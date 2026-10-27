import { locales } from '../i18n/config';
import { isUIKey } from '../i18n/ui';
import type { UiOverrides } from '../i18n/utils';
import { COLLECTIONS } from './cms/config';
import type { CmsContext } from './cms/context';
import { listEntries, stringField, type CmsEntry } from './cms/entries';

/** Turns published `ui_strings` entries (one per key and language) into translator overrides. */
export function toUiOverrides(entries: CmsEntry[]): UiOverrides {
	const overrides: UiOverrides = {};
	for (const entry of entries) {
		const key = stringField(entry, 'key');
		const value = stringField(entry, 'value');
		if (!isUIKey(key) || !value.trim()) continue;
		overrides[entry.locale] = { ...overrides[entry.locale], [key]: value };
	}
	return overrides;
}

const overridesByContext = new WeakMap<CmsContext, Promise<UiOverrides>>();
const failedContexts = new WeakSet<CmsContext>();

async function fetchUiOverrides(ctx: CmsContext): Promise<UiOverrides> {
	try {
		const perLocale = await Promise.all(
			locales.map((locale) => listEntries(COLLECTIONS.uiStrings, locale)),
		);
		return toUiOverrides(perLocale.flat());
	} catch (error) {
		failedContexts.add(ctx);
		console.error(
			JSON.stringify({
				message: 'UI string overrides failed to load',
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return {};
	}
}

export function loadUiOverrides(ctx: CmsContext): Promise<UiOverrides> {
	let pending = overridesByContext.get(ctx);
	if (!pending) {
		pending = fetchUiOverrides(ctx);
		overridesByContext.set(ctx, pending);
	}
	return pending;
}

export function uiOverridesFailed(ctx: CmsContext): boolean {
	return failedContexts.has(ctx);
}
