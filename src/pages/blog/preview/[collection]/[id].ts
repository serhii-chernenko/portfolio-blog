import type { APIRoute } from 'astro';
import { locales, type Locale } from '../../../../i18n/config';
import { localeHref } from '../../../../i18n/utils';
import { COLLECTIONS, PREVIEW_TOKEN_PARAM } from '../../../../lib/cms/config';
import { getEntryBySlug } from '../../../../lib/cms/entries';

export const prerender = false;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SLUG_PATTERN = /^[a-z0-9-]+$/;

const PUBLIC_PATHS: Record<string, (locale: Locale, slug: string) => string> = {
	[COLLECTIONS.posts]: (locale, slug) => localeHref(locale, `posts/${slug}`),
	[COLLECTIONS.pages]: (locale, slug) => localeHref(locale, slug),
};

function notFound(): Response {
	return new Response('Preview not found', {
		status: 404,
		headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' },
	});
}

/**
 * Target of the admin's "View on site" link (EMDASH_PREVIEW_PATH_PATTERN in astro.config.mts).
 * EmDash signs the token for the entry's database ID and its middleware has already verified it;
 * this route looks the entry up in each locale and forwards the token to the public URL, where
 * the regular page renders the draft because the token names that entry.
 */
export const GET: APIRoute = async ({ params, url }) => {
	const collection = params.collection ?? '';
	const id = params.id ?? '';
	const token = url.searchParams.get(PREVIEW_TOKEN_PARAM);
	const buildPath = PUBLIC_PATHS[collection];
	if (!token || !buildPath || !ID_PATTERN.test(id)) return notFound();

	for (const locale of locales) {
		const entry = await getEntryBySlug(collection, id, locale);
		if (!entry || entry.id !== id) continue;
		if (!entry.slug || !SLUG_PATTERN.test(entry.slug)) return notFound();
		const target = new URL(buildPath(locale, entry.slug), url);
		target.searchParams.set(PREVIEW_TOKEN_PARAM, token);
		return new Response(null, {
			status: 302,
			headers: {
				location: `${target.pathname}${target.search}`,
				'cache-control': 'private, no-store',
			},
		});
	}
	return notFound();
};
