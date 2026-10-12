import { InfoOutlineIcon } from '@sanity/icons/InfoOutline';
import { defineArrayMember, defineField, defineType } from 'sanity';
import { linkAnnotation } from './linkAnnotation';

const CALLOUT_TONES = [
	{ title: 'Info', value: 'info' },
	{ title: 'Tip', value: 'tip' },
	{ title: 'Warning', value: 'warn' },
	{ title: 'Danger', value: 'danger' },
];

export const callout = defineType({
	name: 'callout',
	title: 'Callout',
	type: 'object',
	icon: InfoOutlineIcon,
	fields: [
		defineField({
			name: 'tone',
			type: 'string',
			title: 'Tone',
			options: { list: CALLOUT_TONES, layout: 'radio', direction: 'horizontal' },
			initialValue: 'info',
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: 'body',
			type: 'array',
			title: 'Body',
			of: [
				defineArrayMember({
					type: 'block',
					styles: [{ title: 'Normal', value: 'normal' }],
					lists: [
						{ title: 'Bullet', value: 'bullet' },
						{ title: 'Numbered', value: 'number' },
					],
					marks: {
						decorators: [
							{ title: 'Strong', value: 'strong' },
							{ title: 'Emphasis', value: 'em' },
							{ title: 'Code', value: 'code' },
						],
						annotations: [linkAnnotation],
					},
				}),
			],
			validation: (rule) => rule.required().min(1),
		}),
	],
	preview: {
		select: { tone: 'tone', body: 'body' },
		prepare({ tone, body }) {
			const firstBlock = (body ?? []).find(
				(block: { _type: string }) => block._type === 'block',
			) as { children?: { text?: string }[] } | undefined;
			const text = (firstBlock?.children ?? []).map((child) => child.text ?? '').join('');
			return {
				title: text || 'Callout',
				subtitle: `Callout · ${tone ?? 'info'}`,
			};
		},
	},
});
