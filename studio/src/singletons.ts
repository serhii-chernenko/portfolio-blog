import { LANGUAGES, type LanguageId } from './languages';

export const SINGLETON_TYPES = ['navigation', 'siteSettings'];

export const MENUS = ['header', 'footer'] as const;

export type MenuId = (typeof MENUS)[number];

export const navigationDocumentId = (menu: MenuId, language: LanguageId) =>
	`navigation-${menu}-${language}`;

export const siteSettingsDocumentId = (language: LanguageId) => `siteSettings-${language}`;

export interface SingletonTemplate {
	id: string;
	title: string;
	schemaType: string;
	value: Record<string, string>;
}

const navigationTemplates: SingletonTemplate[] = MENUS.flatMap((menu) =>
	LANGUAGES.map(({ id, title }) => ({
		id: navigationDocumentId(menu, id),
		title: `${menu === 'header' ? 'Header' : 'Footer'} navigation (${title})`,
		schemaType: 'navigation',
		value: { menu, language: id },
	})),
);

const siteSettingsTemplates: SingletonTemplate[] = LANGUAGES.map(({ id, title }) => ({
	id: siteSettingsDocumentId(id),
	title: `Site settings (${title})`,
	schemaType: 'siteSettings',
	value: { language: id },
}));

export const SINGLETON_TEMPLATES = [...navigationTemplates, ...siteSettingsTemplates];
