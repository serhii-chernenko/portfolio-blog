import { env } from 'cloudflare:workers';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Newsletter lifecycle events tracked server-side via Cloudflare Analytics Engine.
 * Keep this union low-cardinality — it is the sampling key (indexes[0]).
 */
export type EventName = 'subscribe_pending' | 'subscribe_confirmed' | 'unsubscribed';

/**
 * Non-identifying dimensions allowed in trackEvent() calls.
 *
 * STRICT PII RULE — the following MUST NEVER be passed here:
 *   - email address
 *   - raw IP, ip_hash, or any derivative of IP
 *   - confirm/unsubscribe tokens
 *   - user-agent strings or any free-form user input
 *
 * Only low-cardinality, non-identifying labels are permitted.
 */
export interface AnalyticsFields {
	/** Site locale — one of the supported locale codes. */
	locale: 'en' | 'uk';
	/**
	 * Short referral label. Callers may pass the raw value from the subscribe
	 * request body — it is normalized against KNOWN_SOURCES before being written
	 * (anything unrecognized collapses to 'other'), so a tampered body can never
	 * pollute the dataset with high-cardinality / attacker-controlled strings.
	 */
	source?: string;
	/** Lifecycle status matching the event (e.g. 'pending', 'confirmed', 'unsubscribed'). */
	status?: string;
	/** Explicit count override; defaults to 1. */
	count?: number;
}

// ── Source allowlist (bounds blob cardinality; defends against polluted input) ─

/**
 * Recognized referral-source labels emitted by the frontend SubscribeForm
 * (`home`, `subscribe-page`, and the inline default). Anything else — including
 * a user-tampered request body — collapses to 'other', keeping blob3 a small,
 * fixed set and closing the dataset-pollution vector.
 */
const KNOWN_SOURCES = ['home', 'subscribe-page', 'inline'] as const;

function normalizeSource(source?: string): string {
	return source != null && (KNOWN_SOURCES as readonly string[]).includes(source) ? source : 'other';
}

// ── Accessor ─────────────────────────────────────────────────────────────────

// Warn at most once per isolate (not once per request) when the binding is
// absent — keeps local-dev logs readable without changing production behaviour.
let warnedBindingMissing = false;

/**
 * Returns the ANALYTICS binding when available, undefined otherwise.
 *
 * The binding is absent in two expected scenarios:
 *   1. Local `pnpm dev` (Astro Node adapter — no Worker runtime).
 *   2. Plain `wrangler dev` without --remote (Cloudflare issue #4258:
 *      writeDataPoint() is a no-op / the binding is not emulated locally).
 *
 * In both cases the caller receives undefined and trackEvent() becomes a
 * silent no-op — requests are never blocked or slowed by missing analytics.
 */
function getAnalytics(): AnalyticsEngineDataset | undefined {
	const ds = (env as { ANALYTICS?: AnalyticsEngineDataset }).ANALYTICS;
	if (!ds && !warnedBindingMissing) {
		// Warn once per isolate so developers know analytics are silent locally.
		// This is intentional: writeDataPoint() is not supported in local dev.
		warnedBindingMissing = true;
		console.warn(
			'[analytics] Analytics Engine binding (ANALYTICS) unavailable; ' +
				'metrics are a no-op in this environment. ' +
				'Use `wrangler dev --remote` or deploy to Cloudflare Workers to record events.',
		);
	}
	return ds;
}

// ── Fire-and-forget event tracker ────────────────────────────────────────────

/**
 * Records a single newsletter lifecycle event to Cloudflare Analytics Engine.
 *
 * Design constraints:
 *   - NEVER throws into the caller — analytics must never break a request.
 *   - NEVER awaited — writeDataPoint() is non-blocking by design; the runtime
 *     flushes it in the background (see Cloudflare docs).
 *   - NEVER receives PII — the AnalyticsFields type enforces this at call sites.
 *
 * Data point shape:
 *   blobs:   [event, locale, source, status]  (string dimensions)
 *   doubles: [count]                           (numeric metric)
 *   indexes: [event]                           (sampling key — MUST be
 *                                              low-cardinality, non-identifying)
 *
 * Querying (no built-in dashboard — use the SQL HTTP API):
 *   POST https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql
 *   Authorization: Bearer <token with "Account Analytics: Read">
 *
 *   Example — weekly funnel:
 *     SELECT blob1 AS event, blob2 AS locale,
 *            SUM(_sample_interval) AS events
 *     FROM portfolio_blog_events
 *     WHERE timestamp > NOW() - INTERVAL '7' DAY
 *     GROUP BY event, locale
 *     FORMAT JSON
 *
 * Sampling note:
 *   Analytics Engine uses adaptive sampling keyed on `indexes[0]` (the event
 *   name). At personal-blog newsletter volumes you will be well below the
 *   sampling threshold. Even when sampling is active, totals are correct via
 *   SUM(_sample_interval). See docs/ANALYTICS.md for details.
 *
 * DANGER — indexes field rules:
 *   indexes is the sampling key and MUST be low-cardinality, non-identifying.
 *   Do NOT put user IDs, emails, IPs, tokens, or high-variance data in indexes;
 *   doing so breaks sampling and risks PII leakage into Cloudflare systems.
 */
export function trackEvent(event: EventName, fields: AnalyticsFields): void {
	try {
		const ds = getAnalytics();
		if (!ds) return;
		// intentionally not awaited — writeDataPoint() is non-blocking
		ds.writeDataPoint({
			blobs: [event, fields.locale, normalizeSource(fields.source), fields.status ?? ''],
			doubles: [fields.count ?? 1],
			indexes: [event], // single, low-cardinality, NON-PII sampling key
		});
	} catch {
		// Analytics failures must never propagate to the request path.
		// Errors are silently swallowed here by design.
	}
}
