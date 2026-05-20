import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '../i18n/config';
import { withBase } from '../i18n/utils';
import { getPostSlug } from './post-slug';

export type AnyPost = CollectionEntry<'postsEn'> | CollectionEntry<'postsUk'>;

const showDrafts =
	import.meta.env.DEV || import.meta.env.PREVIEW_MODE === 'true';

function collectionFor(locale: Locale): 'postsEn' | 'postsUk' {
	return locale === 'en' ? 'postsEn' : 'postsUk';
}

export function localeOf(post: AnyPost): Locale {
	return post.collection === 'postsEn' ? 'en' : 'uk';
}

export function postUrl(post: AnyPost): string {
	const locale = localeOf(post);
	const slug = getPostSlug(post);
	return withBase(`${locale}/posts/${slug}`);
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
	return filtered.sort(
		(a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
	);
}

export async function getAllPublishedPosts(): Promise<AnyPost[]> {
	const [en, uk] = await Promise.all([
		getPublishedPosts('en'),
		getPublishedPosts('uk'),
	]);
	return [...en, ...uk];
}

export async function getTagsForLocale(
	locale: Locale,
): Promise<{ tag: string; count: number }[]> {
	const posts = await getPublishedPosts(locale);
	const counts = new Map<string, number>();
	for (const p of posts) {
		for (const tag of p.data.tags ?? []) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return Array.from(counts.entries())
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function tagSlug(tag: string): string {
	return tag
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9Ѐ-ӿ]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
