import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '../i18n/config';
import { withPageBase } from '../i18n/utils';
import { getPostSlug } from './post-slug';
import { tagSlug } from './tag-slug';

export { tagSlug };

export type AnyPost = CollectionEntry<'postsEn'> | CollectionEntry<'postsUk'>;

const showDrafts = import.meta.env.DEV || import.meta.env.PREVIEW_MODE === 'true';

function collectionFor(locale: Locale): 'postsEn' | 'postsUk' {
	return locale === 'en' ? 'postsEn' : 'postsUk';
}

export function localeOf(post: AnyPost): Locale {
	return post.collection === 'postsEn' ? 'en' : 'uk';
}

export function postUrl(post: AnyPost): string {
	const locale = localeOf(post);
	const slug = getPostSlug(post);
	return withPageBase(`${locale}/posts/${slug}`);
}

export async function getPublishedPosts(locale: Locale): Promise<AnyPost[]> {
	const all = await getCollection(collectionFor(locale));
	const now = new Date();
	const filtered = all.filter((p) => {
		if (showDrafts) return true;
		if (p.data.draft) return false;
		if (p.data.publishedAt > now) return false;
		return true;
	});
	return filtered.sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
}

export async function getAllPublishedPosts(): Promise<AnyPost[]> {
	const [en, uk] = await Promise.all([getPublishedPosts('en'), getPublishedPosts('uk')]);
	return [...en, ...uk];
}

export function postHasTagSlug(post: AnyPost, slug: string): boolean {
	return (post.data.tags ?? []).some((tag) => tagSlug(tag) === slug);
}

export async function getPostsForTagSlug(locale: Locale, slug: string): Promise<AnyPost[]> {
	const posts = await getPublishedPosts(locale);
	return posts.filter((post) => postHasTagSlug(post, slug));
}

export async function getTagsForLocale(
	locale: Locale,
): Promise<{ tag: string; slug: string; count: number }[]> {
	const posts = await getPublishedPosts(locale);
	const bySlug = new Map<string, { tag: string; count: number }>();
	for (const post of posts) {
		const slugsInPost = new Set<string>();
		for (const tag of post.data.tags ?? []) {
			const slug = tagSlug(tag);
			if (slugsInPost.has(slug)) continue;
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
