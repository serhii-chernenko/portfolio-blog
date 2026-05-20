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
const BASE = '/blog';
const APEX_PREFIXES = ['/api/keystatic'];

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
