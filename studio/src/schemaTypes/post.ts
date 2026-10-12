import { DocumentTextIcon } from '@sanity/icons/DocumentText';
import { defineField, defineType } from 'sanity';
import { isSlugUniqueInLanguage, SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from './validation';

export const post = defineType({
	name: 'post',
	title: 'Post',
	type: 'document',
	icon: DocumentTextIcon,
	fields: [
		defineField({
			name: 'language',
			type: 'string',
			title: 'Language',
			readOnly: true,
			hidden: true,
		}),
		defineField({
			name: 'title',
			type: 'string',
			title: 'Title',
			validation: (rule) => rule.required().max(120),
		}),
		defineField({
			name: 'slug',
			type: 'slug',
			title: 'Slug',
			options: { source: 'title', maxLength: 96, isUnique: isSlugUniqueInLanguage },
			validation: (rule) =>
				rule.required().custom((slug) => {
					const current = slug?.current;
					return !current || SLUG_PATTERN.test(current) ? true : SLUG_PATTERN_MESSAGE;
				}),
		}),
		defineField({
			name: 'description',
			type: 'text',
			title: 'Description',
			rows: 3,
			validation: (rule) => rule.required().min(50).max(200),
		}),
		defineField({
			name: 'publishedAt',
			type: 'datetime',
			title: 'Published at',
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: 'updatedAt',
			type: 'datetime',
			title: 'Updated at',
		}),
		defineField({
			name: 'tags',
			type: 'array',
			title: 'Tags',
			of: [{ type: 'string' }],
			options: { layout: 'tags' },
		}),
		defineField({
			name: 'heroImage',
			type: 'image',
			title: 'Hero image',
			options: { hotspot: true },
			fields: [
				defineField({
					name: 'alt',
					type: 'string',
					title: 'Alternative text',
				}),
			],
		}),
		defineField({
			name: 'body',
			type: 'blockContent',
			title: 'Body',
		}),
	],
	orderings: [
		{
			title: 'Published at, newest first',
			name: 'publishedAtDesc',
			by: [{ field: 'publishedAt', direction: 'desc' }],
		},
	],
	preview: {
		select: {
			title: 'title',
			language: 'language',
			publishedAt: 'publishedAt',
			media: 'heroImage',
		},
		prepare({ title, language, publishedAt, media }) {
			const languageLabel = (language ?? '').toUpperCase();
			const publishedDate = publishedAt ? String(publishedAt).slice(0, 10) : 'not scheduled';
			return {
				title,
				subtitle: `${languageLabel} · ${publishedDate}`,
				media,
			};
		},
	},
});
