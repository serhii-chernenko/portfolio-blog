import { getCliClient } from 'sanity/cli';
import { DEFAULT_LANGUAGE, LANGUAGES, type LanguageId } from '../src/languages';
import {
	MENUS,
	navigationDocumentId,
	SITE_SETTINGS_DOCUMENT_ID,
	UI_STRINGS_DOCUMENT_ID,
	type MenuId,
} from '../src/singletons';

const API_VERSION = '2026-10-01';
const DRY_RUN = process.argv.includes('--dry-run');

const SETTINGS_STRING_FIELDS = [
	'siteName',
	'tagline',
	'heroEyebrow',
	'heroTitle',
	'aboutTitle',
	'aboutCta',
] as const;

const SETTINGS_TEXT_FIELDS = ['description', 'heroSubtitle', 'aboutBody'] as const;

type SettingsField =
	(typeof SETTINGS_STRING_FIELDS)[number] | (typeof SETTINGS_TEXT_FIELDS)[number];

interface LegacyNavItem {
	_key: string;
	label?: string;
	linkType?: string;
	route?: string;
	url?: string;
	icon?: string;
	openInNewTab?: boolean;
	pageKey?: string | null;
}

interface LegacyNavigation {
	_id: string;
	title?: string;
	items?: LegacyNavItem[];
}

type LegacySettings = { _id: string; defaultOgImage?: Record<string, unknown> } & Partial<
	Record<SettingsField, string>
>;

interface LocalizedValue {
	_key: string;
	_type: 'internationalizedArrayStringValue' | 'internationalizedArrayTextValue';
	language: LanguageId;
	value: string;
}

const legacyNavigationId = (menu: MenuId, language: LanguageId) => `navigation-${menu}-${language}`;

const legacySettingsId = (language: LanguageId) => `siteSettings-${language}`;

const LEGACY_NAVIGATION_QUERY = `*[_id == $id][0]{
	_id,
	title,
	items[]{ _key, label, linkType, route, url, icon, openInNewTab, "pageKey": internal->key }
}`;

const LEGACY_SETTINGS_QUERY = `*[_id == $id][0]`;

const VERIFY_QUERY = `{
	"header": *[_id == $headerId][0]{ _id, menu, title, items },
	"footer": *[_id == $footerId][0]{ _id, menu, title, items },
	"settings": *[_id == $settingsId][0],
	"uiStrings": *[_id == $uiStringsId][0]
}`;

const client = getCliClient({ apiVersion: API_VERSION }).withConfig({ perspective: 'published' });

function fail(message: string): never {
	throw new Error(`Migration aborted: ${message}`);
}

function localized(
	type: LocalizedValue['_type'],
	values: Partial<Record<LanguageId, string | undefined>>,
): LocalizedValue[] {
	return LANGUAGES.flatMap(({ id }) => {
		const value = values[id]?.trim() ? values[id] : undefined;
		return value ? [{ _key: id, _type: type, language: id, value }] : [];
	});
}

async function fetchRequired<T>(query: string, id: string): Promise<T> {
	const document = await client.fetch<T | null>(query, { id });
	return document ?? fail(`published document ${id} not found`);
}

function assertSame(menu: MenuId, index: number, field: string, values: unknown[]) {
	const [first, ...rest] = values;
	if (rest.some((value) => value !== first)) {
		fail(
			`${menu} item #${index + 1} has a different ${field} per language: ${JSON.stringify(values)}`,
		);
	}
}

function mergeNavItems(menu: MenuId, byLanguage: Record<LanguageId, LegacyNavItem[]>) {
	const base = byLanguage[DEFAULT_LANGUAGE];
	for (const { id } of LANGUAGES) {
		if (byLanguage[id].length !== base.length) {
			fail(
				`${menu} has ${byLanguage[id].length} items in ${id} but ${base.length} in ${DEFAULT_LANGUAGE}`,
			);
		}
	}

	return base.map((baseItem, index) => {
		const items = LANGUAGES.map(({ id }) => byLanguage[id][index]);
		const linkType = baseItem.linkType ?? 'internal';
		assertSame(
			menu,
			index,
			'linkType',
			items.map((item) => item.linkType ?? 'internal'),
		);
		for (const field of ['route', 'url', 'icon'] as const) {
			assertSame(
				menu,
				index,
				field,
				items.map((item) => item[field] ?? null),
			);
		}
		assertSame(
			menu,
			index,
			'openInNewTab',
			items.map((item) => item.openInNewTab === true),
		);

		const labels = localized(
			'internationalizedArrayStringValue',
			Object.fromEntries(LANGUAGES.map(({ id }, i) => [id, items[i].label])),
		);
		if (!labels.some(({ language }) => language === DEFAULT_LANGUAGE)) {
			fail(`${menu} item #${index + 1} has no ${DEFAULT_LANGUAGE} label`);
		}

		const target: Record<string, string> = {};
		if (linkType === 'internal') {
			const pageKeys = items.map((item) => item.pageKey ?? null);
			assertSame(menu, index, 'page key', pageKeys);
			const [pageKey] = pageKeys;
			if (!pageKey) {
				fail(`${menu} item #${index + 1} references a page without a key`);
			}
			target.linkType = 'page';
			target.pageKey = pageKey;
		} else if (linkType === 'route') {
			target.linkType = 'route';
			target.route = baseItem.route ?? fail(`${menu} item #${index + 1} has no route`);
		} else if (linkType === 'external') {
			target.linkType = 'external';
			target.url = baseItem.url ?? fail(`${menu} item #${index + 1} has no URL`);
		} else {
			fail(`${menu} item #${index + 1} has an unknown linkType ${linkType}`);
		}

		return {
			_key: baseItem._key,
			_type: 'navItem',
			label: labels,
			...target,
			...(baseItem.icon ? { icon: baseItem.icon } : {}),
			...(baseItem.openInNewTab === true ? { openInNewTab: true } : {}),
		};
	});
}

async function buildNavigation(menu: MenuId) {
	const legacy = await Promise.all(
		LANGUAGES.map(({ id }) =>
			fetchRequired<LegacyNavigation>(LEGACY_NAVIGATION_QUERY, legacyNavigationId(menu, id)),
		),
	);
	const byLanguage = Object.fromEntries(
		LANGUAGES.map(({ id }, index) => [id, legacy[index].items ?? []]),
	) as Record<LanguageId, LegacyNavItem[]>;
	const defaultTitle = legacy[LANGUAGES.findIndex(({ id }) => id === DEFAULT_LANGUAGE)].title;

	return {
		_id: navigationDocumentId(menu),
		_type: 'navigation',
		menu,
		title: defaultTitle ?? menu,
		items: mergeNavItems(menu, byLanguage),
	};
}

async function buildSiteSettings() {
	const legacy = await Promise.all(
		LANGUAGES.map(({ id }) =>
			fetchRequired<LegacySettings>(LEGACY_SETTINGS_QUERY, legacySettingsId(id)),
		),
	);
	const valuesOf = (field: SettingsField) =>
		Object.fromEntries(LANGUAGES.map(({ id }, index) => [id, legacy[index][field]]));

	const fields = Object.fromEntries([
		...SETTINGS_STRING_FIELDS.map((field) => [
			field,
			localized('internationalizedArrayStringValue', valuesOf(field)),
		]),
		...SETTINGS_TEXT_FIELDS.map((field) => [
			field,
			localized('internationalizedArrayTextValue', valuesOf(field)),
		]),
	]);
	const defaultOgImage = legacy.find((document) => document.defaultOgImage)?.defaultOgImage;

	return {
		_id: SITE_SETTINGS_DOCUMENT_ID,
		_type: 'siteSettings',
		...fields,
		...(defaultOgImage ? { defaultOgImage } : {}),
	};
}

async function main() {
	const [header, footer, settings] = await Promise.all([
		buildNavigation('header'),
		buildNavigation('footer'),
		buildSiteSettings(),
	]);
	const uiStrings = { _id: UI_STRINGS_DOCUMENT_ID, _type: 'uiStrings', entries: [] };

	if (DRY_RUN) {
		console.log(JSON.stringify({ header, footer, settings, uiStrings }, null, 2));
		console.log(
			`Dry run: would createOrReplace ${[header, footer, settings].map(({ _id }) => _id).join(', ')} and createIfNotExists ${uiStrings._id}`,
		);
		return;
	}

	const result = await client
		.transaction()
		.createOrReplace(header)
		.createOrReplace(footer)
		.createOrReplace(settings)
		.createIfNotExists(uiStrings)
		.commit({ visibility: 'sync' });
	console.log(`Committed transaction ${result.transactionId}`);

	const written = await client.fetch(VERIFY_QUERY, {
		headerId: navigationDocumentId('header'),
		footerId: navigationDocumentId('footer'),
		settingsId: SITE_SETTINGS_DOCUMENT_ID,
		uiStringsId: UI_STRINGS_DOCUMENT_ID,
	});
	console.log(JSON.stringify(written, null, 2));
	if (!written.header || !written.footer || !written.settings || !written.uiStrings) {
		fail('a written document could not be read back');
	}
	console.log(`Verified ${MENUS.length} menus, site settings and UI strings`);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
