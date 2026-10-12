import type { APIContext } from 'astro';
import { withBase } from '../i18n/utils';
import { absoluteUrl, xmlResponse } from '../lib/sitemap';

export const prerender = false;

export function GET(context: APIContext) {
	const sitemapUrl = absoluteUrl(context, withBase('sitemap-0.xml'));
	return xmlResponse(
		[
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			`<sitemap><loc>${sitemapUrl}</loc></sitemap>`,
			'</sitemapindex>',
		].join(''),
	);
}
