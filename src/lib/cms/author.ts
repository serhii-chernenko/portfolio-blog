/** A content author for structured data, from an EmDash byline (admin → Bylines). */
export interface Author {
	name: string;
	/** The byline's website URL. */
	websiteUrl?: string;
	/** Profile URLs from the byline (its website). Site-wide profiles are merged in BaseHead. */
	sameAs: string[];
}

/** Byline custom field that held profile URLs before they moved to Site settings. */
const LEGACY_PROFILES_FIELD = 'profiles';

const HTTP_URL = /^https?:\/\/\S+$/i;

/** Profile URLs from a multi-line text value (one URL per line; other lines are ignored). */
export function profileUrls(value: unknown): string[] {
	if (typeof value !== 'string') return [];
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => HTTP_URL.test(line));
}

/** Identity of a profile URL for de-duplication: host without `www.`, path without the trailing slash. */
function profileKey(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase();
	} catch {
		return url.toLowerCase();
	}
}

/** Profile URLs in order, without the same profile twice in different forms. */
export function mergeProfiles(...lists: string[][]): string[] {
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const url of lists.flat()) {
		const key = profileKey(url);
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(url);
	}
	return merged;
}

/**
 * The author of an entry from its primary byline (`entry.data.byline`, eagerly loaded by
 * EmDash). Returns undefined for entries without a byline.
 */
export function authorFromByline(
	byline: unknown,
	socialProfiles: string[] = [],
): Author | undefined {
	if (!byline || typeof byline !== 'object') return undefined;
	const record = byline as Record<string, unknown>;
	const name = typeof record.displayName === 'string' ? record.displayName.trim() : '';
	if (!name) return undefined;
	const websiteUrl =
		typeof record.websiteUrl === 'string' && HTTP_URL.test(record.websiteUrl)
			? record.websiteUrl
			: undefined;
	// No byline custom fields on purpose: any custom byline field makes EmDash load bylines with
	// extra queries for every list of every collection. Profile URLs live in Site settings; the
	// legacy `profiles` byline field is still read until `pnpm cms:adopt` moves and deletes it.
	const customFields =
		record.customFields && typeof record.customFields === 'object'
			? (record.customFields as Record<string, unknown>)
			: {};
	const sameAs = mergeProfiles(
		profileUrls(customFields[LEGACY_PROFILES_FIELD]),
		websiteUrl ? [websiteUrl] : [],
		socialProfiles,
	);
	return { name, websiteUrl, sameAs };
}
