/** Collection slugs of the EmDash content model (seed/seed.json). */
export const COLLECTIONS = {
	posts: 'posts',
	pages: 'pages',
	siteSettings: 'site_settings',
	uiStrings: 'ui_strings',
} as const;

/** Menu names; each exists once per locale, linked as translations. */
export const MENUS = {
	header: 'header',
	footer: 'footer',
} as const;

/** Taxonomies the site renders (admin → Tags). */
export const TAXONOMIES = {
	tag: 'tag',
} as const;

/**
 * Route-cache tags. EmDash purges a collection's tag and the entry's ID whenever an entry changes
 * live, `emdash:menu:{name}` on menu edits, `emdash:settings` when Settings are saved and
 * `emdash:taxonomy:{name}` on term edits. Byline edits purge nothing; pages pick them up when they
 * expire or their entry is saved.
 *
 * Every page renders the layout (site settings, UI strings, menus, and pages for menu links), so
 * it carries LAYOUT_CACHE_TAGS. Routes that set `Astro.locals.cacheTags` add only those; all other
 * routes (post lists, tag pages, feeds, sitemaps, search) depend on every post and carry the full
 * CMS_CACHE_TAGS, so publishing a post doesn't purge the about page or other posts' pages.
 */
export const LAYOUT_CACHE_TAGS = [
	COLLECTIONS.siteSettings,
	COLLECTIONS.uiStrings,
	COLLECTIONS.pages,
	...Object.values(MENUS).map((name) => `emdash:menu:${name}`),
	'emdash:settings',
];

/** Tag of every taxonomy, for pages that show tag names. */
export const TAXONOMY_CACHE_TAGS = Object.values(TAXONOMIES).map(
	(name) => `emdash:taxonomy:${name}`,
);

/** Tag of every page with a comments section; purged after any comment write (src/middleware.ts). */
export const COMMENTS_CACHE_TAG = 'comments';

/**
 * Tag of every page of one translation group. EmDash only purges the changed entry, so the site
 * plugin purges this on publish and unpublish: the other languages' switchers and hreflang change.
 */
export function translationGroupCacheTag(collection: string, translationGroup: string): string {
	return `${collection}:group:${translationGroup}`;
}

/** Lists, tag pages, feeds, sitemaps and search: every collection and taxonomy (no comments). */
export const CMS_CACHE_TAGS = [
	...new Set([...Object.values(COLLECTIONS), ...LAYOUT_CACHE_TAGS, ...TAXONOMY_CACHE_TAGS]),
];

/** Query parameter of EmDash's signed preview links. */
export const PREVIEW_TOKEN_PARAM = '_preview';

/** Query parameter of EmDash's edit-mode links. */
export const EDIT_MODE_PARAM = '_edit';

/** Upper bound for "all entries" list queries; the blog has a few dozen entries per locale. */
export const MAX_LIST_ENTRIES = 1000;
