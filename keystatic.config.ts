import { config, fields, collection } from '@keystatic/core';
import { block, wrapper } from '@keystatic/core/content-components';
import { createElement, type ReactNode } from 'react';

const isProd = process.env.NODE_ENV === 'production';

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
	storage: isProd
		? {
				kind: 'github',
				repo: 'serhii-chernenko/portfolio-blog',
				branchPrefix: 'post/',
			}
		: { kind: 'local' },

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
