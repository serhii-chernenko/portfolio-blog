import type { SchemaTypeDefinition } from 'sanity';

export const TRANSLATION_METADATA_TYPE = 'translation.metadata';

const TITLE_SEPARATOR = ' ↔ ';

interface MetadataPreviewSelection {
	title0?: string;
	title1?: string;
	title2?: string;
	language0?: string;
	language1?: string;
	language2?: string;
}

const metadataPreview = {
	select: {
		title0: 'translations.0.value.title',
		title1: 'translations.1.value.title',
		title2: 'translations.2.value.title',
		language0: 'translations.0.language',
		language1: 'translations.1.language',
		language2: 'translations.2.language',
	},
	prepare({ title0, title1, title2, language0, language1, language2 }: MetadataPreviewSelection) {
		const titles = [title0, title1, title2].filter(Boolean);
		const languages = [language0, language1, language2]
			.filter((language): language is string => Boolean(language))
			.map((language) => language.toUpperCase());
		return {
			title: titles.length ? titles.join(TITLE_SEPARATOR) : 'Переклади без заголовків',
			subtitle: languages.join(' · '),
		};
	},
};

export const withReadablePreview = (type: SchemaTypeDefinition): SchemaTypeDefinition =>
	type.name === TRANSLATION_METADATA_TYPE
		? { ...type, readOnly: true, preview: metadataPreview }
		: type;
