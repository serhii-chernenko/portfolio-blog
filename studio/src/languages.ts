export type LanguageId = 'en' | 'uk';

export interface StudioLanguage {
	id: LanguageId;
	title: string;
}

export const LANGUAGES: StudioLanguage[] = [
	{ id: 'en', title: 'English' },
	{ id: 'uk', title: 'Українська' },
];

export const DEFAULT_LANGUAGE: LanguageId = 'en';

export const LANGUAGE_FIELD = 'language';

export const LOCALIZED_DOCUMENT_TYPES = ['post', 'page'];
