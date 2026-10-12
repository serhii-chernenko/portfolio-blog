# Observability: evlog → New Relic

The blog emits structured [evlog](https://www.npmjs.com/package/evlog) wide events and ships
production events to New Relic EU through evlog's OTLP drain, the same way the `princess` and
`wishlist` Workers do. This runs **alongside** the existing signals, not instead of them:

| Signal                        | Scope                                                                    | Where                |
| ----------------------------- | ------------------------------------------------------------------------ | -------------------- |
| Cloudflare Web Analytics      | Anonymous page-view totals                                               | Cloudflare dashboard |
| Analytics Engine `trackEvent` | Newsletter funnel counters                                               | `docs/ANALYTICS.md`  |
| Telegram `notify`             | Real-time newsletter pings                                               | `docs/TELEGRAM.md`   |
| **evlog → New Relic**         | Visits, sessions, engagement, newsletter funnel with results, SSR health | this document        |

## Why a client beacon

Almost every public page (`home`, posts, tags, static pages, `subscribe`) is prerendered. Cloudflare
serves those files from static assets **before** the Worker runs, so neither middleware nor any
server code sees a post view. Page activity is therefore reported by a small script in
`BaseLayout.astro` that posts to the SSR endpoint `/blog/api/events`. Running JavaScript is also the
first bot filter; the endpoint drops requests whose User-Agent looks like a crawler.

`run_worker_first` was rejected: it would put every asset request through the Worker, count bots and
asset fetches as visits, and still give no engagement data.

## Shipping rules

- Module: `src/lib/telemetry.ts` (`initWorkersLogger`, `createRequestLogger`, OTLP drain to
  `https://otlp.eu01.nr-data.net`, `service.name = portfolio-blog`).
- `blogEnvironment` is derived from the request host: `www.serhiichernenko.com` → `production`,
  `localhost` / `127.0.0.1` → `development`, anything else (Workers preview URLs) → `preview`.
- Events are shipped to New Relic only when `blogEnvironment = production` **and** the optional
  secret `NEW_RELIC_LICENSE_KEY` is set. Every environment still writes the event to Workers logs.
- Delivery is registered with `locals.cfContext.waitUntil`; drain failure logs one
  `new_relic_drain_failed` warning and never changes the response.

```bash
pnpm wrangler secret put NEW_RELIC_LICENSE_KEY
```

Configuration lives in `wrangler.jsonc`: the secret above is the only new secret, and the
`ratelimits` binding `EVENTS_RATE_LIMITER` (`namespace_id: "1001"`, `limit: 60`, `period: 60`) backs
the `/blog/api/events` rate limit. The binding needs no provisioning; `namespace_id` is an arbitrary
unique integer string.

## New Relic setup

Account `8569908` (EU). The data partition `Log_blog` (standard 30-day retention) uses the rule
`` `service.name` = 'portfolio-blog' AND blogEnvironment = 'production' `` and was created on
2026-10-12, together with the
[Portfolio Blog — Production Analytics dashboard](https://one.eu.newrelic.com/dashboards/detail/ODU2OTkwOHxWSVp8REFTSEJPQVJEfGRhOjI3NjQ0OTQ?account=8569908)
imported from `docs/newrelic-dashboard.json`. All queries read `Log_blog`. A partition rule only
applies to data ingested after it exists, and preview or local traffic never ships, so the first
events appear after the first production deploy. The New Relic MCP server is not available on this
account's plan; manage partitions and dashboards in the New Relic UI.

## Event contract

Every event carries `eventName`, `blogEnvironment`, and `outcome` (`success` | `rejected` | `error`)
as top-level NRQL attributes. Labels outside the allowlists below collapse to `other` (or the event is
rejected); free text never reaches New Relic.

### Client → `POST /blog/api/events`

The emitted `eventName` equals the body's `type`. `Content-Type: application/json`, body ≤ 1024 bytes, closed schema (unknown keys → `400`). Sent with
`fetch(url, { method: 'POST', keepalive: true, referrerPolicy: 'no-referrer' })`; the policy keeps the
page URL (the unsubscribe page URL carries a bearer token) out of the `Referer` header. Valid events
return `204`.

Request checks, in order:

1. `Sec-Fetch-Site` present and not `same-origin` → `403`, no event.
2. Crawler User-Agent → `204`, no event.
3. Rate limit: 60 events / 60 s via the `EVENTS_RATE_LIMITER` binding → `429` with `Retry-After: 60`
   when exceeded. The limiter key is the client IP for IPv4 and the /64 prefix (first four hextets of
   the expanded address) for IPv6 (IPv4-mapped `::ffff:a.b.c.d` is keyed as the IPv4 address), so one subscriber cannot rotate through a /64 to dodge the limit.
   The key is never emitted.
4. `Content-Type`, body size, and schema validation (`415` / `413` / `400`).

Required fields (`type`, `sessionId`, `locale`, `pageType`) are strictly validated: a bad value rejects
the event with `400`. Optional string fields (`utmSource`, `referrerHost`, `browserLanguage`,
`targetHost`) never reject the event: a non-string or over-long (> 256 chars) value is treated as
`other`, and an empty value as absent. The one exception is a missing or empty `targetHost`, which is
a required part of an `outbound_clicked` event and is rejected.

The client sends no events at all when `sessionStorage` is unavailable (blocked or throwing), so
`isEntry` and session counts are not inflated by storage-less browsers.

Common body fields:

| Field        | Type / allowlist                                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | `page_view` \| `page_engaged` \| `language_switched` \| `search_used` \| `outbound_clicked`                                                                                             |
| `sessionId`  | UUID v4 from `crypto.randomUUID()`, stored in `sessionStorage` under `blog.sid` (tab-scoped, dies with the tab)                                                                         |
| `locale`     | `en` \| `uk` — the page locale                                                                                                                                                          |
| `pageType`   | `home` \| `post` \| `post_list` \| `tag` \| `tag_list` \| `page` \| `subscribe` \| `unsubscribe` \| `not_found`                                                                         |
| `contentKey` | optional. `post`/`page`: the entry's `translationKey` (shared by EN and UK versions). `tag`: the tag slug. Server validates against published content; unknown → dropped from the event |

Type-specific fields:

| `type`              | Field             | Client sends                                                                                                          | Emitted as                                                                                                                                                                                                                                                                                                     |
| ------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page_view`         | `referrerHost`    | `new URL(document.referrer).hostname` or omitted                                                                      | `referrerSource`: `direct` \| `internal` \| `google` \| `bing` \| `duckduckgo` \| `yandex` \| `linkedin` \| `dou` \| `telegram` \| `x` \| `facebook` \| `github` \| `reddit` \| `hackernews` \| `chatgpt` \| `perplexity` \| `other`                                                                           |
|                     | `utmSource`       | `utm_source` of the landing URL, truncated to 64 characters, if any                                                   | `campaignSource`: lowercased, one of `linkedin` \| `dou` \| `telegram` \| `x` \| `twitter` \| `facebook` \| `threads` \| `mastodon` \| `bluesky` \| `reddit` \| `hackernews` \| `github` \| `devto` \| `medium` \| `newsletter` \| `email` \| `google` \| `youtube` \| `discord` \| `slack`, otherwise `other` |
|                     | `browserLanguage` | primary subtag of `navigator.language`                                                                                | `browserLanguage`: `^[a-z]{2,3}$`, otherwise `other`                                                                                                                                                                                                                                                           |
|                     | `theme`           | `light` \| `dark`                                                                                                     | `theme`                                                                                                                                                                                                                                                                                                        |
|                     | `pageIndex`       | 1-based count of page views in this session                                                                           | `pageIndex` (integer 1–500) and `isEntry` (`pageIndex = 1`)                                                                                                                                                                                                                                                    |
| `page_engaged`      | `activeSeconds`   | visible time on the page, sent on first `pagehide`/`visibilitychange → hidden`                                        | `engagedBucket`: `lt10s` \| `s10to30` \| `s30to120` \| `m2to5` \| `m5plus`; `activeSeconds` (capped 3600)                                                                                                                                                                                                      |
|                     | `scrollDepth`     | max scroll percent 0–100                                                                                              | `scrollBucket`: `p0` \| `p25` \| `p50` \| `p75` \| `p100` (floor to quarter; ≥ 95 → `p100`)                                                                                                                                                                                                                    |
| `language_switched` | `targetLocale`    | `en` \| `uk`                                                                                                          | `targetLocale`                                                                                                                                                                                                                                                                                                 |
| `search_used`       | `resultsCount`    | number of Pagefind results once the results list has rendered, debounced; never sent while searching, never the query | `resultsBucket`: `none` \| `oneToFive` \| `sixPlus`                                                                                                                                                                                                                                                            |
| `outbound_clicked`  | `targetHost`      | hostname of an external link                                                                                          | `targetSource`: same mapping as `referrerSource` (without `direct`/`internal`)                                                                                                                                                                                                                                 |

`referrerSource` and `targetSource` map `google` for Google search hosts only: `mail.`, `docs.`,
`drive.` and `accounts.` subdomains of Google, and `mail.yandex.*`, map to `other`.

Server-derived on every client event: `country` (`cf-ipcountry`, `^[A-Z]{2}$` or `XX`/`T1`),
`deviceType` (`mobile` \| `tablet` \| `desktop`), computed from the User-Agent which is never
emitted. Crawler User-Agents are dropped with `204` and no event; the DuckDuckGo mobile browser
(`DuckDuckGo/5`) is a real browser and counted, while `DuckDuckBot` and `DuckDuckGo-Favicons-Bot` are
dropped.

### Newsletter (server, emitted next to `trackEvent` and `notify`)

| `eventName`                      | Attributes                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `newsletter_subscribe_requested` | `result`: `pending` \| `invalid_request` \| `rate_limited` \| `unavailable` \| `email_failed`; `locale` (when valid); `source`: `home` \| `inline` \| `subscribe-page` \| `other`                                                                                                                                                                                    |
| `newsletter_confirmed`           | `result`: `confirmed` \| `already_confirmed` \| `invalid_token` \| `unavailable`; `communicationLocale` (when known)                                                                                                                                                                                                                                                 |
| `newsletter_preferences_changed` | `action`: `en` \| `uk` \| `all` \| `subscribe_all`; `channel`: `ui` \| `oneclick` (`oneclick` only once the request passed RFC 8058 one-click validation); `result`: `changed` \| `unchanged` \| `invalid_token` \| `invalid_request` \| `unavailable`; `communicationLocale`; `pageLocale`; `enabledLanguages`: `both` \| `en` \| `uk` \| `none` (after the change) |
| `newsletter_unsubscribed`        | Emitted when a change leaves `enabledLanguages = none`. `action`, `channel`, `communicationLocale`                                                                                                                                                                                                                                                                   |

### SSR health (middleware)

`http_request_completed` for non-prerendered requests: `method`, `route`, `status`, `durationMs`,
`outcome` (`error` when `status ≥ 500`, `rejected` when `status ≥ 400`), and `errorType`
(`error.name`, or `typeof` for non-Error values) when the request threw. It is skipped for route
`/unknown` and for `/api/subscribe`, `/api/confirm`, `/api/unsubscribe` unless `status ≥ 500`: the
latter already emit the `newsletter_*` domain events, and unmatched routes are scanner noise. `route` is a template, never the raw path or query (confirm
and unsubscribe URLs carry bearer tokens): `/api/subscribe`, `/api/confirm`, `/api/unsubscribe`,
`/api/mcp`, `/api/emails/templates`, `/api/emails/templates/:slug`, `/admin/emails`,
`/admin/emails/:slug`, `/:locale/unsubscribe`, `/llms.txt`, otherwise `/unknown`. `/api/events` and
Keystatic routes are not logged here.

## Privacy

No cookies, no `localStorage`, no email, IP, User-Agent, token, search query, full URL, or referrer
path is ever emitted. The `sessionId` is random, tab-scoped, and cannot link visits across sessions.
The privacy pages (`src/content/pages/en/privacy.mdoc`, `src/content/pages/uk/pryvatnist.mdoc`) name
New Relic (EU) as a processor and list these fields.
