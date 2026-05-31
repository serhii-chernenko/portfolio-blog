import { ui, type UIKey } from './ui';
import { defaultLocale, isLocale, type Locale } from './config';
import { getPostSlug } from '../lib/post-slug';
import { getPageSlug } from '../lib/page-slug';

export function getLocaleFromUrl(url: URL): Locale {
	const [, maybeLocale] = url.pathname.split('/');
	if (maybeLocale && isLocale(maybeLocale)) return maybeLocale;
	return defaultLocale;
}

export function useTranslations(locale: Locale) {
	return function t(key: UIKey, vars?: Record<string, string | number>): string {
		let value: string = ui[locale][key] ?? ui[defaultLocale][key];
		if (vars) {
			for (const [k, v] of Object.entries(vars)) {
				value = value.replaceAll(`{${k}}`, String(v));
			}
		}
		return value;
	};
}

/**
 * Prepends Astro's BASE_URL (e.g. `/blog`) to a path.
 * Always inserts exactly one slash between base and path.
 */
export function withBase(path: string): string {
	const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
	const clean = path.replace(/^\/+/, '');
	return clean ? `${base}/${clean}` : `${base}/`;
}

export function localeHref(locale: Locale, path = ''): string {
	const clean = path.replace(/^\/+/, '');
	return withBase(clean ? `${locale}/${clean}` : `${locale}/`);
}

/**
 * Returns the URL for the same post in each locale.
 * Returns null for locales where the translation doesn't exist.
 */
export async function getTranslatedPostUrls(
	translationKey: string,
): Promise<Record<Locale, string | null>> {
	const { getCollection } = await import('astro:content');
	const all = [...(await getCollection('postsEn')), ...(await getCollection('postsUk'))];
	const matches = all.filter((p) => p.data.translationKey === translationKey);
	const result: Record<Locale, string | null> = { en: null, uk: null };
	for (const m of matches) {
		const locale: Locale = m.collection === 'postsEn' ? 'en' : 'uk';
		result[locale] = withBase(`${locale}/posts/${getPostSlug(m)}`);
	}
	return result;
}

/**
 * Returns the URL for the same page in each locale.
 * Returns null for locales where the translation doesn't exist.
 */
export async function getTranslatedPageUrls(
	translationKey: string,
): Promise<Record<Locale, string | null>> {
	const { getCollection } = await import('astro:content');
	const showDrafts = import.meta.env.DEV || import.meta.env.PREVIEW_MODE === 'true';
	const all = [...(await getCollection('pagesEn')), ...(await getCollection('pagesUk'))];
	const matches = all
		.filter((p) => showDrafts || !p.data.draft)
		.filter((p) => p.data.translationKey === translationKey);
	const result: Record<Locale, string | null> = { en: null, uk: null };
	for (const m of matches) {
		const locale: Locale = m.collection === 'pagesEn' ? 'en' : 'uk';
		result[locale] = withBase(`${locale}/${getPageSlug(m)}`);
	}
	return result;
}
