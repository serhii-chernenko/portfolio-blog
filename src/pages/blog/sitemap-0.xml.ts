import type { APIContext } from 'astro';
import { locales, type Locale } from '../../i18n/config';
import { localeHref, mirroredLocaleHrefs } from '../../i18n/utils';
import { getPages, pageUrl } from '../../lib/pages';
import { POSTS_PAGE_SIZE } from '../../lib/pagination';
import {
	getAllPublishedPosts,
	postHasTagSlug,
	postUrl,
	summarizeTags,
	type Post,
} from '../../lib/posts';
import { createPublishedContext } from '../../lib/cms/context';
import { renderUrlSet, xmlResponse, type SitemapEntry } from '../../lib/sitemap';
import { MIN_POSTS_FOR_TAG_INDEXING } from '../../lib/tag-slug';

export const prerender = false;

function lastModifiedOf(post: Post): Date {
	return post.updatedAt ?? post.publishedAt;
}

function latestModified(posts: Post[]): Date | undefined {
	let latest: Date | undefined;
	for (const post of posts) {
		const modified = lastModifiedOf(post);
		if (!latest || modified > latest) latest = modified;
	}
	return latest;
}

function mirroredEntries(path: string, lastModifiedFor?: (locale: Locale) => Date | undefined) {
	const alternates = mirroredLocaleHrefs(path);
	return locales.map((locale): SitemapEntry => ({
		locale,
		path: alternates[locale],
		alternates,
		lastModified: lastModifiedFor?.(locale),
	}));
}

export async function GET(context: APIContext) {
	const cms = createPublishedContext();
	const [posts, pagesByLocale] = await Promise.all([
		getAllPublishedPosts(cms),
		Promise.all(locales.map((locale) => getPages(locale, cms))),
	]);
	const postsByLocale = new Map(
		locales.map((locale) => [locale, posts.filter((post) => post.language === locale)]),
	);
	const latestPostIn = (locale: Locale) => latestModified(postsByLocale.get(locale) ?? []);

	const entries: SitemapEntry[] = [
		...mirroredEntries('', latestPostIn),
		...mirroredEntries('posts/', latestPostIn),
		...mirroredEntries('tags/'),
		...mirroredEntries('subscribe/'),
	];

	for (const locale of locales) {
		const localePosts = postsByLocale.get(locale) ?? [];
		const totalPages = Math.ceil(localePosts.length / POSTS_PAGE_SIZE);
		for (let page = 2; page <= totalPages; page++) {
			entries.push({ locale, path: localeHref(locale, `posts/page/${page}`) });
		}

		for (const { slug, count } of summarizeTags(localePosts)) {
			if (count < MIN_POSTS_FOR_TAG_INDEXING) continue;
			entries.push({
				locale,
				path: localeHref(locale, `tags/${slug}`),
				lastModified: latestModified(localePosts.filter((post) => postHasTagSlug(post, slug))),
			});
		}
	}

	for (const post of posts) {
		entries.push({
			locale: post.language,
			path: postUrl(post),
			alternates: post.translations,
			lastModified: lastModifiedOf(post),
		});
	}

	for (const page of pagesByLocale.flat()) {
		entries.push({
			locale: page.language,
			path: pageUrl(page),
			alternates: page.translations,
			lastModified: page.updatedAt,
		});
	}

	return xmlResponse(renderUrlSet(context, entries));
}
