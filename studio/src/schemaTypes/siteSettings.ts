import { CogIcon } from '@sanity/icons/Cog';
import { defineField, defineType } from 'sanity';
import { DEFAULT_LANGUAGE } from '../languages';

const localizedString = (name: string, title: string) =>
	defineField({ name, type: 'internationalizedArrayString', title });

const localizedText = (name: string, title: string) =>
	defineField({ name, type: 'internationalizedArrayText', title });

export const siteSettings = defineType({
	name: 'siteSettings',
	title: 'Site settings',
	type: 'document',
	icon: CogIcon,
	fields: [
		localizedString('siteName', 'Site name'),
		localizedString('tagline', 'Tagline'),
		localizedText('description', 'Description'),
		localizedString('heroEyebrow', 'Hero eyebrow'),
		localizedString('heroTitle', 'Hero title'),
		localizedText('heroSubtitle', 'Hero subtitle'),
		localizedString('aboutTitle', 'About title'),
		localizedText('aboutBody', 'About body'),
		localizedString('aboutCta', 'About call to action'),
		defineField({
			name: 'defaultOgImage',
			type: 'image',
			title: 'Default social image',
			options: { hotspot: true },
		}),
	],
	preview: {
		select: { siteName: 'siteName' },
		prepare({ siteName }: { siteName?: { language?: string; value?: string }[] }) {
			const title = siteName?.find(({ language }) => language === DEFAULT_LANGUAGE)?.value;
			return { title: title || 'Site settings' };
		},
	},
});
