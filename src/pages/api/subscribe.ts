import type { APIRoute } from 'astro';
import { SUBSCRIBE_RATE_LIMIT_SECRET } from 'astro:env/server';
import {
	cleanupExpiredPendingIntents,
	consumeSubscribeRateLimit,
	getDB,
	upsertPendingSubscriber,
} from '../../lib/d1';
import {
	CONFIRM_TOKEN_TTL_SECONDS,
	hashConfirmationToken,
	hashEmail,
	hashIp,
	issueToken,
} from '../../lib/tokens';
import { sendConfirmation } from '../../lib/email';
import { notify } from '../../lib/telegram';
import { trackEvent } from '../../lib/analytics';
import { isLocale, type Locale } from '../../i18n/config';
import { resolvePageSlug } from '../../lib/pages';
import { hasSupportedJsonContentType, readLimitedJson } from '../../lib/request-body';
import { emitTelemetryEvent, telemetryInputFromContext } from '../../lib/telemetry';
import {
	newsletterOutcome,
	newsletterSource,
	type NewsletterResult,
	type NewsletterSource,
} from '../../lib/telemetry-schema';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_POST_BODY_BYTES = 2_048;
const MAX_EMAIL_LENGTH = 254;
const MAX_SOURCE_LENGTH = 32;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_IP_TEXT_LENGTH = 64;
const ALLOWED_SOURCES = new Set(['home', 'inline', 'subscribe-page']);

function jsonError(message: string, status: number, headers?: HeadersInit): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'content-type': 'application/json', ...headers },
	});
}

export const POST: APIRoute = async (context) => {
	const telemetryInput = telemetryInputFromContext(context);
	const reported: { locale?: Locale; source: NewsletterSource } = {
		source: newsletterSource(undefined),
	};
	const finish = (result: NewsletterResult, response: Response): Response => {
		emitTelemetryEvent(telemetryInput, {
			eventName: 'newsletter_subscribe_requested',
			outcome: newsletterOutcome(result),
			method: 'POST',
			path: '/api/subscribe',
			result,
			locale: reported.locale,
			source: reported.source,
		});
		return response;
	};

	if (!hasSupportedJsonContentType(context.request.headers.get('content-type'))) {
		return finish('invalid_request', jsonError('Content-Type must be application/json', 415));
	}

	let body: unknown;
	try {
		body = await readLimitedJson(context.request, MAX_POST_BODY_BYTES);
	} catch (error) {
		return finish(
			'invalid_request',
			jsonError(error instanceof RangeError ? 'Request too large' : 'Invalid JSON body', 400),
		);
	}

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return finish('invalid_request', jsonError('Invalid request body', 400));
	}
	const entries = Object.entries(body as Record<string, unknown>);
	if (entries.some(([key]) => key !== 'email' && key !== 'locale' && key !== 'source')) {
		return finish('invalid_request', jsonError('Invalid request body', 400));
	}

	const { email: rawEmail, locale: rawLocale, source: rawSource } = body as Record<string, unknown>;
	reported.locale = typeof rawLocale === 'string' && isLocale(rawLocale) ? rawLocale : undefined;
	reported.source = newsletterSource(rawSource);
	if (
		typeof rawEmail !== 'string' ||
		rawEmail.length === 0 ||
		rawEmail.length > MAX_EMAIL_LENGTH ||
		!EMAIL_RE.test(rawEmail)
	) {
		return finish('invalid_request', jsonError('Invalid email address', 400));
	}
	if (typeof rawLocale !== 'string' || !isLocale(rawLocale)) {
		return finish('invalid_request', jsonError('Invalid locale', 400));
	}
	if (
		rawSource !== undefined &&
		(typeof rawSource !== 'string' ||
			rawSource.length > MAX_SOURCE_LENGTH ||
			!ALLOWED_SOURCES.has(rawSource))
	) {
		return finish('invalid_request', jsonError('Invalid source', 400));
	}
	const userAgent = context.request.headers.get('user-agent');
	if (userAgent && userAgent.length > MAX_USER_AGENT_LENGTH) {
		return finish('invalid_request', jsonError('Invalid request headers', 400));
	}
	if (!SUBSCRIBE_RATE_LIMIT_SECRET) {
		return finish('unavailable', jsonError('Service unavailable', 503));
	}

	const email = rawEmail;
	const locale = rawLocale as Locale;
	const source = typeof rawSource === 'string' ? rawSource : undefined;
	const rawIp =
		context.request.headers.get('cf-connecting-ip') ??
		context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		'unknown';
	if (rawIp.length > MAX_IP_TEXT_LENGTH)
		return finish('invalid_request', jsonError('Invalid request headers', 400));

	let db: D1Database;
	try {
		db = getDB();
	} catch {
		return finish('unavailable', jsonError('Service unavailable', 503));
	}

	const [ipHash, emailHash] = await Promise.all([
		hashIp(SUBSCRIBE_RATE_LIMIT_SECRET, rawIp),
		hashEmail(SUBSCRIBE_RATE_LIMIT_SECRET, email.toLowerCase()),
	]);
	try {
		const limit = await consumeSubscribeRateLimit(db, { ipHash, emailHash });
		if (!limit.allowed) {
			return finish(
				'rate_limited',
				jsonError('Too many attempts. Try again in a few minutes.', 429, {
					'retry-after': String(limit.retryAfterSeconds),
				}),
			);
		}
		await cleanupExpiredPendingIntents(db);
	} catch {
		console.error(JSON.stringify({ message: 'Subscription abuse controls failed' }));
		return finish('unavailable', jsonError('Service unavailable', 503));
	}

	const issuedAt = Date.now();
	const token = await issueToken(
		SUBSCRIBE_RATE_LIMIT_SECRET,
		email,
		{ purpose: 'confirm' },
		issuedAt,
	);
	const confirmationTokenHash = await hashConfirmationToken(SUBSCRIBE_RATE_LIMIT_SECRET, token);
	try {
		await upsertPendingSubscriber(db, {
			email,
			communication_locale: locale,
			confirmation_token_hash: confirmationTokenHash,
			pending_expires_at: Math.ceil(issuedAt / 1000) + CONFIRM_TOKEN_TTL_SECONDS,
		});
	} catch {
		console.error(JSON.stringify({ message: 'Failed to store pending subscriber' }));
		return finish('unavailable', jsonError('Service unavailable', 503));
	}

	const origin = new URL(context.request.url).origin;
	const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
	const confirmUrl = `${origin}${base}/api/confirm?token=${encodeURIComponent(token)}&locale=${locale}`;
	const privacySlug = await resolvePageSlug('privacy', locale, 'privacy');
	const privacyUrl = `${origin}${base}/${locale}/${privacySlug}/`;

	try {
		await sendConfirmation({ to: email, locale, confirmUrl, privacyUrl });
	} catch {
		console.error(JSON.stringify({ message: 'Failed to send confirmation email' }));
		return finish('email_failed', jsonError('Failed to send confirmation email', 500));
	}

	await notify(`📬 New pending subscription (${locale})`);
	trackEvent('subscribe_pending', { locale, source, status: 'pending' });

	return finish(
		'pending',
		new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		}),
	);
};
