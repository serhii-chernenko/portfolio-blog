import type { APIContext, MiddlewareNext } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { GET as getLlmsTxt } from './pages/blog/llms.txt';
import { GET as getLlmsFullTxt } from './pages/blog/llms-full.txt';
import {
	CMS_CACHE_TAGS,
	COMMENTS_CACHE_TAG,
	LAYOUT_CACHE_TAGS,
	EDIT_MODE_PARAM,
	PREVIEW_TOKEN_PARAM,
} from './lib/cms/config';
import { createRequestContext } from './lib/cms/context';
import { errorType, startTelemetryEvent, telemetryInputFromContext } from './lib/telemetry';
import {
	httpOutcome,
	isUntrackedRoute,
	normalizeRoute,
	shouldEmitHttpEvent,
} from './lib/telemetry-schema';
import { hasAssetExtension } from './lib/trailing-slash';
import { loadUiOverrides, uiOverridesFailed } from './lib/ui-overrides';
import { getLayoutPayload, layoutSource } from './lib/site';
import { isLocale } from './i18n/config';
import { BASE_PATH } from './lib/base-path';

const FORM_CONTENT_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
];
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const ONE_CLICK_CONTENT_TYPE = 'application/x-www-form-urlencoded';
const ONE_CLICK_ACTIONS = ['en', 'uk', 'all'];
const RUNTIME_BASE = BASE_PATH;
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
/** Cached API routes matched by prefix: the layout JSON (src/pages/blog/api/layout/). */
const CACHEABLE_API_PREFIXES = [`${RUNTIME_BASE}/api/layout/`];
const API_PATH_PREFIX = `${RUNTIME_BASE}/api/`;
const PUBLISHED_CACHE_POLICY = { maxAge: 3600, swr: 86400 };
const NOT_FOUND_CACHE_POLICY = { maxAge: 60, tags: CMS_CACHE_TAGS };
const PRIVATE_CACHE_CONTROL = 'private, no-store';
const NO_STORE_CACHE_CONTROL = 'no-store';
const ADMIN_PATH_PREFIX = `${RUNTIME_BASE}/admin`;
const REDIRECT_ONLY_PATHS = new Set([RUNTIME_BASE, `${RUNTIME_BASE}/`]);
const INTERNAL_SEGMENT_PREFIX = '/_';
const CMS_PATH_PREFIX = '/_emdash/';
const HTML_SECURITY_HEADERS: Record<string, string> = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'content-security-policy': "frame-ancestors 'self'",
};

/** EmDash admin, API and media routes: EmDash sets their headers and caching itself. */
function isCmsRoute(pathname: string): boolean {
	return pathname === CMS_PATH_PREFIX.slice(0, -1) || pathname.startsWith(CMS_PATH_PREFIX);
}

/**
 * Comment writes that change what a post page renders: a public submission (approved ones show
 * immediately) and moderation in the admin. Likes are left out; their counts refresh client-side
 * and with the page's TTL.
 */
const COMMENT_WRITE_PATH = /^\/_emdash\/api\/(?:comments\/[^/]+\/[^/]+|admin\/comments(?:\/.*)?)$/;

/**
 * EmDash purges the route cache for content, menu, taxonomy and settings changes, but not for
 * comments, so a post page would show a new comment only after its cached copy expires. Purge
 * the pages with a comments section (COMMENTS_CACHE_TAG) after a successful comment write instead.
 */
async function handleCmsRoute(context: APIContext, next: MiddlewareNext): Promise<Response> {
	const response = await next();
	const { request, url } = context;
	if (
		!SAFE_METHODS.includes(request.method) &&
		COMMENT_WRITE_PATH.test(url.pathname) &&
		response.ok &&
		context.cache?.enabled
	) {
		try {
			await context.cache.invalidate({ tags: COMMENTS_CACHE_TAG });
		} catch {
			// Purge failures only delay the comment until the page expires.
		}
	}
	return response;
}

function isCacheableRoute(pathname: string): boolean {
	if (pathname.startsWith(ADMIN_PATH_PREFIX)) return false;
	if (pathname.startsWith(API_PATH_PREFIX)) {
		return (
			CACHEABLE_API_PATHS.includes(pathname) ||
			CACHEABLE_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
		);
	}
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

function needsTrailingSlash(request: Request, pathname: string): boolean {
	return (
		CACHEABLE_METHODS.includes(request.method) &&
		!pathname.endsWith('/') &&
		pathname.startsWith(`${RUNTIME_BASE}/`) &&
		!pathname.startsWith(API_PATH_PREFIX) &&
		!pathname.includes(INTERNAL_SEGMENT_PREFIX) &&
		!hasAssetExtension(pathname)
	);
}

function isPageRoute(pathname: string): boolean {
	return !pathname.startsWith(API_PATH_PREFIX) && !hasAssetExtension(pathname);
}

function rendersUi(pathname: string): boolean {
	return (
		isPageRoute(pathname) &&
		!isCmsRoute(pathname) &&
		!pathname.startsWith(ADMIN_PATH_PREFIX) &&
		!REDIRECT_ONLY_PATHS.has(pathname)
	);
}

/**
 * Draft views: signed `_preview` links and authenticated edit-mode requests (EmDash verifies
 * both). Any request carrying either parameter stays out of the shared cache, valid or not,
 * because the parameter makes the URL per-token.
 */
function isDraftViewRequest(url: URL, preview: boolean): boolean {
	return (
		preview || url.searchParams.has(PREVIEW_TOKEN_PARAM) || url.searchParams.has(EDIT_MODE_PARAM)
	);
}

function redirect(location: string, status: 307 | 308): Response {
	return new Response(null, {
		status,
		headers: { location, 'cache-control': 'no-store' },
	});
}

const APEX_ENDPOINTS: Record<string, (context: APIContext) => Promise<Response>> = {
	'/llms.txt': getLlmsTxt,
	'/llms-full.txt': getLlmsFullTxt,
};
const SITEMAP_ALIAS_PATHS = new Set(['/sitemap.xml', `${RUNTIME_BASE}/sitemap.xml`]);
const SITEMAP_INDEX_PATH = `${RUNTIME_BASE}/sitemap-index.xml`;
const SITEMAP_REDIRECT_CACHE_CONTROL = 'public, max-age=3600';

function apexEndpointFor(request: Request, pathname: string) {
	if (RUNTIME_BASE === '' || !['GET', 'HEAD'].includes(request.method)) return undefined;
	return APEX_ENDPOINTS[pathname];
}

function redirectSitemapAlias(request: Request, url: URL): Response | null {
	if (!SAFE_METHODS.includes(request.method) || !SITEMAP_ALIAS_PATHS.has(url.pathname)) {
		return null;
	}
	return new Response(null, {
		status: 301,
		headers: {
			location: new URL(SITEMAP_INDEX_PATH, url.origin).toString(),
			'cache-control': SITEMAP_REDIRECT_CACHE_CONTROL,
		},
	});
}

function withMutableHeaders(response: Response): Response {
	try {
		response.headers.set('x-content-type-options', 'nosniff');
		return response;
	} catch {
		return new Response(response.body, response);
	}
}

function applySecurityHeaders(response: Response): Response {
	const mutable = withMutableHeaders(response);
	mutable.headers.set('x-content-type-options', 'nosniff');
	const contentType = mutable.headers.get('content-type')?.toLowerCase() ?? '';
	if (!contentType.includes('text/html')) return mutable;
	for (const [name, value] of Object.entries(HTML_SECURITY_HEADERS)) {
		if (!mutable.headers.has(name)) mutable.headers.set(name, value);
	}
	return mutable;
}

function disableCaching(context: APIContext, response: Response): Response {
	if (context.cache.enabled) context.cache.set(false);
	response.headers.set('cache-control', PRIVATE_CACHE_CONTROL);
	response.headers.set('x-robots-tag', 'noindex');
	return response;
}

function disableCachingForDegradedResponse(context: APIContext, response: Response): void {
	if (context.cache.enabled) context.cache.set(false);
	response.headers.set('cache-control', NO_STORE_CACHE_CONTROL);
}

function applyCachePolicy(context: APIContext, response: Response): void {
	if (
		context.cache.enabled &&
		CACHEABLE_METHODS.includes(context.request.method) &&
		isCacheableRoute(context.url.pathname) &&
		isCacheableResponse(response)
	) {
		if (response.status === 404) {
			context.cache.set(NOT_FOUND_CACHE_POLICY);
			return;
		}
		// Routes that declare their dependencies get the layout's tags plus theirs; the rest depend
		// on everything (see CMS_CACHE_TAGS).
		const routeTags = context.locals.cacheTags;
		const tags = routeTags ? [...new Set([...LAYOUT_CACHE_TAGS, ...routeTags])] : CMS_CACHE_TAGS;
		context.cache.set({ ...PUBLISHED_CACHE_POLICY, tags });
	}
}

async function handleRequest(context: APIContext, next: MiddlewareNext): Promise<Response> {
	const { request, url, isPrerendered } = context;
	// EmDash admin, API and media: EmDash enforces its own CSRF (X-EmDash-Request header or a
	// bearer token), sets its own headers and caching, and needs no site UI data.
	if (isCmsRoute(url.pathname)) return handleCmsRoute(context, next);
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

	if (isPrerendered) return next();

	const sitemapRedirect = redirectSitemapAlias(request, url);
	if (sitemapRedirect) return sitemapRedirect;

	if (needsTrailingSlash(request, url.pathname)) {
		return redirect(`${url.pathname}/${url.search}`, 308);
	}

	context.locals.cms = createRequestContext();

	const apexEndpoint = apexEndpointFor(request, url.pathname);
	if (!apexEndpoint && rendersUi(url.pathname)) {
		// Header, footer, site copy and UI strings come from the cached layout JSON (one Workers
		// Cache lookup instead of ~11 D1 queries); the page reuses the same promise.
		const locale = url.pathname.slice(BASE_PATH.length).split('/')[1] ?? '';
		context.locals.uiOverrides = isLocale(locale)
			? (await getLayoutPayload(locale, context.locals.cms, url.origin)).uiOverrides
			: await loadUiOverrides(context.locals.cms);
	}
	const response = applySecurityHeaders(await (apexEndpoint ? apexEndpoint(context) : next()));
	const source = layoutSource(context.locals.cms);
	// Where the layout data came from (cached JSON or D1). Not Server-Timing: EmDash overwrites it.
	if (source) {
		try {
			response.headers.set('x-layout-source', source);
		} catch {
			// Immutable headers (e.g. Response.redirect): skip the diagnostic.
		}
	}
	if (isDraftViewRequest(url, context.locals.cms.preview)) return disableCaching(context, response);
	if (uiOverridesFailed(context.locals.cms)) {
		disableCachingForDegradedResponse(context, response);
		return response;
	}
	applyCachePolicy(context, response);
	return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
	const { request, url, isPrerendered } = context;
	if (isPrerendered || isUntrackedRoute(url.pathname, RUNTIME_BASE)) {
		return handleRequest(context, next);
	}

	const route = normalizeRoute(url.pathname, RUNTIME_BASE);
	const telemetry = startTelemetryEvent(telemetryInputFromContext(context), {
		method: request.method,
		path: route,
	});
	const report = (status: number, thrownErrorType?: string) => {
		if (!shouldEmitHttpEvent(route, status)) return;
		telemetry.emit({
			eventName: 'http_request_completed',
			outcome: httpOutcome(status),
			method: request.method,
			route,
			status,
			errorType: thrownErrorType,
		});
	};

	try {
		const response = await handleRequest(context, next);
		report(response.status);
		return response;
	} catch (error) {
		report(500, errorType(error));
		throw error;
	}
});
