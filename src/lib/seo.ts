import type { Locale } from '../i18n/config';
import { htmlLangAttribute, ogLocale } from '../i18n/config';
import { withBase } from '../i18n/utils';

export interface SeoInput {
	site: URL | string;
	pathname: string;
	locale: Locale;
	title: string;
	description: string;
	type?: 'website' | 'article';
	image?: string;
	publishedAt?: Date;
	updatedAt?: Date;
	tags?: string[];
	alternates?: Partial<Record<Locale, string | null>>;
}

/**
 * Ensures an absolute URL string ends with a trailing slash.
 * Skips URLs whose pathname ends with a file extension (e.g. .xml, .html)
 * so that asset/feed URLs are left untouched.
 */
function ensureTrailingSlash(url: string): string {
	const parsed = new URL(url);
	// If the pathname ends with a file extension, leave it as-is.
	if (/\.[^./]+$/.test(parsed.pathname)) return url;
	if (!parsed.pathname.endsWith('/')) {
		parsed.pathname += '/';
	}
	return parsed.toString();
}

export function buildCanonical(site: URL | string, pathname: string): string {
	const base = typeof site === 'string' ? new URL(site) : site;
	return ensureTrailingSlash(new URL(pathname, base).toString());
}

export function buildHreflang(
	site: URL | string,
	locale: Locale,
	pathname: string,
	alternates?: Partial<Record<Locale, string | null>>,
): { hreflang: string; href: string }[] {
	const base = typeof site === 'string' ? new URL(site) : site;
	const out: { hreflang: string; href: string }[] = [];
	const seen = new Set<string>();

	const self = ensureTrailingSlash(new URL(pathname, base).toString());
	out.push({ hreflang: htmlLangAttribute[locale], href: self });
	seen.add(locale);

	if (alternates) {
		for (const [lang, path] of Object.entries(alternates)) {
			if (!path || seen.has(lang)) continue;
			out.push({
				hreflang: htmlLangAttribute[lang as Locale],
				href: ensureTrailingSlash(new URL(path, base).toString()),
			});
			seen.add(lang);
		}
	}

	// x-default → English version if exists, otherwise current page
	const enPath = alternates?.en ?? (locale === 'en' ? pathname : null);
	out.push({
		hreflang: 'x-default',
		href: enPath ? ensureTrailingSlash(new URL(enPath, base).toString()) : self,
	});

	return out;
}

export function articleJsonLd(input: {
	site: URL | string;
	pathname: string;
	locale: Locale;
	title: string;
	description: string;
	image?: string;
	publishedAt: Date;
	updatedAt?: Date;
	authorName: string;
}) {
	const base = typeof input.site === 'string' ? new URL(input.site) : input.site;
	const url = new URL(input.pathname, base).toString();
	const authorUrl = new URL(withBase(`${input.locale}/about`), base).toString();
	return {
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: input.title,
		description: input.description,
		...(input.image ? { image: new URL(input.image, base).toString() } : {}),
		datePublished: input.publishedAt.toISOString(),
		...(input.updatedAt ? { dateModified: input.updatedAt.toISOString() } : {}),
		author: { '@type': 'Person', name: input.authorName, url: authorUrl },
		publisher: { '@type': 'Person', name: input.authorName },
		inLanguage: htmlLangAttribute[input.locale],
		mainEntityOfPage: url,
	};
}

export function websiteJsonLd(input: {
	site: URL | string;
	siteName: string;
	description: string;
	locale: Locale;
}) {
	const base = typeof input.site === 'string' ? new URL(input.site) : input.site;
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: input.siteName,
		description: input.description,
		url: new URL(withBase(`${input.locale}/`), base).toString(),
		inLanguage: htmlLangAttribute[input.locale],
	};
}

export function ogLocaleFor(locale: Locale): string {
	return ogLocale[locale];
}
