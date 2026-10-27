import { definePlugin } from 'emdash';
import { SITE_PLUGIN_ID, SITE_PLUGIN_VERSION } from './descriptor';
import { slugPolicyViolation } from './slug-policy';

export { sitePlugin } from './descriptor';

const CALLOUT_TONES = [
	{ label: 'Info', value: 'info' },
	{ label: 'Tip', value: 'tip' },
	{ label: 'Warning', value: 'warn' },
	{ label: 'Danger', value: 'danger' },
];

/**
 * Runtime entry loaded by EmDash. Declares the blog's custom Portable Text blocks for the admin
 * editor (the public site renders them with its own components) and the publish side effects
 * that used to live in the Sanity webhook: the first-publish Telegram ping and IndexNow. Also
 * enforces the slug rules the Sanity Studio used to validate (see ./slug-policy.ts), and sends a
 * Telegram message for new comments.
 */
export function createPlugin() {
	return definePlugin({
		id: SITE_PLUGIN_ID,
		version: SITE_PLUGIN_VERSION,
		capabilities: ['content:read', 'users:read', 'hooks.content-policy:register'],
		admin: {
			portableTextBlocks: [
				{
					type: 'callout',
					label: 'Callout',
					icon: 'info',
					description: 'Highlighted note: info, tip, warning or danger',
					category: 'Sections',
					fields: [
						{
							type: 'select',
							action_id: 'tone',
							label: 'Tone',
							options: CALLOUT_TONES,
							initial_value: 'info',
						},
						{
							type: 'text_input',
							action_id: 'text',
							label: 'Text',
							multiline: true,
							placeholder:
								'Markdown: **bold**, _italic_, `code`, [link](https://…), "- " bullets, "1. " numbers',
						},
					],
				},
				{
					type: 'youtube',
					label: 'YouTube video',
					icon: 'video',
					description: 'Privacy-friendly youtube-nocookie.com embed',
					category: 'Embeds',
					fields: [
						{
							type: 'text_input',
							action_id: 'id',
							label: 'Video ID',
							placeholder: 'The part after v= in the YouTube URL',
						},
						{ type: 'text_input', action_id: 'title', label: 'Title' },
					],
				},
			],
		},
		hooks: {
			'content:beforePublish': async (event) => {
				const reason = slugPolicyViolation(event.collection, event.content.slug);
				return reason ? { cancel: true, reason } : undefined;
			},
			'content:beforeSchedule': async (event) => {
				const reason = slugPolicyViolation(event.collection, event.content.slug);
				return reason ? { cancel: true, reason } : undefined;
			},
			'comment:afterCreate': async (event, ctx) => {
				const { handleCommentCreated } = await import('../../../src/lib/comment-hooks');
				handleCommentCreated(
					{ comment: event.comment, content: event.content },
					{ siteUrl: ctx.site.url, log: ctx.log },
				);
			},
			'content:afterPublish': async (event, ctx) => {
				const { handleContentPublished } = await import('../../../src/lib/publish-hooks');
				await handleContentPublished(
					{ collection: event.collection, content: event.content },
					{ siteUrl: ctx.site.url, kv: ctx.kv, log: ctx.log },
				);
			},
		},
	});
}

export default createPlugin;
