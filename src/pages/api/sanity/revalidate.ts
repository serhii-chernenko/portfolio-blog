import type { APIContext, APIRoute } from 'astro';
import { decodeSignatureHeader, isValidSignature, SIGNATURE_HEADER_NAME } from '@sanity/webhook';
import { isLocale } from '../../../i18n/config';
import { localeHref } from '../../../i18n/utils';
import { changedContentUrls, submitToIndexNow } from '../../../lib/indexnow';
import { SANITY_CACHE_TAG } from '../../../lib/sanity/config';
import { getSanityWebhookSecret } from '../../../lib/server-secrets';
import { notify } from '../../../lib/telegram';
import { environmentFromHost } from '../../../lib/telemetry-schema';

export const prerender = false;

const MAX_BODY_BYTES = 256_000;
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

interface WebhookPayload {
	_type?: unknown;
	operation?: unknown;
	title?: unknown;
	language?: unknown;
	slug?: unknown;
	previousSlug?: unknown;
	publishedAt?: unknown;
}

class PayloadTooLargeError extends Error {}

function json(body: Record<string, unknown>, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
	});
}

async function readLimitedText(request: Request): Promise<string> {
	const reader = request.body?.getReader();
	if (!reader) return '';
	const chunks: Uint8Array[] = [];
	let bytesRead = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytesRead += value.byteLength;
			if (bytesRead > MAX_BODY_BYTES) {
				await reader.cancel('Request body is too large').catch(() => undefined);
				throw new PayloadTooLargeError();
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(bytesRead);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function hasFreshTimestamp(signature: string, now = Date.now()): boolean {
	try {
		const { timestamp } = decodeSignatureHeader(signature);
		return Math.abs(now - timestamp) <= SIGNATURE_MAX_AGE_MS;
	} catch {
		return false;
	}
}

async function hasValidSignature(body: string, signature: string, secret: string) {
	if (!body) return false;
	try {
		return await isValidSignature(body, signature, secret);
	} catch {
		return false;
	}
}

function parsePayload(body: string): WebhookPayload | null {
	try {
		const payload: unknown = JSON.parse(body);
		return payload && typeof payload === 'object' ? (payload as WebhookPayload) : null;
	} catch {
		return null;
	}
}

function escapeHtml(text: string): string {
	return text.replace(/[&<>]/g, (character) => HTML_ESCAPES[character]);
}

function newPostMessage(payload: WebhookPayload, context: APIContext): string | null {
	if (payload._type !== 'post' || payload.operation !== 'create') return null;
	const { title, language, slug } = payload;
	if (typeof language !== 'string' || !isLocale(language)) return null;
	if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) return null;
	const postTitle = typeof title === 'string' && title.trim() ? title.trim() : slug;
	const url = new URL(localeHref(language, `posts/${slug}`), context.site ?? context.url.origin);
	return `📝 New post published: ${escapeHtml(postTitle)} (${language.toUpperCase()}) ${url}`;
}

async function runAfterResponse(context: APIContext, pending: Promise<void>): Promise<void> {
	const cfContext = (context.locals as Partial<App.Locals>).cfContext;
	if (!cfContext) return pending;
	cfContext.waitUntil(pending);
}

function indexNowSubmission(payload: WebhookPayload, context: APIContext): Promise<void> | null {
	if (!context.site || environmentFromHost(context.url.host) !== 'production') return null;
	const urls = changedContentUrls(payload, context.site);
	return urls.length > 0 ? submitToIndexNow(context.site, urls) : null;
}

export const POST: APIRoute = async (context) => {
	const { request } = context;
	const contentLength = Number(request.headers.get('content-length') ?? '0');
	if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_BYTES) {
		return json({ error: 'Payload too large' }, 413);
	}

	const secret = await getSanityWebhookSecret();
	const signature = request.headers.get(SIGNATURE_HEADER_NAME);
	if (!secret || !signature || !hasFreshTimestamp(signature)) {
		return json({ error: 'Invalid signature' }, 401);
	}

	let body: string;
	try {
		body = await readLimitedText(request);
	} catch (error) {
		if (error instanceof PayloadTooLargeError) return json({ error: 'Payload too large' }, 413);
		return json({ error: 'Invalid signature' }, 401);
	}
	if (!(await hasValidSignature(body, signature, secret))) {
		return json({ error: 'Invalid signature' }, 401);
	}

	const payload = parsePayload(body);
	const message = payload ? newPostMessage(payload, context) : null;

	if (context.cache.enabled) {
		try {
			await context.cache.invalidate({ tags: [SANITY_CACHE_TAG] });
		} catch (error) {
			console.error(
				JSON.stringify({
					message: 'Failed to purge Sanity cache tag',
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			return json({ error: 'Cache purge failed' }, 503);
		}
	}

	const indexNow = payload ? indexNowSubmission(payload, context) : null;
	if (indexNow) await runAfterResponse(context, indexNow);
	if (message) await runAfterResponse(context, notify(message));
	return json({ purged: context.cache.enabled }, 200);
};
