/// <reference path="../.astro/types.d.ts" />
/// <reference path="../worker-configuration.d.ts" />

// @astrojs/cloudflare v13: locals.runtime is removed.
// The adapter now only provides `cfContext` (ExecutionContext) in locals.
// Bindings are accessed via `import { env } from 'cloudflare:workers'`.
type Runtime = import('@astrojs/cloudflare').Runtime;

declare namespace App {
	interface Locals extends Runtime {}
}

interface ImportMetaEnv {
	readonly PREVIEW_MODE?: string;
	/**
	 * Drives Keystatic storage kind AND Astro base path. Set to `'local'`
	 * by `pnpm dev` only. Unset for `pnpm wrangler:dev` and `pnpm build`
	 * (both use GitHub OAuth and base `/blog`).
	 */
	readonly PUBLIC_KEYSTATIC_MODE?: 'local';
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
