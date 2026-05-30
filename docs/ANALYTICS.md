# Analytics Engine — Newsletter Funnel Metrics

This document covers the server-side Analytics Engine integration, which runs alongside Cloudflare Web Analytics (the client-side RUM layer). Web Analytics is injected **automatically** by Cloudflare's edge for the proxied zone — there is no beacon script or `PUBLIC_CF_ANALYTICS_TOKEN` in this app.

---

## Architecture overview

| Layer | System | What it measures |
|---|---|---|
| Client-side | Cloudflare Web Analytics (auto-injected at the edge) | Pageviews, referrers, country, device/browser, Core Web Vitals |
| Server-side | Cloudflare Analytics Engine | Newsletter funnel events (subscribe / confirm / unsubscribe) |

These two systems are complementary, not substitutes. Web Analytics (auto-injected by Cloudflare's edge — no app code or token) captures visitor RUM from the browser; Analytics Engine records lifecycle events that happen in API routes where no client JS runs (e.g. a user clicking the confirmation link in their email app).

---

## Binding and dataset

| Field | Value |
|---|---|
| Binding name | `ANALYTICS` |
| Dataset name | `portfolio_blog_events` |
| Retention | ~3 months |

The dataset is **auto-created on first write** — no separate provisioning step is needed (unlike D1 or KV, which require `REPLACE_WITH_REAL_ID` values).

After modifying `wrangler.jsonc`, regenerate types:

```sh
pnpm exec wrangler types
```

---

## Events tracked

| Event name (blob1) | Trigger | Dimensions |
|---|---|---|
| `subscribe_pending` | `upsertPendingSubscriber` succeeds + confirmation email sent | locale, source, status='pending' |
| `subscribe_confirmed` | `markConfirmed` succeeds | locale, status='confirmed' |
| `unsubscribed` | `markUnsubscribed` succeeds | locale, status='unsubscribed' |

### Data point shape

```
blobs:   [event_name, locale, source, status]
doubles: [count]           // always 1 per event
indexes: [event_name]      // sampling key — low-cardinality, non-PII
```

---

## No-PII rule (strictly enforced)

The `trackEvent()` helper in `src/lib/analytics.ts` accepts only `AnalyticsFields`, which is typed to allow only:

- `locale` — `'en'` or `'uk'`
- `source` — a referral label, normalized against an allowlist (`home`, `subscribe-page`, `inline`); anything unrecognized (including tampered request bodies) collapses to `other`, so `blob3` stays a small fixed set
- `status` — a fixed status string (`'pending'`, `'confirmed'`, `'unsubscribed'`)
- `count` — a numeric override (defaults to 1)

The following are **never** written to Analytics Engine:

- Email addresses
- Raw IP addresses or ip_hash
- Confirmation/unsubscribe tokens
- User-agent strings
- Any free-form user input

The `indexes` field is the sampling key. It **must** remain low-cardinality and non-identifying (the event name). Placing user IDs, emails, or high-cardinality data in `indexes` both breaks adaptive sampling and risks PII leakage into Cloudflare systems.

---

## Local development caveat

`writeDataPoint()` is **not emulated** in plain `wrangler dev` (Cloudflare issue #4258). When the `ANALYTICS` binding is absent, `trackEvent()` is a silent no-op — requests are never blocked or slowed. A `console.warn()` is emitted once per request to indicate metrics are not being recorded.

To test Analytics Engine locally, use remote mode:

```sh
wrangler dev --remote
```

---

## Querying (SQL over HTTP — no dashboard)

There is no built-in dashboard for Analytics Engine. Query via the Cloudflare SQL API:

```
POST https://api.cloudflare.com/client/v4/accounts/<account_id>/analytics_engine/sql
Authorization: Bearer <token>
Content-Type: application/json
```

The bearer token requires the **"Account Analytics: Read"** permission.

### Example queries

**Weekly funnel by event and locale:**

```sql
SELECT blob1 AS event, blob2 AS locale,
       SUM(_sample_interval) AS events
FROM portfolio_blog_events
WHERE timestamp > NOW() - INTERVAL '7' DAY
GROUP BY event, locale
FORMAT JSON
```

**All-time totals:**

```sql
SELECT blob1 AS event, SUM(_sample_interval) AS total
FROM portfolio_blog_events
GROUP BY event
FORMAT JSON
```

**Check if sampling is active (sample_interval > 1 means data is being sampled):**

```sql
SELECT blob1 AS event, timestamp,
       SUM(_sample_interval) AS weight
FROM portfolio_blog_events
WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY event, timestamp
HAVING SUM(_sample_interval) > 1
FORMAT JSON
```

### Sampling notes

Analytics Engine uses adaptive sampling keyed on `indexes[0]` (the event name). At personal-blog newsletter volumes this is well below sampling thresholds. Even when sampling is active, correct totals are recovered by weighting with `_sample_interval` (as shown in the queries above). Do not use raw row counts — always use `SUM(_sample_interval)`.

---

## Reliability characteristics

- **Non-blocking**: `writeDataPoint()` returns immediately; the runtime flushes in the background. It is intentionally not awaited.
- **Never throws**: `trackEvent()` wraps all calls in try/catch. A metrics failure cannot affect the subscribe/confirm/unsubscribe request path.
- **Best-effort**: Events are not durable. If the worker terminates before flush (rare), some events may not be recorded. This is acceptable for aggregate analytics. For durable event ledgers, add a D1 INSERT alongside `trackEvent()`.
- **No feature flag**: To disable analytics, remove the `trackEvent()` calls from the three API routes. The binding can remain in `wrangler.jsonc` without effect.

---

## Privacy statement

`src/pages/[...locale]/privacy.astro` discloses this system in the Analytics section (both EN and UK locales). The disclosure explicitly states:

- What dimensions are recorded (event type, language, referral source)
- What is never recorded (email, IP, tokens, browser info)
- Approximate retention (~3 months)

This is consistent with the site's cookieless/no-PII analytics posture. No consent banner is required since no personal data is processed.
