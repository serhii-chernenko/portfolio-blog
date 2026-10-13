import { CogIcon } from '@sanity/icons/Cog';
import { DocumentIcon } from '@sanity/icons/Document';
import { DocumentTextIcon } from '@sanity/icons/DocumentText';
import { LinkIcon } from '@sanity/icons/Link';
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
import { TRANSLATION_METADATA_TYPE } from './translationMetadata';

const HIDDEN_FROM_DEFAULT_LIST = ['post', 'page', TRANSLATION_METADATA_TYPE, ...SINGLETON_TYPES];

const MENU_TITLES: Record<MenuId, string> = {
	header: 'Header',
	footer: 'Footer',
};

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
			translationsListItem(S),
			S.divider(),
			navigationGroup(S),
			siteSettingsGroup(S),
			...S.documentTypeListItems().filter(
				(item) => !HIDDEN_FROM_DEFAULT_LIST.includes(item.getId() ?? ''),
			),
		]);
