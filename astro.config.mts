// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import keystatic from '@keystatic/astro';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const SITE = process.env.SITE_URL || 'https://chernenko.digital';

/**
 * Keystatic + base-path mode.
 *
 * Keystatic's Astro integration auto-mounts UI at `/keystatic` and API at
 * `/api/keystatic/*`. Its React client hardcodes ~20 root-relative paths to
 * `/api/keystatic/*`, with no `basePath` option. So when Astro `base: '/blog'`
 * is set, the UI loads at `/blog/keystatic` but its fetches hit `/api/keystatic/*`
 * (the apex) which 404s — UI renders blank.
 *
 * Resolution (development):
 *   `pnpm dev` and `pnpm wrangler:dev` set KEYSTATIC=true, which makes Astro
 *   serve at the apex (no `/blog/` prefix). Keystatic UI at /keystatic works
 *   cleanly because its hardcoded API paths line up.
 *
 * Resolution (production):
 *   The integration is always loaded (to support GitHub-mode editing). With
 *   base `/blog`, Keystatic UI is at `/blog/keystatic`. The UI's hardcoded API
 *   paths require either:
 *     (a) a CF Worker-level rewrite of `/api/keystatic/*` → `/blog/api/...`, or
 *     (b) running prod also at the apex via a `blog.chernenko.digital` subdomain
 *     (c) patching @keystatic/core/ui (~20 hardcoded paths — fragile)
 *   Documented in README. The user opted to handle prod setup when ready to deploy.
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
