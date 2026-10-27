import type { Locale } from '../../i18n/config';
import type { CmsEntry } from './entries';

export type LocalizedUrls = Record<Locale, string | null>;

export function emptyLocalizedUrls(): LocalizedUrls {
	return { en: null, uk: null };
}

/** Groups entries of several locales by EmDash translation group. */
export function indexByTranslationGroup(
	entriesPerLocale: CmsEntry[][],
): Map<string, Partial<Record<Locale, CmsEntry>>> {
	const index = new Map<string, Partial<Record<Locale, CmsEntry>>>();
	for (const entries of entriesPerLocale) {
		for (const entry of entries) {
			const group = index.get(entry.translationGroup) ?? {};
			group[entry.locale] = entry;
			index.set(entry.translationGroup, group);
		}
	}
	return index;
}

/**
 * URLs of the live translations of an entry (itself included). Only entries that are visible on
 * the public site count, so the language switcher, hreflang and sitemap never point at a draft.
 */
export function translationUrls(
	entry: Pick<CmsEntry, 'translationGroup' | 'locale' | 'slug'>,
	index: Map<string, Partial<Record<Locale, CmsEntry>>>,
	isVisible: (candidate: CmsEntry) => boolean,
	buildPath: (locale: Locale, slug: string) => string,
): LocalizedUrls {
	const urls = emptyLocalizedUrls();
	const group = index.get(entry.translationGroup) ?? {};
	const siblings = (Object.entries(group) as [Locale, CmsEntry][]).filter(
		([locale, candidate]) => locale !== entry.locale && candidate.slug && isVisible(candidate),
	);
	// An entry without a live translation links nowhere, so the language switcher falls back to
	// the other language's home page and only the page's own hreflang is emitted.
	if (siblings.length === 0) return urls;
	for (const [locale, candidate] of siblings) urls[locale] = buildPath(locale, candidate.slug!);
	if (entry.slug) urls[entry.locale] = buildPath(entry.locale, entry.slug);
	return urls;
}
