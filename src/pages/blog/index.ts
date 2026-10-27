import type { APIRoute } from 'astro';
import { localeHref } from '../../i18n/utils';
import { defaultLocale } from '../../i18n/config';

export const prerender = false;

const REDIRECT_CACHE_CONTROL = 'public, max-age=3600';

export const GET: APIRoute = () =>
	new Response(null, {
		status: 301,
		headers: { location: localeHref(defaultLocale), 'cache-control': REDIRECT_CACHE_CONTROL },
	});
