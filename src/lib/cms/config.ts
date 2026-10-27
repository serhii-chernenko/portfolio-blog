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
 * Route-cache tags of every cached response. EmDash invalidates a collection's tag whenever an
 * entry of it changes live, `emdash:menu:{name}` on menu edits, `emdash:settings` when Settings
 * are saved and `emdash:taxonomy:{name}` on term edits, so any of those purges every cached page:
 * menus, settings, lists, tags and translation links make most pages depend on most entries.
 * Byline edits purge nothing; pages pick them up when they expire or their entry is saved.
 */
export const CMS_CACHE_TAGS = [
	...Object.values(COLLECTIONS),
	...Object.values(MENUS).map((name) => `emdash:menu:${name}`),
	...Object.values(TAXONOMIES).map((name) => `emdash:taxonomy:${name}`),
	'emdash:settings',
];

/** Query parameter of EmDash's signed preview links. */
export const PREVIEW_TOKEN_PARAM = '_preview';

/** Query parameter of EmDash's edit-mode links. */
export const EDIT_MODE_PARAM = '_edit';

/** Upper bound for "all entries" list queries; the blog has a few dozen entries per locale. */
export const MAX_LIST_ENTRIES = 1000;
