import { LinkIcon } from '@sanity/icons/Link';
import { defineArrayMember, defineField } from 'sanity';

export const linkAnnotation = defineArrayMember({
	name: 'link',
	type: 'object',
	title: 'Link',
	icon: LinkIcon,
	fields: [
		defineField({
			name: 'href',
			type: 'url',
			title: 'URL',
			validation: (rule) =>
				rule.required().uri({
					scheme: ['http', 'https', 'mailto'],
					allowRelative: true,
				}),
		}),
		defineField({
			name: 'openInNewTab',
			type: 'boolean',
			title: 'Open in new tab',
			initialValue: false,
		}),
	],
});
