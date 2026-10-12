import { perspectiveCookieName } from '@sanity/preview-url-secret/constants';
import type { ClientPerspective } from '@sanity/client';
import { PREVIEW_SEARCH_PARAM } from './config';

const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
const API_PATH_PREFIX = `${BASE_PATH}/api/`;
const DEFAULT_REDIRECT_PATH = `${BASE_PATH}/en/`;
const EXPIRED_COOKIE_ATTRIBUTES = 'Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';

function cookieAttributes(partitioned: boolean): string {
	const attributes = [`Path=${BASE_PATH || '/'}`, 'Secure', 'SameSite=None'];
	if (partitioned) attributes.push('Partitioned');
	return attributes.join('; ');
}

export function serializePerspective(perspective: ClientPerspective): string {
	return Array.isArray(perspective) ? perspective.join(',') : perspective;
}

export function perspectiveCookie(perspective: ClientPerspective, partitioned: boolean): string {
	const value = encodeURIComponent(serializePerspective(perspective));
	return `${perspectiveCookieName}=${value}; ${cookieAttributes(partitioned)}`;
}

export function expiredPerspectiveCookies(): string[] {
	return [false, true].map(
		(partitioned) =>
			`${perspectiveCookieName}=; ${EXPIRED_COOKIE_ATTRIBUTES}; ${cookieAttributes(partitioned)}`,
	);
}

export function isCrossSiteIframe(request: Request): boolean {
	return (
		request.headers.get('sec-fetch-dest') === 'iframe' &&
		request.headers.get('sec-fetch-site') === 'cross-site'
	);
}

/**
 * Resolves a redirect target to a same-origin blog page path, so draft-mode routes
 * can never be turned into open redirects or bounced onto API endpoints.
 */
export function safeBlogRedirect(
	target: string | null | undefined,
	requestUrl: URL,
	includePreviewParam: boolean,
): string {
	let destination: URL;
	try {
		destination = new URL(target || DEFAULT_REDIRECT_PATH, requestUrl.origin);
	} catch {
		destination = new URL(DEFAULT_REDIRECT_PATH, requestUrl.origin);
	}
	const isBlogPage =
		destination.origin === requestUrl.origin &&
		destination.pathname.startsWith(`${BASE_PATH}/`) &&
		!destination.pathname.startsWith(API_PATH_PREFIX);
	if (!isBlogPage) destination = new URL(DEFAULT_REDIRECT_PATH, requestUrl.origin);
	if (includePreviewParam) destination.searchParams.set(PREVIEW_SEARCH_PARAM, '1');
	else destination.searchParams.delete(PREVIEW_SEARCH_PARAM);
	return `${destination.pathname}${destination.search}${destination.hash}`;
}
