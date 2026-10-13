import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ui } from '../src/i18n/ui.ts';

const TARGET = fileURLToPath(new URL('../studio/src/uiKeys.ts', import.meta.url));
const CHECK_FLAG = '--check';

function render(keys) {
	const lines = keys.map((key) => `\t'${key}',`).join('\n');
	return `export const UI_KEYS = [\n${lines}\n] as const;\n\nexport type UIKey = (typeof UI_KEYS)[number];\n`;
}

function readCurrent() {
	try {
		return readFileSync(TARGET, 'utf8');
	} catch {
		return '';
	}
}

const expected = render(Object.keys(ui.en));

if (process.argv.includes(CHECK_FLAG)) {
	if (readCurrent() !== expected) {
		console.error(
			'studio/src/uiKeys.ts is out of date with src/i18n/ui.ts. Run: pnpm ui-keys:sync',
		);
		process.exit(1);
	}
	console.log(`studio/src/uiKeys.ts matches src/i18n/ui.ts (${Object.keys(ui.en).length} keys)`);
} else {
	writeFileSync(TARGET, expected);
	console.log(`Wrote ${Object.keys(ui.en).length} keys to studio/src/uiKeys.ts`);
}
