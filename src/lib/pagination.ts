export const POSTS_PAGE_SIZE = 10;

const PAGE_NUMBER_PATTERN = /^[1-9][0-9]{0,3}$/;

export function parsePageNumber(raw: string | undefined): number | null {
	return raw && PAGE_NUMBER_PATTERN.test(raw) ? Number(raw) : null;
}
