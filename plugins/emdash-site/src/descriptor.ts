import type { PluginDescriptor } from 'emdash';

export const SITE_PLUGIN_ID = 'portfolio-site';
export const SITE_PLUGIN_VERSION = '1.0.0';

/**
 * Build-time descriptor, imported by `astro.config.mts`. Kept free of runtime imports so
 * evaluating the Astro config never loads the hook code (which reads Worker secrets).
 */
export function sitePlugin(): PluginDescriptor {
	return {
		id: SITE_PLUGIN_ID,
		version: SITE_PLUGIN_VERSION,
		format: 'native',
		entrypoint: '@portfolio-blog/emdash-site',
		options: {},
	};
}
