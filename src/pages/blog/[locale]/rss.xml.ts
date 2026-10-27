import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublishedPosts, postUrl, tagLabels } from '../../../lib/posts';
import { createPublishedContext } from '../../../lib/cms/context';
import { getLayoutData } from '../../../lib/site';
import { localeHref } from '../../../i18n/utils';
import { htmlLangAttribute, isLocale } from '../../../i18n/config';

export const prerender = false;

const FEED_TITLE_SUFFIX = { en: 'Posts', uk: 'Дописи' } as const;
const FALLBACK_SITE = 'https://serhiichernenko.com';

export async function GET(context: APIContext) {
	const locale = context.params.locale ?? '';
	if (!isLocale(locale)) return new Response(null, { status: 404 });

	const cms = createPublishedContext();
	const [{ settings }, posts] = await Promise.all([
		getLayoutData(locale, cms),
		getPublishedPosts(locale, cms),
	]);
	const site = context.site ?? new URL(FALLBACK_SITE);
	const channelUrl = new URL(localeHref(locale), site);
	const feedUrl = new URL(localeHref(locale, 'rss.xml'), site);
	const langCode = htmlLangAttribute[locale];

	return rss({
		title: `${settings.siteName} — ${FEED_TITLE_SUFFIX[locale]}`,
		description: settings.description,
		site: channelUrl,
		xmlns: { atom: 'http://www.w3.org/2005/Atom' },
		items: posts.map((post) => ({
			title: post.title,
			description: post.description,
			pubDate: post.publishedAt,
			link: postUrl(post),
			categories: tagLabels(post),
		})),
		customData: `<language>${langCode}</language><atom:link href="${feedUrl.toString()}" rel="self" type="application/rss+xml" />`,
	});
}
