import { PREVIEW_SEARCH_PARAM } from './sanity/config';

const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
const API_PATH_PREFIX = `${BASE_PATH}/api/`;

export const PREVIEW_ROOT_ATTRIBUTE = 'data-sanity-preview';

function isPreviewActive(): boolean {
	return document.documentElement.hasAttribute(PREVIEW_ROOT_ATTRIBUTE);
}

/**
 * Keeps navigation inside draft mode by tagging same-origin blog page links with the preview
 * param. Hash-only and same-page anchors are left alone so in-page jumps never reload.
 */
export function previewAwareHref(href: string): string {
	if (!isPreviewActive() || href.startsWith('#')) return href;
	const current = new URL(window.location.href);
	const target = new URL(href, current);
	const isBlogPage =
		target.origin === current.origin &&
		target.pathname.startsWith(`${BASE_PATH}/`) &&
		!target.pathname.startsWith(API_PATH_PREFIX);
	const isSamePageAnchor = target.hash !== '' && target.pathname === current.pathname;
	if (!isBlogPage || isSamePageAnchor || target.searchParams.has(PREVIEW_SEARCH_PARAM)) {
		return href;
	}
	target.searchParams.set(PREVIEW_SEARCH_PARAM, '1');
	return `${target.pathname}${target.search}${target.hash}`;
}
