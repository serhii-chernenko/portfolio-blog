import { defineMiddleware } from 'astro:middleware';

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

export const onRequest = defineMiddleware((context, next) => {
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
