import type { CollectionEntry } from 'astro:content';

type LocalizedPost = CollectionEntry<'postsEn'> | CollectionEntry<'postsUk'>;

export function getPostSlug(post: LocalizedPost): string {
	return post.data.slug ?? post.id.replace(/\.mdoc$/, '');
}