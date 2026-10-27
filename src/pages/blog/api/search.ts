import type { APIRoute } from 'astro';
import { search } from 'emdash';
import { isLocale } from '../../../i18n/config';
import { COLLECTIONS } from '../../../lib/cms/config';
import { createPublishedContext } from '../../../lib/cms/context';
import { getPublishedPosts, postUrl, type Post } from '../../../lib/posts';
import { portableTextToPlainText } from '../../../lib/portable-text';

export const prerender = false;

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const RESULT_LIMIT = 10;
const FTS_CANDIDATE_LIMIT = 50;
const MAX_TERMS = 8;
const TOKEN_SEPARATOR = /[^\p{L}\p{N}]+/u;

/** Field weights of the relevance score: title 4, tags 3, description 2, body 1. */
const WEIGHTS = { title: 4, tags: 3, description: 2, body: 1 } as const;

function json(body: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
}

function toTerms(query: string): string[] {
	return query
		.normalize('NFKC')
		.toLowerCase()
		.split(/\s+/)
		.map((term) => term.replace(/[^\p{L}\p{N}-]/gu, ''))
		.filter((term) => term.length > 0)
		.slice(0, MAX_TERMS);
}

function tokenize(text: string): string[] {
	return text.normalize('NFKC').toLowerCase().split(TOKEN_SEPARATOR).filter(Boolean);
}

/** Every term matches the start of some word in the text (GROQ `match` with `term*`). */
function matchesAll(text: string, terms: string[]): boolean {
	const tokens = tokenize(text);
	return terms.every((term) =>
		tokenize(term).every((part) => tokens.some((token) => token.startsWith(part))),
	);
}

function score(post: Post, terms: string[]): number {
	let total = 0;
	if (matchesAll(post.title, terms)) total += WEIGHTS.title;
	if (post.tags.some((tag) => matchesAll(tag.label, terms))) total += WEIGHTS.tags;
	if (matchesAll(post.description, terms)) total += WEIGHTS.description;
	if (matchesAll(portableTextToPlainText(post.body), terms)) total += WEIGHTS.body;
	return total;
}

/** Posts EmDash's full-text index matches; it also catches stemmed forms the word match misses. */
async function ftsMatches(query: string, locale: string): Promise<Set<string>> {
	try {
		const { items } = await search(query, {
			collections: [COLLECTIONS.posts],
			locale,
			status: 'published',
			limit: FTS_CANDIDATE_LIMIT,
		});
		return new Set(items.map((item) => item.id));
	} catch (error) {
		console.warn(
			JSON.stringify({
				message: 'EmDash full-text search failed; using word matching only',
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return new Set();
	}
}

export const GET: APIRoute = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	const locale = url.searchParams.get('locale') ?? '';
	if (!isLocale(locale)) return json({ error: 'Invalid locale' }, 400);
	if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
		return json({ error: 'Query must be 2–100 characters' }, 400);
	}

	const terms = toTerms(query);
	if (terms.length === 0) return json({ results: [] });

	try {
		const [posts, ftsIds] = await Promise.all([
			getPublishedPosts(locale, createPublishedContext()),
			ftsMatches(terms.join(' '), locale),
		]);
		const results = posts
			.map((post) => {
				const value = score(post, terms);
				// An index-only hit (e.g. a stemmed form) ranks like a body match.
				return { post, score: value === 0 && ftsIds.has(post.id) ? WEIGHTS.body : value };
			})
			.filter(({ score: value }) => value > 0)
			.sort(
				(a, b) => b.score - a.score || b.post.publishedAt.getTime() - a.post.publishedAt.getTime(),
			)
			.slice(0, RESULT_LIMIT)
			.map(({ post }) => ({
				title: post.title,
				description: post.description,
				url: postUrl(post),
				publishedAt: post.publishedAt.toISOString(),
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
