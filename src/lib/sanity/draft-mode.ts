import { perspectiveCookieName } from '@sanity/preview-url-secret/constants';
import type { ClientPerspective } from '@sanity/client';
import { b64urlEncode, signHmac, verifyHmac } from '../tokens';
import { PREVIEW_SEARCH_PARAM } from './config';

const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
const API_PATH_PREFIX = `${BASE_PATH}/api/`;
const DEFAULT_REDIRECT_PATH = `${BASE_PATH}/en/`;
const EXPIRED_COOKIE_ATTRIBUTES = 'Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';

export const DRAFT_SESSION_COOKIE_NAME = 'sanity-draft-session';
const DRAFT_SESSION_TTL_SECONDS = 12 * 60 * 60;
const DRAFT_SESSION_SIGNING_CONTEXT = 'draft-session:v1:';
const DRAFT_SESSION_NONCE_BYTES = 16;
const DRAFT_SESSION_EXPIRY_PATTERN = /^[1-9][0-9]{0,11}$/;
const DRAFT_SESSION_NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const DRAFT_SESSION_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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

function expiredCookies(name: string, httpOnly: boolean): string[] {
	return [false, true].map((partitioned) => {
		const attributes = [`${name}=`, EXPIRED_COOKIE_ATTRIBUTES, cookieAttributes(partitioned)];
		if (httpOnly) attributes.push('HttpOnly');
		return attributes.join('; ');
	});
}

export function expiredDraftModeCookies(): string[] {
	return [
		...expiredCookies(perspectiveCookieName, false),
		...expiredCookies(DRAFT_SESSION_COOKIE_NAME, true),
	];
}

function draftSessionMessage(expiry: string, nonce: string): string {
	return `${DRAFT_SESSION_SIGNING_CONTEXT}${expiry}.${nonce}`;
}

/**
 * Issues the signed draft session (`<expiry>.<nonce>.<hmac>`) that alone unlocks draft
 * rendering; the perspective cookie only chooses which perspective a valid session sees.
 */
export async function draftSessionCookie(
	secret: string,
	partitioned: boolean,
	now = Date.now(),
): Promise<string> {
	const expiry = String(Math.floor(now / 1000) + DRAFT_SESSION_TTL_SECONDS);
	const nonce = b64urlEncode(crypto.getRandomValues(new Uint8Array(DRAFT_SESSION_NONCE_BYTES)));
	const signature = await signHmac(secret, draftSessionMessage(expiry, nonce));
	const value = `${expiry}.${nonce}.${signature}`;
	return [
		`${DRAFT_SESSION_COOKIE_NAME}=${value}`,
		`Max-Age=${DRAFT_SESSION_TTL_SECONDS}`,
		cookieAttributes(partitioned),
		'HttpOnly',
	].join('; ');
}

export async function isValidDraftSession(
	secret: string,
	value: string | undefined,
	now = Date.now(),
): Promise<boolean> {
	const [expiry, nonce, signature, extra] = (value ?? '').split('.');
	if (!expiry || !nonce || !signature || extra !== undefined) return false;
	if (
		!DRAFT_SESSION_EXPIRY_PATTERN.test(expiry) ||
		!DRAFT_SESSION_NONCE_PATTERN.test(nonce) ||
		!DRAFT_SESSION_SIGNATURE_PATTERN.test(signature)
	) {
		return false;
	}
	const nowSeconds = Math.floor(now / 1000);
	const expiresAt = Number(expiry);
	if (expiresAt <= nowSeconds || expiresAt > nowSeconds + DRAFT_SESSION_TTL_SECONDS) return false;
	return verifyHmac(secret, draftSessionMessage(expiry, nonce), signature);
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
