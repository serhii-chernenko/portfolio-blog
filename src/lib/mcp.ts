import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';
import { getPublishedPosts, getTagsForLocale, tagSlug, postUrl, type AnyPost } from './posts';
import { getPostSlug } from './post-slug';
import { locales, type Locale } from '../i18n/config';
import { withBase } from '../i18n/utils';

const localeSchema = z.enum(locales);

const postSummarySchema = z.object({
	locale: localeSchema,
	slug: z.string(),
	title: z.string(),
	description: z.string(),
	url: z.string(),
	publishedAt: z.string(),
	updatedAt: z.string().optional(),
	tags: z.array(z.string()),
});

function localeOfPost(post: AnyPost): Locale {
	return post.collection === 'postsEn' ? 'en' : 'uk';
}

function toSummary(post: AnyPost) {
	return {
		locale: localeOfPost(post),
		slug: getPostSlug(post),
		title: post.data.title,
		description: post.data.description,
		url: postUrl(post),
		publishedAt: post.data.publishedAt.toISOString(),
		updatedAt: post.data.updatedAt?.toISOString(),
		tags: post.data.tags ?? [],
	};
}

async function getPostsForLocales(locale: Locale | undefined): Promise<AnyPost[]> {
	const targets = locale ? [locale] : locales;
	const lists = await Promise.all(targets.map((l) => getPublishedPosts(l)));
	return lists.flat().sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
}

function textResult(value: unknown, structuredContent?: Record<string, unknown>) {
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(value) }],
		...(structuredContent ? { structuredContent } : {}),
	};
}

export function buildMcpServer(): McpServer {
	const server = new McpServer({ name: 'portfolio-blog', version: '1.0.0' });

	server.registerTool(
		'list_posts',
		{
			title: 'List posts',
			description: 'List published blog posts, newest first, optionally filtered by tag.',
			inputSchema: z.object({
				locale: localeSchema.optional().describe('Omit to list posts from both locales'),
				tag: z.string().min(1).max(64).optional().describe('Tag label to filter by'),
				limit: z.number().int().min(1).max(50).default(20),
				offset: z.number().int().min(0).default(0),
			}),
			outputSchema: z.object({ total: z.number().int(), posts: z.array(postSummarySchema) }),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ locale, tag, limit, offset }) => {
			let posts = await getPostsForLocales(locale);
			if (tag) posts = posts.filter((p) => (p.data.tags ?? []).includes(tag));
			const page = posts.slice(offset, offset + limit).map(toSummary);
			const output = { total: posts.length, posts: page };
			return textResult(output, output);
		},
	);

	server.registerTool(
		'get_post',
		{
			title: 'Get post',
			description: 'Get the full content of one published post by locale and slug.',
			inputSchema: z.object({
				locale: localeSchema,
				slug: z
					.string()
					.min(1)
					.max(120)
					.regex(/^[A-Za-z0-9-]+$/),
			}),
			outputSchema: z.object({
				locale: localeSchema,
				slug: z.string(),
				title: z.string(),
				description: z.string(),
				url: z.string(),
				publishedAt: z.string(),
				updatedAt: z.string().optional(),
				tags: z.array(z.string()),
				translationKey: z.string(),
				body: z.string(),
			}),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ locale, slug }) => {
			const posts = await getPublishedPosts(locale);
			const post = posts.find((p) => getPostSlug(p) === slug);
			if (!post) {
				return {
					isError: true,
					content: [{ type: 'text' as const, text: 'No published post found for that slug.' }],
				};
			}
			const output = {
				...toSummary(post),
				translationKey: post.data.translationKey,
				body: post.body ?? '',
			};
			return textResult(output, output);
		},
	);

	server.registerTool(
		'search_posts_by_tag',
		{
			title: 'Search posts by tag',
			description: 'List published posts that have a given tag, newest first.',
			inputSchema: z.object({
				tag: z.string().min(1).max(64),
				locale: localeSchema.optional(),
				limit: z.number().int().min(1).max(50).default(20),
			}),
			outputSchema: z.object({ total: z.number().int(), posts: z.array(postSummarySchema) }),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ tag, locale, limit }) => {
			const posts = (await getPostsForLocales(locale)).filter((p) =>
				(p.data.tags ?? []).includes(tag),
			);
			const output = { total: posts.length, posts: posts.slice(0, limit).map(toSummary) };
			return textResult(output, output);
		},
	);

	server.registerTool(
		'list_tags',
		{
			title: 'List tags',
			description: 'List all tags used by published posts, with post counts, per locale.',
			inputSchema: z.object({ locale: localeSchema.optional() }),
			outputSchema: z.object({
				tags: z.array(
					z.object({
						tag: z.string(),
						slug: z.string(),
						count: z.number().int(),
						locale: localeSchema,
						url: z.string(),
					}),
				),
			}),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ locale }) => {
			const targets = locale ? [locale] : locales;
			const perLocale = await Promise.all(
				targets.map(async (l) => {
					const tags = await getTagsForLocale(l);
					return tags.map(({ tag, count }) => ({
						tag,
						slug: tagSlug(tag),
						count,
						locale: l,
						url: withBase(`${l}/tags/${tagSlug(tag)}`),
					}));
				}),
			);
			const output = { tags: perLocale.flat() };
			return textResult(output, output);
		},
	);

	return server;
}
