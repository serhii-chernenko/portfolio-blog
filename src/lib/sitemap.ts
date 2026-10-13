import type { APIContext } from 'astro';
import type { Locale } from '../i18n/config';
import { buildCanonical, buildHreflang, type LocaleAlternates } from './hreflang';

export interface SitemapEntry {
	locale: Locale;
	path: string;
	alternates?: LocaleAlternates;
	lastModified?: Date;
}

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

function siteOf(context: APIContext): URL | string {
	return context.site ?? context.url.origin;
}

export function absoluteUrl(context: APIContext, path: string): string {
	return escapeXml(buildCanonical(siteOf(context), path));
}

function renderAlternates(context: APIContext, entry: SitemapEntry): string {
	const alternateCount = Object.values(entry.alternates ?? {}).filter(Boolean).length;
	if (alternateCount < 2) return '';
	return buildHreflang(siteOf(context), entry.locale, entry.path, entry.alternates)
		.map(
			({ hreflang, href }) =>
				`<xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeXml(href)}"/>`,
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
