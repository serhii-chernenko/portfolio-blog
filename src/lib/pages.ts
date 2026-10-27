import type { TypedObject } from 'astro-portabletext/types';
import type { Locale } from '../i18n/config';
import { localeHref } from '../i18n/utils';
import { COLLECTIONS } from './cms/config';
import { createPublishedContext, type CmsContext } from './cms/context';
import {
	dateField,
	getEntryBySlug,
	listEntries,
	listEntriesForAllLocales,
	stringField,
	type CmsEntry,
} from './cms/entries';
import { entrySeo, type EntrySeo } from './cms/seo';
import { indexByTranslationGroup, translationUrls, type LocalizedUrls } from './cms/translations';

export interface Page {
	id: string;
	language: Locale;
	key: string;
	slug: string;
	title: string;
	description: string;
	category: 'static' | 'legal';
	updatedAt?: Date;
	body?: TypedObject[];
	translations: LocalizedUrls;
	/** The entry's SEO panel. Only set on single-page reads. */
	seo?: EntrySeo;
}

type TranslationIndex = ReturnType<typeof indexByTranslationGroup>;

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function pagePath(locale: Locale, slug: string): string {
	return localeHref(locale, slug);
}

function toPage(entry: CmsEntry, index: TranslationIndex): Page | null {
	const slug = entry.slug ?? '';
	const key = stringField(entry, 'key');
	if (!SLUG_PATTERN.test(slug) || !key) return null;
	return {
		id: entry.id,
		language: entry.locale,
		key,
		slug,
		title: stringField(entry, 'title'),
		description: stringField(entry, 'description'),
		category: stringField(entry, 'category') === 'legal' ? 'legal' : 'static',
		updatedAt: dateField(entry, 'revised_at'),
		body: Array.isArray(entry.data.body) ? (entry.data.body as TypedObject[]) : undefined,
		translations: translationUrls(entry, index, () => true, pagePath),
		seo: entrySeo(entry),
	};
}

async function translationIndex(): Promise<TranslationIndex> {
	return indexByTranslationGroup(await listEntriesForAllLocales(COLLECTIONS.pages));
}

/** Code-point order, as the Sanity-era `order(title asc)` listed pages. */
function byTitle(a: Page, b: Page): number {
	if (a.title === b.title) return 0;
	return a.title < b.title ? -1 : 1;
}

export function pageUrl(page: Pick<Page, 'language' | 'slug'>): string {
	return pagePath(page.language, page.slug);
}

export async function getPages(locale: Locale, _ctx: CmsContext): Promise<Page[]> {
	const [entries, index] = await Promise.all([
		listEntries(COLLECTIONS.pages, locale),
		translationIndex(),
	]);
	return entries
		.map((entry) => toPage(entry, index))
		.filter((page): page is Page => page !== null)
		.sort(byTitle);
}

export async function getPageBySlug(
	locale: Locale,
	slug: string,
	_ctx: CmsContext,
): Promise<Page | null> {
	if (!SLUG_PATTERN.test(slug)) return null;
	const [entry, index] = await Promise.all([
		getEntryBySlug(COLLECTIONS.pages, slug, locale),
		translationIndex(),
	]);
	return entry ? toPage(entry, index) : null;
}

export async function getPageByKey(
	key: string,
	locale: Locale,
	ctx: CmsContext,
): Promise<Page | null> {
	const pages = await getPages(locale, ctx);
	return pages.find((page) => page.key === key) ?? null;
}

export async function getPagePath(key: string, locale: Locale, ctx: CmsContext): Promise<string> {
	const page = await getPageByKey(key, locale, ctx);
	return page ? pageUrl(page) : localeHref(locale);
}

/**
 * Resolves a page slug for API routes that must never fail: any lookup error or
 * unexpected slug shape yields `fallback`, so a committed subscribe/confirm flow
 * cannot break on CMS data.
 */
export async function resolvePageSlug(
	key: string,
	locale: Locale,
	fallback: string,
): Promise<string> {
	try {
		const page = await getPageByKey(key, locale, createPublishedContext());
		const slug = page?.slug ?? fallback;
		return SLUG_PATTERN.test(slug) ? slug : fallback;
	} catch {
		return fallback;
	}
}
