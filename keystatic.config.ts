import { config, fields, collection } from '@keystatic/core';
import { block, wrapper } from '@keystatic/core/content-components';
import { createElement, type ReactNode } from 'react';

// Mode selection.
//
//   Local kind: ONLY `pnpm dev` (Astro dev server, real Node.js). Sets
//   PUBLIC_KEYSTATIC_MODE=local, which also flips Astro's base path to apex
//   in `astro.config.mts` so Keystatic's hardcoded /api/keystatic/* paths
//   line up. Saves write directly to `src/content/posts/{en,uk}/`.
//
//   Keystatic's local storage requires `fs`, so it cannot run inside a
//   Cloudflare Worker — that rules out `pnpm wrangler:dev` and production.
//
//   GitHub kind: `pnpm wrangler:dev` AND deployed Worker (production).
//   The flag is unset, base path is `/blog`, and the integration uses the
//   GitHub App credentials. For `wrangler:dev` they come from `.dev.vars`;
//   for production they come from `wrangler secret put`. Authentication
//   runs via GitHub OAuth; commits go to branches with the `post/` prefix
//   and open PRs.
//
//   `import.meta.env.PUBLIC_*` is the Astro idiom: Vite substitutes it at
//   build time into both server and client bundles, so the storage kind is a
//   literal in the shipped output (no runtime `process.env` lookup that
//   wouldn't survive into the browser).
//
//   See docs/KEYSTATIC.md for the full secret/setup checklist.
const useLocal = import.meta.env.PUBLIC_KEYSTATIC_MODE === 'local';

// Repo for GitHub mode. Must match the actual GitHub repo where content lives,
// i.e. the same repo the deployed app is built from.
const GITHUB_REPO = 'serhii-chernenko/portfolio-blog';

const markdocComponents = {
	callout: wrapper({
		label: 'Callout',
		schema: {
			type: fields.select({
				label: 'Type',
				defaultValue: 'info',
				options: [
					{ label: 'Info', value: 'info' },
					{ label: 'Tip', value: 'tip' },
					{ label: 'Warning', value: 'warn' },
					{ label: 'Danger', value: 'danger' },
				],
			}),
		},
		ContentView: ({ value, children }) =>
			createElement(
				'div',
				{
					style: {
						borderLeft: '4px solid var(--ks-colors-border-accent)',
						padding: '12px 16px',
						margin: '12px 0',
						background: 'var(--ks-colors-background-secondary)',
						borderRadius: '8px',
					},
				},
				createElement(
					'div',
					{
						style: {
							fontSize: '12px',
							fontWeight: 600,
							letterSpacing: '0.04em',
							textTransform: 'uppercase',
							marginBottom: '8px',
						},
					},
					value.type
				),
				children as ReactNode
			),
	}),
	youtube: block({
		label: 'YouTube',
		schema: {
			id: fields.text({
				label: 'Video ID',
				validation: { isRequired: true },
			}),
			title: fields.text({
				label: 'Title',
				defaultValue: '',
			}),
		},
		ContentView: ({ value }) =>
			createElement(
				'div',
				{
					style: {
						padding: '12px 16px',
						margin: '12px 0',
						background: 'var(--ks-colors-background-secondary)',
						border: '1px solid var(--ks-colors-border-muted)',
						borderRadius: '8px',
					},
				},
				`YouTube embed: ${value.title || value.id}`
			),
	}),
};

export default config({
	storage: useLocal
		? { kind: 'local' }
		: {
				kind: 'github',
				repo: GITHUB_REPO,
				branchPrefix: 'post/',
			},

	ui: {
		brand: {
			name: 'Serhii Chernenko · Blog',
			mark: () => createElement('span', null, '✍️'),
		},
	},

	collections: {
		postsEn: collection({
			label: 'Posts (English)',
			// `slugField: 'title'` tells Keystatic to use the `title` field's slug part
			// as the filename. `fields.slug` is a COMPOUND field: it renders a name
			// input AND a slug input derived from it. So one field, two UI inputs —
			// no separate `slug` field needed.
			slugField: 'title',
			path: 'src/content/posts/en/*',
			format: { contentField: 'content' },
			schema: {
				title: fields.slug({
					name: {
						label: 'Title',
						validation: { length: { min: 1, max: 120 } },
					},
					slug: {
						label: 'Slug',
						description: 'URL slug — auto-generated from the title. Override if needed.',
					},
				}),
				translationKey: fields.text({
					label: 'Translation Key',
					description: 'Shared identifier across translations of the same article.',
					validation: { length: { min: 1, max: 80 } },
				}),
				description: fields.text({
					label: 'Description',
					multiline: true,
					validation: { length: { min: 50, max: 200 } },
				}),
				publishedAt: fields.datetime({ label: 'Published at' }),
				updatedAt: fields.datetime({ label: 'Updated at' }),
				tags: fields.array(fields.text({ label: 'Tag' }), {
					label: 'Tags',
					itemLabel: (props) => props.value,
				}),
				heroImage: fields.image({
					label: 'Hero image',
					directory: 'src/assets/posts',
					publicPath: '/src/assets/posts/',
				}),
				heroImageAlt: fields.text({ label: 'Hero image alt text' }),
				draft: fields.checkbox({ label: 'Draft', defaultValue: true }),
				content: fields.markdoc({
					label: 'Content',
					components: markdocComponents,
					options: {
						image: {
							directory: 'src/assets/posts',
							publicPath: '/src/assets/posts/',
						},
					},
				}),
			},
		}),

		postsUk: collection({
			label: 'Статті (Українською)',
			slugField: 'title',
			path: 'src/content/posts/uk/*',
			format: { contentField: 'content' },
			schema: {
				title: fields.slug({
					name: {
						label: 'Заголовок',
						validation: { length: { min: 1, max: 120 } },
					},
					slug: {
						label: 'Slug',
						description: 'URL slug — генерується автоматично, можна змінити вручну.',
					},
				}),
				translationKey: fields.text({
					label: 'Translation Key',
					description: 'Спільний ідентифікатор для перекладів однієї статті.',
					validation: { length: { min: 1, max: 80 } },
				}),
				description: fields.text({
					label: 'Опис',
					multiline: true,
					validation: { length: { min: 50, max: 200 } },
				}),
				publishedAt: fields.datetime({ label: 'Опубліковано' }),
				updatedAt: fields.datetime({ label: 'Оновлено' }),
				tags: fields.array(fields.text({ label: 'Тег' }), {
					label: 'Теги',
					itemLabel: (props) => props.value,
				}),
				heroImage: fields.image({
					label: 'Головне зображення',
					directory: 'src/assets/posts',
					publicPath: '/src/assets/posts/',
				}),
				heroImageAlt: fields.text({ label: 'Alt тексту' }),
				draft: fields.checkbox({ label: 'Чернетка', defaultValue: true }),
				content: fields.markdoc({
					label: 'Текст статті',
					components: markdocComponents,
					options: {
						image: {
							directory: 'src/assets/posts',
							publicPath: '/src/assets/posts/',
						},
					},
				}),
			},
		}),
	},
});
