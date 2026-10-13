// @ts-check
import type { AstroUserConfig } from 'astro';
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

const SITE = 'https://serhiichernenko.com';

const USE_NODE_DEV_ADAPTER = process.env.ASTRO_NODE_DEV === 'true';

type VitePlugin = Extract<
	NonNullable<NonNullable<AstroUserConfig['vite']>['plugins']>[number],
	{ name: string }
>;

const SANITY_UI_STYLES = '@sanity/ui/styles.css';
const INLINE_SANITY_UI_STYLES_ID = '\0inline-sanity-ui-styles.js';

/**
 * Astro hoists every stylesheet reachable from a client-only island into each page that
 * imports it, so the Visual Editing overlay's `@sanity/ui` CSS would ship render-blocking on
 * every public page. Importing it as an inline string defers it to the draft-mode-only chunk.
 */
function inlineSanityUiStyles(): VitePlugin {
	let stylesheetPath = '';
	return {
		name: 'inline-sanity-ui-styles',
		enforce: 'pre',
		async resolveId(source, importer) {
			if (source !== SANITY_UI_STYLES) return null;
			const resolved = await this.resolve(source, importer, { skipSelf: true });
			if (!resolved?.id.endsWith('.css')) return null;
			stylesheetPath = resolved.id;
			return INLINE_SANITY_UI_STYLES_ID;
		},
		load(id) {
			if (id !== INLINE_SANITY_UI_STYLES_ID) return null;
			return [
				`import css from ${JSON.stringify(`${stylesheetPath}?inline`)};`,
				"const style = document.createElement('style');",
				'style.textContent = css;',
				'document.head.append(style);',
			].join('\n');
		},
	};
}

const runtimeConfig = USE_NODE_DEV_ADAPTER
	? { adapter: node({ mode: 'standalone' }) }
	: {
			adapter: cloudflare({
				// 'passthrough' avoids bundling sharp into the Worker.
				imageService: 'passthrough',
			}),
			cache: { provider: cacheCloudflare() },
		};

export default defineConfig({
	site: SITE,
	base: '/blog',
	output: 'server',
	// Astro v7 defaults to 'jsx' whitespace collapsing between inline elements — pin true to keep v6 rendering behavior.
	compressHTML: true,
	// Reproduced in src/middleware.ts so RFC 8058 one-click unsubscribe POSTs
	// can receive a narrowly scoped exception without weakening other forms.
	security: {
		checkOrigin: false,
	},
	...runtimeConfig,
	image: {
		// No-op service prevents sharp from being pulled into the bundle.
		service: { entrypoint: 'astro/assets/services/noop' },
	},
	i18n: {
		locales: ['en', 'uk'],
		defaultLocale: 'en',
		routing: {
			prefixDefaultLocale: true,
			redirectToDefaultLocale: false,
		},
	},
	integrations: [react()],
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
			SANITY_API_READ_TOKEN: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
			}),
			SANITY_WEBHOOK_SECRET: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
			}),
			DRAFT_MODE_COOKIE_SECRET: envField.string({
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
			PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
				context: 'client',
				access: 'public',
				optional: true,
			}),
			PUBLIC_BING_SITE_VERIFICATION: envField.string({
				context: 'client',
				access: 'public',
				optional: true,
			}),
		},
	},
	vite: {
		plugins: [tailwindcss(), inlineSanityUiStyles()],
		optimizeDeps: {
			include: [
				'react',
				'react/jsx-runtime',
				'react-dom',
				'react-dom/client',
				'@react-email/editor',
			],
		},
	},
});
