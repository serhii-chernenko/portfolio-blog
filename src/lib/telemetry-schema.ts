export const CANONICAL_HOST = 'serhiichernenko.com';
export const LEGACY_REFERRER_HOST = `www.${CANONICAL_HOST}`;
export const PRODUCTION_HOSTS: ReadonlySet<string> = new Set([CANONICAL_HOST]);

export const CLIENT_EVENT_TYPES = [
	'page_view',
	'page_engaged',
	'language_switched',
	'search_used',
	'outbound_clicked',
] as const;
export const TELEMETRY_LOCALES = ['en', 'uk'] as const;
export const PAGE_TYPES = [
	'home',
	'post',
	'post_list',
	'tag',
	'tag_list',
	'page',
	'subscribe',
	'unsubscribe',
	'not_found',
] as const;
export const THEMES = ['light', 'dark'] as const;

export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];
export type TelemetryLocale = (typeof TELEMETRY_LOCALES)[number];
export type PageType = (typeof PAGE_TYPES)[number];
export type Theme = (typeof THEMES)[number];
export type BlogEnvironment = 'production' | 'development' | 'preview';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type ContentKind = 'post' | 'page' | 'tag';
export type EngagedBucket = 'lt10s' | 's10to30' | 's30to120' | 'm2to5' | 'm5plus';
export type ScrollBucket = 'p0' | 'p25' | 'p50' | 'p75' | 'p100';
export type ResultsBucket = 'none' | 'oneToFive' | 'sixPlus';
export type OutboundSource =
	| 'google'
	| 'bing'
	| 'duckduckgo'
	| 'yandex'
	| 'linkedin'
	| 'dou'
	| 'telegram'
	| 'x'
	| 'facebook'
	| 'github'
	| 'reddit'
	| 'hackernews'
	| 'chatgpt'
	| 'perplexity'
	| 'other';
export type ReferrerSource = OutboundSource | 'direct' | 'internal';
export type EnabledLanguages = 'both' | 'en' | 'uk' | 'none';
export type NewsletterSource = 'home' | 'inline' | 'subscribe-page' | 'other';
export type TelemetryOutcome = 'success' | 'rejected' | 'error';
export type NewsletterResult =
	| 'pending'
	| 'invalid_request'
	| 'rate_limited'
	| 'unavailable'
	| 'email_failed'
	| 'confirmed'
	| 'already_confirmed'
	| 'invalid_token'
	| 'changed'
	| 'unchanged';
export interface ClientEventAttributes {
	eventName: ClientEventType;
	outcome: TelemetryOutcome;
	[attribute: string]: string | number | boolean;
}

interface ClientEventBase {
	sessionId: string;
	locale: TelemetryLocale;
	pageType: PageType;
	contentKey?: string;
}

export type ClientEvent =
	| (ClientEventBase & {
			type: 'page_view';
			referrerHost?: string;
			utmSource?: string;
			browserLanguage?: string;
			theme: Theme;
			pageIndex: number;
	  })
	| (ClientEventBase & { type: 'page_engaged'; activeSeconds: number; scrollDepth: number })
	| (ClientEventBase & { type: 'language_switched'; targetLocale: TelemetryLocale })
	| (ClientEventBase & { type: 'search_used'; resultsCount: number })
	| (ClientEventBase & { type: 'outbound_clicked'; targetHost: string });

export interface ClientEventContext {
	ownHost: string;
	country: string;
	deviceType: DeviceType;
}

const MAX_ACTIVE_SECONDS = 3600;
const MAX_PAGE_INDEX = 500;
const MAX_RESULTS_COUNT = 100_000;
const MAX_CONTENT_KEY_LENGTH = 128;
const MAX_FREE_TEXT_LENGTH = 256;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTENT_KEY_PATTERN = /^[a-z0-9Ѐ-ӿ-]+$/;
const LANGUAGE_SUBTAG_PATTERN = /^[a-z]{2,3}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)*$/;
const GOOGLE_HOST_PATTERN = /(^|\.)google\.(?:(?:com?|org|net)\.[a-z]{2}|[a-z]{2,3})$/;
const GOOGLE_NON_SEARCH_HOST_PATTERN = /(^|\.)(mail|docs|drive|accounts)\.google\./;
const YANDEX_HOST_PATTERN = /(^|\.)yandex\.(?:com?\.[a-z]{2}|[a-z]{2,3})$/;
const YANDEX_MAIL_HOST_PATTERN = /(^|\.)mail\.yandex\./;
const DEGRADED_VALUE = 'other';
const CAMPAIGN_SOURCES: ReadonlySet<string> = new Set([
	'linkedin',
	'dou',
	'telegram',
	'x',
	'twitter',
	'facebook',
	'threads',
	'mastodon',
	'bluesky',
	'reddit',
	'hackernews',
	'github',
	'devto',
	'medium',
	'newsletter',
	'email',
	'google',
	'youtube',
	'discord',
	'slack',
]);
const DOMAIN_EVENT_ROUTES: ReadonlySet<string> = new Set([
	'/api/subscribe',
	'/api/confirm',
	'/api/unsubscribe',
]);
const IPV6_PREFIX_HEXTETS = 4;
const IPV6_HEXTET_COUNT = 8;
const HEXTET_PATTERN = /^[0-9a-f]{1,4}$/;
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const COMMON_KEYS = ['type', 'sessionId', 'locale', 'pageType', 'contentKey'];
const ALLOWED_KEYS: Record<ClientEventType, readonly string[]> = {
	page_view: [...COMMON_KEYS, 'referrerHost', 'utmSource', 'browserLanguage', 'theme', 'pageIndex'],
	page_engaged: [...COMMON_KEYS, 'activeSeconds', 'scrollDepth'],
	language_switched: [...COMMON_KEYS, 'targetLocale'],
	search_used: [...COMMON_KEYS, 'resultsCount'],
	outbound_clicked: [...COMMON_KEYS, 'targetHost'],
};

const SOURCE_DOMAINS: ReadonlyArray<readonly [OutboundSource, readonly string[]]> = [
	['bing', ['bing.com']],
	['duckduckgo', ['duckduckgo.com']],
	['yandex', ['ya.ru']],
	['linkedin', ['linkedin.com', 'lnkd.in']],
	['dou', ['dou.ua']],
	['telegram', ['t.me', 'telegram.me', 'telegram.org']],
	['x', ['t.co', 'x.com', 'twitter.com']],
	['facebook', ['facebook.com', 'fb.com']],
	['github', ['github.com']],
	['reddit', ['reddit.com', 'redd.it']],
	['hackernews', ['news.ycombinator.com']],
	['chatgpt', ['chatgpt.com', 'chat.openai.com']],
	['perplexity', ['perplexity.ai']],
];

const CRAWLER_PATTERN = new RegExp(
	[
		'bot\\b',
		'bot[/;_-]',
		'crawl',
		'spider',
		'slurp',
		'scrape',
		'facebookexternalhit',
		'embedly',
		'headless',
		'lighthouse',
		'pagespeed',
		'gtmetrix',
		'pingdom',
		'uptime',
		'monitor',
		'curl/',
		'wget',
		'python-',
		'httpclient',
		'okhttp',
		'go-http-client',
		'java/',
		'libwww',
		'node-fetch',
		'axios',
		'undici',
		'phantomjs',
		'puppeteer',
		'playwright',
		'selenium',
		'yandex',
		'baidu',
		'duckduckbot',
		'duckduckgo-favicons-bot',
		'bingpreview',
		'semrush',
		'ahrefs',
		'mj12',
		'applebot',
		'ia_archiver',
		'feedfetcher',
		'feedly',
		'validator',
		'inspectiontool',
		'zgrab',
		'masscan',
		'nmap',
	].join('|'),
	'i',
);
const TABLET_PATTERN = /ipad|tablet|kindle|silk\/|playbook/i;
const MOBILE_PATTERN = /mobi|iphone|ipod|windows phone/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
	return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function hostnameOf(host: string): string {
	return host.trim().toLowerCase().replace(/:\d+$/, '');
}

function normalizeHostname(value: string): string | null {
	const hostname = value.trim().toLowerCase().replace(/\.$/, '');
	return HOSTNAME_PATTERN.test(hostname) ? hostname : null;
}

function withoutWww(hostname: string): string {
	return hostname.replace(/^www\./, '');
}

function isHostOrSubdomain(hostname: string, domain: string): boolean {
	return hostname === domain || hostname.endsWith(`.${domain}`);
}

function parseOptionalText(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'string' || value.length > MAX_FREE_TEXT_LENGTH) return DEGRADED_VALUE;
	return value.length > 0 ? value : undefined;
}

function ipv4ToHextets(address: string): string[] | null {
	const match = IPV4_PATTERN.exec(address);
	if (!match) return null;
	const octets = match.slice(1).map(Number);
	if (octets.some((octet) => octet > 255)) return null;
	return [((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16)];
}

function ipv4FromHextets(high: string, low: string): string {
	const value = (Number.parseInt(high, 16) << 16) | Number.parseInt(low, 16);
	return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

function hextetsOf(segment: string): string[] | null {
	if (segment === '') return [];
	const parts = segment.split(':');
	const last = parts[parts.length - 1];
	if (last.includes('.')) {
		const embedded = ipv4ToHextets(last);
		if (!embedded) return null;
		parts.splice(parts.length - 1, 1, ...embedded);
	}
	return parts.every((part) => HEXTET_PATTERN.test(part)) ? parts : null;
}

function expandIpv6(address: string): string[] | null {
	const halves = address.split('::');
	if (halves.length > 2) return null;
	const head = hextetsOf(halves[0]);
	const tail = halves.length === 2 ? hextetsOf(halves[1]) : [];
	if (!head || !tail) return null;
	const missing = IPV6_HEXTET_COUNT - head.length - tail.length;
	if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
	const zeros = Array.from({ length: halves.length === 2 ? missing : 0 }, () => '0');
	return [...head, ...zeros, ...tail].map((hextet) => hextet.padStart(4, '0'));
}

export function rateLimitKey(ip: string | null | undefined): string {
	const address = ip?.trim().toLowerCase() ?? '';
	if (address === '') return 'unknown';
	if (!address.includes(':')) return address;
	const hextets = expandIpv6(address);
	if (!hextets) return address;
	if (hextets.slice(0, 5).every((hextet) => hextet === '0000') && hextets[5] === 'ffff') {
		return ipv4FromHextets(hextets[6], hextets[7]);
	}
	return `${hextets.slice(0, IPV6_PREFIX_HEXTETS).join(':')}::/64`;
}

export function shouldEmitHttpEvent(route: string, status: number): boolean {
	if (status >= 500) return true;
	return route !== '/unknown' && !DOMAIN_EVENT_ROUTES.has(route);
}

export function environmentFromHost(host: string): BlogEnvironment {
	const hostname = hostnameOf(host);
	if (PRODUCTION_HOSTS.has(hostname)) return 'production';
	if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
		return 'development';
	}
	return 'preview';
}

export function engagedBucket(activeSeconds: number): EngagedBucket {
	if (activeSeconds < 10) return 'lt10s';
	if (activeSeconds < 30) return 's10to30';
	if (activeSeconds < 120) return 's30to120';
	if (activeSeconds < 300) return 'm2to5';
	return 'm5plus';
}

export function scrollBucket(scrollDepth: number): ScrollBucket {
	if (scrollDepth >= 95) return 'p100';
	if (scrollDepth >= 75) return 'p75';
	if (scrollDepth >= 50) return 'p50';
	if (scrollDepth >= 25) return 'p25';
	return 'p0';
}

export function resultsBucket(resultsCount: number): ResultsBucket {
	if (resultsCount <= 0) return 'none';
	if (resultsCount <= 5) return 'oneToFive';
	return 'sixPlus';
}

export function outboundSource(host: string): OutboundSource {
	const hostname = normalizeHostname(host);
	if (!hostname) return 'other';
	if (GOOGLE_NON_SEARCH_HOST_PATTERN.test(hostname) || YANDEX_MAIL_HOST_PATTERN.test(hostname)) {
		return 'other';
	}
	if (GOOGLE_HOST_PATTERN.test(hostname)) return 'google';
	if (YANDEX_HOST_PATTERN.test(hostname)) return 'yandex';
	for (const [source, domains] of SOURCE_DOMAINS) {
		if (domains.some((domain) => isHostOrSubdomain(hostname, domain))) return source;
	}
	return 'other';
}

export function referrerSource(referrerHost: string | undefined, ownHost: string): ReferrerSource {
	if (referrerHost === undefined || referrerHost.trim() === '') return 'direct';
	const hostname = normalizeHostname(referrerHost);
	if (!hostname) return 'other';
	const ownHostname = hostnameOf(ownHost);
	const isOwnSite =
		withoutWww(hostname) === withoutWww(ownHostname) ||
		PRODUCTION_HOSTS.has(hostname) ||
		hostname === LEGACY_REFERRER_HOST;
	if (isOwnSite) {
		return 'internal';
	}
	return outboundSource(hostname);
}

export function campaignSource(value: string | undefined): string | undefined {
	if (value === undefined || value === '') return undefined;
	const lowered = value.toLowerCase();
	return CAMPAIGN_SOURCES.has(lowered) ? lowered : DEGRADED_VALUE;
}

export function browserLanguage(value: string | undefined): string | undefined {
	if (value === undefined || value === '') return undefined;
	const primarySubtag = value.length <= 35 ? value.toLowerCase().split(/[-_]/)[0] : '';
	return LANGUAGE_SUBTAG_PATTERN.test(primarySubtag ?? '') ? primarySubtag : 'other';
}

export function countryCode(value: string | null | undefined): string {
	const code = value?.trim().toUpperCase() ?? '';
	return COUNTRY_PATTERN.test(code) || code === 'T1' ? code : 'XX';
}

export function isCrawler(userAgent: string | null | undefined): boolean {
	if (!userAgent) return true;
	return CRAWLER_PATTERN.test(userAgent.replace(/cubot/gi, ''));
}

export function deviceType(userAgent: string | null | undefined): DeviceType {
	if (!userAgent) return 'desktop';
	if (TABLET_PATTERN.test(userAgent)) return 'tablet';
	if (/android/i.test(userAgent)) return /mobile/i.test(userAgent) ? 'mobile' : 'tablet';
	return MOBILE_PATTERN.test(userAgent) ? 'mobile' : 'desktop';
}

export function contentKindForPageType(pageType: PageType): ContentKind | null {
	if (pageType === 'post') return 'post';
	if (pageType === 'page') return 'page';
	if (pageType === 'tag') return 'tag';
	return null;
}

export function enabledLanguages(languages: { en: boolean; uk: boolean }): EnabledLanguages {
	if (languages.en && languages.uk) return 'both';
	if (languages.en) return 'en';
	if (languages.uk) return 'uk';
	return 'none';
}

export function newsletterSource(value: unknown): NewsletterSource {
	return value === 'home' || value === 'inline' || value === 'subscribe-page' ? value : 'other';
}

export function newsletterOutcome(result: NewsletterResult): TelemetryOutcome {
	if (result === 'invalid_request' || result === 'rate_limited' || result === 'invalid_token') {
		return 'rejected';
	}
	if (result === 'email_failed' || result === 'unavailable') return 'error';
	return 'success';
}

export function httpOutcome(status: number): TelemetryOutcome {
	if (status >= 500) return 'error';
	return status >= 400 ? 'rejected' : 'success';
}

export function stripBasePath(pathname: string, base: string): string {
	const normalizedBase = base.replace(/\/+$/, '');
	if (normalizedBase === '') return pathname;
	if (pathname === normalizedBase) return '/';
	if (pathname.startsWith(`${normalizedBase}/`)) return pathname.slice(normalizedBase.length);
	return pathname;
}

function trimTrailingSlash(path: string): string {
	return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path;
}

const STATIC_ROUTES = new Set([
	'/api/subscribe',
	'/api/confirm',
	'/api/unsubscribe',
	'/api/mcp',
	'/api/emails/templates',
	'/admin/emails',
	'/llms.txt',
	'/llms-full.txt',
]);

export function normalizeRoute(pathname: string, base: string): string {
	const path = trimTrailingSlash(stripBasePath(pathname, base));
	if (STATIC_ROUTES.has(path)) return path;
	if (/^\/api\/emails\/templates\/[^/]+$/.test(path)) return '/api/emails/templates/:slug';
	if (/^\/admin\/emails\/[^/]+$/.test(path)) return '/admin/emails/:slug';
	if (/^\/(en|uk)\/unsubscribe$/.test(path)) return '/:locale/unsubscribe';
	return '/unknown';
}

export function isUntrackedRoute(pathname: string, base: string): boolean {
	const path = trimTrailingSlash(stripBasePath(pathname, base));
	return (
		path === '/api/events' ||
		path === '/api/keystatic' ||
		path.startsWith('/api/keystatic/') ||
		path === '/keystatic' ||
		path.startsWith('/keystatic/')
	);
}

export function parseClientEvent(body: unknown): ClientEvent | null {
	if (!isPlainObject(body)) return null;
	const type = body.type;
	if (!isOneOf(CLIENT_EVENT_TYPES, type)) return null;
	const allowedKeys = ALLOWED_KEYS[type];
	if (Object.keys(body).some((key) => !allowedKeys.includes(key))) return null;

	const { sessionId, locale, pageType, contentKey } = body;
	if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId.toLowerCase())) {
		return null;
	}
	if (!isOneOf(TELEMETRY_LOCALES, locale) || !isOneOf(PAGE_TYPES, pageType)) return null;
	if (
		contentKey !== undefined &&
		(typeof contentKey !== 'string' ||
			contentKey.length === 0 ||
			contentKey.length > MAX_CONTENT_KEY_LENGTH ||
			!CONTENT_KEY_PATTERN.test(contentKey))
	) {
		return null;
	}
	const base: ClientEventBase = {
		sessionId: sessionId.toLowerCase(),
		locale,
		pageType,
		...(contentKey === undefined ? {} : { contentKey }),
	};

	switch (type) {
		case 'page_view': {
			const { pageIndex, theme } = body;
			const referrerHost = parseOptionalText(body.referrerHost);
			const utmSource = parseOptionalText(body.utmSource);
			const language = parseOptionalText(body.browserLanguage);
			if (referrerHost === null || utmSource === null || language === null) return null;
			if (!isOneOf(THEMES, theme)) return null;
			if (
				typeof pageIndex !== 'number' ||
				!Number.isInteger(pageIndex) ||
				pageIndex < 1 ||
				pageIndex > MAX_PAGE_INDEX
			) {
				return null;
			}
			return {
				...base,
				type,
				...(referrerHost === undefined ? {} : { referrerHost }),
				...(utmSource === undefined ? {} : { utmSource }),
				...(language === undefined ? {} : { browserLanguage: language }),
				theme,
				pageIndex,
			};
		}
		case 'page_engaged': {
			const { activeSeconds, scrollDepth } = body;
			if (typeof activeSeconds !== 'number' || !Number.isFinite(activeSeconds)) return null;
			if (activeSeconds < 0) return null;
			if (typeof scrollDepth !== 'number' || !Number.isFinite(scrollDepth)) return null;
			if (scrollDepth < 0 || scrollDepth > 100) return null;
			return {
				...base,
				type,
				activeSeconds: Math.min(Math.floor(activeSeconds), MAX_ACTIVE_SECONDS),
				scrollDepth,
			};
		}
		case 'language_switched': {
			const { targetLocale } = body;
			if (!isOneOf(TELEMETRY_LOCALES, targetLocale)) return null;
			return { ...base, type, targetLocale };
		}
		case 'search_used': {
			const { resultsCount } = body;
			if (
				typeof resultsCount !== 'number' ||
				!Number.isInteger(resultsCount) ||
				resultsCount < 0 ||
				resultsCount > MAX_RESULTS_COUNT
			) {
				return null;
			}
			return { ...base, type, resultsCount };
		}
		case 'outbound_clicked': {
			const targetHost = parseOptionalText(body.targetHost);
			if (!targetHost) return null;
			return { ...base, type, targetHost };
		}
	}
}

export function clientEventAttributes(
	event: ClientEvent,
	context: ClientEventContext,
): ClientEventAttributes {
	const attributes: ClientEventAttributes = {
		eventName: event.type,
		outcome: 'success',
		sessionId: event.sessionId,
		locale: event.locale,
		pageType: event.pageType,
		country: context.country,
		deviceType: context.deviceType,
	};
	if (event.contentKey !== undefined) attributes.contentKey = event.contentKey;

	switch (event.type) {
		case 'page_view': {
			attributes.referrerSource = referrerSource(event.referrerHost, context.ownHost);
			const campaign = campaignSource(event.utmSource);
			if (campaign !== undefined) attributes.campaignSource = campaign;
			const language = browserLanguage(event.browserLanguage);
			if (language !== undefined) attributes.browserLanguage = language;
			attributes.theme = event.theme;
			attributes.pageIndex = event.pageIndex;
			attributes.isEntry = event.pageIndex === 1;
			break;
		}
		case 'page_engaged':
			attributes.engagedBucket = engagedBucket(event.activeSeconds);
			attributes.activeSeconds = event.activeSeconds;
			attributes.scrollBucket = scrollBucket(event.scrollDepth);
			break;
		case 'language_switched':
			attributes.targetLocale = event.targetLocale;
			break;
		case 'search_used':
			attributes.resultsBucket = resultsBucket(event.resultsCount);
			break;
		case 'outbound_clicked':
			attributes.targetSource = outboundSource(event.targetHost);
			break;
	}
	return attributes;
}
