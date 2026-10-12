import { getPages } from './pages';
import { getPublishedPosts, getTagsForLocale, tagSlug } from './posts';
import type { ContentKind, TelemetryLocale } from './telemetry-schema';

const knownKeysByScope = new Map<string, Promise<Set<string>>>();

async function loadKnownKeys(kind: ContentKind, locale: TelemetryLocale): Promise<Set<string>> {
	if (kind === 'post') {
		const posts = await getPublishedPosts(locale);
		return new Set(posts.map((post) => post.data.translationKey));
	}
	if (kind === 'page') {
		const pages = await getPages(locale);
		return new Set(pages.map((page) => page.data.translationKey));
	}
	const tags = await getTagsForLocale(locale);
	return new Set(tags.map(({ tag }) => tagSlug(tag)));
}

function knownKeysFor(kind: ContentKind, locale: TelemetryLocale): Promise<Set<string>> {
	if (import.meta.env.DEV) return loadKnownKeys(kind, locale);
	const scope = `${kind}:${locale}`;
	let keys = knownKeysByScope.get(scope);
	if (!keys) {
		keys = loadKnownKeys(kind, locale);
		knownKeysByScope.set(scope, keys);
		keys.catch(() => knownKeysByScope.delete(scope));
	}
	return keys;
}

export async function isKnownContentKey(
	kind: ContentKind,
	locale: TelemetryLocale,
	contentKey: string,
): Promise<boolean> {
	try {
		return (await knownKeysFor(kind, locale)).has(contentKey);
	} catch {
		return false;
	}
}
