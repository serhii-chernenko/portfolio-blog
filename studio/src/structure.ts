import { CogIcon } from '@sanity/icons/Cog';
import { DocumentIcon } from '@sanity/icons/Document';
import { DocumentTextIcon } from '@sanity/icons/DocumentText';
import { LinkIcon } from '@sanity/icons/Link';
import { MenuIcon } from '@sanity/icons/Menu';
import { TranslateIcon } from '@sanity/icons/Translate';
import type { StructureBuilder, StructureResolver } from 'sanity/structure';
import { LANGUAGES, type LanguageId } from './languages';
import {
	MENU_TITLES,
	MENUS,
	navigationDocumentId,
	SINGLETON_TYPES,
	SITE_SETTINGS_DOCUMENT_ID,
	UI_STRINGS_DOCUMENT_ID,
} from './singletons';
import { TRANSLATION_METADATA_TYPE } from './translationMetadata';

const HIDDEN_FROM_DEFAULT_LIST = ['post', 'page', TRANSLATION_METADATA_TYPE, ...SINGLETON_TYPES];

const languageTitle = (language: LanguageId) =>
	LANGUAGES.find(({ id }) => id === language)?.title ?? language;

type TranslationStatus = 'translated' | 'untranslated';

const HAS_TRANSLATION_PAIR = `defined(*[_type == "${TRANSLATION_METADATA_TYPE}" && references(string::split(^._id, "drafts.")[-1])][0]._id)`;

const TRANSLATION_STATUS_FILTERS: Record<TranslationStatus, string> = {
	translated: `_type == $type && ${HAS_TRANSLATION_PAIR}`,
	untranslated: `_type == $type && !${HAS_TRANSLATION_PAIR}`,
};

const TRANSLATION_STATUS_TITLES: Record<TranslationStatus, string> = {
	translated: 'З перекладом',
	untranslated: 'Без перекладу',
};

const defaultOrdering = (schemaType: 'post' | 'page') =>
	schemaType === 'post'
		? [{ field: 'publishedAt', direction: 'desc' as const }]
		: [{ field: 'title', direction: 'asc' as const }];

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
		.defaultOrdering(defaultOrdering(schemaType))
		.initialValueTemplates([S.initialValueTemplateItem(`${schemaType}-${language}`)]);

const translationStatusItem = (
	S: StructureBuilder,
	schemaType: 'post' | 'page',
	status: TranslationStatus,
) =>
	S.listItem()
		.id(`${schemaType}-${status}`)
		.title(TRANSLATION_STATUS_TITLES[status])
		.icon(LinkIcon)
		.child(
			S.documentList()
				.id(`${schemaType}-${status}-list`)
				.title(TRANSLATION_STATUS_TITLES[status])
				.schemaType(schemaType)
				.apiVersion('2026-10-01')
				.filter(TRANSLATION_STATUS_FILTERS[status])
				.params({ type: schemaType })
				.defaultOrdering(defaultOrdering(schemaType))
				.initialValueTemplates([]),
		);

const translationsListItem = (S: StructureBuilder) =>
	S.listItem()
		.id('translations')
		.title('Переклади')
		.icon(TranslateIcon)
		.child(
			S.documentList()
				.id('translations-list')
				.title('Переклади')
				.schemaType(TRANSLATION_METADATA_TYPE)
				.apiVersion('2026-10-01')
				.filter('_type == $type')
				.params({ type: TRANSLATION_METADATA_TYPE })
				.defaultOrdering([{ field: '_updatedAt', direction: 'desc' }])
				.initialValueTemplates([]),
		);

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
					translationStatusItem(S, schemaType, 'translated'),
					translationStatusItem(S, schemaType, 'untranslated'),
					S.divider(),
					S.listItem()
						.id(`${schemaType}-all`)
						.title(allTitle)
						.icon(schemaType === 'post' ? DocumentTextIcon : DocumentIcon)
						.child(
							S.documentTypeList(schemaType)
								.id(`${schemaType}-all-list`)
								.title(allTitle)
								.defaultOrdering(defaultOrdering(schemaType)),
						),
				]),
		);

const singletonDocument = (
	S: StructureBuilder,
	schemaType: string,
	documentId: string,
	title: string,
) =>
	S.document()
		.schemaType(schemaType)
		.documentId(documentId)
		.initialValueTemplate(documentId)
		.title(title);

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
					MENUS.map((menu) =>
						S.listItem()
							.id(navigationDocumentId(menu))
							.title(MENU_TITLES[menu])
							.icon(MenuIcon)
							.child(
								singletonDocument(
									S,
									'navigation',
									navigationDocumentId(menu),
									`${MENU_TITLES[menu]} navigation`,
								),
							),
					),
				),
		);

const siteSettingsItem = (S: StructureBuilder) =>
	S.listItem()
		.id(SITE_SETTINGS_DOCUMENT_ID)
		.title('Site settings')
		.icon(CogIcon)
		.child(singletonDocument(S, 'siteSettings', SITE_SETTINGS_DOCUMENT_ID, 'Site settings'));

const uiStringsItem = (S: StructureBuilder) =>
	S.listItem()
		.id(UI_STRINGS_DOCUMENT_ID)
		.title('UI strings')
		.icon(TranslateIcon)
		.child(singletonDocument(S, 'uiStrings', UI_STRINGS_DOCUMENT_ID, 'UI strings'));

export const structure: StructureResolver = (S) =>
	S.list()
		.id('root')
		.title('Content')
		.items([
			localizedGroup(S, 'post', 'Posts', 'All posts'),
			localizedGroup(S, 'page', 'Pages', 'All pages'),
			translationsListItem(S),
			S.divider(),
			navigationGroup(S),
			siteSettingsItem(S),
			uiStringsItem(S),
			...S.documentTypeListItems().filter(
				(item) => !HIDDEN_FROM_DEFAULT_LIST.includes(item.getId() ?? ''),
			),
		]);
