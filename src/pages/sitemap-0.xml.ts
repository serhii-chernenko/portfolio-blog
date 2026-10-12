import type { APIContext } from 'astro';
import { locales, type Locale } from '../i18n/config';
import { localeHref } from '../i18n/utils';
import { getPages, pageUrl } from '../lib/pages';
import { POSTS_PAGE_SIZE } from '../lib/pagination';
import { getAllPublishedPosts, getTagsForLocale, postUrl, tagSlug } from '../lib/posts';
import { createPublishedContext } from '../lib/sanity/request';
import { renderUrlSet, xmlResponse, type SitemapEntry } from '../lib/sitemap';

export const prerender = false;

function sameInEveryLocale(path: (locale: Locale) => string): SitemapEntry[] {
	const alternates = Object.fromEntries(locales.map((locale) => [locale, path(locale)])) as Record<
		Locale,
		string
	>;
	return locales.map((locale) => ({ path: path(locale), alternates }));
}

export async function GET(context: APIContext) {
	const sanity = createPublishedContext();
	const [posts, pagesByLocale, tagsByLocale] = await Promise.all([
		getAllPublishedPosts(sanity),
		Promise.all(locales.map((locale) => getPages(locale, sanity))),
		Promise.all(locales.map((locale) => getTagsForLocale(locale, sanity))),
	]);

	const entries: SitemapEntry[] = [
		...sameInEveryLocale((locale) => localeHref(locale)),
		...sameInEveryLocale((locale) => localeHref(locale, 'posts')),
		...sameInEveryLocale((locale) => localeHref(locale, 'tags')),
		...sameInEveryLocale((locale) => localeHref(locale, 'subscribe')),
	];

	for (const locale of locales) {
		const postCount = posts.filter((post) => post.language === locale).length;
		const totalPages = Math.ceil(postCount / POSTS_PAGE_SIZE);
		for (let page = 2; page <= totalPages; page++) {
			entries.push({ path: localeHref(locale, `posts/page/${page}`) });
		}
	}

	const tagSlugsByLocale = new Map(
		locales.map((locale, index) => [
			locale,
			new Set(tagsByLocale[index].map(({ tag }) => tagSlug(tag))),
		]),
	);
	for (const locale of locales) {
		for (const slug of tagSlugsByLocale.get(locale) ?? []) {
			const alternates = Object.fromEntries(
				locales
					.filter((candidate) => tagSlugsByLocale.get(candidate)?.has(slug))
					.map((candidate) => [candidate, localeHref(candidate, `tags/${slug}`)]),
			);
			entries.push({ path: localeHref(locale, `tags/${slug}`), alternates });
		}
	}

	for (const post of posts) {
		entries.push({
			path: postUrl(post),
			alternates: post.translations,
			lastModified: post.updatedAt ?? post.publishedAt,
		});
	}

	for (const page of pagesByLocale.flat()) {
		entries.push({
			path: pageUrl(page),
			alternates: page.translations,
			lastModified: page.updatedAt,
		});
	}

	return xmlResponse(renderUrlSet(context, entries));
}
