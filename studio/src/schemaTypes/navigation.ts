import { MenuIcon } from '@sanity/icons/Menu';
import { defineArrayMember, defineField, defineType } from 'sanity';
import { MENU_TITLES, MENUS } from '../singletons';

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
			options: {
				list: MENUS.map((menu) => ({ title: MENU_TITLES[menu], value: menu })),
				aiAssist: { exclude: true },
			},
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
		select: { title: 'title', menu: 'menu' },
		prepare({ title, menu }) {
			return {
				title: title || `${menu ?? 'Navigation'}`,
				subtitle: menu ?? '',
			};
		},
	},
});
