/** A content author for structured data, from an EmDash byline (admin → Bylines). */
export interface Author {
	name: string;
	/** The byline's website URL. */
	websiteUrl?: string;
	/** Profile URLs: the byline's `profiles` field (one per line), its website and Settings → Social. */
	sameAs: string[];
}

/** Byline custom field (admin → Byline Schema) holding profile URLs, one per line. */
export const BYLINE_PROFILES_FIELD = 'profiles';

const HTTP_URL = /^https?:\/\/\S+$/i;

function urlLines(value: unknown): string[] {
	if (typeof value !== 'string') return [];
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => HTTP_URL.test(line));
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
	const customFields =
		record.customFields && typeof record.customFields === 'object'
			? (record.customFields as Record<string, unknown>)
			: {};
	const sameAs = [
		...urlLines(customFields[BYLINE_PROFILES_FIELD]),
		...(websiteUrl ? [websiteUrl] : []),
		...socialProfiles,
	];
	return { name, websiteUrl, sameAs: Array.from(new Set(sameAs)) };
}
