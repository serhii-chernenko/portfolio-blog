import { stegaClean } from '@sanity/client/stega';
import { defaultLocale, type Locale } from '../i18n/config';
import type { UIKey } from '../i18n/ui';
import { localeHref, useTranslations } from '../i18n/utils';
import type { SanityImage } from './sanity/image';
import { LAYOUT_QUERY } from './sanity/queries';
import type { SanityContext } from './sanity/request';
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
	defaultOgImage?: SanityImage;
}

export interface LayoutData {
	settings: SiteSettings;
	header: NavLink[];
	footer: NavLink[];
	aboutPath: string;
}

interface RawNavItem {
	_key: string;
	label: string | null;
	linkType: string | null;
	pageKey: string | null;
	pageSlug: string | null;
	route: string | null;
	url: string | null;
	icon: string | null;
	openInNewTab: boolean | null;
}

interface RawLayout {
	settings:
		| (Partial<Record<Exclude<keyof SiteSettings, 'defaultOgImage'>, string | null>> & {
				defaultOgImage?: SanityImage | null;
		  })
		| null;
	header: RawNavItem[] | null;
	footer: RawNavItem[] | null;
	aboutSlug: string | null;
}

const NAV_ROUTES: readonly NavRoute[] = ['home', 'posts', 'tags', 'subscribe', 'rss'];
const NAV_ICONS: readonly NavIcon[] = ['rss', 'github', 'support'];
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const EXTERNAL_URL_PATTERN = /^(https?:\/\/|mailto:)/i;
const SOURCE_REPOSITORY_URL = 'https://github.com/serhii-chernenko/portfolio-blog';
const SITE_SETTINGS_ID = 'siteSettings';
const HEADER_NAVIGATION_ID = 'navigation-header';
const FOOTER_NAVIGATION_ID = 'navigation-footer';

function isNavRoute(value: string): value is NavRoute {
	return (NAV_ROUTES as readonly string[]).includes(value);
}

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

function pageHref(item: RawNavItem, locale: Locale): string | null {
	const slug = stegaClean(item.pageSlug ?? '');
	return SLUG_PATTERN.test(slug) ? localeHref(locale, slug) : null;
}

function resolveHref(
	item: RawNavItem,
	locale: Locale,
): Pick<NavLink, 'href' | 'route' | 'isExternal'> | null {
	const linkType = stegaClean(item.linkType ?? 'page');
	if (linkType === 'route') {
		const route = stegaClean(item.route ?? '');
		return isNavRoute(route) ? { href: routeHref(route, locale), route, isExternal: false } : null;
	}
	if (linkType === 'external') {
		const url = stegaClean(item.url ?? '');
		return EXTERNAL_URL_PATTERN.test(url) ? { href: url, isExternal: true } : null;
	}
	if (linkType !== 'page') return null;
	const href = pageHref(item, locale);
	return href ? { href, isExternal: false } : null;
}

function toNavLinks(items: RawNavItem[], locale: Locale): NavLink[] {
	const links: NavLink[] = [];
	for (const item of items) {
		const target = resolveHref(item, locale);
		if (!target || !item.label) continue;
		const icon = stegaClean(item.icon ?? '');
		links.push({
			key: item._key,
			label: item.label,
			...target,
			icon: isNavIcon(icon) ? icon : undefined,
			openInNewTab: item.openInNewTab === true,
		});
	}
	return links;
}

type Translate = ReturnType<typeof useTranslations>;

function fallbackSettings(t: Translate, raw: RawLayout['settings']): SiteSettings {
	const pick = (value: string | null | undefined, key: UIKey) => value || t(key);
	return {
		siteName: pick(raw?.siteName, 'site.name'),
		tagline: pick(raw?.tagline, 'site.tagline'),
		description: pick(raw?.description, 'site.description'),
		heroEyebrow: pick(raw?.heroEyebrow, 'home.hero.eyebrow'),
		heroTitle: pick(raw?.heroTitle, 'home.hero.title'),
		heroSubtitle: pick(raw?.heroSubtitle, 'home.hero.subtitle'),
		aboutTitle: pick(raw?.aboutTitle, 'home.about.title'),
		aboutBody: pick(raw?.aboutBody, 'home.about.body'),
		aboutCta: pick(raw?.aboutCta, 'home.about.cta'),
		defaultOgImage: raw?.defaultOgImage?.asset ? raw.defaultOgImage : undefined,
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

export async function getLayoutData(locale: Locale, ctx: SanityContext): Promise<LayoutData> {
	const [raw, overrides] = await Promise.all([
		ctx.fetch<RawLayout>(LAYOUT_QUERY, {
			locale,
			defaultLocale,
			settingsId: SITE_SETTINGS_ID,
			headerId: HEADER_NAVIGATION_ID,
			footerId: FOOTER_NAVIGATION_ID,
		}),
		loadUiOverrides(ctx),
	]);
	const t = useTranslations(locale, overrides);
	const aboutSlug = stegaClean(raw?.aboutSlug ?? '');
	const aboutPath = SLUG_PATTERN.test(aboutSlug)
		? localeHref(locale, aboutSlug)
		: localeHref(locale);
	return {
		settings: fallbackSettings(t, raw?.settings ?? null),
		header: raw?.header ? toNavLinks(raw.header, locale) : fallbackHeader(t, locale, aboutPath),
		footer: raw?.footer ? toNavLinks(raw.footer, locale) : fallbackFooter(t, locale),
		aboutPath,
	};
}
