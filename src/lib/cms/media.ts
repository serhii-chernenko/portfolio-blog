/**
 * An EmDash image: a media field value (`{ id, alt, width, height, meta.storageKey }`) or a
 * Portable Text image block's `asset` reference (`{ _ref, url }` with dimensions on the block).
 */
export interface MediaImage {
	id?: string;
	src?: string;
	url?: string;
	alt?: string | null;
	width?: number;
	height?: number;
	provider?: string;
	meta?: { storageKey?: unknown } & Record<string, unknown>;
}

interface Dimensions {
	width: number;
	height: number;
}

const EMDASH_MEDIA_FILE_PREFIX = '/_emdash/api/media/file/';
const SAFE_STORAGE_KEY = /^[A-Za-z0-9._-]+$/;
const ABSOLUTE_URL = /^https?:\/\//i;

function storageKeyOf(image: MediaImage): string | null {
	const key = image.meta?.storageKey;
	if (typeof key === 'string' && SAFE_STORAGE_KEY.test(key)) return key;
	const url = image.url ?? image.src ?? '';
	const index = url.indexOf(EMDASH_MEDIA_FILE_PREFIX);
	if (index === -1) return null;
	const candidate = decodeURIComponent(url.slice(index + EMDASH_MEDIA_FILE_PREFIX.length));
	return SAFE_STORAGE_KEY.test(candidate) ? candidate : null;
}

export function isMediaImage(value: unknown): value is MediaImage {
	if (!value || typeof value !== 'object') return false;
	const image = value as MediaImage;
	return Boolean(storageKeyOf(image) || (image.src && ABSOLUTE_URL.test(image.src)));
}

/**
 * Public URL of the original file: EmDash serves stored media (local uploads in dev, the R2
 * bucket in production) at `/_emdash/api/media/file/{key}`. External media keep their URL.
 */
export function mediaUrl(image: MediaImage): string {
	const key = storageKeyOf(image);
	if (key) return `${EMDASH_MEDIA_FILE_PREFIX}${key}`;
	const external = image.src ?? image.url ?? '';
	return ABSOLUTE_URL.test(external) ? external : '';
}

export function absoluteMediaUrl(image: MediaImage, site: URL | string): string {
	const url = mediaUrl(image);
	return url ? new URL(url, site).toString() : '';
}

export function imageDimensions(image: MediaImage): Dimensions | null {
	const { width, height } = image;
	return typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0
		? { width, height }
		: null;
}
