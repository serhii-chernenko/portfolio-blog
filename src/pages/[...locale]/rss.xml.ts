export const prerender = true;
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPublishedPosts, postUrl } from '../../lib/posts';
import { ui } from '../../i18n/ui';
import { isLocale, type Locale } from '../../i18n/config';

export function getStaticPaths() {
	return [{ params: { locale: 'en' } }, { params: { locale: 'uk' } }];
}

export async function GET(context: APIContext) {
	const { locale: rawLocale } = context.params as { locale: string };
	const locale: Locale = isLocale(rawLocale) ? rawLocale : 'en';

	const posts = await getPublishedPosts(locale);
	const siteUrl = context.site?.toString() ?? 'https://chernenko.digital';
	const siteName = ui[locale]['site.name'];
	const description = ui[locale]['site.description'];
	const langCode = locale === 'en' ? 'en-US' : 'uk-UA';

	return rss({
		title: `${siteName} — ${locale === 'en' ? 'Posts' : 'Дописи'}`,
		description,
		site: siteUrl,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.publishedAt,
			link: postUrl(post),
			customData: `<language>${langCode}</language>`,
		})),
		customData: `<language>${langCode}</language>`,
	});
}
