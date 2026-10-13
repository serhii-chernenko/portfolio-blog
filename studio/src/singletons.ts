export const SINGLETON_TYPES = ['navigation', 'siteSettings', 'uiStrings'];

export const MENUS = ['header', 'footer'] as const;

export type MenuId = (typeof MENUS)[number];

export const navigationDocumentId = (menu: MenuId) => `navigation-${menu}`;

export const SITE_SETTINGS_DOCUMENT_ID = 'siteSettings';

export const UI_STRINGS_DOCUMENT_ID = 'uiStrings';

export const MENU_TITLES: Record<MenuId, string> = {
	header: 'Header',
	footer: 'Footer',
};

export interface SingletonTemplate {
	id: string;
	title: string;
	schemaType: string;
	value: Record<string, unknown>;
}

const navigationTemplates: SingletonTemplate[] = MENUS.map((menu) => ({
	id: navigationDocumentId(menu),
	title: `${MENU_TITLES[menu]} navigation`,
	schemaType: 'navigation',
	value: { menu, title: MENU_TITLES[menu] },
}));

export const SINGLETON_TEMPLATES: SingletonTemplate[] = [
	...navigationTemplates,
	{
		id: SITE_SETTINGS_DOCUMENT_ID,
		title: 'Site settings',
		schemaType: 'siteSettings',
		value: {},
	},
	{
		id: UI_STRINGS_DOCUMENT_ID,
		title: 'UI strings',
		schemaType: 'uiStrings',
		value: { entries: [] },
	},
];
