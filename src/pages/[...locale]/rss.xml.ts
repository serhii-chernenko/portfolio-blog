export const prerender = true;
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublishedPosts, postUrl } from '../../lib/posts';
import { localeHref, withPageBase } from '../../i18n/utils';
import { ui } from '../../i18n/ui';
import { htmlLangAttribute, isLocale, type Locale } from '../../i18n/config';

export function getStaticPaths() {
	return [{ params: { locale: 'en' } }, { params: { locale: 'uk' } }];
}

export async function GET(context: APIContext) {
	const { locale: rawLocale } = context.params as { locale: string };
	const locale: Locale = isLocale(rawLocale) ? rawLocale : 'en';

	const posts = await getPublishedPosts(locale);
	const site = context.site ?? new URL('https://serhiichernenko.com');
	const channelUrl = new URL(localeHref(locale), site);
	const feedUrl = new URL(withPageBase(`${locale}/rss.xml`), site);
	const siteName = ui[locale]['site.name'];
	const description = ui[locale]['site.description'];
	const langCode = htmlLangAttribute[locale];

	return rss({
		title: `${siteName} — ${locale === 'en' ? 'Posts' : 'Дописи'}`,
		description,
		site: channelUrl,
		xmlns: { atom: 'http://www.w3.org/2005/Atom' },
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.publishedAt,
			link: postUrl(post),
			categories: post.data.tags,
		})),
		customData: `<language>${langCode}</language><atom:link href="${feedUrl.toString()}" rel="self" type="application/rss+xml" />`,
	});
}
