import type { APIRoute } from 'astro';
import { isLocale } from '../../../../../i18n/config';
import { getCmsContext } from '../../../../../lib/cms/context';
import { isLayoutDataVersion, loadLayoutPayload } from '../../../../../lib/site';

export const prerender = false;

/**
 * Layout data and UI string overrides for one language (see LayoutPayload in src/lib/site.ts).
 * Pages read it through the Worker's loopback entrypoint, so it is normally a Workers Cache hit;
 * it carries only the layout's cache tags, so EmDash's purges refresh it with the pages.
 */
export const GET: APIRoute = async ({ params, locals }) => {
	const locale = params.locale ?? '';
	if (!isLayoutDataVersion(params.version) || !isLocale(locale)) {
		return new Response(null, { status: 404 });
	}
	const payload = await loadLayoutPayload(locale, getCmsContext(locals));
	locals.cacheTags = [];
	return new Response(JSON.stringify(payload), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'x-robots-tag': 'noindex',
			// Never cache a payload rendered without its UI string overrides.
			...(payload.degraded ? { 'cache-control': 'no-store' } : {}),
		},
	});
};
