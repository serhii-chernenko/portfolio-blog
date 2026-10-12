import { ui, type UIKey } from './ui';
import { defaultLocale, isLocale, type Locale } from './config';

export function getLocaleFromUrl(url: URL): Locale {
	const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
	const pathname = url.pathname.startsWith(`${base}/`)
		? url.pathname.slice(base.length)
		: url.pathname;
	const [, maybeLocale] = pathname.split('/');
	if (maybeLocale && isLocale(maybeLocale)) return maybeLocale;
	return defaultLocale;
}

export function useTranslations(locale: Locale) {
	return function t(key: UIKey, vars?: Record<string, string | number>): string {
		let value: string = ui[locale][key] ?? ui[defaultLocale][key];
		if (vars) {
			for (const [k, v] of Object.entries(vars)) {
				value = value.replaceAll(`{${k}}`, String(v));
			}
		}
		return value;
	};
}

/**
 * Prepends Astro's BASE_URL (e.g. `/blog`) to a path.
 * Always inserts exactly one slash between base and path.
 */
export function withBase(path: string): string {
	const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
	const clean = path.replace(/^\/+/, '');
	return clean ? `${base}/${clean}` : `${base}/`;
}

const FILE_EXTENSION_PATTERN = /\.[^./]+$/;

/**
 * Builds a base-prefixed page path in the canonical trailing-slash form; file-like paths such
 * as `rss.xml` keep their extension untouched.
 */
export function localeHref(locale: Locale, path = ''): string {
	const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
	if (!clean) return withBase(`${locale}/`);
	const suffix = FILE_EXTENSION_PATTERN.test(clean) ? '' : '/';
	return withBase(`${locale}/${clean}${suffix}`);
}
