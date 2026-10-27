import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { hasSupportedJsonContentType, readLimitedJson } from '../../../lib/request-body';
import { emitTelemetryEvent, telemetryInputFromContext } from '../../../lib/telemetry';
import { isKnownContentKey } from '../../../lib/telemetry-content';
import {
	clientEventAttributes,
	contentKindForPageType,
	countryCode,
	deviceType,
	isCrawler,
	parseClientEvent,
	rateLimitKey,
	type ClientEvent,
} from '../../../lib/telemetry-schema';

export const prerender = false;

const MAX_POST_BODY_BYTES = 1_024;
const RATE_LIMIT_RETRY_AFTER_SECONDS = '60';

function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
	return new Response(null, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

async function isRateLimited(request: Request): Promise<boolean> {
	const limiter = (env as { EVENTS_RATE_LIMITER?: RateLimit }).EVENTS_RATE_LIMITER;
	if (!limiter) return false;
	try {
		const { success } = await limiter.limit({
			key: rateLimitKey(request.headers.get('cf-connecting-ip')),
		});
		return !success;
	} catch {
		return false;
	}
}

async function withKnownContentKey(event: ClientEvent): Promise<ClientEvent> {
	const kind = contentKindForPageType(event.pageType);
	if (event.contentKey === undefined) return event;
	if (kind && (await isKnownContentKey(kind, event.locale, event.contentKey))) return event;
	return { ...event, contentKey: undefined };
}

export const POST: APIRoute = async (context) => {
	const { request } = context;
	const fetchSite = request.headers.get('sec-fetch-site');
	if (fetchSite !== null && fetchSite !== 'same-origin') return emptyResponse(403);

	const userAgent = request.headers.get('user-agent');
	if (isCrawler(userAgent)) return emptyResponse(204);

	if (await isRateLimited(request)) {
		return emptyResponse(429, { 'retry-after': RATE_LIMIT_RETRY_AFTER_SECONDS });
	}

	if (!hasSupportedJsonContentType(request.headers.get('content-type'))) {
		return emptyResponse(415);
	}

	let body: unknown;
	try {
		body = await readLimitedJson(request, MAX_POST_BODY_BYTES);
	} catch (error) {
		return emptyResponse(error instanceof RangeError ? 413 : 400);
	}

	const parsedEvent = parseClientEvent(body);
	if (!parsedEvent) return emptyResponse(400);

	const event = await withKnownContentKey(parsedEvent);
	const telemetryInput = telemetryInputFromContext(context);
	emitTelemetryEvent(telemetryInput, {
		...clientEventAttributes(event, {
			ownHost: telemetryInput.host,
			country: countryCode(request.headers.get('cf-ipcountry')),
			deviceType: deviceType(userAgent),
		}),
		method: 'POST',
		path: '/api/events',
	});

	return emptyResponse(204);
};
