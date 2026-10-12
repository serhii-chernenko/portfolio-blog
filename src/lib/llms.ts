import type { AnyPost } from './posts';
import { localeOf, postUrl } from './posts';
import { localeLabels } from '../i18n/config';

export const LLMS_CONTENT_TYPE = 'text/plain; charset=utf-8';

export const LLMS_SITE_TITLE = 'Serhii Chernenko — Blog';

export const LLMS_SITE_SUMMARY =
	'Bilingual (English / Ukrainian) personal blog on Astro, Cloudflare Workers, web performance, and Ukrainian volunteering.';

export function escapeLinkText(text: string): string {
	return text.replace(/[[\]]/g, '');
}

/**
 * `new URL()` leaves `(`/`)` unescaped in pathnames; callers embed the result in
 * Markdown `(url)` link syntax, where a bare `)` from a free-form CMS slug would
 * end the link early.
 */
export function absoluteUrl(site: URL | undefined, path: string): string {
	return new URL(path, site).toString().replace(/\(/g, '%28').replace(/\)/g, '%29');
}

const CALLOUT_TAG = /^\s*\{%\s*\/?callout\b[^%]*%\}\s*$/;
const YOUTUBE_TAG = /\{%\s*youtube\b([^%]*)%\}/g;
const MARKDOWN_IMAGE = /!\[((?:[^[\]]|\[[^\]]*\])*)\]\([^)]*\)/g;

function attributeValue(attributes: string, name: string): string | undefined {
	return new RegExp(`${name}="([^"]*)"`).exec(attributes)?.[1];
}

export function markdocToPlainMarkdown(source: string): string {
	return source
		.split('\n')
		.filter((line) => !CALLOUT_TAG.test(line))
		.join('\n')
		.replace(YOUTUBE_TAG, (_match, attributes: string) => {
			const id = attributeValue(attributes, 'id');
			if (!id) return '';
			const title = attributeValue(attributes, 'title') ?? 'Video';
			return `[${escapeLinkText(title)}](https://www.youtube.com/watch?v=${id})`;
		})
		.replace(MARKDOWN_IMAGE, (_match, alt: string) => (alt ? `[Image: ${alt}]` : ''))
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function postHeading(post: AnyPost, site: URL | undefined): string[] {
	const locale = localeOf(post);
	const lines = [
		`# ${post.data.title}`,
		'',
		`- URL: ${absoluteUrl(site, postUrl(post))}`,
		`- Language: ${localeLabels[locale]}`,
		`- Published: ${post.data.publishedAt.toISOString()}`,
	];
	if (post.data.updatedAt) lines.push(`- Updated: ${post.data.updatedAt.toISOString()}`);
	const tags = post.data.tags ?? [];
	if (tags.length > 0) lines.push(`- Tags: ${tags.join(', ')}`);
	lines.push('', `> ${post.data.description}`);
	return lines;
}
