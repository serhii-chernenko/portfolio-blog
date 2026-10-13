import type { Locale } from '../i18n/config';
import { htmlLangAttribute } from '../i18n/config';
import { withTrailingSlash } from './trailing-slash';

export type LocaleAlternates = Partial<Record<Locale, string | null>>;

export interface HreflangLink {
	hreflang: string;
	href: string;
}

export function ensureTrailingSlash(url: string): string {
	const parsed = new URL(url);
	const pathname = withTrailingSlash(parsed.pathname);
	if (pathname === parsed.pathname) return url;
	parsed.pathname = pathname;
	return parsed.toString();
}

export function buildCanonical(site: URL | string, pathname: string): string {
	const base = typeof site === 'string' ? new URL(site) : site;
	return ensureTrailingSlash(new URL(pathname, base).toString());
}

export function buildHreflang(
	site: URL | string,
	locale: Locale,
	pathname: string,
	alternates?: LocaleAlternates,
): HreflangLink[] {
	const base = typeof site === 'string' ? new URL(site) : site;
	const out: HreflangLink[] = [];
	const seen = new Set<string>();

	const self = buildCanonical(base, pathname);
	out.push({ hreflang: htmlLangAttribute[locale], href: self });
	seen.add(locale);

	if (alternates) {
		for (const [lang, path] of Object.entries(alternates)) {
			if (!path || seen.has(lang)) continue;
			out.push({
				hreflang: htmlLangAttribute[lang as Locale],
				href: buildCanonical(base, path),
			});
			seen.add(lang);
		}
	}

	const enPath = alternates?.en ?? (locale === 'en' ? pathname : null);
	out.push({
		hreflang: 'x-default',
		href: enPath ? buildCanonical(base, enPath) : self,
	});

	return out;
}
