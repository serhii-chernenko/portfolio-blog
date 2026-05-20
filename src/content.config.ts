import { defineCollection, z } from 'astro:content';
import type { SchemaContext } from 'astro:content';
import { glob } from 'astro/loaders';

const postSchema = ({ image }: SchemaContext) =>
	z.object({
		title: z.string().min(1).max(120),
		slug: z.string().optional(),
		description: z.string().min(50).max(200),
		translationKey: z.string().regex(/^[a-z0-9-]+$/),
		publishedAt: z.coerce.date(),
		updatedAt: z.coerce.date().optional(),
		tags: z.array(z.string()).default([]),
		heroImage: image().optional(),
		heroImageAlt: z.string().optional(),
		draft: z.boolean().default(true),
	});

const postsEn = defineCollection({
	loader: glob({ pattern: '*.mdoc', base: './src/content/posts/en' }),
	schema: postSchema,
});

const postsUk = defineCollection({
	loader: glob({ pattern: '*.mdoc', base: './src/content/posts/uk' }),
	schema: postSchema,
});

export const collections = { postsEn, postsUk };
