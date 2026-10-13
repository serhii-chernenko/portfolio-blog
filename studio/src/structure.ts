import { CogIcon } from '@sanity/icons/Cog';
import { DocumentIcon } from '@sanity/icons/Document';
import { DocumentTextIcon } from '@sanity/icons/DocumentText';
import { MenuIcon } from '@sanity/icons/Menu';
import { TranslateIcon } from '@sanity/icons/Translate';
import type { StructureBuilder, StructureResolver } from 'sanity/structure';
import { LANGUAGES, type LanguageId } from './languages';
import {
	MENUS,
	navigationDocumentId,
	siteSettingsDocumentId,
	SINGLETON_TYPES,
	type MenuId,
} from './singletons';

const HIDDEN_FROM_DEFAULT_LIST = ['post', 'page', 'translation.metadata', ...SINGLETON_TYPES];

const MENU_TITLES: Record<MenuId, string> = {
	header: 'Header',
	footer: 'Footer',
};

const languageTitle = (language: LanguageId) =>
	LANGUAGES.find(({ id }) => id === language)?.title ?? language;

const localizedDocumentList = (
	S: StructureBuilder,
	schemaType: 'post' | 'page',
	language: LanguageId,
) =>
	S.documentList()
		.id(`${schemaType}-${language}`)
		.title(`${languageTitle(language)} ${schemaType === 'post' ? 'posts' : 'pages'}`)
		.schemaType(schemaType)
		.apiVersion('2026-10-01')
		.filter(`_type == "${schemaType}" && language == $lang`)
		.params({ lang: language })
		.defaultOrdering(
			schemaType === 'post'
				? [{ field: 'publishedAt', direction: 'desc' }]
				: [{ field: 'title', direction: 'asc' }],
		)
		.initialValueTemplates([S.initialValueTemplateItem(`${schemaType}-${language}`)]);

const localizedGroup = (
	S: StructureBuilder,
	schemaType: 'post' | 'page',
	groupTitle: string,
	allTitle: string,
) =>
	S.listItem()
		.id(`${schemaType}-group`)
		.title(groupTitle)
		.icon(schemaType === 'post' ? DocumentTextIcon : DocumentIcon)
		.child(
			S.list()
				.id(`${schemaType}-group-list`)
				.title(groupTitle)
				.items([
					...LANGUAGES.map(({ id, title }) =>
						S.listItem()
							.id(`${schemaType}-${id}`)
							.title(title)
							.icon(TranslateIcon)
							.child(localizedDocumentList(S, schemaType, id)),
					),
					S.divider(),
					S.listItem()
						.id(`${schemaType}-all`)
						.title(allTitle)
						.icon(schemaType === 'post' ? DocumentTextIcon : DocumentIcon)
						.child(
							S.documentTypeList(schemaType)
								.id(`${schemaType}-all-list`)
								.title(allTitle)
								.defaultOrdering(
									schemaType === 'post'
										? [{ field: 'publishedAt', direction: 'desc' }]
										: [{ field: 'title', direction: 'asc' }],
								),
						),
				]),
		);

const navigationGroup = (S: StructureBuilder) =>
	S.listItem()
		.id('navigation-group')
		.title('Navigation')
		.icon(MenuIcon)
		.child(
			S.list()
				.id('navigation-group-list')
				.title('Navigation')
				.items(
					MENUS.flatMap((menu) =>
						LANGUAGES.map(({ id, title }) =>
							S.listItem()
								.id(navigationDocumentId(menu, id))
								.title(`${MENU_TITLES[menu]} (${title})`)
								.icon(MenuIcon)
								.child(
									S.document()
										.schemaType('navigation')
										.documentId(navigationDocumentId(menu, id))
										.initialValueTemplate(navigationDocumentId(menu, id))
										.title(`${MENU_TITLES[menu]} navigation (${title})`),
								),
						),
					),
				),
		);

const siteSettingsGroup = (S: StructureBuilder) =>
	S.listItem()
		.id('site-settings-group')
		.title('Site settings')
		.icon(CogIcon)
		.child(
			S.list()
				.id('site-settings-group-list')
				.title('Site settings')
				.items(
					LANGUAGES.map(({ id, title }) =>
						S.listItem()
							.id(siteSettingsDocumentId(id))
							.title(title)
							.icon(CogIcon)
							.child(
								S.document()
									.schemaType('siteSettings')
									.documentId(siteSettingsDocumentId(id))
									.initialValueTemplate(siteSettingsDocumentId(id))
									.title(`Site settings (${title})`),
							),
					),
				),
		);

export const structure: StructureResolver = (S) =>
	S.list()
		.id('root')
		.title('Content')
		.items([
			localizedGroup(S, 'post', 'Posts', 'All posts'),
			localizedGroup(S, 'page', 'Pages', 'All pages'),
			S.divider(),
			navigationGroup(S),
			siteSettingsGroup(S),
			...S.documentTypeListItems().filter(
				(item) => !HIDDEN_FROM_DEFAULT_LIST.includes(item.getId() ?? ''),
			),
		]);
