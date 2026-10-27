import type { TypedObject } from 'astro-portabletext/types';
import { locales, type Locale } from '../i18n/config';
import { localeHref } from '../i18n/utils';
import { COLLECTIONS } from './cms/config';
import { includesScheduledContent, type CmsContext } from './cms/context';
import {
	dateField,
	getEntryBySlug,
	listEntries,
	listEntriesForAllLocales,
	stringField,
	type CmsEntry,
} from './cms/entries';
import { authorFromByline, type Author } from './cms/author';
import { isMediaImage, type MediaImage } from './cms/media';
import { entrySeo, type EntrySeo } from './cms/seo';
import { postTagsFromEntry, type PostTag } from './cms/tags';
import {
	emptyLocalizedUrls,
	indexByTranslationGroup,
	translationUrls,
	type LocalizedUrls,
} from './cms/translations';
import { portableTextToPlainText, portableTextWordCount } from './portable-text';
import { tagSlug } from './tag-slug';

export { tagSlug, emptyLocalizedUrls, type LocalizedUrls, type PostTag };

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
	/** Terms of the `tag` taxonomy in the post's language, sorted by label. */
	tags: PostTag[];
	/** From the post's primary byline (admin → Bylines). */
	author?: Author;
	/** The entry's SEO panel. Only set on single-post reads. */
	seo?: EntrySeo;
	heroImage?: MediaImage;
	body?: TypedObject[];
	wordCount: number;
	translations: LocalizedUrls;
}

type TranslationIndex = ReturnType<typeof indexByTranslationGroup>;

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function postPath(locale: Locale, slug: string): string {
	return localeHref(locale, `posts/${slug}`);
}

/** The date a post is listed under: its publish date, or for an unpublished preview its schedule. */
function effectivePublishedAt(entry: CmsEntry, ctx: CmsContext): Date | null {
	if (entry.publishedAt) return entry.publishedAt;
	if (!includesScheduledContent(ctx)) return null;
	return dateField(entry, 'scheduledAt') ?? entry.createdAt ?? new Date();
}

/** Published posts with a future date stay hidden until then, except in preview. */
function isLive(entry: CmsEntry, ctx: CmsContext, now = new Date()): boolean {
	const publishedAt = effectivePublishedAt(entry, ctx);
	if (!publishedAt) return false;
	return includesScheduledContent(ctx) || publishedAt <= now;
}

function hasPendingDraft(entry: CmsEntry, ctx: CmsContext): boolean {
	if (!ctx.preview) return false;
	if (entry.status !== 'published') return true;
	const draft = entry.data.draftRevisionId;
	return typeof draft === 'string' && draft !== '' && draft !== entry.data.liveRevisionId;
}

function portableText(value: unknown): TypedObject[] | undefined {
	return Array.isArray(value) ? (value as TypedObject[]) : undefined;
}

function toPost(entry: CmsEntry, index: TranslationIndex, ctx: CmsContext): Post | null {
	const slug = entry.slug ?? '';
	const publishedAt = effectivePublishedAt(entry, ctx);
	if (!SLUG_PATTERN.test(slug) || !publishedAt) return null;
	const translations = translationUrls(
		entry,
		index,
		(candidate) => isLive(candidate, ctx),
		postPath,
	);
	const englishSlug = index.get(entry.translationGroup)?.en?.slug;
	const body = portableText(entry.data.body);
	const heroImage = entry.data.hero_image;
	return {
		id: entry.id,
		isDraft: hasPendingDraft(entry, ctx),
		language: entry.locale,
		slug,
		translationKey:
			entry.locale === 'en' || !englishSlug || !SLUG_PATTERN.test(englishSlug) ? slug : englishSlug,
		title: stringField(entry, 'title'),
		description: stringField(entry, 'description'),
		publishedAt,
		updatedAt: dateField(entry, 'revised_at'),
		tags: postTagsFromEntry(entry),
		author: authorFromByline(entry.data.byline),
		seo: entrySeo(entry),
		heroImage: isMediaImage(heroImage) ? heroImage : undefined,
		body,
		wordCount: portableTextWordCount(body),
		translations,
	};
}

async function translationIndex(): Promise<TranslationIndex> {
	return indexByTranslationGroup(await listEntriesForAllLocales(COLLECTIONS.posts));
}

function byPublishedAtDesc(a: Post, b: Post): number {
	return b.publishedAt.getTime() - a.publishedAt.getTime();
}

export function postUrl(post: Pick<Post, 'language' | 'slug'>): string {
	return postPath(post.language, post.slug);
}

export async function getPublishedPosts(locale: Locale, ctx: CmsContext): Promise<Post[]> {
	const [entries, index] = await Promise.all([
		listEntries(COLLECTIONS.posts, locale),
		translationIndex(),
	]);
	const now = new Date();
	return entries
		.filter((entry) => isLive(entry, ctx, now))
		.map((entry) => toPost(entry, index, ctx))
		.filter((post): post is Post => post !== null)
		.sort(byPublishedAtDesc);
}

export async function getAllPublishedPosts(ctx: CmsContext): Promise<Post[]> {
	const perLocale = await Promise.all(locales.map((locale) => getPublishedPosts(locale, ctx)));
	return perLocale.flat().sort(byPublishedAtDesc);
}

export async function getPostBySlug(
	locale: Locale,
	slug: string,
	ctx: CmsContext,
): Promise<Post | null> {
	if (!SLUG_PATTERN.test(slug)) return null;
	const [entry, index] = await Promise.all([
		getEntryBySlug(COLLECTIONS.posts, slug, locale),
		translationIndex(),
	]);
	if (!entry || !isLive(entry, ctx)) return null;
	return toPost(entry, index, ctx);
}

export async function getPostPlainText(
	locale: Locale,
	slug: string,
	ctx: CmsContext,
): Promise<{ post: Post; plainText: string } | null> {
	const post = await getPostBySlug(locale, slug, ctx);
	return post ? { post, plainText: portableTextToPlainText(post.body) } : null;
}

export async function getPublishedPostsWithPlainText(
	locale: Locale,
	ctx: CmsContext,
): Promise<{ post: Post; plainText: string }[]> {
	const posts = await getPublishedPosts(locale, ctx);
	return posts.map((post) => ({ post, plainText: portableTextToPlainText(post.body) }));
}

export function getTranslatedPostUrls(post: Pick<Post, 'translations'>): LocalizedUrls {
	return post.translations;
}

export function postHasTagSlug(post: Pick<Post, 'tags'>, slug: string): boolean {
	return post.tags.some((tag) => tag.slug === slug);
}

/** Tag labels in display order, for keywords, RSS categories and plain-text exports. */
export function tagLabels(post: Pick<Post, 'tags'>): string[] {
	return post.tags.map((tag) => tag.label);
}

export async function getPostsForTagSlug(
	locale: Locale,
	slug: string,
	ctx: CmsContext,
): Promise<Post[]> {
	const posts = await getPublishedPosts(locale, ctx);
	return posts.filter((post) => postHasTagSlug(post, slug));
}

export interface TagSummary {
	tag: string;
	slug: string;
	count: number;
	/** Links the tag to its translations (the same term in other languages). */
	translationGroup: string;
}

export function summarizeTags(posts: Pick<Post, 'tags'>[]): TagSummary[] {
	const bySlug = new Map<string, Omit<TagSummary, 'slug'>>();
	for (const post of posts) {
		const slugsInPost = new Set<string>();
		for (const { label, slug, translationGroup } of post.tags) {
			if (!slug || slugsInPost.has(slug)) continue;
			slugsInPost.add(slug);
			const entry = bySlug.get(slug);
			if (entry) entry.count += 1;
			else bySlug.set(slug, { tag: label, count: 1, translationGroup });
		}
	}
	return Array.from(bySlug, ([slug, summary]) => ({ ...summary, slug })).sort(
		(a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
	);
}

export async function getTagsForLocale(locale: Locale, ctx: CmsContext): Promise<TagSummary[]> {
	return summarizeTags(await getPublishedPosts(locale, ctx));
}

export function getPostsForLocales(locale: Locale | undefined, ctx: CmsContext): Promise<Post[]> {
	return locale ? getPublishedPosts(locale, ctx) : getAllPublishedPosts(ctx);
}
