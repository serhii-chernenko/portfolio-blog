import rss from '@astrojs/rss';
import { stegaClean } from '@sanity/client/stega';
import type { APIContext } from 'astro';
import { getPublishedPosts, postUrl } from '../../lib/posts';
import { createPublishedContext } from '../../lib/sanity/request';
import { getLayoutData } from '../../lib/site';
import { isLocale } from '../../i18n/config';

export const prerender = false;

const FEED_TITLE_SUFFIX = { en: 'Posts', uk: 'Дописи' } as const;
const FEED_LANGUAGE = { en: 'en-US', uk: 'uk-UA' } as const;

export async function GET(context: APIContext) {
	const locale = context.params.locale ?? '';
	if (!isLocale(locale)) return new Response(null, { status: 404 });

	const sanity = createPublishedContext();
	const [{ settings }, posts] = await Promise.all([
		getLayoutData(locale, sanity),
		getPublishedPosts(locale, sanity),
	]);
	const siteUrl = context.site?.toString() ?? context.url.origin;
	const langCode = FEED_LANGUAGE[locale];

	return rss({
		title: `${stegaClean(settings.siteName)} — ${FEED_TITLE_SUFFIX[locale]}`,
		description: stegaClean(settings.description),
		site: siteUrl,
		items: posts.map((post) => ({
			title: post.title,
			description: post.description,
			pubDate: post.publishedAt,
			link: postUrl(post),
			customData: `<language>${langCode}</language>`,
		})),
		customData: `<language>${langCode}</language>`,
	});
}
