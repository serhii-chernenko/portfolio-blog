import { after, type KVAccess, type LogAccess } from 'emdash';
import { isLocale, type Locale } from '../i18n/config';
import { localeHref } from '../i18n/utils';
import { COLLECTIONS } from './cms/config';
import { changedContentUrls, submitToIndexNow } from './indexnow';
import { notify } from './telegram';
import { environmentFromHost } from './telemetry-schema';

export interface PublishedContentEvent {
	collection: string;
	content: Record<string, unknown>;
}

export interface PublishHookDeps {
	siteUrl: string;
	kv: Pick<KVAccess, 'compareAndSet'>;
	log: Pick<LogAccess, 'info' | 'warn'>;
	now?: Date;
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const DOCUMENT_TYPES: Record<string, 'post' | 'page'> = {
	[COLLECTIONS.posts]: 'post',
	[COLLECTIONS.pages]: 'page',
};
/**
 * A post counts as newly published when its publish date is this recent. Older dates mean a
 * republish or an imported historical post, which must not ping Telegram.
 */
const FIRST_PUBLISH_WINDOW_MS = 60 * 60 * 1000;
const NOTIFIED_KEY_PREFIX = 'telegram:new-post:';

/** Reads a field from a hook payload, whether system fields sit at the top level or in `data`. */
function field(content: Record<string, unknown>, name: string): unknown {
	if (name in content) return content[name];
	const data = content.data;
	return data && typeof data === 'object' ? (data as Record<string, unknown>)[name] : undefined;
}

function stringValue(content: Record<string, unknown>, name: string): string {
	const value = field(content, name);
	return typeof value === 'string' ? value : '';
}

function dateValue(content: Record<string, unknown>, ...names: string[]): Date | null {
	for (const name of names) {
		const value = field(content, name);
		const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
		if (date && !Number.isNaN(date.getTime())) return date;
	}
	return null;
}

function escapeHtml(text: string): string {
	return text.replace(/[&<>]/g, (char) => HTML_ESCAPES[char] ?? char);
}

function newPostMessage(title: string, locale: Locale, slug: string, site: URL): string {
	const url = new URL(localeHref(locale, `posts/${slug}`), site);
	const postTitle = title.trim() || slug;
	return `📝 New post published: ${escapeHtml(postTitle)} (${locale.toUpperCase()}) ${url}`;
}

/**
 * Side effects of publishing a post or page, formerly run by the Sanity webhook (the route
 * cache purge is built into EmDash now):
 * - IndexNow submission of the changed URLs, on the production host only;
 * - a Telegram message the first time a post goes live, at most once per entry.
 * Both run after the response and never fail the publish.
 */
export async function handleContentPublished(
	event: PublishedContentEvent,
	deps: PublishHookDeps,
): Promise<void> {
	const type = DOCUMENT_TYPES[event.collection];
	if (!type) return;
	const locale = stringValue(event.content, 'locale');
	const slug = stringValue(event.content, 'slug');
	if (!isLocale(locale) || !SLUG_PATTERN.test(slug)) return;

	let site: URL;
	try {
		site = new URL(deps.siteUrl);
	} catch {
		return;
	}
	const now = deps.now ?? new Date();
	const publishedAt = dateValue(event.content, 'publishedAt', 'published_at');

	if (environmentFromHost(site.host) === 'production') {
		const urls = changedContentUrls(
			{ _type: type, language: locale, slug, publishedAt: publishedAt?.toISOString() },
			site,
			now,
		);
		if (urls.length > 0) after(() => submitToIndexNow(site, urls));
	}

	if (type !== 'post' || !publishedAt) return;
	const age = now.getTime() - publishedAt.getTime();
	if (age < 0 || age > FIRST_PUBLISH_WINDOW_MS) return;
	const id = stringValue(event.content, 'id');
	if (!id) return;
	const claim = await deps.kv.compareAndSet(`${NOTIFIED_KEY_PREFIX}${id}`, null, now.toISOString());
	if (!claim.applied) return;
	const message = newPostMessage(stringValue(event.content, 'title'), locale, slug, site);
	deps.log.info('New post published; notifying Telegram', { id, locale });
	after(() => notify(message));
}
