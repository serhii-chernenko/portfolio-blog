// Worker entry: the Astro handler plus EmDash's Cron Trigger handler, which publishes
// scheduled entries and runs CMS maintenance (wrangler.jsonc `triggers.crons`).
import handler, { createScheduledHandler, PluginBridge } from '@emdash-cms/cloudflare/worker';

export { PluginBridge };

export default {
	...handler,
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
