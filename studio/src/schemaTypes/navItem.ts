import { LinkIcon } from '@sanity/icons/Link';
import { defineField, defineType, type CustomValidator } from 'sanity';
import { PageKeyInput } from '../components/PageKeyInput';
import { DEFAULT_LANGUAGE } from '../languages';

const LINK_TYPES = [
	{ title: 'Page', value: 'page' },
	{ title: 'Site route', value: 'route' },
	{ title: 'External URL', value: 'external' },
];

const ROUTES = [
	{ title: 'Home', value: 'home' },
	{ title: 'Posts', value: 'posts' },
	{ title: 'Tags', value: 'tags' },
	{ title: 'Subscribe', value: 'subscribe' },
	{ title: 'RSS feed', value: 'rss' },
];

const ICONS = [
	{ title: 'RSS', value: 'rss' },
	{ title: 'GitHub', value: 'github' },
	{ title: 'Support', value: 'support' },
];

interface NavItemParent {
	linkType?: string;
}

interface LocalizedValue {
	language?: string;
	value?: string;
}

const isLinkTypeOtherThan =
	(linkType: string) =>
	({ parent }: { parent?: NavItemParent }) =>
		parent?.linkType !== linkType;

const requiredWhenLinkType =
	(linkType: string, message: string): CustomValidator<unknown> =>
	(value, context) => {
		const parent = context.parent as NavItemParent | undefined;
		return parent?.linkType === linkType && !value ? message : true;
	};

const hasDefaultLanguageLabel: CustomValidator<LocalizedValue[] | undefined> = (value) =>
	value?.some(({ language, value: label }) => language === DEFAULT_LANGUAGE && label?.trim())
		? true
		: `Add a label in ${DEFAULT_LANGUAGE.toUpperCase()}`;

const defaultLanguageLabel = (label?: LocalizedValue[]) =>
	label?.find(({ language }) => language === DEFAULT_LANGUAGE)?.value;

export const navItem = defineType({
	name: 'navItem',
	title: 'Navigation item',
	type: 'object',
	icon: LinkIcon,
	fields: [
		defineField({
			name: 'label',
			type: 'internationalizedArrayString',
			title: 'Label',
			validation: (rule) => rule.custom(hasDefaultLanguageLabel),
		}),
		defineField({
			name: 'linkType',
			type: 'string',
			title: 'Link type',
			options: {
				list: LINK_TYPES,
				layout: 'radio',
				direction: 'horizontal',
				aiAssist: { exclude: true },
			},
			initialValue: 'page',
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: 'pageKey',
			type: 'string',
			title: 'Page',
			description: 'The page key; each language links to its own translation of that page',
			components: { input: PageKeyInput },
			options: { aiAssist: { exclude: true } },
			hidden: isLinkTypeOtherThan('page'),
			validation: (rule) => rule.custom(requiredWhenLinkType('page', 'Select a page')),
		}),
		defineField({
			name: 'route',
			type: 'string',
			title: 'Site route',
			options: { list: ROUTES, aiAssist: { exclude: true } },
			hidden: isLinkTypeOtherThan('route'),
			validation: (rule) => rule.custom(requiredWhenLinkType('route', 'Select a route')),
		}),
		defineField({
			name: 'url',
			type: 'url',
			title: 'URL',
			options: { aiAssist: { exclude: true } },
			hidden: isLinkTypeOtherThan('external'),
			validation: (rule) =>
				rule
					.uri({ scheme: ['http', 'https', 'mailto'] })
					.custom(requiredWhenLinkType('external', 'Enter a URL')),
		}),
		defineField({
			name: 'icon',
			type: 'string',
			title: 'Icon',
			options: { list: ICONS, aiAssist: { exclude: true } },
		}),
		defineField({
			name: 'openInNewTab',
			type: 'boolean',
			title: 'Open in new tab',
			initialValue: false,
		}),
	],
	preview: {
		select: {
			label: 'label',
			linkType: 'linkType',
			pageKey: 'pageKey',
			route: 'route',
			url: 'url',
		},
		prepare({ label, linkType, pageKey, route, url }) {
			const targets: Record<string, string | undefined> = {
				page: pageKey,
				route,
				external: url,
			};
			return {
				title: defaultLanguageLabel(label) || 'Untitled link',
				subtitle: `${linkType ?? 'page'} · ${targets[linkType ?? 'page'] ?? ''}`,
			};
		},
	},
});
