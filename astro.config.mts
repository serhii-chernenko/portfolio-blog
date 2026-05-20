// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import keystatic from '@keystatic/astro';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const SITE = process.env.SITE_URL || 'https://serhiichernenko.com';

/**
 * Keystatic + base-path mode.
 *
 * Keystatic's Astro integration auto-mounts UI at `/keystatic` and API at
 * `/api/keystatic/*`. Its React client hardcodes ~20 root-relative paths to
 * `/api/keystatic/*`, with no `basePath` option. So when Astro `base: '/blog'`
 * is set, the UI loads at `/blog/keystatic` but its fetches hit `/api/keystatic/*`
 * (the apex) which 404s — UI renders blank.
 *
 * Dev / wrangler:dev:
 *   The `dev` and `build:local` npm scripts set KEYSTATIC=true. The base path
 *   collapses to apex and Keystatic's hardcoded API paths line up. Mode in
 *   keystatic.config.ts also reads KEYSTATIC=true and uses local kind — no
 *   GitHub auth, saves write straight to the filesystem.
 *
 * Production:
 *   `pnpm build` runs without KEYSTATIC, so base is `/blog` and Keystatic
 *   uses GitHub kind (OAuth via the GitHub App credentials set as wrangler
 *   secrets — see docs/KEYSTATIC.md). The base-path/API-path mismatch is
 *   solved by two pieces (no Keystatic fork needed):
 *     1. wrangler.jsonc binds the Worker to apex /api/keystatic[/*] routes
 *        in addition to /blog/*, so the UI's apex fetches reach this Worker.
 *     2. src/middleware.ts rewrites those apex requests to /blog/api/keystatic/*
 *        so Astro's router (which lives under base: '/blog') can serve them.
 */
const KEYSTATIC_DEV = process.env.KEYSTATIC === 'true';
const BASE_PATH = KEYSTATIC_DEV ? '/' : '/blog';

const integrations = [
	react(),
	markdoc(),
	sitemap({
		i18n: {
			defaultLocale: 'en',
			locales: { en: 'en-US', uk: 'uk-UA' },
		},
	}),
	keystatic(), // always loaded — dev uses base `/`, prod uses `/blog/`
];

// https://astro.build/config
export default defineConfig({
	site: SITE,
	base: BASE_PATH,
	output: 'server',
	adapter: cloudflare({
		platformProxy: { enabled: true },
		// 'passthrough' avoids bundling sharp into the Worker.
		imageService: 'passthrough',
	}),
	image: {
		// No-op service prevents sharp from being pulled into the bundle.
		service: { entrypoint: 'astro/assets/services/noop' },
	},
	i18n: {
		locales: ['en', 'uk'],
		defaultLocale: 'en',
		routing: {
			prefixDefaultLocale: true,
			redirectToDefaultLocale: true,
		},
	},
	integrations,
	vite: {
		plugins: [tailwindcss()],
		// Keystatic UI needs Vite to pre-bundle (CJS→ESM) react-dom/client and the
		// React Spectrum / Keystatic UI modules. Including them eagerly avoids the
		// "createRoot is not exported" runtime hydration error.
		optimizeDeps: {
			include: [
				'react',
				'react/jsx-runtime',
				'react-dom',
				'react-dom/client',
				'@keystatic/core/ui',
				'@keystatic/astro/ui',
			],
		},
	},
});
