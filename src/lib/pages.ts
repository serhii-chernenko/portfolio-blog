import { stegaClean } from '@sanity/client/stega';
import type { TypedObject } from 'astro-portabletext/types';
import { isLocale, type Locale } from '../i18n/config';
import { withBase } from '../i18n/utils';
import { resolveTranslationUrls, type LocalizedUrls, type TranslationRef } from './posts';
import { createPublishedContext, type SanityContext } from './sanity/request';
import { PAGE_BY_KEY_QUERY, PAGE_BY_SLUG_QUERY, PAGES_BY_LOCALE_QUERY } from './sanity/queries';

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
}

interface RawPage {
	id: string;
	language: string;
	key: string;
	slug: string;
	title: string | null;
	description: string | null;
	category: string;
	updatedAt: string | null;
	translations: (TranslationRef | null)[] | null;
	body?: TypedObject[] | null;
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function pagePath(locale: Locale, slug: string): string {
	return withBase(`${locale}/${slug}`);
}

function toPage(raw: RawPage, ctx: SanityContext): Page | null {
	const language = stegaClean(raw.language);
	const slug = stegaClean(raw.slug);
	const key = stegaClean(raw.key);
	if (!isLocale(language) || !SLUG_PATTERN.test(slug) || !key) return null;
	const updatedAt = raw.updatedAt ? new Date(stegaClean(raw.updatedAt)) : undefined;
	return {
		id: raw.id,
		language,
		key,
		slug,
		title: raw.title ?? '',
		description: raw.description ?? '',
		category: stegaClean(raw.category) === 'legal' ? 'legal' : 'static',
		updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : undefined,
		body: raw.body ?? undefined,
		translations: resolveTranslationUrls(raw.translations, ctx, pagePath),
	};
}

export function pageUrl(page: Pick<Page, 'language' | 'slug'>): string {
	return pagePath(page.language, page.slug);
}

export async function getPages(locale: Locale, ctx: SanityContext): Promise<Page[]> {
	const raws = await ctx.fetch<RawPage[]>(PAGES_BY_LOCALE_QUERY, { locale });
	return (raws ?? []).map((raw) => toPage(raw, ctx)).filter((page): page is Page => page !== null);
}

export async function getPageBySlug(
	locale: Locale,
	slug: string,
	ctx: SanityContext,
): Promise<Page | null> {
	if (!SLUG_PATTERN.test(slug)) return null;
	const raw = await ctx.fetch<RawPage | null>(PAGE_BY_SLUG_QUERY, { locale, slug });
	return raw ? toPage(raw, ctx) : null;
}

export async function getPageByKey(
	key: string,
	locale: Locale,
	ctx: SanityContext,
): Promise<Page | null> {
	const raw = await ctx.fetch<RawPage | null>(PAGE_BY_KEY_QUERY, { locale, key });
	return raw ? toPage(raw, ctx) : null;
}

export async function getPagePath(
	key: string,
	locale: Locale,
	ctx: SanityContext,
): Promise<string> {
	const page = await getPageByKey(key, locale, ctx);
	return page ? pageUrl(page) : withBase(`${locale}/`);
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
