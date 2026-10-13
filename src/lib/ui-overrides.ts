import { stegaClean } from '@sanity/client/stega';
import { isLocale } from '../i18n/config';
import { isUIKey } from '../i18n/ui';
import type { UiOverrides } from '../i18n/utils';
import { UI_STRINGS_QUERY } from './sanity/queries';
import type { SanityContext } from './sanity/request';

const UI_STRINGS_ID = 'uiStrings';

interface RawUiStringEntry {
	key: string | null;
	values: { language: string | null; value: string | null }[] | null;
}

export function toUiOverrides(entries: RawUiStringEntry[] | null): UiOverrides {
	const overrides: UiOverrides = {};
	for (const entry of entries ?? []) {
		const key = stegaClean(entry.key ?? '');
		if (!isUIKey(key)) continue;
		for (const { language: rawLanguage, value } of entry.values ?? []) {
			const language = stegaClean(rawLanguage ?? '');
			if (!isLocale(language) || !value || !stegaClean(value).trim()) continue;
			overrides[language] = { ...overrides[language], [key]: value };
		}
	}
	return overrides;
}

const overridesByContext = new WeakMap<SanityContext, Promise<UiOverrides>>();
const failedContexts = new WeakSet<SanityContext>();

async function fetchUiOverrides(ctx: SanityContext): Promise<UiOverrides> {
	try {
		const entries = await ctx.fetch<RawUiStringEntry[] | null>(UI_STRINGS_QUERY, {
			uiStringsId: UI_STRINGS_ID,
		});
		return toUiOverrides(entries);
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

export function loadUiOverrides(ctx: SanityContext): Promise<UiOverrides> {
	let pending = overridesByContext.get(ctx);
	if (!pending) {
		pending = fetchUiOverrides(ctx);
		overridesByContext.set(ctx, pending);
	}
	return pending;
}

export function uiOverridesFailed(ctx: SanityContext): boolean {
	return failedContexts.has(ctx);
}
