import { ui, type UIKey } from './ui';
import { defaultLocale, isLocale, type Locale } from './config';
import { withTrailingSlash } from '../lib/trailing-slash';

export function getLocaleFromUrl(url: URL): Locale {
	const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
	const pathname = url.pathname.startsWith(`${base}/`)
		? url.pathname.slice(base.length)
		: url.pathname;
	const [, maybeLocale] = pathname.split('/');
	if (maybeLocale && isLocale(maybeLocale)) return maybeLocale;
	return defaultLocale;
}

export type UiOverrides = Partial<Record<Locale, Partial<Record<UIKey, string>>>>;

/**
 * Returns a synchronous translator for `locale`. Sanity `uiStrings` overrides win over
 * `ui.ts`; in draft mode they carry stega markers, so clean them before using in attributes.
 */
export function useTranslations(locale: Locale, overrides?: UiOverrides) {
	const localeOverrides = overrides?.[locale];
	return function t(key: UIKey, vars?: Record<string, string | number>): string {
		let value: string = localeOverrides?.[key] ?? ui[locale][key] ?? ui[defaultLocale][key];
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

export function withPageBase(path: string): string {
	const clean = path.replace(/^\/+/, '');
	return withBase(withTrailingSlash(clean));
}

export function localeHref(locale: Locale, path = ''): string {
	const clean = path.replace(/^\/+/, '');
	return withPageBase(clean ? `${locale}/${clean}` : `${locale}/`);
}

export function mirroredLocaleHrefs(path = ''): Record<Locale, string> {
	return { en: localeHref('en', path), uk: localeHref('uk', path) };
}
