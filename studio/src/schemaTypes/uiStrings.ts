import { TranslateIcon } from '@sanity/icons/Translate';
import { defineArrayMember, defineField, defineType } from 'sanity';
import { DEFAULT_LANGUAGE } from '../languages';
import { UI_KEYS } from '../uiKeys';

interface LocalizedValue {
	language?: string;
	value?: string;
}

interface UiStringEntry {
	_key: string;
	key?: string;
}

const uniqueKeys = (entries: UiStringEntry[] | undefined) => {
	const seen = new Set<string>();
	const duplicates = (entries ?? []).filter(({ key }) => {
		if (!key) {
			return false;
		}
		const isDuplicate = seen.has(key);
		seen.add(key);
		return isDuplicate;
	});
	return duplicates.length
		? duplicates.map(({ _key, key }) => ({
				message: `"${key}" is already overridden above`,
				path: [{ _key }, 'key'],
			}))
		: true;
};

export const uiStrings = defineType({
	name: 'uiStrings',
	title: 'UI strings',
	type: 'document',
	icon: TranslateIcon,
	fields: [
		defineField({
			name: 'entries',
			type: 'array',
			title: 'Overrides',
			description:
				'Override interface strings from src/i18n/ui.ts. A language without a value keeps the built-in text.',
			validation: (rule) => rule.custom(uniqueKeys),
			of: [
				defineArrayMember({
					name: 'uiString',
					type: 'object',
					title: 'UI string',
					fields: [
						defineField({
							name: 'key',
							type: 'string',
							title: 'Key',
							options: {
								list: UI_KEYS.map((key) => ({ title: key, value: key })),
								aiAssist: { exclude: true },
							},
							validation: (rule) => rule.required(),
						}),
						defineField({
							name: 'value',
							type: 'internationalizedArrayString',
							title: 'Text',
							description: 'Keep {placeholders} such as {year} or {query} unchanged',
						}),
					],
					preview: {
						select: { key: 'key', value: 'value' },
						prepare({ key, value }: { key?: string; value?: LocalizedValue[] }) {
							return {
								title: key || 'Choose a key',
								subtitle: value?.find(({ language }) => language === DEFAULT_LANGUAGE)?.value,
							};
						},
					},
				}),
			],
		}),
	],
	preview: {
		prepare() {
			return { title: 'UI strings' };
		},
	},
});
