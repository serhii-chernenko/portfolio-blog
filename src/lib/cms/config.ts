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

/**
 * Route-cache tags of every cached response. EmDash invalidates a collection's tag whenever an
 * entry of it changes live, and `emdash:menu:{name}` on menu edits, so any publish purges every
 * cached page: menus, lists, tags and translation links make most pages depend on most entries.
 */
export const CMS_CACHE_TAGS = [
	...Object.values(COLLECTIONS),
	...Object.values(MENUS).map((name) => `emdash:menu:${name}`),
];

/** Query parameter of EmDash's signed preview links. */
export const PREVIEW_TOKEN_PARAM = '_preview';

/** Query parameter of EmDash's edit-mode links. */
export const EDIT_MODE_PARAM = '_edit';

/** Upper bound for "all entries" list queries; the blog has a few dozen entries per locale. */
export const MAX_LIST_ENTRIES = 1000;
