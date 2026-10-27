#!/usr/bin/env node
// One-off migration of the Sanity dataset (project 8xspnp7h / production) into an EmDash site.
//
//   pnpm cms:migrate-sanity -- --url http://localhost:4321            # local `pnpm dev`, dev bypass
//   pnpm cms:migrate-sanity -- --url https://serhiichernenko.com --token "$EMDASH_TOKEN"
//
// Options:
//   --url <origin>        EmDash site origin (required). The admin API lives at <origin>/_emdash.
//   --token <token>       EmDash API token (Settings → API tokens, admin scope). Defaults to
//                         $EMDASH_TOKEN; on localhost the dev bypass issues one when omitted.
//   --sanity-token <tok>  Sanity viewer token, to also migrate unpublished drafts. Defaults to
//                         $SANITY_API_READ_TOKEN (read from .dev.vars by `dotenv` if present).
//   --export <file>       Read a saved `sanity dataset export` NDJSON instead of the live API.
//   --dry-run             Convert and report, write nothing.
//
// What it does (idempotent: entries that already exist by collection + locale + slug are skipped,
// menus that already exist are left alone):
//   1. uploads every referenced Sanity image into the EmDash media library,
//   2. creates pages and posts per language, linking translations (translation.metadata) and
//      keeping the original publish/creation dates; unpublished Sanity drafts become EmDash
//      drafts, pending draft edits of published documents become pending EmDash drafts,
//   3. creates the per-language site_settings and ui_strings entries,
//   4. creates the header and footer menus per language.
//
// Portable Text is converted to EmDash's shapes: image blocks reference the uploaded media,
// link marks use `blank` for "open in new tab", and callouts store Markdown (`text`) so the
// admin's callout block form can edit them. Code blocks keep their Sanity shape.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { portableTextToMarkdown } from 'emdash/client';

const SANITY_PROJECT_ID = '8xspnp7h';
const SANITY_DATASET = 'production';
const SANITY_API_VERSION = '2026-10-01';
const LOCALES = ['en', 'uk'];
const DEFAULT_LOCALE = 'en';
const BLOG_PATH = '/blog';
const ROUTE_PATHS = {
	home: '',
	posts: 'posts/',
	tags: 'tags/',
	subscribe: 'subscribe/',
	rss: 'rss.xml',
};
const SETTINGS_FIELDS = {
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

const { values: args } = parseArgs({
	options: {
		url: { type: 'string' },
		token: { type: 'string' },
		'sanity-token': { type: 'string' },
		export: { type: 'string' },
		'dry-run': { type: 'boolean', default: false },
	},
	allowPositionals: true,
});

if (!args.url) {
	console.error('Missing --url <EmDash site origin>. See the header of this script for usage.');
	process.exit(1);
}

const origin = new URL(args.url).origin;
const dryRun = args['dry-run'];
const sanityToken = args['sanity-token'] ?? process.env.SANITY_API_READ_TOKEN ?? '';

const stats = { media: 0, created: 0, skipped: 0, drafts: 0, menus: 0, warnings: 0 };

function warn(message) {
	stats.warnings += 1;
	console.warn(`  ! ${message}`);
}

// ── Sanity ────────────────────────────────────────────────────────────────────

async function loadSanityDocuments() {
	if (args.export) {
		return readFileSync(args.export, 'utf8')
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
	}
	const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/export/${SANITY_DATASET}`;
	const response = await fetch(url, {
		headers: sanityToken ? { authorization: `Bearer ${sanityToken}` } : {},
	});
	if (!response.ok) throw new Error(`Sanity export failed: HTTP ${response.status}`);
	const text = await response.text();
	return text
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function publishedId(id) {
	return id.replace(/^drafts\./, '');
}

function localized(values, locale) {
	const pick = (lang) => values?.find((item) => item.language === lang)?.value?.trim() || '';
	return pick(locale);
}

// ── EmDash API ────────────────────────────────────────────────────────────────

let token = args.token ?? process.env.EMDASH_TOKEN ?? '';

async function resolveToken() {
	if (token) return;
	const { hostname } = new URL(origin);
	if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
		throw new Error('Pass --token (or EMDASH_TOKEN) for a non-local EmDash site.');
	}
	const response = await fetch(`${origin}/_emdash/api/setup/dev-bypass?content=0&token=1`);
	const body = await response.json().catch(() => null);
	token = body?.data?.token ?? '';
	if (!token) throw new Error(`Dev bypass did not return a token (HTTP ${response.status}).`);
}

async function api(method, path, body, { formData } = {}) {
	const headers = {
		authorization: `Bearer ${token}`,
		'x-emdash-request': '1',
		origin,
	};
	if (body !== undefined && !formData) headers['content-type'] = 'application/json';
	const response = await fetch(`${origin}/_emdash/api${path}`, {
		method,
		headers,
		body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
	});
	const text = await response.text();
	let json;
	try {
		json = text ? JSON.parse(text) : {};
	} catch {
		throw new Error(`${method} ${path}: HTTP ${response.status} ${text.slice(0, 200)}`);
	}
	if (!response.ok || json.success === false) {
		const error = json.error ?? {};
		throw new Error(
			`${method} ${path}: HTTP ${response.status} ${error.code ?? ''} ${error.message ?? text.slice(0, 300)}`,
		);
	}
	return json.data ?? json;
}

async function listAll(collection, locale) {
	const items = [];
	let cursor;
	do {
		const query = new URLSearchParams({ locale, limit: '100' });
		if (cursor) query.set('cursor', cursor);
		const page = await api('GET', `/content/${collection}?${query}`);
		items.push(...(page.items ?? []));
		cursor = page.nextCursor;
	} while (cursor);
	return items;
}

// ── Media ─────────────────────────────────────────────────────────────────────

/** Sanity asset _id → EmDash media item */
const mediaByAsset = new Map();

async function uploadAsset(asset, alt) {
	if (mediaByAsset.has(asset._id)) return mediaByAsset.get(asset._id);
	const dimensions = asset.metadata?.dimensions;
	if (dryRun) {
		const fake = {
			id: `dry-${asset._id}`,
			storageKey: `${asset._id}.${asset.extension}`,
			width: dimensions?.width,
			height: dimensions?.height,
			mimeType: asset.mimeType,
			filename: asset.originalFilename,
		};
		mediaByAsset.set(asset._id, fake);
		return fake;
	}
	const download = await fetch(asset.url);
	if (!download.ok) throw new Error(`Download of ${asset.url} failed: HTTP ${download.status}`);
	const bytes = new Uint8Array(await download.arrayBuffer());
	const form = new FormData();
	const filename = asset.originalFilename || `${asset.assetId}.${asset.extension}`;
	form.set('file', new Blob([bytes], { type: asset.mimeType }), filename);
	if (alt) form.set('alt', alt);
	if (dimensions?.width) form.set('width', String(dimensions.width));
	if (dimensions?.height) form.set('height', String(dimensions.height));
	form.set('deduplicate', 'true');
	const result = await api('POST', '/media', undefined, { formData: form });
	const item = result.item ?? result;
	stats.media += 1;
	console.log(`  media ${filename} → ${item.id}`);
	mediaByAsset.set(asset._id, item);
	return item;
}

function storageKeyOf(item) {
	return item.storageKey ?? item.storage_key ?? item.meta?.storageKey;
}

/** Image field value (the MediaValue EmDash stores for `image` fields). */
function imageFieldValue(item, alt) {
	return {
		provider: 'local',
		id: item.id,
		alt: alt || undefined,
		width: item.width ?? undefined,
		height: item.height ?? undefined,
		mimeType: item.mimeType ?? undefined,
		filename: item.filename ?? undefined,
		meta: { storageKey: storageKeyOf(item) },
	};
}

// ── Portable Text ─────────────────────────────────────────────────────────────

function convertMarkDefs(markDefs) {
	return (markDefs ?? []).map(({ openInNewTab, ...markDef }) =>
		markDef._type === 'link' && openInNewTab ? { ...markDef, blank: true } : markDef,
	);
}

function convertTextBlock(block) {
	const { markDefs, ...rest } = block;
	return { ...rest, markDefs: convertMarkDefs(markDefs) };
}

async function convertBody(body, assets) {
	const out = [];
	for (const node of body ?? []) {
		switch (node._type) {
			case 'block':
				out.push(convertTextBlock(node));
				break;
			case 'image': {
				const asset = assets.get(node.asset?._ref);
				if (!asset) {
					warn(`image block ${node._key} references a missing asset`);
					break;
				}
				const item = await uploadAsset(asset, node.alt);
				const dims = asset.metadata?.dimensions;
				out.push({
					_type: 'image',
					_key: node._key,
					asset: {
						_type: 'reference',
						_ref: item.id,
						url: `/_emdash/api/media/file/${storageKeyOf(item)}`,
					},
					alt: node.alt ?? '',
					...(node.caption ? { caption: node.caption } : {}),
					...(dims ? { width: dims.width, height: dims.height } : {}),
				});
				break;
			}
			case 'code':
				out.push({
					_type: 'code',
					_key: node._key,
					code: node.code ?? '',
					...(node.language ? { language: node.language } : {}),
					...(node.filename ? { filename: node.filename } : {}),
				});
				break;
			case 'callout':
				out.push({
					_type: 'callout',
					_key: node._key,
					tone: node.tone ?? 'info',
					text: portableTextToMarkdown((node.body ?? []).map(convertTextBlock)).trim(),
				});
				break;
			case 'youtube':
				out.push({
					_type: 'youtube',
					_key: node._key,
					id: node.videoId ?? '',
					...(node.title ? { title: node.title } : {}),
				});
				break;
			default:
				warn(`unknown block type "${node._type}" (${node._key}) kept as is`);
				out.push(node);
		}
	}
	return out;
}

// ── Content ───────────────────────────────────────────────────────────────────

async function postData(doc, assets) {
	const data = {
		title: doc.title ?? '',
		description: doc.description ?? '',
		tags: doc.tags ?? [],
		body: await convertBody(doc.body, assets),
	};
	if (doc.updatedAt) data.revised_at = doc.updatedAt;
	if (doc.heroImage?.asset?._ref) {
		const asset = assets.get(doc.heroImage.asset._ref);
		if (asset)
			data.hero_image = imageFieldValue(
				await uploadAsset(asset, doc.heroImage.alt),
				doc.heroImage.alt,
			);
		else warn(`${doc._id}: hero image asset missing`);
	}
	return data;
}

async function pageData(doc, assets) {
	const data = {
		key: doc.key,
		title: doc.title ?? '',
		description: doc.description ?? '',
		category: doc.category === 'legal' ? 'legal' : 'static',
		body: await convertBody(doc.body, assets),
	};
	if (doc.updatedAt) data.revised_at = doc.updatedAt;
	return data;
}

/** Returns [sourceDocFirst...] so a translation is created after the entry it translates. */
function orderForTranslations(docs, groupOf) {
	return [...docs].sort((a, b) => {
		const rank = (doc) =>
			groupOf.get(publishedId(doc._id)) && doc.language !== DEFAULT_LOCALE ? 1 : 0;
		return rank(a) - rank(b) || a._id.localeCompare(b._id);
	});
}

async function migrateCollection({
	collection,
	type,
	docs,
	assets,
	translationGroupOf,
	buildData,
	idMap,
}) {
	console.log(`\n${collection}`);
	const existing = new Map();
	if (!dryRun) {
		for (const locale of LOCALES) {
			for (const item of await listAll(collection, locale))
				existing.set(`${locale}/${item.slug}`, item);
		}
	}

	const published = new Map(
		docs.filter((d) => !d._id.startsWith('drafts.')).map((d) => [d._id, d]),
	);
	const drafts = new Map(
		docs.filter((d) => d._id.startsWith('drafts.')).map((d) => [publishedId(d._id), d]),
	);
	const ids = new Set([...published.keys(), ...drafts.keys()]);
	const ordered = orderForTranslations(
		[...ids].map((id) => published.get(id) ?? drafts.get(id)),
		translationGroupOf,
	);

	for (const doc of ordered) {
		const id = publishedId(doc._id);
		const live = published.get(id);
		const draft = drafts.get(id);
		const source = live ?? draft;
		const slug = source.slug?.current;
		const locale = source.language;
		if (!slug || !LOCALES.includes(locale)) {
			warn(`${type} ${id} has no slug or language, skipped`);
			continue;
		}
		const key = `${locale}/${slug}`;
		if (existing.has(key)) {
			idMap.set(id, existing.get(key));
			stats.skipped += 1;
			console.log(`  skip ${key} (exists)`);
			continue;
		}

		const group = translationGroupOf.get(id);
		const sourceTranslation = group
			? [...group.entries()].find(([lang, docId]) => lang === DEFAULT_LOCALE && docId !== id)
			: undefined;
		const translationOf = sourceTranslation ? idMap.get(sourceTranslation[1])?.id : undefined;

		const body = {
			slug,
			locale,
			...(translationOf ? { translationOf } : {}),
			data: await buildData(source, assets),
			createdAt: source._createdAt,
		};
		if (type === 'post' && source.publishedAt) body.publishedAt = source.publishedAt;
		else if (live) body.publishedAt = live._createdAt;
		if (!live) body.status = 'draft';

		if (dryRun) {
			console.log(
				`  would create ${key}${live ? '' : ' (draft)'}${translationOf ? ' (translation)' : ''}`,
			);
			idMap.set(id, { id: `dry-${id}`, slug, locale });
			continue;
		}
		const created = await api('POST', `/content/${collection}`, body);
		const item = created.item ?? created;
		idMap.set(id, item);
		stats.created += 1;
		console.log(
			`  create ${key} → ${item.id}${live ? '' : ' (draft)'}${translationOf ? ' (translation)' : ''}`,
		);

		if (live) await api('POST', `/content/${collection}/${item.id}/publish`, {});

		// A published Sanity document with unpublished edits keeps them as a pending EmDash draft:
		// with revisions enabled, an update of a published entry is staged as its draft revision
		// (passing `status: 'draft'` would unpublish the entry instead).
		if (live && draft) {
			const current = await api('GET', `/content/${collection}/${item.id}`);
			await api('PUT', `/content/${collection}/${item.id}`, {
				data: await buildData(draft, assets),
				_rev: (current.item ?? current)._rev,
			});
			stats.drafts += 1;
			console.log(`  draft edits kept for ${key}`);
		}
	}
}

async function migrateSingletonPerLocale({ collection, label, entriesFor }) {
	console.log(`\n${collection}`);
	const existing = dryRun
		? []
		: (await listAll(collection, DEFAULT_LOCALE)).concat(await listAll(collection, 'uk'));
	if (existing.length > 0) {
		console.log(`  skip (${existing.length} ${label} entries exist)`);
		stats.skipped += existing.length;
		return;
	}
	const sources = new Map();
	for (const locale of LOCALES) {
		for (const entry of entriesFor(locale)) {
			const translationOf = locale === DEFAULT_LOCALE ? undefined : sources.get(entry.groupKey);
			if (dryRun) {
				console.log(`  would create ${locale} ${entry.groupKey}`);
				continue;
			}
			const created = await api('POST', `/content/${collection}`, {
				locale,
				...(translationOf ? { translationOf } : {}),
				data: entry.data,
			});
			const item = created.item ?? created;
			await api('POST', `/content/${collection}/${item.id}/publish`, {});
			if (locale === DEFAULT_LOCALE) sources.set(entry.groupKey, item.id);
			stats.created += 1;
			console.log(`  create ${locale} ${entry.groupKey} → ${item.id}`);
		}
	}
}

// ── Menus ─────────────────────────────────────────────────────────────────────

async function migrateMenus(navigationDocs, pagesByKeyAndLocale) {
	console.log('\nmenus');
	const existing = dryRun ? [] : await api('GET', '/menus');
	const existingNames = new Set(
		(Array.isArray(existing) ? existing : (existing.items ?? [])).map((m) => m.name),
	);
	for (const nav of navigationDocs) {
		const name = nav.menu;
		if (existingNames.has(name)) {
			console.log(`  skip menu ${name} (exists)`);
			continue;
		}
		let sourceMenuId;
		for (const locale of LOCALES) {
			if (dryRun) {
				console.log(`  would create menu ${name} (${locale}) with ${nav.items?.length ?? 0} items`);
				continue;
			}
			const menu = await api('POST', '/menus', {
				name,
				label: nav.title ?? name,
				locale,
				...(sourceMenuId ? { translationOf: sourceMenuId } : {}),
			});
			if (locale === DEFAULT_LOCALE) sourceMenuId = menu.id;
			// A translated menu starts as a copy of the source's items; rebuild it for this locale.
			const current = await api('GET', `/menus/${name}?locale=${locale}`);
			for (const item of current.items ?? []) {
				await api('DELETE', `/menus/${name}/items/${item.id}?locale=${locale}`).catch(() => {});
			}
			let sortOrder = 0;
			for (const navItem of nav.items ?? []) {
				const label = localized(navItem.label, locale) || localized(navItem.label, DEFAULT_LOCALE);
				if (!label) continue;
				const extra = {
					...(navItem.icon ? { cssClasses: `icon-${navItem.icon}` } : {}),
					...(navItem.openInNewTab ? { target: '_blank' } : {}),
				};
				let body;
				if (navItem.linkType === 'route') {
					const path = ROUTE_PATHS[navItem.route];
					if (path === undefined) continue;
					body = { type: 'custom', label, customUrl: `${BLOG_PATH}/${locale}/${path}`, ...extra };
				} else if (navItem.linkType === 'external') {
					body = { type: 'custom', label, customUrl: navItem.url, ...extra };
				} else {
					const page = pagesByKeyAndLocale.get(`${navItem.pageKey}/${locale}`);
					if (!page) continue; // the page has no translation in this language
					body = {
						type: 'page',
						label,
						referenceCollection: 'pages',
						referenceId: page.translationGroup ?? page.id,
						...extra,
					};
				}
				await api('POST', `/menus/${name}/items?locale=${locale}`, { ...body, sortOrder });
				sortOrder += 1;
			}
			stats.menus += 1;
			console.log(`  create menu ${name} (${locale}) with ${sortOrder} items`);
		}
	}
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	console.log(
		`Sanity ${SANITY_PROJECT_ID}/${SANITY_DATASET} → EmDash ${origin}${dryRun ? ' (dry run)' : ''}`,
	);
	if (!sanityToken && !args.export) {
		console.log('No Sanity token: unpublished drafts are not part of the public export.');
	}
	const docs = await loadSanityDocuments();
	if (!dryRun) await resolveToken();

	const assets = new Map(
		docs.filter((d) => d._type === 'sanity.imageAsset').map((d) => [d._id, d]),
	);
	const translationGroupOf = new Map();
	for (const meta of docs.filter(
		(d) => d._type === 'translation.metadata' && !d._id.startsWith('drafts.'),
	)) {
		const group = new Map(
			(meta.translations ?? [])
				.filter((t) => t.value?._ref)
				.map((t) => [t.language ?? t._key, publishedId(t.value._ref)]),
		);
		for (const id of group.values()) translationGroupOf.set(id, group);
	}

	const pageIds = new Map();
	await migrateCollection({
		collection: 'pages',
		type: 'page',
		docs: docs.filter((d) => d._type === 'page'),
		assets,
		translationGroupOf,
		buildData: pageData,
		idMap: pageIds,
	});

	await migrateCollection({
		collection: 'posts',
		type: 'post',
		docs: docs.filter((d) => d._type === 'post'),
		assets,
		translationGroupOf,
		buildData: postData,
		idMap: new Map(),
	});

	const settings = docs.find((d) => d._id === 'siteSettings');
	const settingsOgImage = settings?.defaultOgImage?.asset?._ref
		? assets.get(settings.defaultOgImage.asset._ref)
		: undefined;
	const ogImageValue = settingsOgImage
		? imageFieldValue(
				await uploadAsset(settingsOgImage, settings.defaultOgImage.alt),
				settings.defaultOgImage.alt,
			)
		: undefined;
	await migrateSingletonPerLocale({
		collection: 'site_settings',
		label: 'site settings',
		entriesFor: (locale) =>
			settings
				? [
						{
							groupKey: 'site-settings',
							data: {
								...Object.fromEntries(
									Object.entries(SETTINGS_FIELDS).map(([from, to]) => [
										to,
										localized(settings[from], locale),
									]),
								),
								...(ogImageValue ? { default_og_image: ogImageValue } : {}),
							},
						},
					]
				: [],
	});

	const uiStrings = docs.find((d) => d._id === 'uiStrings');
	await migrateSingletonPerLocale({
		collection: 'ui_strings',
		label: 'UI string',
		entriesFor: (locale) =>
			(uiStrings?.entries ?? [])
				.filter((entry) => entry.key && localized(entry.value, locale))
				.map((entry) => ({
					groupKey: entry.key,
					data: { key: entry.key, value: localized(entry.value, locale) },
				})),
	});

	const pagesByKeyAndLocale = new Map();
	for (const doc of docs.filter((d) => d._type === 'page' && !d._id.startsWith('drafts.'))) {
		const item = pageIds.get(doc._id);
		if (item) pagesByKeyAndLocale.set(`${doc.key}/${doc.language}`, item);
	}
	await migrateMenus(
		docs.filter((d) => d._type === 'navigation' && !d._id.startsWith('drafts.')),
		pagesByKeyAndLocale,
	);

	console.log(
		`\nDone: ${stats.media} media uploaded, ${stats.created} entries created, ${stats.drafts} pending drafts, ` +
			`${stats.skipped} skipped, ${stats.menus} menus, ${stats.warnings} warnings.`,
	);
}

main().catch((error) => {
	console.error(`\nMigration failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
