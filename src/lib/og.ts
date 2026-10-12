import { withBase } from '../i18n/utils';

export const DEFAULT_OG_IMAGE_WIDTH = 1200;
export const DEFAULT_OG_IMAGE_HEIGHT = 630;

/**
 * Fallback social image, served from `public/` so it lives under the base path.
 * Returns an absolute URL.
 */
export function defaultOgImage(site: URL | string): string {
	const base = typeof site === 'string' ? new URL(site) : site;
	return new URL(withBase('og-default.png'), base).toString();
}
