import { DocumentIcon } from '@sanity/icons/Document';
import { defineField, defineType } from 'sanity';
import {
	isSlugUniqueInLanguage,
	RESERVED_PAGE_SLUGS,
	SLUG_PATTERN,
	SLUG_PATTERN_MESSAGE,
} from './validation';

const PAGE_CATEGORIES = [
	{ title: 'Static', value: 'static' },
	{ title: 'Legal', value: 'legal' },
];

const IS_PAGE_KEY_UNIQUE_QUERY = `!defined(*[_type == "page" && key == $key && language == $lang && !(_id in [$draft, $published])][0]._id)`;

export const page = defineType({
	name: 'page',
	title: 'Page',
	type: 'document',
	icon: DocumentIcon,
	fields: [
		defineField({
			name: 'language',
			type: 'string',
			title: 'Language',
			readOnly: true,
			hidden: true,
			options: { aiAssist: { exclude: true } },
		}),
		defineField({
			name: 'key',
			type: 'string',
			title: 'Key',
			description: 'Stable identifier shared by all translations of this page, for example about',
			options: { aiAssist: { exclude: true } },
			validation: (rule) =>
				rule
					.required()
					.regex(SLUG_PATTERN, { name: 'key' })
					.error(SLUG_PATTERN_MESSAGE)
					.custom(async (key, context) => {
						const { document, getClient } = context;
						if (!key || !document) {
							return true;
						}
						const published = document._id.replace(/^drafts\./, '');
						const isUnique = await getClient({ apiVersion: '2026-10-01' }).fetch<boolean>(
							IS_PAGE_KEY_UNIQUE_QUERY,
							{
								key,
								lang: document.language ?? null,
								draft: `drafts.${published}`,
								published,
							},
						);
						return isUnique ? true : 'Another page in this language already uses this key';
					}),
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
			options: {
				source: 'title',
				maxLength: 96,
				isUnique: isSlugUniqueInLanguage,
				aiAssist: { exclude: true },
			},
			validation: (rule) =>
				rule.required().custom((slug) => {
					const current = slug?.current;
					if (!current) {
						return true;
					}
					if (RESERVED_PAGE_SLUGS.includes(current)) {
						return `"${current}" is reserved by the site routes`;
					}
					return SLUG_PATTERN.test(current) ? true : SLUG_PATTERN_MESSAGE;
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
			name: 'category',
			type: 'string',
			title: 'Category',
			options: { list: PAGE_CATEGORIES, layout: 'radio', direction: 'horizontal' },
			initialValue: 'static',
		}),
		defineField({
			name: 'updatedAt',
			type: 'datetime',
			title: 'Updated at',
			options: { aiAssist: { exclude: true } },
		}),
		defineField({
			name: 'body',
			type: 'blockContent',
			title: 'Body',
		}),
	],
	preview: {
		select: { title: 'title', language: 'language', slug: 'slug.current' },
		prepare({ title, language, slug }) {
			return {
				title,
				subtitle: `${language ?? ''} · /${slug ?? ''}`,
			};
		},
	},
});
