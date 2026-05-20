/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
	interface Locals extends Runtime {}
}

interface Env {
	DB: D1Database;
	RATE_LIMIT: KVNamespace;
	ASSETS: Fetcher;
	/** Cloudflare Email Service binding — see `send_email` in wrangler.jsonc. */
	SEND_EMAIL: SendEmail;
	/** Sender address, e.g. "hello@blog.chernenko.digital". Set as a wrangler var. */
	MAIL_FROM: string;
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_CHAT_ID: string;
	SUBSCRIBE_RATE_LIMIT_SECRET: string;
	KEYSTATIC_GITHUB_CLIENT_ID: string;
	KEYSTATIC_GITHUB_CLIENT_SECRET: string;
	KEYSTATIC_SECRET: string;
	PUBLIC_KEYSTATIC_GITHUB_APP_SLUG: string;
	SITE_URL: string;
}

interface ImportMetaEnv {
	readonly PREVIEW_MODE?: string;
	readonly SITE_URL?: string;
	readonly PUBLIC_KEYSTATIC_GITHUB_APP_SLUG?: string;
	readonly PUBLIC_GISCUS_REPO?: string;
	readonly PUBLIC_GISCUS_REPO_ID?: string;
	readonly PUBLIC_GISCUS_CATEGORY?: string;
	readonly PUBLIC_GISCUS_CATEGORY_ID?: string;
	readonly PUBLIC_CF_ANALYTICS_TOKEN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
