/// <reference path="../.astro/types.d.ts" />
/// <reference path="../worker-configuration.d.ts" />

// @astrojs/cloudflare v13: locals.runtime is removed.
// The adapter now only provides `cfContext` (ExecutionContext) in locals.
// Bindings are accessed via `import { env } from 'cloudflare:workers'`.
type Runtime = import('@astrojs/cloudflare').Runtime;

declare namespace App {
	interface Locals extends Runtime {
		sanity: import('./lib/sanity/request').SanityContext;
	}
}
