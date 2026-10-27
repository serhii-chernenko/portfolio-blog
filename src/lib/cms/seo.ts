import { getSeoMeta } from 'emdash';
import type { CmsEntry } from './entries';

/**
 * An entry's SEO panel (admin → entry → SEO): overrides for the page's title, description,
 * social image and canonical URL, and a noindex switch. EmDash attaches it to single-entry
 * reads; lists don't carry it.
 */
export interface EntrySeo {
	title?: string;
	description?: string;
	/** Image reference as stored by EmDash (resolve with `resolveEntrySeo`). */
	image?: string;
	canonical?: string;
	noIndex: boolean;
}

export function entrySeo(entry: CmsEntry): EntrySeo | undefined {
	const seo = entry.data.seo;
	if (!seo || typeof seo !== 'object') return undefined;
	const raw = seo as Record<string, unknown>;
	const text = (value: unknown) =>
		typeof value === 'string' && value.trim() ? value.trim() : undefined;
	const result: EntrySeo = {
		title: text(raw.title),
		description: text(raw.description),
		image: text(raw.image),
		canonical: text(raw.canonical),
		noIndex: raw.noIndex === true,
	};
	return result.title || result.description || result.image || result.canonical || result.noIndex
		? result
		: undefined;
}

/** Absolute social image and canonical URLs of an SEO panel, resolved the way EmDash does. */
export function resolveEntrySeo(seo: EntrySeo, site: URL): { image?: string; canonical?: string } {
	const meta = getSeoMeta(
		{
			data: {},
			seo: {
				title: null,
				description: null,
				image: seo.image ?? null,
				canonical: seo.canonical ?? null,
				noIndex: seo.noIndex,
			},
		},
		{ siteUrl: site.origin },
	);
	return {
		image: seo.image ? (meta.ogImage ?? undefined) : undefined,
		canonical: seo.canonical ? (meta.canonical ?? undefined) : undefined,
	};
}
