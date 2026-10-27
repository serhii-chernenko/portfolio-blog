import { getSiteSettings, type MediaReference } from 'emdash';
import { isMediaImage, type MediaImage } from './media';

/** Posts per list page when Settings → Reading has no value. */
export const DEFAULT_POSTS_PER_PAGE = 10;

/**
 * EmDash's built-in site settings (admin → Settings), normalized for the site. The per-language
 * copy (site name, hero, about) stays in the `site_settings` collection; these are the site-wide
 * values EmDash already has a screen for.
 */
export interface SiteConfig {
	/** Settings → General: Site Title / Tagline. Fallbacks for the per-language site copy. */
	title?: string;
	tagline?: string;
	logo?: MediaImage;
	favicon?: MediaImage & { contentType?: string };
	/** Settings → Reading. */
	postsPerPage: number;
	/** IANA time zone for displayed dates (Settings → General: Timezone). */
	timeZone?: string;
	/** Settings → Social as profile URLs, added to the author's schema.org `sameAs`. */
	socialProfiles: string[];
	seo: {
		/** Settings → SEO: when set, page titles become `{title}{separator}{site name}`. */
		titleSeparator?: string;
		defaultOgImage?: MediaImage;
		googleVerification?: string;
		bingVerification?: string;
	};
}

function nonEmpty(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function mediaFrom(reference: MediaReference | undefined): MediaImage | undefined {
	if (!reference?.url) return undefined;
	const image: MediaImage & { contentType?: string } = {
		id: reference.mediaId,
		url: reference.url,
		alt: reference.alt ?? null,
		width: reference.width,
		height: reference.height,
		contentType: reference.contentType,
	};
	return isMediaImage(image) ? image : undefined;
}

function validTimeZone(value: unknown): string | undefined {
	const zone = nonEmpty(value);
	if (!zone) return undefined;
	try {
		new Intl.DateTimeFormat('en', { timeZone: zone });
		return zone;
	} catch {
		return undefined;
	}
}

/** Profile URL per Settings → Social network; the admin stores handles (`@name`, `name`). */
const SOCIAL_PROFILE_URL: Partial<Record<string, (handle: string) => string>> = {
	twitter: (handle) => `https://x.com/${handle}`,
	github: (handle) => `https://github.com/${handle}`,
	facebook: (handle) => `https://www.facebook.com/${handle}`,
	instagram: (handle) => `https://www.instagram.com/${handle}`,
	linkedin: (handle) => `https://www.linkedin.com/in/${handle}`,
	youtube: (handle) => `https://www.youtube.com/@${handle}`,
};

const HANDLE = /^[\p{L}\p{N}._-]+$/u;

/** A Settings → Social value as a profile URL: full URLs as they are, handles per network. */
export function socialProfileUrl(network: string, value: unknown): string | undefined {
	const raw = nonEmpty(value);
	if (!raw) return undefined;
	if (/^https?:\/\//i.test(raw)) return raw;
	const handle = raw.replace(/^@/, '');
	const build = SOCIAL_PROFILE_URL[network];
	return build && HANDLE.test(handle) ? build(handle) : undefined;
}

/** Built-in site settings. EmDash caches them per request and purges `emdash:settings` on save. */
export async function getSiteConfig(): Promise<SiteConfig> {
	const settings = await getSiteSettings();
	const postsPerPage =
		typeof settings.postsPerPage === 'number' && settings.postsPerPage > 0
			? Math.floor(settings.postsPerPage)
			: DEFAULT_POSTS_PER_PAGE;
	const seo = settings.seo ?? {};
	return {
		title: nonEmpty(settings.title),
		tagline: nonEmpty(settings.tagline),
		logo: mediaFrom(settings.logo),
		favicon: mediaFrom(settings.favicon),
		postsPerPage,
		timeZone: validTimeZone(settings.timezone),
		socialProfiles: Object.entries(settings.social ?? {})
			.map(([network, value]) => socialProfileUrl(network, value))
			.filter((url): url is string => Boolean(url)),
		seo: {
			titleSeparator:
				typeof seo.titleSeparator === 'string' && seo.titleSeparator
					? seo.titleSeparator
					: undefined,
			defaultOgImage: mediaFrom(seo.defaultOgImage),
			googleVerification: nonEmpty(seo.googleVerification),
			bingVerification: nonEmpty(seo.bingVerification),
		},
	};
}
