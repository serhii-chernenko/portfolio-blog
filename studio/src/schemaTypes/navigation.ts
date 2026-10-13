import { MenuIcon } from '@sanity/icons/Menu';
import { defineArrayMember, defineField, defineType } from 'sanity';
import { LANGUAGES } from '../languages';

const MENUS = [
	{ title: 'Header', value: 'header' },
	{ title: 'Footer', value: 'footer' },
];

export const navigation = defineType({
	name: 'navigation',
	title: 'Navigation',
	type: 'document',
	icon: MenuIcon,
	fields: [
		defineField({
			name: 'menu',
			type: 'string',
			title: 'Menu',
			options: { list: MENUS },
			readOnly: true,
		}),
		defineField({
			name: 'language',
			type: 'string',
			title: 'Language',
			options: { list: LANGUAGES.map(({ id, title }) => ({ title, value: id })) },
			readOnly: true,
		}),
		defineField({
			name: 'title',
			type: 'string',
			title: 'Title',
		}),
		defineField({
			name: 'items',
			type: 'array',
			title: 'Items',
			of: [defineArrayMember({ type: 'navItem' })],
		}),
	],
	preview: {
		select: { title: 'title', menu: 'menu', language: 'language' },
		prepare({ title, menu, language }) {
			return {
				title: title || `${menu ?? 'Navigation'}`,
				subtitle: `${menu ?? ''} · ${(language ?? '').toUpperCase()}`,
			};
		},
	},
});
