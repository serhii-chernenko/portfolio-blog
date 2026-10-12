import type { APIRoute } from 'astro';
import { isLocale } from '../../i18n/config';
import { postUrl } from '../../lib/posts';
import { SEARCH_POSTS_QUERY } from '../../lib/sanity/queries';
import { createPublishedContext } from '../../lib/sanity/request';

export const prerender = false;

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const RESULT_LIMIT = 10;
const MAX_TERMS = 8;
const SLUG_PATTERN = /^[a-z0-9-]+$/;

interface RawSearchResult {
	title: string | null;
	description: string | null;
	language: string;
	slug: string | null;
	publishedAt: string;
}

function json(body: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
}

function toMatchTerms(query: string): string[] {
	return query
		.normalize('NFKC')
		.split(/\s+/)
		.map((term) => term.replace(/[^\p{L}\p{N}-]/gu, ''))
		.filter((term) => term.length > 0)
		.slice(0, MAX_TERMS)
		.map((term) => `${term}*`);
}

export const GET: APIRoute = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	const locale = url.searchParams.get('locale') ?? '';
	if (!isLocale(locale)) return json({ error: 'Invalid locale' }, 400);
	if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
		return json({ error: 'Query must be 2–100 characters' }, 400);
	}

	const terms = toMatchTerms(query);
	if (terms.length === 0) return json({ results: [] });

	try {
		const raws = await createPublishedContext().fetch<RawSearchResult[]>(SEARCH_POSTS_QUERY, {
			locale,
			terms: terms.join(' '),
			limit: RESULT_LIMIT,
		});
		const results = (raws ?? [])
			.filter((raw) => raw.slug && SLUG_PATTERN.test(raw.slug))
			.map((raw) => ({
				title: raw.title ?? '',
				description: raw.description ?? '',
				url: postUrl({ language: locale, slug: raw.slug ?? '' }),
				publishedAt: raw.publishedAt,
			}));
		return json({ results });
	} catch (error) {
		console.error(
			JSON.stringify({
				message: 'Search query failed',
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return json({ error: 'Search unavailable' }, 502);
	}
};
