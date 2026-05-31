import type { CollectionEntry } from 'astro:content';

type LocalizedPage = CollectionEntry<'pagesEn'> | CollectionEntry<'pagesUk'>;

export function getPageSlug(page: LocalizedPage): string {
	return page.data.slug ?? page.id.replace(/\.mdoc$/, '');
}
