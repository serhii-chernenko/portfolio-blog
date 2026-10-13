import { isLocale, type Locale } from '../i18n/config';
import { localeHref, withBase } from '../i18n/utils';

export const INDEXNOW_KEY = 'aa97432c46c58c839540be4d044ece78';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

const SUCCESS_STATUSES = new Set([200, 202]);
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const INDEXED_DOCUMENT_TYPES = new Set(['post', 'page']);

export interface ContentChange {
	_type?: unknown;
	language?: unknown;
	slug?: unknown;
	previousSlug?: unknown;
	publishedAt?: unknown;
}

function validSlug(value: unknown): string | null {
	return typeof value === 'string' && SLUG_PATTERN.test(value) ? value : null;
}

function isScheduled(publishedAt: unknown, now: Date): boolean {
	if (typeof publishedAt !== 'string') return false;
	const date = new Date(publishedAt);
	return !Number.isNaN(date.getTime()) && date > now;
}

function documentPath(type: string, locale: Locale, slug: string): string {
	return type === 'post' ? localeHref(locale, `posts/${slug}`) : localeHref(locale, slug);
}

export function indexNowKeyLocation(site: URL): string {
	return new URL(withBase(`${INDEXNOW_KEY}.txt`), site).toString();
}

/**
 * Lists the public URLs a published post or page change affects: the document itself, the URL
 * it moved away from after a slug rename and, for posts, the locale home and posts index.
 * Returns nothing for scheduled posts and for documents without a valid language and slug.
 */
export function changedContentUrls(change: ContentChange, site: URL, now = new Date()): string[] {
	const type = change._type;
	const language = change.language;
	const slug = validSlug(change.slug);
	if (typeof type !== 'string' || !INDEXED_DOCUMENT_TYPES.has(type)) return [];
	if (typeof language !== 'string' || !isLocale(language) || !slug) return [];
	if (type === 'post' && isScheduled(change.publishedAt, now)) return [];

	const paths = [documentPath(type, language, slug)];
	const previousSlug = validSlug(change.previousSlug);
	if (previousSlug && previousSlug !== slug) {
		paths.push(documentPath(type, language, previousSlug));
	}
	if (type === 'post') paths.push(localeHref(language), localeHref(language, 'posts/'));
	return [...new Set(paths.map((path) => new URL(path, site).toString()))];
}

export async function submitToIndexNow(site: URL, urls: string[]): Promise<void> {
	if (urls.length === 0) return;
	try {
		const response = await fetch(INDEXNOW_ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/json; charset=utf-8' },
			body: JSON.stringify({
				host: site.hostname,
				key: INDEXNOW_KEY,
				keyLocation: indexNowKeyLocation(site),
				urlList: urls,
			}),
		});
		if (!SUCCESS_STATUSES.has(response.status)) {
			console.error(
				JSON.stringify({ message: 'IndexNow submission rejected', status: response.status }),
			);
		}
	} catch (error) {
		console.error(
			JSON.stringify({
				message: 'IndexNow submission failed',
				error: error instanceof Error ? error.message : String(error),
			}),
		);
	}
}
