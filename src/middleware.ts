import type { APIContext } from 'astro';
import { SANITY_API_READ_TOKEN } from 'astro:env/server';
import { defineMiddleware } from 'astro:middleware';
import { perspectiveCookieName } from '@sanity/preview-url-secret/constants';
import { PREVIEW_SEARCH_PARAM, SANITY_CACHE_TAG } from './lib/sanity/config';
import { createRequestContext, parseDraftPerspective } from './lib/sanity/request';

const FORM_CONTENT_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
];
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const ONE_CLICK_CONTENT_TYPE = 'application/x-www-form-urlencoded';
const ONE_CLICK_ACTIONS = ['en', 'uk', 'all'];
const RUNTIME_BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
const ONE_CLICK_UNSUBSCRIBE_PATH = `${RUNTIME_BASE}/api/unsubscribe`;

function hasFormLikeHeader(contentType: string | null): boolean {
	if (contentType) {
		for (const formContentType of FORM_CONTENT_TYPES) {
			if (contentType.toLowerCase().includes(formContentType)) return true;
		}
	}
	return false;
}

function isRfc8058OneClickRequest(request: Request, url: URL): boolean {
	if (
		request.method !== 'POST' ||
		url.pathname !== ONE_CLICK_UNSUBSCRIBE_PATH ||
		request.headers.get('content-type')?.toLowerCase() !== ONE_CLICK_CONTENT_TYPE
	) {
		return false;
	}

	const entries = [...url.searchParams];
	return (
		entries.length === 3 &&
		url.searchParams.getAll('token').length === 1 &&
		(url.searchParams.get('token')?.length ?? 0) > 0 &&
		url.searchParams.getAll('action').length === 1 &&
		ONE_CLICK_ACTIONS.includes(url.searchParams.get('action') ?? '') &&
		url.searchParams.getAll('oneclick').length === 1 &&
		url.searchParams.get('oneclick') === '1'
	);
}

const CACHEABLE_METHODS = ['GET', 'HEAD'];
const CACHEABLE_STATUSES = [200, 404];
const CACHEABLE_API_PATHS = [`${RUNTIME_BASE}/api/search`];
const PUBLISHED_CACHE_POLICY = { maxAge: 3600, swr: 86400, tags: [SANITY_CACHE_TAG] };
const PRIVATE_CACHE_CONTROL = 'private, no-store';

function isCacheableRoute(pathname: string): boolean {
	if (pathname.startsWith(`${RUNTIME_BASE}/admin`)) return false;
	if (pathname.startsWith(`${RUNTIME_BASE}/api/`)) return CACHEABLE_API_PATHS.includes(pathname);
	return true;
}

function isCacheableResponse(response: Response): boolean {
	const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? '';
	return (
		CACHEABLE_STATUSES.includes(response.status) &&
		!response.headers.has('set-cookie') &&
		!cacheControl.includes('no-store') &&
		!cacheControl.includes('private')
	);
}

function readDraftPerspective(context: APIContext) {
	if (context.isPrerendered || !SANITY_API_READ_TOKEN) return null;
	const cookie = context.cookies.get(perspectiveCookieName);
	return cookie ? parseDraftPerspective(cookie.value) : null;
}

function withMutableHeaders(response: Response): Response {
	try {
		response.headers.set('cache-control', PRIVATE_CACHE_CONTROL);
		return response;
	} catch {
		return new Response(response.body, response);
	}
}

function disableCaching(context: APIContext, response: Response, noIndex: boolean): Response {
	if (context.cache.enabled) context.cache.set(false);
	const privateResponse = withMutableHeaders(response);
	privateResponse.headers.set('cache-control', PRIVATE_CACHE_CONTROL);
	if (noIndex) privateResponse.headers.set('x-robots-tag', 'noindex');
	return privateResponse;
}

export const onRequest = defineMiddleware(async (context, next) => {
	const { request, url, isPrerendered } = context;
	if (!isPrerendered && !SAFE_METHODS.includes(request.method)) {
		const isOneClickUnsubscribe = isRfc8058OneClickRequest(request, url);
		const isSameOrigin = request.headers.get('origin') === url.origin;
		const hasContentType = request.headers.has('content-type');
		if (hasContentType) {
			const formLikeHeader = hasFormLikeHeader(request.headers.get('content-type'));
			if (formLikeHeader && !isSameOrigin && !isOneClickUnsubscribe) {
				return new Response(`Cross-site ${request.method} form submissions are forbidden`, {
					status: 403,
				});
			}
		} else if (!isSameOrigin) {
			return new Response(`Cross-site ${request.method} form submissions are forbidden`, {
				status: 403,
			});
		}
	}

	const draftPerspective = readDraftPerspective(context);
	context.locals.sanity = createRequestContext(
		draftPerspective ? { token: SANITY_API_READ_TOKEN, perspective: draftPerspective } : null,
	);

	const response = await next();
	if (isPrerendered) return response;

	if (draftPerspective || url.searchParams.has(PREVIEW_SEARCH_PARAM)) {
		return disableCaching(context, response, draftPerspective !== null);
	}
	if (
		context.cache.enabled &&
		CACHEABLE_METHODS.includes(request.method) &&
		isCacheableRoute(url.pathname) &&
		isCacheableResponse(response)
	) {
		context.cache.set(PUBLISHED_CACHE_POLICY);
	}
	return response;
});
