/** URL-safe slugs only: the site's routes and the publish hooks reject anything else. */
export const SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * Pages are served at `/blog/{locale}/{slug}/`, next to the site's own routes, so these slugs
 * would be shadowed by (or shadow) a route and can never be page slugs.
 */
export const RESERVED_PAGE_SLUGS: readonly string[] = [
	'posts',
	'tags',
	'subscribe',
	'unsubscribe',
	'rss.xml',
	'page',
	'api',
	'admin',
	'search',
	'preview',
	'sitemap-index.xml',
	'sitemap-0.xml',
];

const ROUTABLE_COLLECTIONS = new Set(['posts', 'pages']);

/**
 * Publish-time slug rules of the routable collections (formerly the Studio's slug validation).
 * Returns the reason a slug cannot go live, or null when it can.
 */
export function slugPolicyViolation(collection: string, slug: unknown): string | null {
	if (!ROUTABLE_COLLECTIONS.has(collection)) return null;
	if (typeof slug !== 'string' || slug === '') return 'Set a slug before publishing.';
	if (!SLUG_PATTERN.test(slug)) {
		return `The slug "${slug}" can only use lowercase letters, numbers and hyphens.`;
	}
	if (collection === 'pages' && RESERVED_PAGE_SLUGS.includes(slug)) {
		return `The slug "${slug}" is reserved for a site route. Choose another page slug.`;
	}
	return null;
}
