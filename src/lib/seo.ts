import type { Locale } from '../i18n/config';
import { htmlLangAttribute, ogLocale } from '../i18n/config';
import { ensureTrailingSlash } from './hreflang';
import { AUTHOR_NAME, AUTHOR_SAME_AS } from './author';

export { buildCanonical, buildHreflang, ensureTrailingSlash } from './hreflang';

const SCHEMA_CONTEXT = 'https://schema.org';

function toUrl(site: URL | string): URL {
	return typeof site === 'string' ? new URL(site) : site;
}

function absoluteCanonical(site: URL | string, path: string): string {
	return ensureTrailingSlash(new URL(path, toUrl(site)).toString());
}

function authorPerson(site: URL | string, authorPath: string) {
	return {
		'@type': 'Person',
		name: AUTHOR_NAME,
		url: absoluteCanonical(site, authorPath),
		sameAs: AUTHOR_SAME_AS,
	};
}

export interface BreadcrumbCrumb {
	name: string;
	path: string;
}

export function blogPostingJsonLd(input: {
	site: URL | string;
	pathname: string;
	locale: Locale;
	title: string;
	description: string;
	image: string;
	publishedAt: Date;
	updatedAt?: Date;
	tags?: string[];
	authorPath: string;
}) {
	const url = absoluteCanonical(input.site, input.pathname);
	const author = authorPerson(input.site, input.authorPath);
	return {
		'@context': SCHEMA_CONTEXT,
		'@type': 'BlogPosting',
		headline: input.title,
		description: input.description,
		image: [new URL(input.image, toUrl(input.site)).toString()],
		datePublished: input.publishedAt.toISOString(),
		dateModified: (input.updatedAt ?? input.publishedAt).toISOString(),
		author,
		publisher: author,
		inLanguage: htmlLangAttribute[input.locale],
		mainEntityOfPage: { '@type': 'WebPage', '@id': url },
		url,
		...(input.tags && input.tags.length > 0 ? { keywords: input.tags.join(', ') } : {}),
	};
}

export function breadcrumbJsonLd(input: { site: URL | string; crumbs: BreadcrumbCrumb[] }) {
	return {
		'@context': SCHEMA_CONTEXT,
		'@type': 'BreadcrumbList',
		itemListElement: input.crumbs.map((crumb, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: crumb.name,
			item: absoluteCanonical(input.site, crumb.path),
		})),
	};
}

export function websiteJsonLd(input: {
	site: URL | string;
	homePath: string;
	siteName: string;
	description: string;
	locale: Locale;
	authorPath: string;
}) {
	return {
		'@context': SCHEMA_CONTEXT,
		'@type': 'WebSite',
		name: input.siteName,
		description: input.description,
		url: absoluteCanonical(input.site, input.homePath),
		inLanguage: htmlLangAttribute[input.locale],
		publisher: authorPerson(input.site, input.authorPath),
	};
}

export function blogJsonLd(input: {
	site: URL | string;
	homePath: string;
	siteName: string;
	description: string;
	locale: Locale;
	authorPath: string;
}) {
	return {
		'@context': SCHEMA_CONTEXT,
		'@type': 'Blog',
		name: input.siteName,
		description: input.description,
		url: absoluteCanonical(input.site, input.homePath),
		inLanguage: htmlLangAttribute[input.locale],
		author: authorPerson(input.site, input.authorPath),
	};
}

export function ogLocaleFor(locale: Locale): string {
	return ogLocale[locale];
}

const JSON_LD_ESCAPES: Record<string, string> = {
	'<': '\\u003c',
	'\u2028': '\\u2028',
	'\u2029': '\\u2029',
};

export function serializeJsonLd(block: object): string {
	return JSON.stringify(block).replace(/[<\u2028\u2029]/g, (char) => JSON_LD_ESCAPES[char]);
}
