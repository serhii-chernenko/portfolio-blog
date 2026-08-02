export const prerender = true;
import type { APIContext } from 'astro';
import { getPublishedPosts, getTagsForLocale, tagSlug, postUrl } from '../lib/posts';
import { getPages, pageUrl } from '../lib/pages';
import { locales, localeLabels } from '../i18n/config';
import { withBase } from '../i18n/utils';

function escapeLinkText(text: string): string {
	return text.replace(/[[\]]/g, '');
}

function absoluteUrl(site: URL | undefined, path: string): string {
	// `new URL()` doesn't percent-encode `(`/`)` in the pathname, but every
	// caller here embeds the result as markdown `(url)` link syntax — an
	// unescaped `)` (e.g. from a free-form CMS `slug` override, which unlike
	// `translationKey` has no character-class restriction in content.config.ts)
	// would prematurely close the link and truncate the rendered line.
	return new URL(path, site).toString().replace(/\(/g, '%28').replace(/\)/g, '%29');
}

export async function GET(context: APIContext) {
	const site = context.site;
	const lines: string[] = [];

	lines.push('# Serhii Chernenko — Blog');
	lines.push('');
	lines.push(
		'> Bilingual (English / Ukrainian) personal blog on Astro, Cloudflare Workers, web performance, and Ukrainian volunteering.',
	);
	lines.push('');
	lines.push(
		`Content usage preference: search=yes, ai-input=yes, ai-train=no (see ${absoluteUrl(site, '/robots.txt')}).`,
	);
	lines.push(`Base URL: ${absoluteUrl(site, withBase(''))}`);

	for (const locale of locales) {
		const posts = await getPublishedPosts(locale);
		if (posts.length === 0) continue;
		lines.push('');
		lines.push(`## Posts (${localeLabels[locale]})`);
		for (const post of posts) {
			const url = absoluteUrl(site, postUrl(post));
			lines.push(`- [${escapeLinkText(post.data.title)}](${url}): ${post.data.description}`);
		}
	}

	for (const locale of locales) {
		const tags = await getTagsForLocale(locale);
		if (tags.length === 0) continue;
		lines.push('');
		lines.push(`## Tags (${localeLabels[locale]})`);
		for (const { tag, count } of tags) {
			const url = absoluteUrl(site, withBase(`${locale}/tags/${tagSlug(tag)}`));
			lines.push(`- [${escapeLinkText(tag)}](${url}): ${count} post${count === 1 ? '' : 's'}`);
		}
	}

	const pageLines: string[] = [];
	for (const locale of locales) {
		const pages = await getPages(locale);
		for (const page of pages) {
			const url = absoluteUrl(site, pageUrl(page));
			pageLines.push(`- [${escapeLinkText(page.data.title)}](${url}): ${page.data.description}`);
		}
	}
	if (pageLines.length > 0) {
		lines.push('');
		lines.push('## Pages');
		lines.push(...pageLines);
	}

	lines.push('');
	lines.push('## Optional');
	for (const locale of locales) {
		lines.push(
			`- [RSS (${localeLabels[locale]})](${absoluteUrl(site, withBase(`${locale}/rss.xml`))})`,
		);
	}
	lines.push(`- [Sitemap](${absoluteUrl(site, withBase('sitemap-index.xml'))})`);
	lines.push('');

	return new Response(lines.join('\n'), {
		headers: { 'content-type': 'text/plain; charset=utf-8' },
	});
}
