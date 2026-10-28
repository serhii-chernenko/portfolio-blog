import { isLocale, locales } from '../i18n/config';
import { localeHref } from '../i18n/utils';
import { COLLECTIONS, translationGroupCacheTag } from './cms/config';

/** Collections whose pages carry a translation-group cache tag (see Post.cacheTags). */
const GROUP_TAGGED_COLLECTIONS: readonly string[] = [COLLECTIONS.posts];

/**
 * Purges route-cache tags directly through Workers Cache, for changes EmDash doesn't purge
 * itself. Best effort: outside workerd (pnpm dev) or on failure, pages refresh with their TTL.
 */
export async function purgeCacheTags(tags: string[]): Promise<void> {
	if (tags.length === 0) return;
	try {
		const { cache } = await import('cloudflare:workers');
		await cache.purge({ tags });
	} catch {
		// Not running in workerd, or the purge failed.
	}
}

/**
 * After an entry is published or unpublished, the pages of its other languages change too (the
 * language switcher and hreflang link to it or stop doing so), but EmDash only purges the entry
 * itself and its collection tag, which those pages don't carry.
 */
export async function purgeTranslationGroup(
	collection: string,
	content: Record<string, unknown>,
): Promise<void> {
	if (!GROUP_TAGGED_COLLECTIONS.includes(collection)) return;
	const group = content.translationGroup ?? content.translation_group ?? content.id;
	if (typeof group !== 'string' || !group) return;
	await purgeCacheTags([translationGroupCacheTag(collection, group)]);
}

/** Most pages a warm-up renders in parallel. */
const WARM_CONCURRENCY = 3;

/**
 * Pages to render right after a publish or unpublish, so the first visitors after it get a cached
 * page instead of a 1–2 s render: the home pages and post lists that publishing a post purges in
 * both languages, plus the entry's own page.
 */
export function pathsToWarm(collection: string, content: Record<string, unknown>): string[] {
	const paths = new Set<string>();
	for (const locale of locales) {
		paths.add(localeHref(locale));
		if (collection === COLLECTIONS.posts) paths.add(localeHref(locale, 'posts'));
	}
	const data =
		content.data && typeof content.data === 'object'
			? (content.data as Record<string, unknown>)
			: {};
	const locale = content.locale ?? data.locale;
	const slug = content.slug ?? data.slug;
	if (
		typeof locale === 'string' &&
		isLocale(locale) &&
		typeof slug === 'string' &&
		/^[a-z0-9-]+$/.test(slug)
	) {
		if (collection === COLLECTIONS.posts) paths.add(localeHref(locale, `posts/${slug}`));
		if (collection === COLLECTIONS.pages) paths.add(localeHref(locale, slug));
	}
	return [...paths];
}

/**
 * Renders pages through the Worker's own loopback entrypoint (`ctx.exports`), which goes through
 * Workers Cache like a visitor's request and stores the fresh response. Best effort, like
 * purgeCacheTags: outside workerd or on failure nothing happens.
 */
export async function warmPages(siteUrl: string, paths: string[]): Promise<void> {
	let target: { fetch(request: Request): Promise<Response> } | undefined;
	try {
		const workers = await import('cloudflare:workers');
		target = (workers.exports as unknown as Record<string, typeof target>).default;
	} catch {
		return;
	}
	if (!target) return;
	const queue = [...paths];
	const worker = async () => {
		for (let path = queue.shift(); path; path = queue.shift()) {
			try {
				const response = await target.fetch(
					new Request(new URL(path, siteUrl), {
						headers: { 'user-agent': 'portfolio-blog cache warm-up' },
					}),
				);
				await response.body?.cancel();
			} catch {
				// Skip this page; it renders on its first visit instead.
			}
		}
	};
	await Promise.all(Array.from({ length: WARM_CONCURRENCY }, worker));
}
