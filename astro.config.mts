// @ts-check
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import keystatic from '@keystatic/astro';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Canonical production URL — used at build time for sitemap.xml and RSS
// absolute links. Runtime URLs are derived from the incoming request, so
// preview Workers and local `wrangler dev` produce self-referential links.
const SITE = 'https://www.serhiichernenko.com';

/**
 * Keystatic + base-path mode.
 *
 * Keystatic's Astro integration auto-mounts UI at `/keystatic` and API at
 * `/api/keystatic/*`. Its React client hardcodes ~20 root-relative paths to
 * `/api/keystatic/*`, with no `basePath` option. So when Astro `base: '/blog'`
 * is set, the UI loads at `/blog/keystatic` but its fetches hit `/api/keystatic/*`
 * (the apex) which 404s — UI renders blank.
 *
 * `pnpm dev` (Astro dev server, Node.js):
 *   Sets PUBLIC_KEYSTATIC_MODE=local. Base path collapses to apex so
 *   Keystatic's hardcoded API paths line up. keystatic.config.ts reads the
 *   same flag and uses local kind — no GitHub auth, saves write straight to
 *   `src/content/posts/{en,uk}/`. Only works in a real Node.js process
 *   (Keystatic's local storage requires `fs`).
 *
 * `pnpm wrangler:dev` and production (Cloudflare Worker runtime):
 *   The flag is unset, so base is `/blog` and Keystatic uses GitHub kind
 *   (OAuth via the GitHub App credentials — wrangler secrets in prod,
 *   `.dev.vars` for `wrangler:dev`; see docs/KEYSTATIC.md). The Worker
 *   runtime isn't Node.js, so local storage isn't an option there. The
 *   base-path/API-path mismatch is solved by two pieces:
 *     1. wrangler.jsonc binds the Worker to apex /api/keystatic[/*] routes
 *        in addition to /blog/*, so the UI's apex fetches reach this Worker.
 *     2. src/middleware.ts rewrites those apex requests to /blog/api/keystatic/*
 *        so Astro's router (which lives under base: '/blog') can serve them.
 */
// astro.config.mts runs in Node before Vite kicks in, so it reads from
// `process.env`. The same flag is read by keystatic.config.ts via
// `import.meta.env` (which Vite inlines at build time) and by middleware.ts.
const LOCAL_MODE = process.env.PUBLIC_KEYSTATIC_MODE === 'local';
const BASE_PATH = LOCAL_MODE ? '/' : '/blog';

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
	// Reproduced in src/middleware.ts so RFC 8058 one-click unsubscribe POSTs
	// can receive a narrowly scoped exception without weakening other forms.
	security: {
		checkOrigin: false,
	},
	// Adapter is mode-dependent. `pnpm dev` (PUBLIC_KEYSTATIC_MODE=local) needs the
	// Node runtime: Keystatic local storage reads/writes src/content via `fs`, which
	// the Cloudflare adapter's `astro dev` can't provide since v13 (it runs on the
	// workerd runtime, no `fs`). Everything else — `wrangler:dev`, `build`,
	// production — uses the Cloudflare adapter (workerd). See keystatic.config.ts.
	adapter: LOCAL_MODE
		? node({ mode: 'standalone' })
		: cloudflare({
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
	env: {
		// validateSecrets defaults to false — so production CI builds without secrets present are fine.
		// astro:env validates secrets at runtime (worker startup), not build time.
		schema: {
			// ── Server secrets (from .dev.vars in dev / wrangler secret put in prod) ──
			SUBSCRIBE_RATE_LIMIT_SECRET: envField.string({
				context: 'server',
				access: 'secret',
				// Tokens and keyed abuse hashes derive from this root secret. Enforce
				// the documented minimum rather than accepting a merely non-empty key.
				min: 32,
			}),
			TELEGRAM_BOT_TOKEN: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
			}),
			TELEGRAM_CHAT_ID: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
			}),
			// ── Client public vars (build-inlined from process.env via dotenv-cli) ──
			PUBLIC_GISCUS_REPO: envField.string({
				context: 'client',
				access: 'public',
				optional: true,
			}),
			PUBLIC_GISCUS_REPO_ID: envField.string({
				context: 'client',
				access: 'public',
				optional: true,
			}),
			PUBLIC_GISCUS_CATEGORY: envField.string({
				context: 'client',
				access: 'public',
				optional: true,
			}),
			PUBLIC_GISCUS_CATEGORY_ID: envField.string({
				context: 'client',
				access: 'public',
				optional: true,
			}),
		},
	},
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
				'@react-email/editor',
			],
		},
	},
});
