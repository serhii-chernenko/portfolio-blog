export const prerender = false;
import type { APIContext } from 'astro';
import { getPublishedPostsWithPlainText } from '../lib/posts';
import { createPublishedContext } from '../lib/sanity/request';
import {
	LLMS_CONTENT_TYPE,
	LLMS_SITE_SUMMARY,
	LLMS_SITE_TITLE,
	absoluteUrl,
	postHeading,
} from '../lib/llms';
import { locales } from '../i18n/config';
import { withBase } from '../i18n/utils';

export async function GET(context: APIContext) {
	const site = context.site;
	const sanity = createPublishedContext();
	const postsByLocale = await Promise.all(
		locales.map((locale) => getPublishedPostsWithPlainText(locale, sanity)),
	);
	const lines: string[] = [];

	lines.push(`# ${LLMS_SITE_TITLE} — full content`);
	lines.push('');
	lines.push(`> ${LLMS_SITE_SUMMARY}`);
	lines.push('');
	lines.push(
		`The complete text of every published post in English and Ukrainian. Index of the same content: ${absoluteUrl(site, withBase('llms.txt'))}`,
	);

	for (const entries of postsByLocale) {
		for (const { post, plainText } of entries) {
			lines.push('', '---', '', ...postHeading(post, site), '', plainText);
		}
	}
	lines.push('');

	return new Response(lines.join('\n'), {
		headers: { 'content-type': LLMS_CONTENT_TYPE },
	});
}
