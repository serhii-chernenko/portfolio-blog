# Go-Live Checklist

Everything the code can't do for itself. The app builds, typechecks, and lints
clean — but it ships with placeholder IDs and empty secrets. This is the
ordered list of manual steps to take it from "builds locally" to "live in
production at `serhiichernenko.com/blog`".

Work top to bottom — later steps depend on earlier ones. Each item says **what**,
**where**, the **command/action**, and **how to verify** it worked.

Legend: 🔴 = blocks production deploy · 🟡 = blocks a specific feature · ⚪ = nice-to-have

---

## 0. Prerequisites

- [x] Cloudflare account with `serhiichernenko.com` added as a zone (DNS on Cloudflare).
- [x] Install + authenticate Wrangler: `npm i -g wrangler && wrangler login`.
- [x] GitHub repo `serhii-chernenko/portfolio-blog` exists and you can push to it.

---

## 1. 🔴 Cloudflare D1 database

The subscribers table lives in D1. `wrangler.jsonc` → `d1_databases[0].database_id`
already holds the production database ID; repeat this step only when recreating the
database.

```bash
wrangler d1 create portfolio-blog
```

- [x] Copy the printed `database_id` into `wrangler.jsonc` → `d1_databases[0].database_id`.
- [x] Apply the schema to the remote DB:
  ```bash
  pnpm d1:apply:remote      # wrangler d1 migrations apply portfolio-blog --remote
  ```
- **Verify:** `wrangler d1 execute portfolio-blog --remote --command "SELECT name FROM sqlite_master WHERE type='table';"` lists a `subscribers` table.

---

## 2. 🔴 Subscription abuse limits

Migration `0002` creates the atomic, expiring D1 counters used for IP and address
cooldowns. No KV namespace is required. After applying migrations, verify
`subscription_rate_limits` exists and contains no expired rows before launch.

---

## 3. 🔴 Worker secrets

These are set with `wrangler secret put <NAME>` (prompts for the value, stored
encrypted on Cloudflare — never in git).

Server secrets are accessed at runtime via `astro:env/server` typed imports (not
`Astro.locals.runtime.env`, which was removed in `@astrojs/cloudflare` v13).
`validateSecrets` defaults to false, so the build succeeds without them —
validation happens at runtime when the Worker receives its first request.

- [x] `SUBSCRIBE_RATE_LIMIT_SECRET` — generate 32 random bytes:
  ```bash
  openssl rand -base64 32 | wrangler secret put SUBSCRIBE_RATE_LIMIT_SECRET
  ```
  Root key for encrypted subscription capabilities and keyed abuse hashes. If this changes
  later, all outstanding confirm links break. Declared as `required` in the
  `astro:env` schema (min length: 1).
- [x] `TELEGRAM_BOT_TOKEN` — see `docs/TELEGRAM.md` + `docs/TELEGRAM-TESTING.md`. Declared optional in `astro:env/server` — omitting it causes `notify()` to no-op silently.
- [x] `TELEGRAM_CHAT_ID` — see `docs/TELEGRAM.md`. Same: optional, no-op when absent.
- [ ] `NEW_RELIC_LICENSE_KEY` — optional; ingest key for the telemetry forwarder (see `docs/OBSERVABILITY.md`). Without it, events are not forwarded to New Relic. `wrangler secret put NEW_RELIC_LICENSE_KEY`.
- **Verify:** `wrangler secret list` shows every secret you set (`SUBSCRIBE_RATE_LIMIT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NEW_RELIC_LICENSE_KEY`). The CMS needs none; `EMDASH_ENCRYPTION_KEY` is only required if a plugin declares secret settings (none do).

The telemetry endpoint (`/blog/api/events`) is rate limited by the
`EVENTS_RATE_LIMITER` binding, declared in `wrangler.jsonc` under `ratelimits`
(`namespace_id` `1001`, 60 requests per 60 seconds). It ships with the deploy;
there is nothing to create by hand.

---

## 4. 🔴 EmDash CMS (content, admin, media)

Content lives in EmDash, which runs inside the same Worker: content in D1
`portfolio-blog-cms` (binding `CMS_DB`), media in R2 `portfolio-blog-media`
(binding `MEDIA`), admin sessions in KV `SESSION` (added by the Cloudflare
adapter). No secrets are needed. See `docs/CMS.md#first-production-setup` for
the full picture.

1. [x] **Resources.** D1 `portfolio-blog-cms` (`database_id` in `wrangler.jsonc`)
       and R2 `portfolio-blog-media` are created. `wrangler deploy` provisions the
       `SESSION` KV namespace the Cloudflare adapter adds.
2. [ ] **Admin passkey** — after the deploy, open
       <https://serhiichernenko.com/_emdash/admin>. The setup wizard creates the
       first admin with a passkey.
3. [ ] **API token** — admin → **Settings** → **API Tokens** → create a token
       with admin scope.
4. [ ] **Migrate the content** from Sanity (see
       `docs/CMS.md#migrating-the-sanity-content`):
   ```bash
   EMDASH_TOKEN=<admin API token> SANITY_API_READ_TOKEN=<Sanity viewer token> \
     pnpm cms:migrate-sanity -- --url https://serhiichernenko.com
   ```
   The script skips entries that already exist, so it is safe to re-run.

- **Verify:** the posts, pages and menus show on `/blog/en/` and `/blog/uk/`.
  Publish a throwaway edit in the admin → the change appears on the site within
  seconds (EmDash purges the cache, see `docs/CMS.md#caching`).

---

## 5. 🟡 Cloudflare Email Routing (newsletter sends)

Outbound email uses the `send_email` Worker binding (`SEND_EMAIL`). It only
works once Email Routing is enabled and the sender is verified. Until then,
`/api/subscribe` returns a 500 on the email step.

1. [x] Cloudflare dashboard → `serhiichernenko.com` → **Email** → **Email Routing** → enable.
2. [x] Add and verify the sender address `hello@serhiichernenko.com`
       (this is the `MAIL_FROM` var in `wrangler.jsonc`). Cloudflare requires the
       destination/sender to be a verified address.
3. [x] Ensure the required DNS records (MX, SPF/TXT, DKIM) Cloudflare prompts
       for are added to the zone.

See `docs/EMAIL.md`.

- **Verify:** after deploy, subscribe with a real address → confirmation email
  arrives → clicking the link sends a welcome email.

---

## 6. ✅ Comments

EmDash's built-in comments (admin → **Comments**), enabled for posts. No setup needed.

- [ ] Optional spam protection: create a [Turnstile](https://developers.cloudflare.com/turnstile/)
      widget for `serhiichernenko.com`, set its site key as the `PUBLIC_TURNSTILE_SITE_KEY` build
      variable (Workers Builds, and the `ci.yml` repo var) and its secret as the
      `EMDASH_TURNSTILE_SECRET_KEY` Worker secret. Without it the honeypot, the rate limit and
      moderation still apply.

- **Verify:** post a comment on any post → it waits in admin → **Comments** (first comment of a
  commenter), Telegram gets `💬 New comment`, and after approval it shows on the post.

---

## 7. ✅ Cloudflare Web Analytics

Web Analytics is injected **automatically** by Cloudflare's edge for the proxied
`serhiichernenko.com` zone (auto-install is enabled in the dashboard). There is
no beacon script in the app and no `PUBLIC_CF_ANALYTICS_TOKEN` env var — nothing
to configure here.

- **Verify:** after deploy, the Web Analytics dashboard shows hits, and
  view-source on a production page shows exactly one
  `static.cloudflareinsights.com/beacon.min.js` (the edge-injected one). If it is
  missing on Worker-served HTML, re-add the manual beacon to `BaseHead.astro`.

---

## 8. 🔴 GitHub Actions secrets & vars

Deployment (production **and** PR previews) is handled by **Cloudflare Workers
Builds** — the dashboard Git integration — not GitHub Actions, so **no Cloudflare
API token lives in the repo**. The only workflows are `ci.yml`
(format/lint/typecheck/build) and `indexnow.yml` (IndexNow submission after a
`main` deploy, see step 9a); neither needs secrets. New-post Telegram
notifications come from the EmDash publish hook on the Worker, not from
Actions.

Secrets (**Settings → Secrets and variables → Actions**):

- None required.

Variables (the `vars.*` context):

- [ ] The optional `PUBLIC_TURNSTILE_SITE_KEY` — inlined by the `ci.yml` build step so CI builds
      match production shape. Not load-bearing for the gate.

> Cloudflare credentials (`CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_ACCOUNT_SUBDOMAIN`)
> are **no longer GitHub secrets** — Workers Builds authenticates through the
> dashboard Git integration. Configure deploys/previews at Cloudflare → Workers &
> Pages → **portfolio-blog → Settings → Build**.

---

## 9. 🔴 First production deploy

Once steps 1–3 and 8 are done (step 4 follows this deploy):

```bash
pnpm wrangler:deploy      # pnpm build && wrangler deploy
```

The build outputs two directories:

- `dist/client/` — static assets served by the `ASSETS` binding (scoped to `./dist/client` in `wrangler.jsonc`).
- `dist/server/` — the Worker script. `wrangler.jsonc` `main` points to `src/worker.ts` (the Astro handler plus EmDash's Cron Trigger handler). Files in `dist/server/` are never served publicly as static assets.

Or just push to `main` — **Cloudflare Workers Builds** runs `pnpm build` + deploy
automatically (dashboard Git integration). Non-`main` branches / PRs get a preview
version with an auto-posted preview URL (see _Preview deployments_ below).

The canonical host is **`serhiichernenko.com`** (the bare apex); `www`
308-redirects to it before Workers run. Three things outside the deploy make routing work — see
**`docs/DNS-ROUTING.md`** for the full runbook, including the phased
**www → apex migration**. **Routes do not create DNS**, and the wrangler OAuth
token and the Workers Builds deploy credential have zone _read_ only, so the DNS
records and the redirect rule are **dashboard/API actions** (not `wrangler`/CI):

- [ ] **DNS — two Proxied (orange-cloud) records** (Cloudflare → `serhiichernenko.com`
      → **DNS → Records**): `AAAA @ → 100::` (so the apex resolves to the edge where
      the Worker routes fire) **and** `CNAME www → serhiichernenko.com` (so `www`
      resolves to the edge where the redirect rule runs). Both must be Proxied.
- [x] **Redirect rules** (**Rules → Redirect Rules**, live 2026-10-12): when
      hostname equals `www.serhiichernenko.com`, **308** to
      `https://serhiichernenko.com` preserving path/query (scoped to `www` only,
      or the apex would loop; 308 keeps RFC 8058 one-click unsubscribe POSTs from
      old emails working), plus a `302` from the apex host root `/` to
      `/blog/en/` (delete it when the portfolio Worker takes `/`). Rule IDs are in
      `docs/DNS-ROUTING.md`.
- [ ] **Routes deploy to the apex only.** `wrangler.jsonc` declares
      `serhiichernenko.com/blog`, `/blog/*`, `/_emdash/*` (CMS admin, API and
      media) and the host-root files `/robots.txt`, `/favicon.ico`, `/llms.txt`,
      `/llms-full.txt` and `/sitemap.xml` (`zone_name`
      is the apex); `www` is not bound. A route change only takes effect
      after `pnpm wrangler:deploy` (the build regenerates the deployed config — a
      bare `wrangler deploy` reuses the old routes). Confirm with
      `pnpm exec wrangler deploy --dry-run | grep serhii`.
- [ ] Decide what serves the host root `/` (intentionally **not** bound to this
      Worker — open decision #8 in `blog-build-plan.md`; until then `/` returns a CF edge error).
- **Verify:** run `./scripts/verify-routing.sh` (pure `dig`/`curl`, no auth) — it
  checks the apex resolves to a proxied edge IP, `serhiichernenko.com/blog/en/`
  returns 2xx, and `www/blog` 308-redirects to the apex. Then manually confirm
  a post page and `serhiichernenko.com/_emdash/admin` (the EmDash sign-in page).
  HTTPS may need up
  to 24h for Universal SSL — test `http://` first.

---

## 9a. 🟡 IndexNow seeding

IndexNow tells Bing, Yandex and other participating engines about URLs without
waiting for a crawl. After the first production deploy on the apex, submit every
sitemap URL once:

```bash
gh workflow run indexnow.yml -f mode=all
```

From then on, `indexnow.yml` submits sitemap changes after each Workers Builds
deploy of `main`, and the EmDash publish hook submits each publish. See `docs/SEO.md` and `docs/CMS.md#publish-side-effects`.

- **Verify:** the workflow run succeeds, and
  `https://serhiichernenko.com/blog/aa97432c46c58c839540be4d044ece78.txt` returns the key.

---

## 9b. Preview deployments (Cloudflare Workers Builds)

Once the repo is connected in **Workers & Pages → portfolio-blog → Settings →
Build**, Cloudflare builds every push: `main` → production deploy; any other
branch / PR → a **preview version** (`wrangler versions upload`). Cloudflare
auto-posts a PR comment with the preview URL — no GitHub Action involved.

- [ ] **View content at the `/blog` path.** Preview URLs live on
      `*.workers.dev`, where the production `/blog*` routes do **not** apply — the
      whole Worker answers at every path. The blog routes live under
      `src/pages/blog/`, so the blog is served under `/blog`. The bare preview root **404s by design**:
  - `https://<version>-portfolio-blog.<subdomain>.workers.dev/` → 404
  - `https://<version>-portfolio-blog.<subdomain>.workers.dev/blog` → the blog ✅

  Always append `/blog` to the URL in the PR comment. Do **not** add a
  `/` → `/blog` redirect — the host root is reserved for the future portfolio
  Worker (see `docs/DNS-ROUTING.md`).

- [ ] **If no preview URL appears:** preview URLs are on by default when
      `workers.dev` is enabled (Wrangler ≥ 3.91; this repo is on 4.x). Otherwise
      enable them in the Worker's **Domains** tab (Workers & Pages →
      portfolio-blog → **Domains** → Preview URLs). No
      `wrangler.jsonc` change is required.
- [ ] **Content on previews.** Preview versions use the same `CMS_DB` binding,
      so they read the production D1 content — there is no per-branch content.
      Drafts are viewed through the admin's **Preview** button on the production
      site (see `docs/CMS.md#preview`).

---

## 10. Post-deploy verification pass

Acceptance criteria that can only be checked against the live site
(see `blog-build-plan.md` §26):

- [ ] Run Lighthouse on `/blog/en/` and a post — confirm the §22 budget
      (Perf ≥ 95, A11y ≥ 95, SEO 100).
- [ ] Paste a post URL into <https://app.hreflang.org> — confirm hreflang
      validates clean (reciprocal + `x-default`, consistent trailing slashes).
- [ ] Validate `/blog/en/rss.xml` and `/blog/uk/rss.xml` as RSS 2.0.
- [ ] End-to-end CMS flow: create a post in the EmDash admin → open it with
      **Preview** (hidden on the public site) → publish → EmDash purges the cache
      and the post is live within seconds → a scheduled post stays hidden until
      the cron publishes it (checked every minute).
- [ ] Decommission Sanity once the production content is verified: delete the
      old Worker secrets and the webhook, undeploy the Studio. See
      `docs/CMS.md#decommissioning-sanity`.
- [ ] Newsletter round-trip (subscribe → confirm → welcome → unsubscribe).
- [ ] Telegram notifications fire for each event — see `docs/TELEGRAM-TESTING.md`.

---

## Quick reference — placeholders to replace

| Placeholder | File | Step |
| ----------- | ---- | ---- |
