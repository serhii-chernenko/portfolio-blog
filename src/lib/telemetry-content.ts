import { getPages } from './pages';
import { getPublishedPosts, getTagsForLocale } from './posts';
import { createPublishedContext } from './sanity/request';
import type { ContentKind, TelemetryLocale } from './telemetry-schema';

const KNOWN_KEYS_TTL_MS = 5 * 60 * 1000;

interface CachedKeys {
	expiresAt: number;
	keys: Promise<Set<string>>;
}

const knownKeysByScope = new Map<string, CachedKeys>();

async function loadKnownKeys(kind: ContentKind, locale: TelemetryLocale): Promise<Set<string>> {
	const sanity = createPublishedContext();
	if (kind === 'post') {
		const posts = await getPublishedPosts(locale, sanity);
		return new Set(posts.map((post) => post.translationKey));
	}
	if (kind === 'page') {
		const pages = await getPages(locale, sanity);
		return new Set(pages.map((page) => page.key));
	}
	const tags = await getTagsForLocale(locale, sanity);
	return new Set(tags.map(({ slug }) => slug));
}

function knownKeysFor(kind: ContentKind, locale: TelemetryLocale): Promise<Set<string>> {
	const scope = `${kind}:${locale}`;
	const now = Date.now();
	const cached = knownKeysByScope.get(scope);
	if (cached && cached.expiresAt > now) return cached.keys;
	const keys = loadKnownKeys(kind, locale);
	const entry: CachedKeys = { expiresAt: now + KNOWN_KEYS_TTL_MS, keys };
	knownKeysByScope.set(scope, entry);
	keys.catch(() => {
		if (knownKeysByScope.get(scope) === entry) knownKeysByScope.delete(scope);
	});
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
