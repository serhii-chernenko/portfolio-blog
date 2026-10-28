/// <reference path="../.astro/types.d.ts" />
/// <reference path="../worker-configuration.d.ts" />

// @astrojs/cloudflare v13: locals.runtime is removed.
// The adapter now only provides `cfContext` (ExecutionContext) in locals.
// Bindings are accessed via `import { env } from 'cloudflare:workers'`.
type Runtime = import('@astrojs/cloudflare').Runtime;

declare namespace App {
	interface Locals extends Runtime {
		cms: import('./lib/cms/context').CmsContext;
		uiOverrides?: import('./i18n/utils').UiOverrides;
		/** Route-cache tags this route depends on beyond the layout (see LAYOUT_CACHE_TAGS). */
		cacheTags?: string[];
	}
}
