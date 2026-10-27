import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';
import {
	getPostPlainText,
	getPostsForLocales,
	getTagsForLocale,
	tagSlug,
	type PostTag,
	postUrl,
	type Post,
} from './posts';
import { createPublishedContext } from './cms/context';
import { locales } from '../i18n/config';
import { localeHref } from '../i18n/utils';

const localeSchema = z.enum(locales);
const TAG_DESCRIPTION = "Tag label or slug (as returned by list_tags' `tag`/`slug` fields)";

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

const translationsSchema = z.object({
	en: z.string().nullable(),
	uk: z.string().nullable(),
});

function toSummary(post: Post) {
	return {
		locale: post.language,
		slug: post.slug,
		title: post.title,
		description: post.description,
		url: postUrl(post),
		publishedAt: post.publishedAt.toISOString(),
		updatedAt: post.updatedAt?.toISOString(),
		tags: post.tags.map((tag) => tag.label),
	};
}

function matchesTag(postTags: PostTag[], query: string): boolean {
	return postTags.some((t) => t.label === query || t.slug === query || t.slug === tagSlug(query));
}

function textResult(value: unknown, structuredContent?: Record<string, unknown>) {
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(value) }],
		...(structuredContent ? { structuredContent } : {}),
	};
}

export function buildMcpServer(): McpServer {
	const server = new McpServer({ name: 'portfolio-blog', version: '1.0.0' });
	const cms = createPublishedContext();

	server.registerTool(
		'list_posts',
		{
			title: 'List posts',
			description: 'List published blog posts, newest first, optionally filtered by tag.',
			inputSchema: z.object({
				locale: localeSchema.optional().describe('Omit to list posts from both locales'),
				tag: z.string().min(1).max(64).optional().describe(TAG_DESCRIPTION),
				limit: z.number().int().min(1).max(50).default(20),
				offset: z.number().int().min(0).default(0),
			}),
			outputSchema: z.object({ total: z.number().int(), posts: z.array(postSummarySchema) }),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ locale, tag, limit, offset }) => {
			let posts = await getPostsForLocales(locale, cms);
			if (tag) posts = posts.filter((p) => matchesTag(p.tags, tag));
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
				translations: translationsSchema,
				body: z.string(),
			}),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ locale, slug }) => {
			const result = await getPostPlainText(locale, slug, cms);
			if (!result) {
				return {
					isError: true,
					content: [{ type: 'text' as const, text: 'No published post found for that slug.' }],
				};
			}
			const output = {
				...toSummary(result.post),
				translations: result.post.translations,
				body: result.plainText,
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
				tag: z.string().min(1).max(64).describe(TAG_DESCRIPTION),
				locale: localeSchema.optional(),
				limit: z.number().int().min(1).max(50).default(20),
				offset: z.number().int().min(0).default(0),
			}),
			outputSchema: z.object({ total: z.number().int(), posts: z.array(postSummarySchema) }),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ tag, locale, limit, offset }) => {
			const posts = (await getPostsForLocales(locale, cms)).filter((p) => matchesTag(p.tags, tag));
			const output = {
				total: posts.length,
				posts: posts.slice(offset, offset + limit).map(toSummary),
			};
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
					const tags = await getTagsForLocale(l, cms);
					return tags.map(({ tag, slug, count }) => ({
						tag,
						slug,
						count,
						locale: l,
						url: localeHref(l, `tags/${slug}`),
					}));
				}),
			);
			const output = { tags: perLocale.flat() };
			return textResult(output, output);
		},
	);

	return server;
}
