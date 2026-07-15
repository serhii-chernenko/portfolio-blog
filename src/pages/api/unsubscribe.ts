import type { APIRoute, APIContext } from 'astro';
import { SUBSCRIBE_RATE_LIMIT_SECRET } from 'astro:env/server';
import {
	applySubscriberPreferenceAction,
	getDB,
	getSubscriberPreferences,
	type PreferenceAction,
} from '../../lib/d1';
import { type OneClickAction, verifyManageToken, verifyToken } from '../../lib/tokens';
import { notify } from '../../lib/telegram';
import { trackEvent } from '../../lib/analytics';
import { defaultLocale, isLocale, type Locale } from '../../i18n/config';

export const prerender = false;

const ACTIONS: readonly PreferenceAction[] = ['en', 'uk', 'all', 'subscribe_all'];
const ONE_CLICK_ACTIONS: readonly OneClickAction[] = ['en', 'uk', 'all'];
const RESULTS: Record<PreferenceAction, string> = {
	en: 'en_disabled',
	uk: 'uk_disabled',
	all: 'all_disabled',
	subscribe_all: 'all_enabled',
};
const MAX_POST_BODY_BYTES = 16_384;
const ONE_CLICK_CONTENT_TYPE = 'application/x-www-form-urlencoded';

function isPreferenceAction(value: string): value is PreferenceAction {
	return (ACTIONS as readonly string[]).includes(value);
}

function isOneClickAction(value: string): value is OneClickAction {
	return (ONE_CLICK_ACTIONS as readonly string[]).includes(value);
}

function hasValidOneClickQuery(url: URL): boolean {
	const entries = [...url.searchParams];
	return (
		entries.length === 3 &&
		url.searchParams.getAll('token').length === 1 &&
		(url.searchParams.get('token')?.length ?? 0) > 0 &&
		url.searchParams.getAll('action').length === 1 &&
		isOneClickAction(url.searchParams.get('action') ?? '') &&
		url.searchParams.getAll('oneclick').length === 1 &&
		url.searchParams.get('oneclick') === '1'
	);
}

function tokenHeaders(): Record<string, string> {
	return {
		'cache-control': 'no-store',
		'referrer-policy': 'no-referrer',
		'x-robots-tag': 'noindex, nofollow, noarchive',
	};
}

function apiResponse(message: string, status: number): Response {
	return new Response(message, {
		status,
		headers: { 'content-type': 'text/plain; charset=utf-8', ...tokenHeaders() },
	});
}

function preferenceCenterPath(locale: Locale, token: string, result?: string): string {
	const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
	const params = new URLSearchParams();
	if (token) params.set('token', token);
	if (result) params.set('result', result);
	const query = params.toString();
	return `${base}/${locale}/unsubscribe${query ? `?${query}` : ''}`;
}

function internalRedirect(
	context: APIContext,
	locale: Locale,
	token: string,
	result?: string,
): Response {
	const response = context.redirect(preferenceCenterPath(locale, token, result), 303);
	for (const [key, value] of Object.entries(tokenHeaders())) response.headers.set(key, value);
	return response;
}

function requestedLocale(value: FormDataEntryValue | string | null): Locale {
	return typeof value === 'string' && isLocale(value) ? value : defaultLocale;
}

/**
 * Compatibility entry point for links sent before the preference center
 * existed. A GET can only navigate; it never changes subscription state.
 */
export const GET: APIRoute = async (context) => {
	const url = new URL(context.request.url);
	const token = url.searchParams.get('token') ?? '';
	let locale = requestedLocale(url.searchParams.get('locale'));

	if (SUBSCRIBE_RATE_LIMIT_SECRET && token) {
		const verified = await verifyManageToken(SUBSCRIBE_RATE_LIMIT_SECRET, token);
		if (verified) {
			try {
				const preferences = await getSubscriberPreferences(getDB(), verified.email);
				if (preferences) locale = preferences.subscriber.communication_locale;
			} catch {
				console.error(
					JSON.stringify({
						message: 'Failed to resolve unsubscribe preference center locale',
					}),
				);
				return internalRedirect(context, locale, token, 'error');
			}
		}
	}

	return internalRedirect(context, locale, token);
};

async function readPostFields(
	request: Request,
): Promise<{ fields: Record<string, string>; entryCount: number }> {
	const contentLength = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(contentLength) && contentLength > MAX_POST_BODY_BYTES) {
		throw new RangeError('Request body is too large');
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

	const contentType = request.headers.get('content-type') ?? '';
	if (contentType.toLowerCase().includes('application/json')) {
		const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
		if (!body || typeof body !== 'object') return { fields: {}, entryCount: 0 };
		const entries = Object.entries(body as Record<string, unknown>);
		return {
			fields: Object.fromEntries(
				entries
					.filter((entry): entry is [string, string] => typeof entry[1] === 'string')
					.map(([key, value]) => [key, value]),
			),
			entryCount: entries.length,
		};
	}

	const formData = await new Response(bytes, {
		headers: { 'content-type': contentType },
	}).formData();
	const fields: Record<string, string> = {};
	let entryCount = 0;
	for (const [key, value] of formData) {
		entryCount += 1;
		if (typeof value === 'string') fields[key] = value;
	}
	return { fields, entryCount };
}

export const POST: APIRoute = async (context) => {
	const url = new URL(context.request.url);
	let fields: Record<string, string>;
	let bodyEntryCount: number;
	try {
		({ fields, entryCount: bodyEntryCount } = await readPostFields(context.request));
	} catch (error) {
		return apiResponse(
			error instanceof RangeError ? 'Request too large' : 'Invalid request body',
			400,
		);
	}

	const isOneClick = url.searchParams.has('oneclick');
	if (isOneClick) {
		const oneClickFields = Object.entries(fields);
		const isValidOneClickBody =
			context.request.headers.get('content-type')?.toLowerCase() === ONE_CLICK_CONTENT_TYPE &&
			hasValidOneClickQuery(url) &&
			bodyEntryCount === 1 &&
			oneClickFields.length === 1 &&
			oneClickFields[0][0] === 'List-Unsubscribe' &&
			oneClickFields[0][1] === 'One-Click';
		if (!isValidOneClickBody) {
			return apiResponse('Invalid one-click unsubscribe request', 400);
		}
	}

	const token = fields.token ?? url.searchParams.get('token') ?? '';
	const rawAction = fields.action ?? url.searchParams.get('action') ?? '';
	const isUiForm = fields.ui === '1';
	const formLocale = requestedLocale(fields.locale ?? url.searchParams.get('locale'));

	if (!SUBSCRIBE_RATE_LIMIT_SECRET) {
		return isUiForm
			? internalRedirect(context, formLocale, token, 'error')
			: apiResponse('Service unavailable', 503);
	}

	if (!isPreferenceAction(rawAction)) {
		return apiResponse('Invalid preference action', 400);
	}

	if (isOneClick && !isOneClickAction(rawAction)) {
		return apiResponse('Invalid one-click unsubscribe action', 400);
	}
	const verified = isOneClick
		? await verifyToken(SUBSCRIBE_RATE_LIMIT_SECRET, token, {
				purpose: 'oneclick',
				action: rawAction as OneClickAction,
			})
		: await verifyManageToken(SUBSCRIBE_RATE_LIMIT_SECRET, token);
	if (!verified) {
		return isUiForm
			? internalRedirect(context, formLocale, token, 'invalid')
			: apiResponse('Invalid or expired token', 400);
	}

	let locale = formLocale;
	let changed = false;
	let becameGloballyUnsubscribed = false;
	try {
		const transition = await applySubscriberPreferenceAction(getDB(), verified.email, rawAction);
		if (!transition) {
			return isUiForm
				? internalRedirect(context, locale, token, 'invalid')
				: apiResponse('Subscriber not found', 404);
		}
		const { before, after } = transition;

		// The stored communication language is authoritative for non-UI clients.
		// A browser preference page may intentionally be viewed in either locale.
		if (!isUiForm) locale = before.subscriber.communication_locale;

		changed =
			before.languages.en !== after.languages.en ||
			before.languages.uk !== after.languages.uk ||
			before.subscriber.status !== after.subscriber.status;
		becameGloballyUnsubscribed =
			before.subscriber.status !== 'unsubscribed' && after.subscriber.status === 'unsubscribed';
	} catch {
		console.error(
			JSON.stringify({
				message: 'Failed to update subscriber preferences',
				action: rawAction,
			}),
		);
		return isUiForm
			? internalRedirect(context, locale, token, 'error')
			: apiResponse('Service unavailable', 503);
	}

	if (changed) {
		await notify(`🔔 Subscription preferences changed (${locale}, ${rawAction})`);

		if (becameGloballyUnsubscribed) {
			trackEvent('unsubscribed', { locale, status: 'all_languages_disabled' });
		} else {
			trackEvent('subscription_preferences_changed', {
				locale,
				status: RESULTS[rawAction],
			});
		}
	}

	if (isUiForm) return internalRedirect(context, locale, token, RESULTS[rawAction]);

	// RFC 8058 one-click requests are machine-to-machine. An empty success body
	// avoids returning an HTML page that a mailbox provider neither needs nor renders.
	return new Response(null, { status: 200, headers: tokenHeaders() });
};
