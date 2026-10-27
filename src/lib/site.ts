import { getMenu, type MenuItem } from 'emdash';
import type { Locale } from '../i18n/config';
import type { UIKey } from '../i18n/ui';
import { localeHref, useTranslations, withBase } from '../i18n/utils';
import { COLLECTIONS, MENUS } from './cms/config';
import type { CmsContext } from './cms/context';
import { listEntries, stringField } from './cms/entries';
import { getSiteConfig, type SiteConfig } from './cms/settings';
import { getPages, pageUrl, type Page } from './pages';
import { loadUiOverrides } from './ui-overrides';

export type NavIcon = 'rss' | 'github' | 'support';
export type NavRoute = 'home' | 'posts' | 'tags' | 'subscribe' | 'rss';

export interface NavLink {
	key: string;
	label: string;
	href: string;
	route?: NavRoute;
	icon?: NavIcon;
	isExternal: boolean;
	openInNewTab: boolean;
}

export interface SiteSettings {
	siteName: string;
	tagline: string;
	description: string;
	heroEyebrow: string;
	heroTitle: string;
	heroSubtitle: string;
	aboutTitle: string;
	aboutBody: string;
	aboutCta: string;
}

export interface LayoutData {
	/** Per-language site copy (`site_settings` collection). */
	settings: SiteSettings;
	/** Built-in EmDash settings (admin → Settings): logo, favicon, SEO, reading, social. */
	site: SiteConfig;
	header: NavLink[];
	footer: NavLink[];
	aboutPath: string;
}

type RawSettings = Partial<Record<keyof SiteSettings, string>>;

const NAV_ROUTES: readonly NavRoute[] = ['home', 'posts', 'tags', 'subscribe', 'rss'];
const NAV_ICONS: readonly NavIcon[] = ['rss', 'github', 'support'];
const NAV_ICON_CLASS_PREFIX = 'icon-';
const EXTERNAL_URL_PATTERN = /^(https?:\/\/|mailto:)/i;
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const SOURCE_REPOSITORY_URL = 'https://github.com/serhii-chernenko/portfolio-blog';
const BLOG_PATH_PREFIX = withBase('');

/** site_settings field slug → SiteSettings key. */
const SETTINGS_FIELDS: Record<keyof SiteSettings, string> = {
	siteName: 'site_name',
	tagline: 'tagline',
	description: 'description',
	heroEyebrow: 'hero_eyebrow',
	heroTitle: 'hero_title',
	heroSubtitle: 'hero_subtitle',
	aboutTitle: 'about_title',
	aboutBody: 'about_body',
	aboutCta: 'about_cta',
};

function isNavIcon(value: string): value is NavIcon {
	return (NAV_ICONS as readonly string[]).includes(value);
}

export function routeHref(route: NavRoute, locale: Locale): string {
	switch (route) {
		case 'home':
			return localeHref(locale);
		case 'posts':
			return localeHref(locale, 'posts');
		case 'tags':
			return localeHref(locale, 'tags');
		case 'subscribe':
			return localeHref(locale, 'subscribe');
		case 'rss':
			return localeHref(locale, 'rss.xml');
	}
}

/** Built-in route a custom menu URL points at, matched with or without the trailing slash. */
function routeFor(href: string, locale: Locale): NavRoute | undefined {
	const normalized = href.replace(/\/+$/, '');
	return NAV_ROUTES.find((route) => routeHref(route, locale).replace(/\/+$/, '') === normalized);
}

function iconFor(item: MenuItem): NavIcon | undefined {
	const icon = (item.cssClasses ?? '')
		.split(/\s+/)
		.find((cssClass) => cssClass.startsWith(NAV_ICON_CLASS_PREFIX))
		?.slice(NAV_ICON_CLASS_PREFIX.length);
	return icon && isNavIcon(icon) ? icon : undefined;
}

/**
 * Menu "page" items resolve through the pages collection URL pattern (`/{slug}`, prefixed with
 * the locale for Ukrainian). Map the slug back to this locale's published page so links get the
 * site's `/blog/{locale}/{slug}/` shape, and drop items whose page has no translation here.
 */
function pageHref(url: string, pages: Page[]): string | null {
	const segments = url.split(/[?#]/)[0].split('/').filter(Boolean);
	const slug = segments.at(-1) ?? '';
	if (!SLUG_PATTERN.test(slug)) return null;
	const page = pages.find((candidate) => candidate.slug === slug);
	return page ? pageUrl(page) : null;
}

function resolveHref(
	item: MenuItem,
	locale: Locale,
	pages: Page[],
): Pick<NavLink, 'href' | 'route' | 'isExternal'> | null {
	const url = item.url.trim();
	if (EXTERNAL_URL_PATTERN.test(url)) return { href: url, isExternal: true };
	if (!url.startsWith('/') || url.startsWith('//')) return null;
	if (url === BLOG_PATH_PREFIX.replace(/\/$/, '') || url.startsWith(BLOG_PATH_PREFIX)) {
		return { href: url, route: routeFor(url, locale), isExternal: false };
	}
	const href = pageHref(url, pages);
	return href ? { href, isExternal: false } : null;
}

function toNavLinks(items: MenuItem[], locale: Locale, pages: Page[]): NavLink[] {
	const links: NavLink[] = [];
	for (const item of items) {
		const target = resolveHref(item, locale, pages);
		if (!target || !item.label) continue;
		links.push({
			key: item.id,
			label: item.label,
			...target,
			icon: iconFor(item),
			openInNewTab: item.target === '_blank',
		});
	}
	return links;
}

type Translate = ReturnType<typeof useTranslations>;

/**
 * Empty per-language fields fall back to the built-in Settings → General title and tagline, then
 * to the interface strings in `src/i18n/ui.ts`.
 */
function fallbackSettings(t: Translate, raw: RawSettings | null, site: SiteConfig): SiteSettings {
	const pick = (value: string | null | undefined, key: UIKey) => value || t(key);
	return {
		siteName: pick(raw?.siteName || site.title, 'site.name'),
		tagline: pick(raw?.tagline || site.tagline, 'site.tagline'),
		description: pick(raw?.description, 'site.description'),
		heroEyebrow: pick(raw?.heroEyebrow, 'home.hero.eyebrow'),
		heroTitle: pick(raw?.heroTitle, 'home.hero.title'),
		heroSubtitle: pick(raw?.heroSubtitle, 'home.hero.subtitle'),
		aboutTitle: pick(raw?.aboutTitle, 'home.about.title'),
		aboutBody: pick(raw?.aboutBody, 'home.about.body'),
		aboutCta: pick(raw?.aboutCta, 'home.about.cta'),
	};
}

function fallbackHeader(t: Translate, locale: Locale, aboutPath: string): NavLink[] {
	const internalLink = (key: string, label: string, href: string, route?: NavRoute): NavLink => ({
		key,
		label,
		href,
		route,
		isExternal: false,
		openInNewTab: false,
	});
	return [
		internalLink('posts', t('nav.posts'), routeHref('posts', locale), 'posts'),
		internalLink('tags', t('nav.tags'), routeHref('tags', locale), 'tags'),
		internalLink('about', t('nav.about'), aboutPath),
	];
}

function fallbackFooter(t: Translate, locale: Locale): NavLink[] {
	return [
		{
			key: 'rss',
			label: t('footer.rss'),
			href: routeHref('rss', locale),
			route: 'rss',
			icon: 'rss',
			isExternal: false,
			openInNewTab: false,
		},
		{
			key: 'source',
			label: t('footer.source'),
			href: SOURCE_REPOSITORY_URL,
			icon: 'github',
			isExternal: true,
			openInNewTab: true,
		},
	];
}

async function loadSettings(locale: Locale): Promise<RawSettings | null> {
	const [entry] = await listEntries(COLLECTIONS.siteSettings, locale, { limit: 1 });
	if (!entry) return null;
	const settings: RawSettings = {};
	for (const [key, field] of Object.entries(SETTINGS_FIELDS) as [
		keyof typeof SETTINGS_FIELDS,
		string,
	][]) {
		settings[key] = stringField(entry, field);
	}
	return settings;
}

export async function getLayoutData(locale: Locale, ctx: CmsContext): Promise<LayoutData> {
	const [settings, site, header, footer, pages, overrides] = await Promise.all([
		loadSettings(locale),
		getSiteConfig(),
		getMenu(MENUS.header, { locale }),
		getMenu(MENUS.footer, { locale }),
		getPages(locale, ctx),
		loadUiOverrides(ctx),
	]);
	const t = useTranslations(locale, overrides);
	const aboutPage = pages.find((page) => page.key === 'about');
	const aboutPath = aboutPage ? pageUrl(aboutPage) : localeHref(locale);
	return {
		settings: fallbackSettings(t, settings, site),
		site,
		header: header ? toNavLinks(header.items, locale, pages) : fallbackHeader(t, locale, aboutPath),
		footer: footer ? toNavLinks(footer.items, locale, pages) : fallbackFooter(t, locale),
		aboutPath,
	};
}
