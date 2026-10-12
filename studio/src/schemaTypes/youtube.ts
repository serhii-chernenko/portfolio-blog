import { PlayIcon } from '@sanity/icons/Play';
import { defineField, defineType } from 'sanity';

export const youtube = defineType({
	name: 'youtube',
	title: 'YouTube video',
	type: 'object',
	icon: PlayIcon,
	fields: [
		defineField({
			name: 'videoId',
			type: 'string',
			title: 'Video ID',
			description: 'The part after v= in the YouTube URL',
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: 'title',
			type: 'string',
			title: 'Title',
		}),
	],
	preview: {
		select: { title: 'title', videoId: 'videoId' },
		prepare({ title, videoId }) {
			return {
				title: title || 'YouTube video',
				subtitle: videoId,
			};
		},
	},
});
