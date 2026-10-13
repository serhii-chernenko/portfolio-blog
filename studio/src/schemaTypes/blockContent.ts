import { ImageIcon } from '@sanity/icons/Image';
import { defineArrayMember, defineField, defineType } from 'sanity';
import { BodyEditorInput } from '../components/BodyEditorInput';
import { linkAnnotation } from './linkAnnotation';

const CODE_LANGUAGES = [
	{ title: 'JavaScript', value: 'javascript' },
	{ title: 'TypeScript', value: 'typescript' },
	{ title: 'JSON', value: 'json' },
	{ title: 'Shell', value: 'sh' },
	{ title: 'SQL', value: 'sql' },
	{ title: 'HTML', value: 'html' },
	{ title: 'CSS', value: 'css' },
	{ title: 'Plain text', value: 'text' },
];

export const blockContent = defineType({
	name: 'blockContent',
	title: 'Block content',
	type: 'array',
	components: { input: BodyEditorInput },
	of: [
		defineArrayMember({
			type: 'block',
			styles: [
				{ title: 'Normal', value: 'normal' },
				{ title: 'Heading 2', value: 'h2' },
				{ title: 'Heading 3', value: 'h3' },
				{ title: 'Heading 4', value: 'h4' },
				{ title: 'Quote', value: 'blockquote' },
			],
			lists: [
				{ title: 'Bullet', value: 'bullet' },
				{ title: 'Numbered', value: 'number' },
			],
			marks: {
				decorators: [
					{ title: 'Strong', value: 'strong' },
					{ title: 'Emphasis', value: 'em' },
					{ title: 'Code', value: 'code' },
					{ title: 'Strike', value: 'strike-through' },
				],
				annotations: [linkAnnotation],
			},
		}),
		defineArrayMember({
			type: 'image',
			icon: ImageIcon,
			options: { hotspot: true },
			fields: [
				defineField({
					name: 'alt',
					type: 'string',
					title: 'Alternative text',
					validation: (rule) => rule.required(),
				}),
				defineField({
					name: 'caption',
					type: 'string',
					title: 'Caption',
				}),
			],
		}),
		defineArrayMember({
			type: 'code',
			options: {
				language: 'typescript',
				languageAlternatives: CODE_LANGUAGES,
				withFilename: true,
				aiAssist: { exclude: true },
			},
		}),
		defineArrayMember({ type: 'callout' }),
		defineArrayMember({ type: 'youtube' }),
	],
});
