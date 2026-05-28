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

- [ ] Cloudflare account with `serhiichernenko.com` added as a zone (DNS on Cloudflare).
- [ ] Install + authenticate Wrangler: `npm i -g wrangler && wrangler login`.
- [ ] GitHub repo `serhii-chernenko/portfolio-blog` exists and you can push to it.

---

## 1. 🔴 Cloudflare D1 database

The subscribers table lives in D1. `wrangler.jsonc` currently has
`"database_id": "REPLACE_WITH_REAL_ID"`.

```bash
wrangler d1 create blog-db
```

- [ ] Copy the printed `database_id` into `wrangler.jsonc` → `d1_databases[0].database_id`.
- [ ] Apply the schema to the remote DB:
  ```bash
  pnpm d1:apply:remote      # wrangler d1 migrations apply blog-db --remote
  ```
- **Verify:** `wrangler d1 execute blog-db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"` lists a `subscribers` table.

---

## 2. 🔴 KV namespace (rate limiting)

`wrangler.jsonc` has `kv_namespaces[0].id = "REPLACE_WITH_REAL_ID"`.

```bash
wrangler kv namespace create RATE_LIMIT
# (older wrangler: wrangler kv:namespace create RATE_LIMIT)
```

- [ ] Copy the printed `id` into `wrangler.jsonc` → `kv_namespaces[0].id`.
- **Verify:** `wrangler kv namespace list` shows `RATE_LIMIT`.

---

## 3. 🔴 Worker secrets

These are set with `wrangler secret put <NAME>` (prompts for the value, stored
encrypted on Cloudflare — never in git).

- [ ] `SUBSCRIBE_RATE_LIMIT_SECRET` — generate 32 random bytes:
  ```bash
  openssl rand -base64 32 | wrangler secret put SUBSCRIBE_RATE_LIMIT_SECRET
  ```
  HMAC key for confirm/unsubscribe tokens **and** IP hashing. If this changes
  later, all outstanding confirm links break.
- [ ] `KEYSTATIC_SECRET` — `openssl rand -base64 32 | wrangler secret put KEYSTATIC_SECRET` (signs the Keystatic admin auth cookie).
- [ ] `KEYSTATIC_GITHUB_CLIENT_ID` — from the GitHub App (see step 4).
- [ ] `KEYSTATIC_GITHUB_CLIENT_SECRET` — from the GitHub App (see step 4).
- [ ] `TELEGRAM_BOT_TOKEN` — see `docs/TELEGRAM.md` + `docs/TELEGRAM-TESTING.md`.
- [ ] `TELEGRAM_CHAT_ID` — see `docs/TELEGRAM.md`.
- **Verify:** `wrangler secret list` shows all six names.

---

## 4. 🔴 Keystatic GitHub App (production CMS auth)

In production, Keystatic runs in **GitHub mode** — editing a post creates a
`post/<slug>` branch and opens a PR. This needs a GitHub App. The app slug
placeholder is in two files: `wrangler.jsonc` (`PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`)
and `.env.example`.

Easiest path — let Keystatic create the app for you:

1. [ ] Deploy once with the other config in place (step 9), then visit
   `https://serhiichernenko.com/blog/keystatic`.
2. [ ] Keystatic detects no app is connected and walks you through creating one
   (it pre-fills the callback URLs). This yields: **App slug**, **Client ID**,
   **Client Secret**.
3. [ ] Put `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` (the part after `/apps/` in the
   app URL) into `wrangler.jsonc` → `vars`.
4. [ ] Set `KEYSTATIC_GITHUB_CLIENT_ID` and `KEYSTATIC_GITHUB_CLIENT_SECRET` as
   Worker secrets (step 3).
5. [ ] Confirm `GITHUB_REPO` in `keystatic.config.ts` is `serhii-chernenko/portfolio-blog`. ✅ (already set)
6. [ ] Re-deploy so the new app slug is baked into the bundle.

See `docs/KEYSTATIC.md` for the full local-vs-GitHub mode explanation.
- **Verify:** log in at `/blog/keystatic`, create a throwaway draft → a
  `post/...` branch + PR appear on GitHub.

---

## 5. 🟡 Cloudflare Email Routing (newsletter sends)

Outbound email uses the `send_email` Worker binding (`SEND_EMAIL`). It only
works once Email Routing is enabled and the sender is verified. Until then,
`/api/subscribe` returns a 500 on the email step.

1. [ ] Cloudflare dashboard → `serhiichernenko.com` → **Email** → **Email Routing** → enable.
2. [ ] Add and verify the sender address `hello@serhiichernenko.com`
   (this is the `MAIL_FROM` var in `wrangler.jsonc`). Cloudflare requires the
   destination/sender to be a verified address.
3. [ ] Ensure the required DNS records (MX, SPF/TXT, DKIM) Cloudflare prompts
   for are added to the zone.

See `docs/EMAIL.md`.
- **Verify:** after deploy, subscribe with a real address → confirmation email
  arrives → clicking the link sends a welcome email.

---

## 6. 🟡 Giscus comments

`.env.example` has empty `PUBLIC_GISCUS_REPO_ID` and `PUBLIC_GISCUS_CATEGORY_ID`.
Comments render blank without them.

1. [ ] Make the GitHub repo **public** (Giscus requires it) and enable
   **Discussions** (Settings → General → Features).
2. [ ] Install the [Giscus GitHub App](https://github.com/apps/giscus) on the repo.
3. [ ] Go to <https://giscus.app>, enter the repo, pick the **Comments**
   discussion category, and copy the generated `data-repo-id` and
   `data-category-id`.
4. [ ] Set these as **Cloudflare Worker vars** (or `wrangler.jsonc` `vars`, since
   `PUBLIC_*` values are non-secret and inlined at build):
   `PUBLIC_GISCUS_REPO`, `PUBLIC_GISCUS_REPO_ID`, `PUBLIC_GISCUS_CATEGORY`,
   `PUBLIC_GISCUS_CATEGORY_ID`. They must be present **at build time**.
- **Verify:** open any post in production → the Giscus thread loads and matches
  the page's light/dark theme.

---

## 7. ⚪ Cloudflare Web Analytics

`PUBLIC_CF_ANALYTICS_TOKEN` is empty → the beacon script in `BaseHead.astro` is
not emitted (it's gated on the token).

1. [ ] Cloudflare dashboard → **Analytics & Logs** → **Web Analytics** → add a
   site → copy the token.
2. [ ] Set `PUBLIC_CF_ANALYTICS_TOKEN` as a build-time var (same as Giscus vars above).
- **Verify:** view-source on a production page shows the
  `static.cloudflareinsights.com/beacon.min.js` script with your token.

---

## 8. 🔴 GitHub Actions secrets & vars

The deploy/preview/auto-label workflows need these in the repo
(**Settings → Secrets and variables → Actions**).

Secrets:
- [ ] `CF_API_TOKEN` — Cloudflare API token with Workers + D1 + KV edit scope.
- [ ] `CF_ACCOUNT_ID` — from the Cloudflare dashboard URL / Workers overview.
- [ ] `CF_ACCOUNT_SUBDOMAIN` — your `*.workers.dev` subdomain (used to build
  preview URLs in `preview.yml`).
- [ ] `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — same values as the Worker
  secrets (Actions and the Worker read from separate stores).

Variables (the `vars.*` context):
- [ ] `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` — referenced by `deploy.yml` and
  `preview.yml` build steps.

Repo labels (auto-label workflow expects them to exist):
- [ ] Create the four labels from `.github/labels.yml`
  (`new article`, `edit article`, `dev`, `mixed`) — manually in the repo's
  Labels UI, or via a labels-sync action.

---

## 9. 🔴 First production deploy

Once steps 1–4 and 8 are done:

```bash
pnpm wrangler:deploy      # pnpm build && wrangler deploy
```

Or push to `main` to trigger `.github/workflows/deploy.yml`.

- [ ] Bind the production routes. `wrangler.jsonc` already declares the
  `serhiichernenko.com/blog`, `/blog/*`, and `/api/keystatic[/*]` routes —
  confirm they attach without error on first deploy (the zone must be active on
  Cloudflare).
- [ ] Decide what serves the apex `/` (it is intentionally **not** bound to this
  Worker — open decision #8 in `blog-build-plan.md`).
- **Verify:** `https://serhiichernenko.com/blog/en/` loads; `/blog` →
  `/blog/en/`; `/blog/keystatic` shows the CMS login.

---

## 10. Post-deploy verification pass

Acceptance criteria that can only be checked against the live site
(see `blog-build-plan.md` §26):

- [ ] Run Lighthouse on `/blog/en/` and a post — confirm the §22 budget
  (Perf ≥ 95, A11y ≥ 95, SEO 100).
- [ ] Paste a post URL into <https://app.hreflang.org> — confirm hreflang
  validates clean (reciprocal + `x-default`, consistent trailing slashes).
- [ ] Validate `/blog/en/rss.xml` and `/blog/uk/rss.xml` as RSS 2.0.
- [ ] End-to-end CMS flow: create post in `/blog/keystatic` → PR auto-labeled
  `new article` → preview Worker deploys → preview URL works (drafts visible) →
  merge → production redeploys → draft is now hidden on prod.
- [ ] Newsletter round-trip (subscribe → confirm → welcome → unsubscribe).
- [ ] Telegram notifications fire for each event — see `docs/TELEGRAM-TESTING.md`.

---

## Quick reference — placeholders to replace

| Placeholder | File | Step |
|---|---|---|
| `REPLACE_WITH_REAL_ID` (D1) | `wrangler.jsonc` | 1 |
| `REPLACE_WITH_REAL_ID` (KV) | `wrangler.jsonc` | 2 |
| `your-keystatic-github-app-slug` | `wrangler.jsonc`, `.env.example` | 4 |
| empty `PUBLIC_GISCUS_REPO_ID` / `_CATEGORY_ID` | Worker vars | 6 |
| empty `PUBLIC_CF_ANALYTICS_TOKEN` | Worker vars | 7 |
