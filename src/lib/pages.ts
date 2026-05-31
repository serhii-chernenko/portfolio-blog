import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '../i18n/config';
import { withBase } from '../i18n/utils';
import { getPageSlug } from './page-slug';

export type AnyPage = CollectionEntry<'pagesEn'> | CollectionEntry<'pagesUk'>;

const showDrafts = import.meta.env.DEV || import.meta.env.PREVIEW_MODE === 'true';

function collectionFor(locale: Locale): 'pagesEn' | 'pagesUk' {
	return locale === 'en' ? 'pagesEn' : 'pagesUk';
}

export function localeOf(page: AnyPage): Locale {
	return page.collection === 'pagesEn' ? 'en' : 'uk';
}

export function pageUrl(page: AnyPage): string {
	const locale = localeOf(page);
	return withBase(`${locale}/${getPageSlug(page)}`);
}

export async function getPages(locale: Locale): Promise<AnyPage[]> {
	const all = await getCollection(collectionFor(locale));
	return all.filter((p) => showDrafts || !p.data.draft);
}

export async function getPageByKey(
	translationKey: string,
	locale: Locale,
): Promise<AnyPage | undefined> {
	const pages = await getPages(locale);
	return pages.find((p) => p.data.translationKey === translationKey);
}

export async function getPagePath(translationKey: string, locale: Locale): Promise<string> {
	const page = await getPageByKey(translationKey, locale);
	if (page) return pageUrl(page);
	return withBase(`${locale}/`);
}

/**
 * Resolves a page's URL slug by translationKey for runtime use (API routes).
 * Never throws and never returns an unexpected value — falls back to `fallback`
 * if the content lookup fails or the page is missing, so it can't break an
 * already-committed subscribe/confirm flow. Also guards the slug against
 * unexpected characters (defence-in-depth: slugs are CMS/editor-controlled).
 */
export async function resolvePageSlug(
	translationKey: string,
	locale: Locale,
	fallback: string,
): Promise<string> {
	try {
		const page = await getPageByKey(translationKey, locale);
		const slug = page ? getPageSlug(page) : fallback;
		return /^[a-z0-9-]+$/.test(slug) ? slug : fallback;
	} catch {
		return fallback;
	}
}
