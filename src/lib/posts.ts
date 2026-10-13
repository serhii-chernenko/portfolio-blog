import { stegaClean } from '@sanity/client/stega';
import type { TypedObject } from 'astro-portabletext/types';
import { isLocale, type Locale } from '../i18n/config';
import { localeHref } from '../i18n/utils';
import { includesScheduledContent, type SanityContext } from './sanity/request';
import { portableTextToPlainText } from './portable-text';
import type { SanityImage } from './sanity/image';
import {
	ALL_POSTS_QUERY,
	POST_BY_SLUG_QUERY,
	POST_PLAIN_TEXT_QUERY,
	POSTS_BY_LOCALE_QUERY,
	POSTS_WITH_PLAIN_TEXT_BODY_QUERY,
} from './sanity/queries';
import { tagSlug } from './tag-slug';

export { tagSlug };

export type LocalizedUrls = Record<Locale, string | null>;

export interface Post {
	id: string;
	isDraft: boolean;
	language: Locale;
	slug: string;
	translationKey: string;
	title: string;
	description: string;
	publishedAt: Date;
	updatedAt?: Date;
	tags: string[];
	heroImage?: SanityImage;
	body?: TypedObject[];
	wordCount: number;
	translations: LocalizedUrls;
}

export interface TranslationRef {
	_type: string;
	language: string | null;
	slug: string | null;
	publishedAt?: string | null;
}

interface RawPost {
	id: string;
	isDraft: boolean;
	language: string;
	slug: string;
	title: string | null;
	description: string | null;
	publishedAt: string;
	updatedAt: string | null;
	tags: string[];
	heroImage: SanityImage | null;
	wordCount: number;
	translations: (TranslationRef | null)[] | null;
	body?: TypedObject[] | null;
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export function emptyLocalizedUrls(): LocalizedUrls {
	return { en: null, uk: null };
}

function isLive(ref: TranslationRef, ctx: SanityContext, now: Date): boolean {
	if (ref._type !== 'post' || includesScheduledContent(ctx)) return true;
	const publishedAt = ref.publishedAt ? new Date(stegaClean(ref.publishedAt)) : null;
	return publishedAt !== null && publishedAt <= now;
}

export function resolveTranslationUrls(
	refs: (TranslationRef | null)[] | null,
	ctx: SanityContext,
	buildPath: (locale: Locale, slug: string) => string,
): LocalizedUrls {
	const urls = emptyLocalizedUrls();
	const now = new Date();
	for (const ref of refs ?? []) {
		if (!ref) continue;
		const language = stegaClean(ref.language ?? '');
		const slug = stegaClean(ref.slug ?? '');
		if (!isLocale(language) || !SLUG_PATTERN.test(slug) || !isLive(ref, ctx, now)) continue;
		urls[language] = buildPath(language, slug);
	}
	return urls;
}

function translationKeyFor(slug: string, refs: (TranslationRef | null)[] | null): string {
	for (const ref of refs ?? []) {
		if (!ref || stegaClean(ref.language ?? '') !== 'en') continue;
		const englishSlug = stegaClean(ref.slug ?? '');
		if (SLUG_PATTERN.test(englishSlug)) return englishSlug;
	}
	return slug;
}

function postPath(locale: Locale, slug: string): string {
	return localeHref(locale, `posts/${slug}`);
}

function toDate(value: string | null | undefined): Date | undefined {
	if (!value) return undefined;
	const date = new Date(stegaClean(value));
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function toPost(raw: RawPost, ctx: SanityContext): Post | null {
	const language = stegaClean(raw.language);
	const slug = stegaClean(raw.slug);
	const publishedAt = toDate(raw.publishedAt);
	if (!isLocale(language) || !SLUG_PATTERN.test(slug) || !publishedAt) return null;
	return {
		id: raw.id,
		isDraft: raw.isDraft,
		language,
		slug,
		translationKey: language === 'en' ? slug : translationKeyFor(slug, raw.translations),
		title: raw.title ?? '',
		description: raw.description ?? '',
		publishedAt,
		updatedAt: toDate(raw.updatedAt),
		tags: (raw.tags ?? []).map((tag) => stegaClean(tag)).filter(Boolean),
		heroImage: raw.heroImage?.asset ? raw.heroImage : undefined,
		body: raw.body ?? undefined,
		wordCount: raw.wordCount ?? 0,
		translations: resolveTranslationUrls(raw.translations, ctx, postPath),
	};
}

function toPosts(raws: RawPost[] | null, ctx: SanityContext): Post[] {
	return (raws ?? []).map((raw) => toPost(raw, ctx)).filter((post): post is Post => post !== null);
}

export function postUrl(post: Pick<Post, 'language' | 'slug'>): string {
	return postPath(post.language, post.slug);
}

export async function getPublishedPosts(locale: Locale, ctx: SanityContext): Promise<Post[]> {
	const raws = await ctx.fetch<RawPost[]>(POSTS_BY_LOCALE_QUERY, {
		locale,
		includeFuture: includesScheduledContent(ctx),
	});
	return toPosts(raws, ctx);
}

export async function getAllPublishedPosts(ctx: SanityContext): Promise<Post[]> {
	const raws = await ctx.fetch<RawPost[]>(ALL_POSTS_QUERY, {
		includeFuture: includesScheduledContent(ctx),
	});
	return toPosts(raws, ctx);
}

export async function getPostBySlug(
	locale: Locale,
	slug: string,
	ctx: SanityContext,
): Promise<Post | null> {
	if (!SLUG_PATTERN.test(slug)) return null;
	const raw = await ctx.fetch<RawPost | null>(POST_BY_SLUG_QUERY, {
		locale,
		slug,
		includeFuture: includesScheduledContent(ctx),
	});
	return raw ? toPost(raw, ctx) : null;
}

export async function getPostPlainText(
	locale: Locale,
	slug: string,
	ctx: SanityContext,
): Promise<{ post: Post; plainText: string } | null> {
	if (!SLUG_PATTERN.test(slug)) return null;
	const raw = await ctx.fetch<RawPost | null>(POST_PLAIN_TEXT_QUERY, {
		locale,
		slug,
		includeFuture: includesScheduledContent(ctx),
	});
	const post = raw ? toPost(raw, ctx) : null;
	return post ? { post, plainText: portableTextToPlainText(post.body) } : null;
}

export async function getPublishedPostsWithPlainText(
	locale: Locale,
	ctx: SanityContext,
): Promise<{ post: Post; plainText: string }[]> {
	const raws = await ctx.fetch<RawPost[]>(POSTS_WITH_PLAIN_TEXT_BODY_QUERY, {
		locale,
		includeFuture: includesScheduledContent(ctx),
	});
	return toPosts(raws, ctx).map((post) => ({
		post,
		plainText: portableTextToPlainText(post.body),
	}));
}

export function getTranslatedPostUrls(post: Pick<Post, 'translations'>): LocalizedUrls {
	return post.translations;
}

export function postHasTagSlug(post: Pick<Post, 'tags'>, slug: string): boolean {
	return post.tags.some((tag) => tagSlug(tag) === slug);
}

export async function getPostsForTagSlug(
	locale: Locale,
	slug: string,
	ctx: SanityContext,
): Promise<Post[]> {
	const posts = await getPublishedPosts(locale, ctx);
	return posts.filter((post) => postHasTagSlug(post, slug));
}

export interface TagSummary {
	tag: string;
	slug: string;
	count: number;
}

export function summarizeTags(posts: Pick<Post, 'tags'>[]): TagSummary[] {
	const bySlug = new Map<string, { tag: string; count: number }>();
	for (const post of posts) {
		const slugsInPost = new Set<string>();
		for (const tag of post.tags) {
			const slug = tagSlug(tag);
			if (!slug || slugsInPost.has(slug)) continue;
			slugsInPost.add(slug);
			const entry = bySlug.get(slug);
			if (entry) entry.count += 1;
			else bySlug.set(slug, { tag, count: 1 });
		}
	}
	return Array.from(bySlug, ([slug, { tag, count }]) => ({ tag, slug, count })).sort(
		(a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
	);
}

export async function getTagsForLocale(locale: Locale, ctx: SanityContext): Promise<TagSummary[]> {
	return summarizeTags(await getPublishedPosts(locale, ctx));
}

export function getPostsForLocales(
	locale: Locale | undefined,
	ctx: SanityContext,
): Promise<Post[]> {
	return locale ? getPublishedPosts(locale, ctx) : getAllPublishedPosts(ctx);
}
