// Keeps the `ui_strings.key` select options in seed/seed.json in sync with src/i18n/ui.ts.
// `--check` (CI, `pnpm test:ui-keys`) fails when they drift; without it the seed is rewritten.
//
// The seed is applied once, to a fresh EmDash database. After adding a key to an existing site,
// also add it to the field in the admin (Content Types → UI strings → Key → Options).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ui } from '../src/i18n/ui.ts';

const SEED = fileURLToPath(new URL('../seed/seed.json', import.meta.url));
const CHECK_FLAG = '--check';

// Keys edited elsewhere in the CMS: site settings (site and home copy) and menus (nav labels).
const MANAGED_ELSEWHERE_KEYS = new Set([
	'site.name',
	'site.tagline',
	'site.description',
	'home.hero.eyebrow',
	'home.hero.title',
	'home.hero.subtitle',
	'home.about.title',
	'home.about.body',
	'home.about.cta',
	'nav.tags',
	'nav.about',
	'footer.rss',
	'footer.source',
]);

const overridableKeys = Object.keys(ui.en).filter((key) => !MANAGED_ELSEWHERE_KEYS.has(key));

const raw = readFileSync(SEED, 'utf8');
const seed = JSON.parse(raw);
const keyField = seed.collections
	.find((collection) => collection.slug === 'ui_strings')
	?.fields.find((field) => field.slug === 'key');
if (!keyField) {
	console.error('seed/seed.json has no ui_strings.key field');
	process.exit(1);
}

const current = keyField.validation?.options ?? [];
const inSync =
	current.length === overridableKeys.length &&
	current.every((key, index) => key === overridableKeys[index]);

if (process.argv.includes(CHECK_FLAG)) {
	if (!inSync) {
		console.error(
			'seed/seed.json ui_strings.key options are out of date with src/i18n/ui.ts. Run: pnpm ui-keys:sync',
		);
		process.exit(1);
	}
	console.log(`seed/seed.json ui_strings.key matches src/i18n/ui.ts (${current.length} keys)`);
} else {
	keyField.validation = { ...keyField.validation, options: overridableKeys };
	writeFileSync(SEED, `${JSON.stringify(seed, null, '\t')}\n`);
	console.log(`Wrote ${overridableKeys.length} keys to seed/seed.json (ui_strings.key)`);
}
