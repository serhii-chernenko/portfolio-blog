import { dateLocale, type Locale } from '../i18n/config';

/**
 * A post date as readers see it ("May 15, 2026" / "15 травня 2026 р."), in the time zone set in
 * the admin (Settings → General: Timezone; the runtime's zone, UTC on Workers, when unset).
 * EmDash's Date Format pattern is not applied: one pattern cannot produce correct dates in both
 * languages, so each language keeps its own `Intl` format.
 */
export function formatPostDate(
	date: Date,
	locale: Locale,
	timeZone?: string,
	month: 'long' | 'short' = 'long',
): string {
	return date.toLocaleDateString(dateLocale[locale], {
		year: 'numeric',
		month,
		day: 'numeric',
		...(timeZone ? { timeZone } : {}),
	});
}
