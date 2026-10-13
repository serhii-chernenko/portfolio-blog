export const MIN_POSTS_FOR_TAG_INDEXING = 2;

const COMBINING_MARKS_AFTER_LATIN = /(\p{Script=Latin})\p{M}+/gu;
const NON_SLUG_RUNS = /[^\p{L}\p{N}]+/gu;
const EDGE_HYPHENS = /^-+|-+$/g;

export function tagSlug(tag: string): string {
	return tag
		.toLowerCase()
		.normalize('NFKD')
		.replace(COMBINING_MARKS_AFTER_LATIN, '$1')
		.normalize('NFC')
		.replace(NON_SLUG_RUNS, '-')
		.replace(EDGE_HYPHENS, '');
}
