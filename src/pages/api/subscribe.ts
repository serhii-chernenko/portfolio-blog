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

function hasSupportedJsonContentType(value: string | null): boolean {
	if (!value) return false;
	const [mediaType, ...parameters] = value.split(';').map((part) => part.trim());
	if (mediaType?.toLowerCase() !== 'application/json') return false;
	let sawCharset = false;
	for (const parameter of parameters) {
		const [rawName, rawValue, extra] = parameter.split('=').map((part) => part.trim());
		if (extra !== undefined || rawName?.toLowerCase() !== 'charset' || sawCharset) return false;
		const charset = rawValue?.replace(/^"|"$/g, '').toLowerCase();
		if (charset !== 'utf-8') return false;
		sawCharset = true;
	}
	return true;
}

async function readLimitedJson(request: Request): Promise<unknown> {
	const rawContentLength = request.headers.get('content-length');
	if (rawContentLength !== null) {
		const contentLength = Number(rawContentLength);
		if (!Number.isInteger(contentLength) || contentLength < 0) {
			throw new SyntaxError('Invalid content length');
		}
		if (contentLength > MAX_POST_BODY_BYTES) throw new RangeError('Request body is too large');
	}

	const chunks: Uint8Array[] = [];
	let bytesRead = 0;
	const reader = request.body?.getReader();
	if (reader) {
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				bytesRead += value.byteLength;
				if (bytesRead > MAX_POST_BODY_BYTES) {
					await reader.cancel('Request body is too large').catch(() => undefined);
					throw new RangeError('Request body is too large');
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
	}

	const bytes = new Uint8Array(bytesRead);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export const POST: APIRoute = async (context) => {
	if (!hasSupportedJsonContentType(context.request.headers.get('content-type'))) {
		return jsonError('Content-Type must be application/json', 415);
	}

	let body: unknown;
	try {
		body = await readLimitedJson(context.request);
	} catch (error) {
		return jsonError(error instanceof RangeError ? 'Request too large' : 'Invalid JSON body', 400);
	}

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return jsonError('Invalid request body', 400);
	}
	const entries = Object.entries(body as Record<string, unknown>);
	if (entries.some(([key]) => key !== 'email' && key !== 'locale' && key !== 'source')) {
		return jsonError('Invalid request body', 400);
	}

	const { email: rawEmail, locale: rawLocale, source: rawSource } = body as Record<string, unknown>;
	if (
		typeof rawEmail !== 'string' ||
		rawEmail.length === 0 ||
		rawEmail.length > MAX_EMAIL_LENGTH ||
		!EMAIL_RE.test(rawEmail)
	) {
		return jsonError('Invalid email address', 400);
	}
	if (typeof rawLocale !== 'string' || !isLocale(rawLocale)) {
		return jsonError('Invalid locale', 400);
	}
	if (
		rawSource !== undefined &&
		(typeof rawSource !== 'string' ||
			rawSource.length > MAX_SOURCE_LENGTH ||
			!ALLOWED_SOURCES.has(rawSource))
	) {
		return jsonError('Invalid source', 400);
	}
	const userAgent = context.request.headers.get('user-agent');
	if (userAgent && userAgent.length > MAX_USER_AGENT_LENGTH) {
		return jsonError('Invalid request headers', 400);
	}
	if (!SUBSCRIBE_RATE_LIMIT_SECRET) return jsonError('Service unavailable', 503);

	const email = rawEmail;
	const locale = rawLocale as Locale;
	const source = typeof rawSource === 'string' ? rawSource : undefined;
	const rawIp =
		context.request.headers.get('cf-connecting-ip') ??
		context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		'unknown';
	if (rawIp.length > MAX_IP_TEXT_LENGTH) return jsonError('Invalid request headers', 400);

	let db: D1Database;
	try {
		db = getDB();
	} catch {
		return jsonError('Service unavailable', 503);
	}

	const [ipHash, emailHash] = await Promise.all([
		hashIp(SUBSCRIBE_RATE_LIMIT_SECRET, rawIp),
		hashEmail(SUBSCRIBE_RATE_LIMIT_SECRET, email.toLowerCase()),
	]);
	try {
		const limit = await consumeSubscribeRateLimit(db, { ipHash, emailHash });
		if (!limit.allowed) {
			return jsonError('Too many attempts. Try again in a few minutes.', 429, {
				'retry-after': String(limit.retryAfterSeconds),
			});
		}
		await cleanupExpiredPendingIntents(db);
	} catch {
		console.error(JSON.stringify({ message: 'Subscription abuse controls failed' }));
		return jsonError('Service unavailable', 503);
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
		return jsonError('Service unavailable', 503);
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
		return jsonError('Failed to send confirmation email', 500);
	}

	await notify(`📬 New pending subscription (${locale})`);
	trackEvent('subscribe_pending', { locale, source, status: 'pending' });

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
};
