import type { SlugIsUniqueValidator } from 'sanity';

export const SLUG_PATTERN = /^[a-z0-9-]+$/;

export const SLUG_PATTERN_MESSAGE = 'Use lowercase letters, numbers and hyphens only';

export const RESERVED_PAGE_SLUGS = [
	'posts',
	'tags',
	'subscribe',
	'unsubscribe',
	'rss.xml',
	'page',
	'api',
	'admin',
	'search',
	'sitemap-index.xml',
	'sitemap-0.xml',
];

const IS_UNIQUE_IN_LANGUAGE_QUERY = `!defined(*[_type == $type && slug.current == $slug && language == $lang && !(_id in [$draft, $published])][0]._id)`;

export const isSlugUniqueInLanguage: SlugIsUniqueValidator = async (slug, context) => {
	const { document, getClient } = context;
	if (!document) {
		return true;
	}
	const published = document._id.replace(/^drafts\./, '');
	const params = {
		type: document._type,
		slug,
		lang: document.language ?? null,
		draft: `drafts.${published}`,
		published,
	};
	return getClient({ apiVersion: '2026-10-01' }).fetch<boolean>(
		IS_UNIQUE_IN_LANGUAGE_QUERY,
		params,
	);
};
