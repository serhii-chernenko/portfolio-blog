import { LinkIcon } from '@sanity/icons/Link';
import { defineField, defineType, type CustomValidator } from 'sanity';

const LINK_TYPES = [
	{ title: 'Page or post', value: 'internal' },
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

export const navItem = defineType({
	name: 'navItem',
	title: 'Navigation item',
	type: 'object',
	icon: LinkIcon,
	fields: [
		defineField({
			name: 'label',
			type: 'string',
			title: 'Label',
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: 'linkType',
			type: 'string',
			title: 'Link type',
			options: { list: LINK_TYPES, layout: 'radio', direction: 'horizontal' },
			initialValue: 'internal',
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: 'internal',
			type: 'reference',
			title: 'Page or post',
			to: [{ type: 'page' }, { type: 'post' }],
			options: {
				filter: ({ document }) => ({
					filter: 'language == $lang',
					params: { lang: (document.language as string | undefined) ?? '' },
				}),
			},
			hidden: isLinkTypeOtherThan('internal'),
			validation: (rule) => rule.custom(requiredWhenLinkType('internal', 'Select a page or post')),
		}),
		defineField({
			name: 'route',
			type: 'string',
			title: 'Site route',
			options: { list: ROUTES },
			hidden: isLinkTypeOtherThan('route'),
			validation: (rule) => rule.custom(requiredWhenLinkType('route', 'Select a route')),
		}),
		defineField({
			name: 'url',
			type: 'url',
			title: 'URL',
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
			options: { list: ICONS },
		}),
		defineField({
			name: 'openInNewTab',
			type: 'boolean',
			title: 'Open in new tab',
			initialValue: false,
		}),
	],
	preview: {
		select: { title: 'label', linkType: 'linkType', route: 'route', url: 'url' },
		prepare({ title, linkType, route, url }) {
			const target = linkType === 'route' ? route : linkType === 'external' ? url : 'page or post';
			return { title, subtitle: `${linkType ?? 'internal'} · ${target ?? ''}` };
		},
	},
});
