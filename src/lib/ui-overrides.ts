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

export async function loadUiOverrides(ctx: SanityContext): Promise<UiOverrides> {
	const entries = await ctx.fetch<RawUiStringEntry[] | null>(UI_STRINGS_QUERY, {
		uiStringsId: UI_STRINGS_ID,
	});
	return toUiOverrides(entries);
}
