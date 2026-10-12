// NOT prerendered: a prerendered endpoint is written to a static file and
// served by Cloudflare's static-asset layer, which assigns Content-Type by
// file extension (.txt -> `text/plain` with no charset) and discards whatever
// header this Response sets. Confirmed live — the deployed prerendered version
// served `text/plain` with no `charset=utf-8`, so browsers fell back to
// latin1/windows-1252 and rendered every Cyrillic byte as mojibake even though
// the underlying file was correct UTF-8. SSR guarantees this header is what
// actually reaches the client, at the cost of computing the (cheap) response
// per request instead of once at build time.
export const prerender = false;
import type { APIContext } from 'astro';
import { getPublishedPosts, getTagsForLocale, tagSlug, postUrl } from '../lib/posts';
import { getPages, pageUrl } from '../lib/pages';
import { MIN_POSTS_FOR_TAG_INDEXING } from '../lib/tag-slug';
import {
	LLMS_CONTENT_TYPE,
	LLMS_SITE_SUMMARY,
	LLMS_SITE_TITLE,
	absoluteUrl,
	escapeLinkText,
} from '../lib/llms';
import { locales, localeLabels } from '../i18n/config';
import { localeHref, withBase, withPageBase } from '../i18n/utils';

export async function GET(context: APIContext) {
	const site = context.site;
	const lines: string[] = [];

	lines.push(`# ${LLMS_SITE_TITLE}`);
	lines.push('');
	lines.push(`> ${LLMS_SITE_SUMMARY}`);
	lines.push('');
	lines.push(
		`Content usage preference: search=yes, ai-input=yes, ai-train=no (see ${absoluteUrl(site, '/robots.txt')}).`,
	);
	lines.push(
		`The full text of every post is available as a single Markdown file: ${absoluteUrl(site, withBase('llms-full.txt'))}`,
	);

	lines.push('');
	lines.push('## Blog');
	for (const locale of locales) {
		lines.push(`- [Home (${localeLabels[locale]})](${absoluteUrl(site, localeHref(locale))})`);
	}

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
		const pages = await getPages(locale);
		if (pages.length === 0) continue;
		lines.push('');
		lines.push(`## Pages (${localeLabels[locale]})`);
		for (const page of pages) {
			const url = absoluteUrl(site, pageUrl(page));
			lines.push(`- [${escapeLinkText(page.data.title)}](${url}): ${page.data.description}`);
		}
	}

	lines.push('');
	lines.push('## Optional');
	for (const locale of locales) {
		const tags = (await getTagsForLocale(locale)).filter(
			({ count }) => count >= MIN_POSTS_FOR_TAG_INDEXING,
		);
		for (const { tag, count } of tags) {
			const url = absoluteUrl(site, localeHref(locale, `tags/${tagSlug(tag)}`));
			lines.push(
				`- [${escapeLinkText(tag)} (${localeLabels[locale]})](${url}): ${count} posts tagged "${escapeLinkText(tag)}"`,
			);
		}
	}
	for (const locale of locales) {
		lines.push(
			`- [RSS (${localeLabels[locale]})](${absoluteUrl(site, withPageBase(`${locale}/rss.xml`))})`,
		);
	}
	lines.push(`- [Sitemap](${absoluteUrl(site, withBase('sitemap-index.xml'))})`);
	lines.push('');

	return new Response(lines.join('\n'), {
		headers: { 'content-type': LLMS_CONTENT_TYPE },
	});
}
