import { TAXONOMIES } from './config';
import type { CmsEntry } from './entries';

/** Name of the taxonomy that holds post tags (admin → Tags). */
export const TAG_TAXONOMY = TAXONOMIES.tag;

/** A tag on a post: a term of the `tag` taxonomy in the post's language. */
export interface PostTag {
	label: string;
	/** URL segment of `/blog/{locale}/tags/{slug}/`. */
	slug: string;
	/** Shared by the translations of a term (`database` / `база-даних`). */
	translationGroup: string;
}

interface RawTerm {
	id?: unknown;
	label?: unknown;
	slug?: unknown;
	translationGroup?: unknown;
}

/**
 * Tags of an entry from `entry.data.terms.tag`, which EmDash loads with every entry, already in
 * the entry's language (a post and its translations share their term assignments, each language
 * reading its own translation of a term) and sorted by label.
 */
export function postTagsFromEntry(entry: CmsEntry): PostTag[] {
	const terms = entry.data.terms;
	const list =
		terms && typeof terms === 'object' ? (terms as Record<string, unknown>)[TAG_TAXONOMY] : null;
	if (!Array.isArray(list)) return [];
	const tags: PostTag[] = [];
	const seen = new Set<string>();
	for (const raw of list as RawTerm[]) {
		const label = typeof raw.label === 'string' ? raw.label.trim() : '';
		const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
		if (!label || !slug || seen.has(slug)) continue;
		seen.add(slug);
		const group =
			typeof raw.translationGroup === 'string' && raw.translationGroup
				? raw.translationGroup
				: typeof raw.id === 'string'
					? raw.id
					: slug;
		tags.push({ label, slug, translationGroup: group });
	}
	return tags;
}
