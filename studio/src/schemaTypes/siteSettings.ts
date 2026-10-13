import { CogIcon } from '@sanity/icons/Cog';
import { defineField, defineType } from 'sanity';

export const siteSettings = defineType({
	name: 'siteSettings',
	title: 'Site settings',
	type: 'document',
	icon: CogIcon,
	fields: [
		defineField({
			name: 'language',
			type: 'string',
			title: 'Language',
			readOnly: true,
		}),
		defineField({ name: 'siteName', type: 'string', title: 'Site name' }),
		defineField({ name: 'tagline', type: 'string', title: 'Tagline' }),
		defineField({ name: 'description', type: 'text', title: 'Description', rows: 3 }),
		defineField({ name: 'heroEyebrow', type: 'string', title: 'Hero eyebrow' }),
		defineField({ name: 'heroTitle', type: 'string', title: 'Hero title' }),
		defineField({ name: 'heroSubtitle', type: 'text', title: 'Hero subtitle', rows: 3 }),
		defineField({ name: 'aboutTitle', type: 'string', title: 'About title' }),
		defineField({ name: 'aboutBody', type: 'text', title: 'About body', rows: 4 }),
		defineField({ name: 'aboutCta', type: 'string', title: 'About call to action' }),
		defineField({
			name: 'defaultOgImage',
			type: 'image',
			title: 'Default social image',
			options: { hotspot: true },
		}),
	],
	preview: {
		select: { title: 'siteName', language: 'language' },
		prepare({ title, language }) {
			return {
				title: title || 'Site settings',
				subtitle: (language ?? '').toUpperCase(),
			};
		},
	},
});
