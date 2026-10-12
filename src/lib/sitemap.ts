import type { APIContext } from 'astro';
import type { Locale } from '../i18n/config';
import { buildCanonical } from './seo';

export interface SitemapEntry {
	path: string;
	alternates?: Partial<Record<Locale, string | null>>;
	lastModified?: Date;
}

const SITEMAP_HREFLANG: Record<Locale, string> = { en: 'en-US', uk: 'uk-UA' };
const XML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&apos;',
};

function escapeXml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);
}

export function absoluteUrl(context: APIContext, path: string): string {
	return escapeXml(buildCanonical(context.site ?? context.url.origin, path));
}

function renderAlternates(context: APIContext, entry: SitemapEntry): string {
	const alternates = Object.entries(entry.alternates ?? {}).filter(
		(alternate): alternate is [Locale, string] => typeof alternate[1] === 'string',
	);
	if (alternates.length < 2) return '';
	return alternates
		.map(
			([locale, path]) =>
				`<xhtml:link rel="alternate" hreflang="${SITEMAP_HREFLANG[locale]}" href="${absoluteUrl(context, path)}"/>`,
		)
		.join('');
}

export function renderUrlSet(context: APIContext, entries: SitemapEntry[]): string {
	const urls = entries.map((entry) => {
		const lastModified = entry.lastModified
			? `<lastmod>${entry.lastModified.toISOString()}</lastmod>`
			: '';
		return `<url><loc>${absoluteUrl(context, entry.path)}</loc>${lastModified}${renderAlternates(context, entry)}</url>`;
	});
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		...urls,
		'</urlset>',
	].join('');
}

export function xmlResponse(body: string): Response {
	return new Response(body, {
		headers: { 'content-type': 'application/xml; charset=utf-8' },
	});
}
