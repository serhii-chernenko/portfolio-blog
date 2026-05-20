import { defineMiddleware } from 'astro:middleware';

// Keystatic's React Admin UI ships with hardcoded fetch URLs to `/api/keystatic/*`
// (root-relative, no base path). With Astro `base: '/blog'`, our Keystatic API
// routes actually live at `/blog/api/keystatic/*`, so the UI's fetches would
// 404 in production.
//
// The Worker is bound to apex `/api/keystatic/*` (see wrangler.jsonc routes),
// so those requests reach this Worker. This middleware rewrites them onto the
// `/blog`-prefixed path that Astro's router knows about. The browser sees a
// normal 200 from `/api/keystatic/...`; Astro internally serves it from the
// prefixed route.
//
// The `/api/keystatic` apex route is also robots-blocked.
const BASE = '/blog';
const APEX_PREFIXES = ['/api/keystatic'];

export const onRequest = defineMiddleware((context, next) => {
	const { pathname, search } = context.url;

	for (const prefix of APEX_PREFIXES) {
		if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
			return context.rewrite(`${BASE}${pathname}${search}`);
		}
	}

	return next();
});
