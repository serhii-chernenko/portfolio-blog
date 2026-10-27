#!/usr/bin/env node
// Moves an existing EmDash site of this blog onto EmDash's built-in features, so the things that
// used to live in code or in custom fields are edited in the admin. Idempotent: every step skips
// what already exists, and nothing the admin already set is overwritten.
//
//   pnpm cms:adopt -- --url http://localhost:4321                      # local `pnpm dev`, dev bypass
//   EMDASH_TOKEN=… pnpm cms:adopt -- --url https://serhiichernenko.com
//   EMDASH_TOKEN=… pnpm cms:adopt -- --url https://serhiichernenko.com --remove-legacy-fields
//
// Steps:
//   1. SEO panel: adds "seo" to the posts and pages collections.
//   2. Tags: turns the legacy `posts.tags` list field into terms of the `tag` taxonomy, one term
//      per language, linking a Ukrainian term to its English one when the two are used by the
//      same post pair, and assigns the terms to the posts. Skipped once the field is gone.
//   3. Byline: creates the author byline (English, plus a Ukrainian translation), linked to the
//      signed-in user so it is inferred for their posts, with a `profiles` custom field (one
//      profile URL per line, rendered as schema.org `sameAs`).
//   4. Settings: prefills Settings → SEO robots.txt (from seed/robots.txt), the default social
//      image (public/blog/og-default.png), the site URL and the social links, when unset.
//   5. Comments: turns on comments for posts (first comment of a commenter held for moderation,
//      never closed), syncs the `ui_strings.key` options with seed/seed.json (new interface
//      strings), and replaces the Giscus section of the privacy pages.
//   6. With --remove-legacy-fields: deletes `posts.tags` and `site_settings.default_og_image`.
//      Run it after the code that reads taxonomy terms is deployed.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
	options: {
		url: { type: 'string' },
		token: { type: 'string' },
		'remove-legacy-fields': { type: 'boolean', default: false },
		'dry-run': { type: 'boolean', default: false },
	},
	allowPositionals: true,
});
if (!args.url) {
	console.error('Missing --url <EmDash site origin>.');
	process.exit(1);
}
const origin = new URL(args.url).origin;
const dryRun = args['dry-run'];
const LOCALES = ['en', 'uk'];
const DEFAULT_LOCALE = 'en';
const SITE_URL = 'https://serhiichernenko.com';
const AUTHOR = {
	slug: 'serhii-chernenko',
	displayName: 'Serhii Chernenko',
	displayNameUk: 'Сергій Черненко',
	profiles: [
		'https://youtube.com/@serhii.chernenko',
		'https://www.linkedin.com/in/serhiichernenko/',
		'https://www.instagram.com/serhiichernenko.ua',
		'https://www.tiktok.com/@serhiichernenko.ua',
		'https://www.threads.net/@serhiichernenko.ua',
		'https://t.me/serhii_chernenko',
		'https://x.com/serhiichernenko',
	],
};
/** Settings → Social stores handles; the site turns them into profile URLs. */
const SOCIAL = {
	youtube: '@serhii.chernenko',
	linkedin: 'serhiichernenko',
	instagram: 'serhiichernenko.ua',
	twitter: '@serhiichernenko',
	github: 'serhii-chernenko',
};
const PROFILES_FIELD = { slug: 'profiles', label: 'Profiles', type: 'text' };
/**
 * Ukrainian terms for English tags whose Ukrainian label was shared by two English tags (the
 * posts used "продуктивність" for both performance and productivity; a term translates one tag).
 */
const UK_TERM_FOR_EN_TAG = { performance: 'швидкодія' };

let token = args.token ?? process.env.EMDASH_TOKEN ?? '';

async function resolveToken() {
	if (token) return;
	const { hostname } = new URL(origin);
	if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
		throw new Error('Pass --token (or EMDASH_TOKEN) for a non-local EmDash site.');
	}
	const response = await fetch(`${origin}/_emdash/api/setup/dev-bypass?content=0&token=1`);
	token = (await response.json().catch(() => null))?.data?.token ?? '';
	if (!token) throw new Error(`Dev bypass did not return a token (HTTP ${response.status}).`);
}

async function api(method, path, body, { formData, allow404 = false } = {}) {
	const headers = { authorization: `Bearer ${token}`, 'x-emdash-request': '1', origin };
	if (body !== undefined && !formData) headers['content-type'] = 'application/json';
	const response = await fetch(`${origin}/_emdash/api${path}`, {
		method,
		headers,
		body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
	});
	if (allow404 && response.status === 404) return null;
	const text = await response.text();
	let json;
	try {
		json = text ? JSON.parse(text) : {};
	} catch {
		throw new Error(`${method} ${path}: HTTP ${response.status} ${text.slice(0, 200)}`);
	}
	if (!response.ok || json.success === false) {
		throw new Error(
			`${method} ${path}: HTTP ${response.status} ${json.error?.code ?? ''} ${json.error?.message ?? text.slice(0, 300)}`,
		);
	}
	return json.data ?? json;
}

async function write(label, fn) {
	if (dryRun) {
		console.log(`  would ${label}`);
		return null;
	}
	const result = await fn();
	console.log(`  ${label}`);
	return result;
}

async function listAll(path) {
	const items = [];
	let cursor;
	do {
		const separator = path.includes('?') ? '&' : '?';
		const page = await api(
			'GET',
			`${path}${separator}limit=100${cursor ? `&cursor=${cursor}` : ''}`,
		);
		items.push(...(page.items ?? []));
		cursor = page.nextCursor;
	} while (cursor);
	return items;
}

// ── 1. SEO panel ──────────────────────────────────────────────────────────────

async function enableSeo() {
	console.log('\nSEO panel');
	for (const slug of ['posts', 'pages']) {
		const result = await api('GET', `/schema/collections/${slug}`);
		const collection = result.item ?? result.collection ?? result;
		const supports = collection.supports ?? [];
		if (supports.includes('seo') || collection.hasSeo) {
			console.log(`  ${slug}: already on`);
			continue;
		}
		await write(`${slug}: turn on`, () =>
			api('PUT', `/schema/collections/${slug}`, { supports: [...supports, 'seo'] }),
		);
	}
}

// ── 2. Tags ───────────────────────────────────────────────────────────────────

/** Same slug rule the site used for tag URLs (src/lib/tag-slug.ts). */
function tagSlug(tag) {
	return tag
		.toLowerCase()
		.normalize('NFKD')
		.replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
		.normalize('NFC')
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}

async function hasField(collection, field) {
	const result = await api('GET', `/schema/collections/${collection}/fields/${field}`, undefined, {
		allow404: true,
	});
	return result !== null;
}

async function migrateTags() {
	console.log('\nTags');
	if (!(await hasField('posts', 'tags'))) {
		console.log('  legacy posts.tags field is gone, nothing to migrate');
		return;
	}
	const postsByLocale = {};
	for (const locale of LOCALES) {
		postsByLocale[locale] = await listAll(`/content/posts?locale=${locale}`);
	}
	const labelsOf = (post) =>
		(Array.isArray(post.data?.tags) ? post.data.tags : [])
			.filter((tag) => typeof tag === 'string' && tag.trim())
			.map((tag) => tag.trim());

	// English ↔ Ukrainian term pairs: explicit overrides first, then identical labels, then the
	// remaining labels of a translated post pair in order (database ↔ база-даних). A term translates
	// one tag, so a pair whose English or Ukrainian side is already taken is skipped.
	const ukToEn = new Map();
	const enTaken = new Map();
	const link = (ukSlug, enSlug) => {
		if (ukToEn.has(ukSlug) || enTaken.has(enSlug)) {
			if (ukToEn.get(ukSlug) !== enSlug) {
				console.warn(
					`  ! ${ukSlug} ↔ ${enSlug} skipped: ${ukSlug} → ${ukToEn.get(ukSlug) ?? '–'}, ${enSlug} ← ${enTaken.get(enSlug) ?? '–'}`,
				);
			}
			return;
		}
		ukToEn.set(ukSlug, enSlug);
		enTaken.set(enSlug, ukSlug);
	};
	for (const [enSlug, ukLabel] of Object.entries(UK_TERM_FOR_EN_TAG))
		link(tagSlug(ukLabel), enSlug);
	const enByGroup = new Map(
		postsByLocale.en.map((post) => [post.translationGroup ?? post.id, post]),
	);
	const pairs = [];
	for (const uk of postsByLocale.uk) {
		const en = enByGroup.get(uk.translationGroup ?? uk.id);
		if (!en || en.id === uk.id) continue;
		const enLabels = labelsOf(en);
		const ukLabels = labelsOf(uk);
		const enSlugs = new Set(enLabels.map(tagSlug));
		const ukSlugs = new Set(ukLabels.map(tagSlug));
		for (const label of ukLabels)
			if (enSlugs.has(tagSlug(label))) link(tagSlug(label), tagSlug(label));
		const enRest = enLabels.filter(
			(label) => !ukSlugs.has(tagSlug(label)) && !(tagSlug(label) in UK_TERM_FOR_EN_TAG),
		);
		const ukRest = ukLabels.filter((label) => !enSlugs.has(tagSlug(label)));
		const skipped =
			enLabels.length - enLabels.filter((label) => !(tagSlug(label) in UK_TERM_FOR_EN_TAG)).length;
		if (enRest.length !== ukRest.length - skipped && enRest.length !== ukRest.length) {
			console.warn(
				`  ! ${en.slug}: ${enRest.length} vs ${ukRest.length} unmatched tags, left unlinked`,
			);
			continue;
		}
		pairs.push({ enRest, ukRest });
	}
	// Unambiguous pairs (same count) first, so an overridden tag's old Ukrainian label goes to the
	// tag it was the only candidate for.
	for (const { enRest, ukRest } of pairs.filter((p) => p.enRest.length === p.ukRest.length)) {
		ukRest.forEach((label, i) => link(tagSlug(label), tagSlug(enRest[i])));
	}
	for (const { enRest, ukRest } of pairs.filter((p) => p.enRest.length !== p.ukRest.length)) {
		const free = ukRest.filter((label) => !ukToEn.has(tagSlug(label)));
		const open = enRest.filter((label) => !enTaken.has(tagSlug(label)));
		if (free.length === open.length)
			free.forEach((label, i) => link(tagSlug(label), tagSlug(open[i])));
	}

	// Terms per locale: reuse existing ones (same slug), create the rest.
	const terms = {};
	for (const locale of LOCALES) {
		const existing = await api('GET', `/taxonomies/tag/terms?locale=${locale}`);
		terms[locale] = new Map(
			(existing.terms ?? existing.items ?? []).map((term) => [term.slug, term]),
		);
	}
	const labels = {};
	for (const locale of LOCALES) {
		labels[locale] = new Map();
		for (const post of postsByLocale[locale]) {
			for (const label of labelsOf(post))
				if (!labels[locale].has(tagSlug(label))) labels[locale].set(tagSlug(label), label);
		}
	}
	for (const [enSlug, ukLabel] of Object.entries(UK_TERM_FOR_EN_TAG)) {
		if (labels[DEFAULT_LOCALE].has(enSlug)) labels.uk.set(tagSlug(ukLabel), ukLabel);
	}
	for (const locale of [DEFAULT_LOCALE, ...LOCALES.filter((l) => l !== DEFAULT_LOCALE)]) {
		for (const [slug, label] of labels[locale]) {
			if (terms[locale].has(slug)) continue;
			const sourceSlug = locale === DEFAULT_LOCALE ? null : ukToEn.get(slug);
			const translationOf = sourceSlug ? terms[DEFAULT_LOCALE].get(sourceSlug)?.id : undefined;
			const created = await write(
				`create ${locale} term "${label}"${translationOf ? ` (translation of ${sourceSlug})` : ''}`,
				() =>
					api('POST', '/taxonomies/tag/terms', {
						slug,
						label,
						locale,
						...(translationOf ? { translationOf } : {}),
					}),
			);
			if (created) terms[locale].set(slug, created.term ?? created);
		}
	}

	// Assignments span a post's translation group: assign the English post's terms once per group,
	// and the Ukrainian terms for posts that exist only in Ukrainian.
	const assigned = new Set();
	for (const locale of [DEFAULT_LOCALE, ...LOCALES.filter((l) => l !== DEFAULT_LOCALE)]) {
		for (const post of postsByLocale[locale]) {
			const group = post.translationGroup ?? post.id;
			if (assigned.has(group)) continue;
			const termIds = labelsOf(post)
				.map((label) => terms[locale].get(tagSlug(label))?.id)
				.filter(Boolean);
			assigned.add(group);
			if (termIds.length === 0) continue;
			const current = await api('GET', `/content/posts/${post.id}/terms/tag`);
			if ((current.terms ?? current.items ?? []).length > 0) continue;
			await write(`assign ${termIds.length} tags to ${locale}/${post.slug}`, () =>
				api('POST', `/content/posts/${post.id}/terms/tag`, { termIds }),
			);
		}
	}
}

// ── 3. Byline ─────────────────────────────────────────────────────────────────

async function setUpByline() {
	console.log('\nByline');
	const fields = await api('GET', '/admin/byline-fields');
	const fieldList = fields.items ?? fields.fields ?? (Array.isArray(fields) ? fields : []);
	if (!fieldList.some((field) => field.slug === PROFILES_FIELD.slug)) {
		await write(`create byline field "${PROFILES_FIELD.slug}"`, () =>
			api('POST', '/admin/byline-fields', { ...PROFILES_FIELD, translatable: false }),
		);
	} else console.log(`  byline field "${PROFILES_FIELD.slug}" exists`);

	const me = await api('GET', '/auth/me');
	const userId = me.id ?? me.user?.id;
	const existing = await listAll(`/admin/bylines?locale=${DEFAULT_LOCALE}`);
	let byline = existing.find((item) => item.slug === AUTHOR.slug);
	if (!byline) {
		byline = await write(`create byline "${AUTHOR.displayName}" linked to the signed-in user`, () =>
			api('POST', '/admin/bylines', {
				slug: AUTHOR.slug,
				displayName: AUTHOR.displayName,
				userId,
				locale: DEFAULT_LOCALE,
				customFields: { [PROFILES_FIELD.slug]: AUTHOR.profiles.join('\n') },
			}),
		);
		byline = byline?.item ?? byline;
	} else console.log(`  byline "${AUTHOR.slug}" exists`);
	if (!byline?.id) return;
	const translations = await api('GET', `/admin/bylines/${byline.id}/translations`);
	const hasUk = (translations.items ?? []).some((item) => item.locale === 'uk');
	if (!hasUk) {
		await write(`create Ukrainian byline "${AUTHOR.displayNameUk}"`, () =>
			api('POST', `/admin/bylines/${byline.id}/translations`, {
				locale: 'uk',
				displayName: AUTHOR.displayNameUk,
			}),
		);
	} else console.log('  Ukrainian byline exists');
}

// ── 4. Settings ───────────────────────────────────────────────────────────────

async function uploadImage(path, filename, alt, width, height) {
	const form = new FormData();
	form.set('file', new Blob([readFileSync(path)], { type: 'image/png' }), filename);
	form.set('alt', alt);
	form.set('width', String(width));
	form.set('height', String(height));
	form.set('deduplicate', 'true');
	const result = await api('POST', '/media', undefined, { formData: form });
	return result.item ?? result;
}

async function prefillSettings() {
	console.log('\nSettings');
	const settings = await api('GET', '/settings');
	const update = {};
	const seo = {};
	if (!settings.seo?.robotsTxt) seo.robotsTxt = readFileSync('seed/robots.txt', 'utf8').trim();
	if (!settings.seo?.defaultOgImage) {
		const media = dryRun
			? { id: 'dry-run' }
			: await uploadImage('public/blog/og-default.png', 'og-default.png', 'Chernenko', 1200, 630);
		seo.defaultOgImage = { mediaId: media.id, alt: 'Chernenko' };
	}
	if (Object.keys(seo).length > 0) update.seo = seo;
	if (!settings.url) update.url = SITE_URL;
	const social = settings.social ?? {};
	const missingSocial = Object.fromEntries(Object.entries(SOCIAL).filter(([key]) => !social[key]));
	if (Object.keys(missingSocial).length > 0) update.social = { ...social, ...missingSocial };
	if (Object.keys(update).length === 0) {
		console.log('  nothing to prefill');
		return;
	}
	await write(
		`set ${Object.keys(update).join(', ')}${update.seo ? ` (seo: ${Object.keys(seo).join(', ')})` : ''}`,
		() => api('POST', '/settings', update),
	);
}

// ── 5. Comments, UI string keys, privacy ──────────────────────────────────────

async function enableComments() {
	console.log('\nComments');
	const result = await api('GET', '/schema/collections/posts');
	const collection = result.item ?? result.collection ?? result;
	if (collection.commentsEnabled) {
		console.log('  posts: already on (settings left as they are)');
		return;
	}
	await write('posts: turn on (first-time moderation, never closed)', () =>
		api('PUT', '/schema/collections/posts', {
			commentsEnabled: true,
			commentsModeration: 'first_time',
			commentsClosedAfterDays: 0,
			commentsAutoApproveUsers: true,
		}),
	);
}

async function syncUiStringKeys() {
	console.log('\nUI string keys');
	const seed = JSON.parse(readFileSync('seed/seed.json', 'utf8'));
	const seedField = seed.collections
		.find((collection) => collection.slug === 'ui_strings')
		?.fields.find((field) => field.slug === 'key');
	const wanted = seedField?.validation?.options ?? [];
	const result = await api('GET', '/schema/collections/ui_strings/fields/key');
	const field = result.item ?? result.field ?? result;
	const current = field.validation?.options ?? [];
	const missing = wanted.filter((option) => !current.includes(option));
	if (missing.length === 0) {
		console.log('  in sync');
		return;
	}
	await write(
		`add ${missing.length} keys (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''})`,
		() =>
			api('PUT', '/schema/collections/ui_strings/fields/key', {
				validation: { ...(field.validation ?? {}), options: [...current, ...missing] },
			}),
	);
}

/** New privacy text for the comments section, per language: [heading, paragraph]. */
const PRIVACY_COMMENTS = {
	en: [
		'Comments',
		'Comments are stored by this site’s own content system (EmDash) on Cloudflare. To comment you enter a name, an email address and the comment. The name and the comment are published; the email address is never shown and is only used to recognise returning commenters and, if needed, to contact you about your comment. A salted hash of your IP address is kept to limit abuse (it cannot be turned back into the address), and likes are counted with the same kind of hash, without cookies or an account. A first comment is reviewed before it appears. To have a comment edited or removed, get in touch through any contact link on this site.',
	],
	uk: [
		'Коментарі',
		'Коментарі зберігає власна система керування вмістом цього сайту (EmDash) на Cloudflare. Щоб залишити коментар, ви вказуєте ім’я, адресу електронної пошти та текст. Ім’я й текст публікуються; адреса пошти ніколи не показується і використовується лише для того, щоб розпізнати тих, хто вже коментував, і за потреби зв’язатися з вами щодо коментаря. Для захисту від зловживань зберігається хеш вашої IP-адреси із сіллю (з нього не можна відновити адресу); вподобання рахуються за таким самим хешем, без cookie чи облікового запису. Перший коментар з’являється після перевірки. Щоб змінити чи видалити коментар, напишіть через будь-яке контактне посилання на цьому сайті.',
	],
};

function blockText(block) {
	return (block?.children ?? []).map((child) => child.text ?? '').join('');
}

function textBlock(template, text) {
	return {
		...template,
		children: [{ _type: 'span', _key: `${template._key}s`, text, marks: [] }],
		markDefs: [],
	};
}

async function updatePrivacyPages() {
	console.log('\nPrivacy pages');
	for (const locale of LOCALES) {
		const pages = await listAll(`/content/pages?locale=${locale}`);
		const page = pages.find((item) => item.data?.key === 'privacy');
		if (!page) {
			console.log(`  ${locale}: no privacy page`);
			continue;
		}
		const full = await api('GET', `/content/pages/${page.id}`);
		const item = full.item ?? full;
		const body = Array.isArray(item.data?.body) ? item.data.body : [];
		const headingIndex = body.findIndex(
			(block) => /giscus/i.test(blockText(block)) && block.style?.startsWith('h'),
		);
		if (headingIndex === -1) {
			console.log(`  ${locale}: no Giscus section, left as it is`);
			continue;
		}
		const [heading, paragraph] = PRIVACY_COMMENTS[locale];
		const next = [...body];
		next[headingIndex] = textBlock(body[headingIndex], heading);
		const paragraphIndex = headingIndex + 1;
		if (
			next[paragraphIndex]?._type === 'block' &&
			/giscus|github/i.test(blockText(next[paragraphIndex]))
		) {
			next[paragraphIndex] = textBlock(next[paragraphIndex], paragraph);
		} else {
			next.splice(
				paragraphIndex,
				0,
				textBlock(
					{ _type: 'block', _key: `${body[headingIndex]._key}p`, style: 'normal' },
					paragraph,
				),
			);
		}
		await write(`${locale}/${item.slug}: replace the Giscus section and publish`, async () => {
			await api('PUT', `/content/pages/${page.id}`, {
				_rev: full._rev,
				data: { ...item.data, body: next, revised_at: new Date().toISOString() },
			});
			await api('POST', `/content/pages/${page.id}/publish`, {});
		});
	}
}

// ── 6. Legacy fields ──────────────────────────────────────────────────────────

async function removeLegacyFields() {
	console.log('\nLegacy fields');
	for (const [collection, field] of [
		['posts', 'tags'],
		['site_settings', 'default_og_image'],
	]) {
		if (!(await hasField(collection, field))) {
			console.log(`  ${collection}.${field}: already removed`);
			continue;
		}
		await write(`remove ${collection}.${field}`, () =>
			api('DELETE', `/schema/collections/${collection}/fields/${field}`),
		);
	}
}

async function main() {
	console.log(`EmDash features → ${origin}${dryRun ? ' (dry run)' : ''}`);
	await resolveToken();
	await enableSeo();
	await migrateTags();
	await setUpByline();
	await prefillSettings();
	await enableComments();
	await syncUiStringKeys();
	await updatePrivacyPages();
	if (args['remove-legacy-fields']) await removeLegacyFields();
	console.log('\nDone.');
}

main().catch((error) => {
	console.error(`\nFailed: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
