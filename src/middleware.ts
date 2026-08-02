import { defineMiddleware } from 'astro:middleware';

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

// Keystatic's React Admin UI ships with hardcoded fetch URLs to `/api/keystatic/*`
// (root-relative, no base path). With Astro `base: '/blog'`, the Keystatic API
// routes live at `/blog/api/keystatic/*`, so the UI's fetches would 404.
//
// The Worker is bound to apex `/api/keystatic/*` (see wrangler.jsonc routes),
// so those requests reach this Worker. This middleware rewrites them onto the
// `/blog`-prefixed path Astro's router knows about. The browser sees a normal
// 200 from `/api/keystatic/...`; Astro internally serves the prefixed route.
//
// Skipped under `pnpm dev` (PUBLIC_KEYSTATIC_MODE=local) — the base is `/`
// there, so /api/keystatic/* already matches without rewriting.
//
// The `/api/keystatic` apex route is also robots-blocked.
// Keystatic has no base-path support — both its admin UI (`/keystatic`) and its
// API (`/api/keystatic`) are hardcoded to the host root in the shipped React
// client. We bind both at the apex (wrangler.jsonc routes) and rewrite them here
// onto Astro's `/blog`-prefixed routes so the client (which only ever sees apex
// paths) routes correctly. Access the CMS at https://<host>/keystatic — NOT
// /blog/keystatic (the React UI can't route under the /blog base and 404s).
const BASE = '/blog';
const APEX_PREFIXES = ['/api/keystatic', '/keystatic'];

// NOTE: `/robots.txt` (host-root) is bound to this Worker in wrangler.jsonc,
// but is NOT rewritten here like the Keystatic paths above — `context.rewrite()`
// only resolves to real Astro routes, and `public/robots.txt` is a static file
// with no route-manifest entry (rewriting to it throws "Unexpectedly unable to
// find a component instance"). scripts/post-build.mjs instead copies the built
// file to the assets root (`dist/client/robots.txt`), where Cloudflare's static
// assets serve it directly ahead of any Worker code — see that script and
// docs/DNS-ROUTING.md.

export const onRequest = defineMiddleware((context, next) => {
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

	if (import.meta.env.PUBLIC_KEYSTATIC_MODE === 'local') {
		return next();
	}

	const { pathname, search } = context.url;

	for (const prefix of APEX_PREFIXES) {
		if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
			return context.rewrite(`${BASE}${pathname}${search}`);
		}
	}

	return next();
});
