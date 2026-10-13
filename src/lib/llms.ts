import { localeLabels } from '../i18n/config';
import { postUrl, type Post } from './posts';

export const LLMS_CONTENT_TYPE = 'text/plain; charset=utf-8';

export const LLMS_SITE_TITLE = 'Serhii Chernenko — Blog';

export const LLMS_SITE_SUMMARY =
	'Bilingual (English / Ukrainian) personal blog on Astro, Cloudflare Workers, web performance, and Ukrainian volunteering.';

export function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

export function escapeLinkText(text: string): string {
	return collapseWhitespace(text).replace(/[[\]]/g, '');
}

/**
 * `new URL()` leaves `(`/`)` unescaped in pathnames; callers embed the result in
 * Markdown `(url)` link syntax, where a bare `)` from a free-form CMS slug would
 * end the link early.
 */
export function absoluteUrl(site: URL | undefined, path: string): string {
	return new URL(path, site).toString().replace(/\(/g, '%28').replace(/\)/g, '%29');
}

export function postHeading(post: Post, site: URL | undefined): string[] {
	const lines = [
		`# ${collapseWhitespace(post.title)}`,
		'',
		`- URL: ${absoluteUrl(site, postUrl(post))}`,
		`- Language: ${localeLabels[post.language]}`,
		`- Published: ${post.publishedAt.toISOString()}`,
	];
	if (post.updatedAt) lines.push(`- Updated: ${post.updatedAt.toISOString()}`);
	if (post.tags.length > 0) lines.push(`- Tags: ${post.tags.join(', ')}`);
	lines.push('', `> ${collapseWhitespace(post.description)}`);
	return lines;
}
