import { getEmDashCollection, getEmDashEntry } from 'emdash';
import { isLocale, locales, type Locale } from '../../i18n/config';
import { MAX_LIST_ENTRIES } from './config';

/** A published (or, in preview, draft) EmDash entry with its system fields normalized. */
export interface CmsEntry {
	id: string;
	slug: string | null;
	locale: Locale;
	translationGroup: string;
	status: string;
	publishedAt: Date | null;
	createdAt: Date | null;
	data: Record<string, unknown>;
}

interface RawEntry {
	id: string;
	data: Record<string, unknown>;
}

interface ListOptions {
	where?: Record<string, string | string[]>;
	orderBy?: Record<string, 'asc' | 'desc'>;
	limit?: number;
}

function toDate(value: unknown): Date | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	if (typeof value !== 'string' || !value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function bareSlug(raw: RawEntry): string | null {
	const slug = raw.data.slug;
	if (typeof slug === 'string' && slug) return slug;
	if (slug === null) return null;
	const routeId = raw.id.split('/').pop() ?? '';
	return routeId || null;
}

function normalize(raw: RawEntry, fallbackLocale: Locale): CmsEntry | null {
	const locale = typeof raw.data.locale === 'string' ? raw.data.locale : fallbackLocale;
	if (!isLocale(locale)) return null;
	const id = typeof raw.data.id === 'string' ? raw.data.id : raw.id;
	return {
		id,
		slug: bareSlug(raw),
		locale,
		translationGroup:
			typeof raw.data.translationGroup === 'string' && raw.data.translationGroup
				? raw.data.translationGroup
				: id,
		status: typeof raw.data.status === 'string' ? raw.data.status : 'published',
		publishedAt: toDate(raw.data.publishedAt),
		createdAt: toDate(raw.data.createdAt),
		data: raw.data,
	};
}

/** Published entries of one collection in one locale. EmDash memoizes identical reads per request. */
export async function listEntries(
	collection: string,
	locale: Locale,
	options: ListOptions = {},
): Promise<CmsEntry[]> {
	const { entries, error } = await getEmDashCollection(collection, {
		locale,
		status: 'published',
		where: options.where,
		orderBy: options.orderBy,
		limit: options.limit ?? MAX_LIST_ENTRIES,
	});
	if (error) throw error;
	return (entries as RawEntry[])
		.map((entry) => normalize(entry, locale))
		.filter((entry): entry is CmsEntry => entry !== null && entry.locale === locale);
}

export function listEntriesForAllLocales(
	collection: string,
	options: ListOptions = {},
): Promise<CmsEntry[][]> {
	return Promise.all(locales.map((locale) => listEntries(collection, locale, options)));
}

/**
 * One entry by slug in exactly `locale`. EmDash would fall back to the default locale when the
 * slug has no entry in the requested one; the blog serves every language at its own URL, so a
 * fallback result counts as missing. In preview, EmDash returns the entry's draft revision.
 */
export async function getEntryBySlug(
	collection: string,
	slug: string,
	locale: Locale,
): Promise<CmsEntry | null> {
	const result = await getEmDashEntry(collection, slug, { locale });
	if (result.error) throw result.error;
	if (!result.entry || result.fallbackLocale) return null;
	const entry = normalize(result.entry as RawEntry, locale);
	return entry && entry.locale === locale ? entry : null;
}

export function stringField(entry: CmsEntry, field: string): string {
	const value = entry.data[field];
	return typeof value === 'string' ? value : '';
}

export function dateField(entry: CmsEntry, field: string): Date | undefined {
	return toDate(entry.data[field]) ?? undefined;
}
