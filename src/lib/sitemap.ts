import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { slug as githubSlug } from 'github-slugger';
import { isLocale, locales, type Locale } from '../i18n/config';
import { buildHreflang, type LocaleAlternates } from './hreflang';
import { MIN_POSTS_FOR_TAG_INDEXING, tagSlug } from './tag-slug';

interface SitemapItemLike {
	url: string;
	lastmod?: string;
	links?: { url: string; lang: string }[];
}

interface ContentEntry {
	locale: Locale;
	slug: string;
	translationKey: string;
	lastmod?: Date;
	tags: string[];
}

interface ContentIndex {
	posts: ContentEntry[];
	pages: ContentEntry[];
}

interface SitemapPolicyOptions {
	site: string;
	base: string;
	contentRoot: string;
	includeDrafts: boolean;
}

type FrontmatterValue = string | string[];

const MIRRORED_SEGMENTS = new Set(['posts', 'tags', 'subscribe']);
const RESERVED_PAGE_SEGMENTS = new Set([...MIRRORED_SEGMENTS, 'unsubscribe']);

function safeDecode(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	const quoted = /^(["'])(.*)\1$/.exec(trimmed);
	return quoted ? quoted[2] : trimmed;
}

function parseInlineList(value: string): string[] {
	return value
		.slice(1, -1)
		.split(',')
		.map(stripQuotes)
		.filter((item) => item !== '');
}

function parseFrontmatter(source: string): Record<string, FrontmatterValue> {
	const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
	if (!block) return {};
	const fields: Record<string, FrontmatterValue> = {};
	let openListKey: string | null = null;
	for (const line of block[1].split(/\r?\n/)) {
		const listItem = /^\s+-\s+(.*)$/.exec(line);
		if (listItem && openListKey) {
			(fields[openListKey] as string[]).push(stripQuotes(listItem[1]));
			continue;
		}
		const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
		if (!pair) continue;
		const [, key, value] = pair;
		if (value === '') {
			fields[key] = [];
			openListKey = key;
		} else if (value.startsWith('[') && value.endsWith(']')) {
			fields[key] = parseInlineList(value);
			openListKey = null;
		} else {
			fields[key] = stripQuotes(value);
			openListKey = null;
		}
	}
	return fields;
}

function scalar(value: FrontmatterValue | undefined): string | undefined {
	return typeof value === 'string' && value !== '' ? value : undefined;
}

function toDate(value: string | undefined): Date | undefined {
	if (!value) return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function readCollection(
	directory: string,
	locale: Locale,
	kind: 'post' | 'page',
	includeDrafts: boolean,
): ContentEntry[] {
	let fileNames: string[];
	try {
		fileNames = readdirSync(directory).filter((name) => name.endsWith('.mdoc'));
	} catch {
		return [];
	}
	const now = new Date();
	const entries: ContentEntry[] = [];
	for (const fileName of fileNames) {
		const fields = parseFrontmatter(readFileSync(join(directory, fileName), 'utf8'));
		const translationKey = scalar(fields.translationKey);
		if (!translationKey) continue;
		const draftValue = scalar(fields.draft);
		const isDraft = draftValue === undefined ? kind === 'post' : draftValue === 'true';
		const publishedAt = toDate(scalar(fields.publishedAt));
		const isPublished = kind === 'page' || (publishedAt !== undefined && publishedAt <= now);
		if (!includeDrafts && (isDraft || !isPublished)) continue;
		const updatedAt = toDate(scalar(fields.updatedAt));
		entries.push({
			locale,
			slug: scalar(fields.slug) ?? githubSlug(basename(fileName, extname(fileName))),
			translationKey,
			lastmod: kind === 'post' ? (updatedAt ?? publishedAt) : updatedAt,
			tags: Array.isArray(fields.tags) ? fields.tags : [],
		});
	}
	return entries;
}

function readContentIndex(contentRoot: string, includeDrafts: boolean): ContentIndex {
	const posts: ContentEntry[] = [];
	const pages: ContentEntry[] = [];
	for (const locale of locales) {
		posts.push(
			...readCollection(join(contentRoot, 'posts', locale), locale, 'post', includeDrafts),
		);
		pages.push(
			...readCollection(join(contentRoot, 'pages', locale), locale, 'page', includeDrafts),
		);
	}
	return { posts, pages };
}

function latest(dates: (Date | undefined)[]): Date | undefined {
	let result: Date | undefined;
	for (const date of dates) {
		if (date && (!result || date > result)) result = date;
	}
	return result;
}

export function createSitemapPolicy(options: SitemapPolicyOptions) {
	const base = options.base.replace(/\/+$/, '');
	const { posts, pages } = readContentIndex(options.contentRoot, options.includeDrafts);

	const localePath = (locale: Locale, rest: string) => `${base}/${locale}/${rest}`;

	const postsByLocale = (locale: Locale) => posts.filter((post) => post.locale === locale);

	const tagStats = (locale: Locale, slug: string) => {
		const tagged = postsByLocale(locale).filter((post) =>
			post.tags.some((tag) => tagSlug(tag) === slug),
		);
		return { count: tagged.length, lastmod: latest(tagged.map((post) => post.lastmod)) };
	};

	const segmentsOf = (pathname: string): string[] => {
		const withoutBase = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
		return withoutBase.split('/').filter(Boolean).map(safeDecode);
	};

	const alternatesForTranslationKey = (
		entries: ContentEntry[],
		translationKey: string,
		prefix: string,
	): LocaleAlternates => {
		const alternates: LocaleAlternates = {};
		for (const entry of entries) {
			if (entry.translationKey === translationKey) {
				alternates[entry.locale] = localePath(entry.locale, `${prefix}${entry.slug}/`);
			}
		}
		return alternates;
	};

	const mirroredAlternates = (rest: string): LocaleAlternates =>
		Object.fromEntries(locales.map((locale) => [locale, localePath(locale, rest)]));

	const describe = (
		locale: Locale,
		rest: string[],
	): { lastmod?: Date; alternates?: LocaleAlternates } => {
		const [first, second, third] = rest;
		if (first === undefined) {
			return {
				lastmod: latest(postsByLocale(locale).map((post) => post.lastmod)),
				alternates: mirroredAlternates(''),
			};
		}
		if (first === 'posts') {
			if (second === undefined) {
				return {
					lastmod: latest(postsByLocale(locale).map((post) => post.lastmod)),
					alternates: mirroredAlternates('posts/'),
				};
			}
			if (second === 'page' && third !== undefined) return {};
			const post = posts.find((entry) => entry.locale === locale && entry.slug === second);
			if (!post) return {};
			return {
				lastmod: post.lastmod,
				alternates: alternatesForTranslationKey(posts, post.translationKey, 'posts/'),
			};
		}
		if (first === 'tags') {
			if (second === undefined) return { alternates: mirroredAlternates('tags/') };
			return { lastmod: tagStats(locale, second).lastmod };
		}
		if (first === 'subscribe') return { alternates: mirroredAlternates('subscribe/') };
		if (RESERVED_PAGE_SEGMENTS.has(first)) return {};
		const page = pages.find((entry) => entry.locale === locale && entry.slug === first);
		if (!page) return {};
		return {
			lastmod: page.lastmod,
			alternates: alternatesForTranslationKey(pages, page.translationKey, ''),
		};
	};

	const filter = (pageUrl: string): boolean => {
		const [first, ...rest] = segmentsOf(new URL(pageUrl).pathname);
		if (first === undefined) return false;
		if (first === 'admin') return false;
		if (isLocale(first) && rest[0] === 'tags' && rest[1] !== undefined) {
			return tagStats(first, rest[1]).count >= MIN_POSTS_FOR_TAG_INDEXING;
		}
		return true;
	};

	const serialize = <Item extends SitemapItemLike>(item: Item): Item => {
		const url = new URL(item.url);
		const [first, ...rest] = segmentsOf(url.pathname);
		const { links: _generatedLinks, ...itemWithoutLinks } = item;
		if (first === undefined || !isLocale(first)) return itemWithoutLinks as Item;
		const { lastmod, alternates } = describe(first, rest);
		const alternateCount = Object.values(alternates ?? {}).filter(Boolean).length;
		const links =
			alternates && alternateCount > 1
				? buildHreflang(options.site, first, url.pathname, alternates).map(
						({ hreflang, href }) => ({ url: href, lang: hreflang }),
					)
				: undefined;
		return {
			...itemWithoutLinks,
			...(lastmod ? { lastmod: lastmod.toISOString() } : {}),
			...(links ? { links } : {}),
		} as Item;
	};

	return { filter, serialize };
}
