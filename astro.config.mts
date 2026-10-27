// @ts-check
import type { AstroIntegration } from 'astro';
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import emdash, { local } from 'emdash/astro';
import { sqlite } from 'emdash/db';
import { d1, r2 } from '@emdash-cms/cloudflare';
import { sitePlugin } from '@portfolio-blog/emdash-site/descriptor';

const SITE = 'https://serhiichernenko.com';

const USE_NODE_DEV_ADAPTER = process.env.ASTRO_NODE_DEV === 'true';

/**
 * Every blog URL starts with /blog (production binds `/blog*` to this Worker). The pages live
 * under `src/pages/blog/` and `public/blog/` instead of using Astro's `base` option, because
 * EmDash mounts its admin and API at the host root (`/_emdash/...`) and does not support a base
 * path. Built assets go under /blog/_astro so they stay on the blog's routes too.
 */
const BLOG_PATH = '/blog';
const EMDASH_PATH_PREFIX = '/_emdash';

const DEV_ADMIN_ROUTES = [
	{
		pattern: `${BLOG_PATH}/admin/emails`,
		entrypoint: './src/dev-routes/emails/index.astro',
		prerender: false,
	},
	{
		pattern: `${BLOG_PATH}/admin/emails/[slug]`,
		entrypoint: './src/dev-routes/emails/[slug].astro',
		prerender: false,
	},
];

/**
 * Astro's i18n router 404s every page route outside a locale prefix, but exempts routes injected
 * by integrations. The local admin lives outside `src/pages` and is injected only for `astro dev`,
 * so production builds contain no admin routes at all.
 */
function devAdminRoutes(): AstroIntegration {
	return {
		name: 'dev-admin-routes',
		hooks: {
			'astro:config:setup': ({ command, injectRoute }) => {
				if (command !== 'dev') return;
				for (const route of DEV_ADMIN_ROUTES) injectRoute(route);
			},
		},
	};
}

/**
 * `pnpm dev` runs on the Node adapter, so EmDash uses a local SQLite file and `./uploads`. The
 * Cloudflare build (production and `pnpm wrangler:dev`) uses the `CMS_DB` D1 database and the
 * `MEDIA` R2 bucket declared in wrangler.jsonc.
 */
const cmsStorageConfig = USE_NODE_DEV_ADAPTER
	? {
			database: sqlite({ url: 'file:./data.db' }),
			storage: local({ directory: './uploads', baseUrl: `${EMDASH_PATH_PREFIX}/api/media/file` }),
		}
	: {
			database: d1({ binding: 'CMS_DB', session: 'auto' }),
			storage: r2({ binding: 'MEDIA' }),
		};

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
	build: {
		assets: `${BLOG_PATH.slice(1)}/_astro`,
	},
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
		// Every public URL carries its locale (`/blog/en/...`, `/blog/uk/...`) and the routes under
		// `src/pages/[locale]/` resolve it themselves. 'manual' keeps those URLs while leaving the
		// EmDash admin routes alone: prefixing the default locale would 404 `/_emdash/admin`.
		routing: 'manual',
	},
	integrations: [
		react(),
		emdash({
			...cmsStorageConfig,
			plugins: [sitePlugin()],
			// The public pages render their own markup and are route-cached; editors preview drafts
			// through "View on site" links instead of the injected visual-editing toolbar.
			toolbar: false,
			// The site keeps Astro's no-op image service (no sharp in the Worker bundle).
			images: false,
		}),
		devAdminRoutes(),
	],
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
		plugins: [tailwindcss()],
		define: {
			// The admin "View on site" link signs a preview token for the entry's database ID and
			// opens this path; src/pages/blog/preview/[collection]/[id].ts redirects it to the public URL.
			'import.meta.env.EMDASH_PREVIEW_PATH_PATTERN': JSON.stringify(
				`${BLOG_PATH}/preview/{collection}/{id}`,
			),
		},
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
