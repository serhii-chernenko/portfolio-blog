import { env } from 'cloudflare:workers';
import { createRequestLogger, type RequestLogger, type WideEvent } from 'evlog';
import { createOTLPDrain } from 'evlog/otlp';
import { initWorkersLogger } from 'evlog/workers';
import {
	environmentFromHost,
	type BlogEnvironment,
	type TelemetryOutcome,
} from './telemetry-schema';

initWorkersLogger({
	env: {
		service: 'portfolio-blog',
		environment: 'cloudflare-workers',
	},
	pretty: false,
	stringify: true,
	redact: true,
});

const NEW_RELIC_OTLP_ENDPOINT = 'https://otlp.eu01.nr-data.net';
const DEFAULT_METHOD = 'EVENT';
const DEFAULT_PATH = '/internal/event';

type WaitUntil = (promise: Promise<unknown>) => void;
type TelemetryValue = string | number | boolean | undefined;

export interface TelemetryInput {
	host: string;
	waitUntil?: WaitUntil;
}

export interface TelemetryRoute {
	method: string;
	path: string;
}

export interface TelemetryFields {
	eventName: string;
	outcome: TelemetryOutcome;
	method?: string;
	path?: string;
	status?: number;
	[attribute: string]: TelemetryValue;
}

export interface TelemetryEmitter {
	emit(fields: TelemetryFields): void;
}

interface TelemetryContext {
	url: URL;
	locals: { cfContext?: { waitUntil(promise: Promise<unknown>): void } };
}

export function errorType(error: unknown): string {
	return error instanceof Error ? error.name : typeof error;
}

function warnTelemetryFailure(event: string, error: unknown): void {
	console.warn(JSON.stringify({ event, errorType: errorType(error) }));
}

function shipToNewRelic(
	event: WideEvent,
	blogEnvironment: BlogEnvironment,
	waitUntil: WaitUntil | undefined,
): void {
	const licenseKey = (env as { NEW_RELIC_LICENSE_KEY?: string }).NEW_RELIC_LICENSE_KEY;
	if (blogEnvironment !== 'production' || !licenseKey) return;

	const delivery = Promise.resolve()
		.then(() => {
			const drain = createOTLPDrain({
				endpoint: NEW_RELIC_OTLP_ENDPOINT,
				serviceName: 'portfolio-blog',
				headers: { 'api-key': licenseKey },
				resourceAttributes: { 'deployment.environment.name': 'production' },
			});
			return drain({ event });
		})
		.catch((error) => warnTelemetryFailure('new_relic_drain_failed', error));

	if (waitUntil) {
		waitUntil(delivery);
		return;
	}
	void delivery;
}

function definedAttributes(
	attributes: Record<string, TelemetryValue>,
): Record<string, string | number | boolean> {
	const defined: Record<string, string | number | boolean> = {};
	for (const [name, value] of Object.entries(attributes)) {
		if (value !== undefined) defined[name] = value;
	}
	return defined;
}

function emitWithLogger(logger: RequestLogger, input: TelemetryInput, fields: TelemetryFields) {
	try {
		const { method: _method, path: _path, status, ...attributes } = fields;
		const blogEnvironment = environmentFromHost(input.host);
		logger.set({ ...definedAttributes(attributes), blogEnvironment });
		const event = logger.emit({
			environment: blogEnvironment,
			...(status === undefined ? {} : { status }),
		});
		if (event) shipToNewRelic(event, blogEnvironment, input.waitUntil);
	} catch (error) {
		warnTelemetryFailure('telemetry_emit_failed', error);
	}
}

/**
 * Starts the wide event clock. Use it ahead of work whose duration must appear
 * in `durationMs`; the returned emitter writes the event once and never throws.
 * `route.path` must be a route template, never a raw path or query string.
 */
export function startTelemetryEvent(
	input: TelemetryInput,
	route: TelemetryRoute = { method: DEFAULT_METHOD, path: DEFAULT_PATH },
): TelemetryEmitter {
	try {
		const logger = createRequestLogger({
			method: route.method,
			path: route.path,
			...(input.waitUntil ? { waitUntil: input.waitUntil } : {}),
		});
		return { emit: (fields) => emitWithLogger(logger, input, fields) };
	} catch (error) {
		warnTelemetryFailure('telemetry_emit_failed', error);
		return { emit: () => undefined };
	}
}

export function emitTelemetryEvent(input: TelemetryInput, fields: TelemetryFields): void {
	startTelemetryEvent(input, {
		method: fields.method ?? DEFAULT_METHOD,
		path: fields.path ?? DEFAULT_PATH,
	}).emit(fields);
}

export function telemetryInputFromContext(context: TelemetryContext): TelemetryInput {
	const cfContext = context.locals.cfContext;
	return {
		host: context.url.host,
		waitUntil: cfContext ? cfContext.waitUntil.bind(cfContext) : undefined,
	};
}
