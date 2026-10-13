import type { APIContext, MiddlewareNext } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { perspectiveCookieName } from '@sanity/preview-url-secret/constants';
import { GET as getLlmsTxt } from './pages/llms.txt';
import { GET as getLlmsFullTxt } from './pages/llms-full.txt';
import { getDraftModeSecrets } from './lib/server-secrets';
import {
	PREVIEW_SEARCH_PARAM,
	SANITY_CACHE_TAG,
	sanityDashboardOrigin,
	studioUrl,
} from './lib/sanity/config';
import { DRAFT_SESSION_COOKIE_NAME, isValidDraftSession } from './lib/sanity/draft-mode';
import { createRequestContext, parseDraftPerspective } from './lib/sanity/request';
import { errorType, startTelemetryEvent, telemetryInputFromContext } from './lib/telemetry';
import {
	httpOutcome,
	isUntrackedRoute,
	normalizeRoute,
	shouldEmitHttpEvent,
} from './lib/telemetry-schema';
import { hasAssetExtension } from './lib/trailing-slash';
import { loadUiOverrides, uiOverridesFailed } from './lib/ui-overrides';

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
const API_PATH_PREFIX = `${RUNTIME_BASE}/api/`;
const PUBLISHED_CACHE_POLICY = { maxAge: 3600, swr: 86400, tags: [SANITY_CACHE_TAG] };
const NOT_FOUND_CACHE_POLICY = { maxAge: 60, tags: [SANITY_CACHE_TAG] };
const PRIVATE_CACHE_CONTROL = 'private, no-store';
const NO_STORE_CACHE_CONTROL = 'no-store';
const ADMIN_PATH_PREFIX = `${RUNTIME_BASE}/admin`;
const REDIRECT_ONLY_PATHS = new Set([RUNTIME_BASE, `${RUNTIME_BASE}/`]);
const INTERNAL_SEGMENT_PREFIX = '/_';
const LOCAL_STUDIO_ORIGIN = 'http://localhost:*';
const FRAME_ANCESTORS = [
	"'self'",
	studioUrl,
	sanityDashboardOrigin,
	...(import.meta.env.DEV ? [LOCAL_STUDIO_ORIGIN] : []),
];
const HTML_SECURITY_HEADERS: Record<string, string> = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'content-security-policy': `frame-ancestors ${FRAME_ANCESTORS.join(' ')}`,
};

interface DraftMode {
	token: string;
	perspective: ReturnType<typeof parseDraftPerspective>;
}

function isCacheableRoute(pathname: string): boolean {
	if (pathname.startsWith(ADMIN_PATH_PREFIX)) return false;
	if (pathname.startsWith(API_PATH_PREFIX)) return CACHEABLE_API_PATHS.includes(pathname);
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
		!pathname.startsWith(ADMIN_PATH_PREFIX) &&
		!REDIRECT_ONLY_PATHS.has(pathname)
	);
}

function isPreviewPageRequest(request: Request, url: URL): boolean {
	return (
		CACHEABLE_METHODS.includes(request.method) &&
		url.searchParams.has(PREVIEW_SEARCH_PARAM) &&
		!url.pathname.startsWith(API_PATH_PREFIX)
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

async function resolveDraftMode(context: APIContext): Promise<DraftMode | null> {
	const session = context.cookies.get(DRAFT_SESSION_COOKIE_NAME)?.value;
	if (!session) return null;
	const secrets = await getDraftModeSecrets();
	if (!secrets || !(await isValidDraftSession(secrets.cookieSecret, session))) return null;
	const perspective = parseDraftPerspective(context.cookies.get(perspectiveCookieName)?.value);
	return { token: secrets.readToken, perspective };
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
		context.cache.set(response.status === 404 ? NOT_FOUND_CACHE_POLICY : PUBLISHED_CACHE_POLICY);
	}
}

async function handleRequest(context: APIContext, next: MiddlewareNext): Promise<Response> {
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

	if (isPrerendered) return next();

	const sitemapRedirect = redirectSitemapAlias(request, url);
	if (sitemapRedirect) return sitemapRedirect;

	if (needsTrailingSlash(request, url.pathname)) {
		return redirect(`${url.pathname}/${url.search}`, 308);
	}

	const draftMode = await resolveDraftMode(context);
	if (!draftMode && isPreviewPageRequest(request, url)) {
		const cleanUrl = new URL(url);
		cleanUrl.searchParams.delete(PREVIEW_SEARCH_PARAM);
		return redirect(`${cleanUrl.pathname}${cleanUrl.search}`, 307);
	}

	context.locals.sanity = createRequestContext(draftMode);

	const apexEndpoint = apexEndpointFor(request, url.pathname);
	if (!apexEndpoint && rendersUi(url.pathname)) {
		context.locals.uiOverrides = await loadUiOverrides(context.locals.sanity);
	}
	const response = applySecurityHeaders(await (apexEndpoint ? apexEndpoint(context) : next()));
	if (draftMode) return disableCaching(context, response);
	if (uiOverridesFailed(context.locals.sanity)) {
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
