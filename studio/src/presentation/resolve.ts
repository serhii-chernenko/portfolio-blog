import {
	defineDocuments,
	defineLocations,
	type PresentationPluginOptions,
} from 'sanity/presentation';
import { LANGUAGES } from '../languages';
import { BLOG_BASE_PATH } from '../project';

interface LocalizedDocumentValue {
	title?: string;
	slug?: string;
	language?: string;
}

const homeHref = (language: string) => `${BLOG_BASE_PATH}/${language}/`;

const layoutLocations = defineLocations({
	locations: LANGUAGES.map(({ id, title }) => ({ title: `Home (${title})`, href: homeHref(id) })),
});

export const resolve: PresentationPluginOptions['resolve'] = {
	mainDocuments: defineDocuments([
		{
			route: `${BLOG_BASE_PATH}/:lang/posts/:slug`,
			filter: '_type == "post" && language == $lang && slug.current == $slug',
			params: ({ params }) => ({ lang: params.lang, slug: params.slug }),
		},
		{
			route: `${BLOG_BASE_PATH}/:lang/:slug`,
			filter: '_type == "page" && language == $lang && slug.current == $slug',
			params: ({ params }) => ({ lang: params.lang, slug: params.slug }),
		},
	]),
	locations: {
		post: defineLocations({
			select: { title: 'title', slug: 'slug.current', language: 'language' },
			resolve: (value: LocalizedDocumentValue | null) => {
				if (!value?.slug || !value.language) {
					return null;
				}
				return {
					locations: [
						{
							title: value.title || 'Untitled',
							href: `${BLOG_BASE_PATH}/${value.language}/posts/${value.slug}/`,
						},
						{
							title: 'Posts',
							href: `${BLOG_BASE_PATH}/${value.language}/posts/`,
						},
					],
				};
			},
		}),
		page: defineLocations({
			select: { title: 'title', slug: 'slug.current', language: 'language' },
			resolve: (value: LocalizedDocumentValue | null) => {
				if (!value?.slug || !value.language) {
					return null;
				}
				return {
					locations: [
						{
							title: value.title || 'Untitled',
							href: `${BLOG_BASE_PATH}/${value.language}/${value.slug}/`,
						},
					],
				};
			},
		}),
		navigation: layoutLocations,
		siteSettings: layoutLocations,
		uiStrings: layoutLocations,
	},
};
