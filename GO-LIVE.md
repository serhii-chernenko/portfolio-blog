# Go-Live Checklist

Everything the code can't do for itself. The app builds, typechecks, and lints
clean — but it ships with placeholder IDs and empty secrets. This is the
ordered list of manual steps to take it from "builds locally" to "live in
production at `www.serhiichernenko.com/blog`".

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

The subscribers table lives in D1. `wrangler.jsonc` currently has
`"database_id": "REPLACE_WITH_REAL_ID"`.

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
- [x] `KEYSTATIC_SECRET` — `openssl rand -base64 32 | wrangler secret put KEYSTATIC_SECRET` (signs the Keystatic admin auth cookie).
- [ ] `KEYSTATIC_GITHUB_CLIENT_ID` — from the GitHub App (see step 4).
- [ ] `KEYSTATIC_GITHUB_CLIENT_SECRET` — from the GitHub App (see step 4).
- [x] `TELEGRAM_BOT_TOKEN` — see `docs/TELEGRAM.md` + `docs/TELEGRAM-TESTING.md`. Declared optional in `astro:env/server` — omitting it causes `notify()` to no-op silently.
- [x] `TELEGRAM_CHAT_ID` — see `docs/TELEGRAM.md`. Same: optional, no-op when absent.
- **Verify:** `wrangler secret list` shows all six names.

---

## 4. 🔴 Keystatic GitHub App (production CMS auth)

In production, Keystatic runs in **GitHub mode** — editing a post creates a
`post/<slug>` branch and opens a PR. This needs a GitHub App. The app slug
placeholder is in `wrangler.jsonc` (`PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`) — it lives
as a `vars` entry there (exposed to local dev automatically) and is NOT in `.dev.vars.example`.

Easiest path — let Keystatic create the app for you:

1. [ ] Deploy once with the other config in place (step 9), then visit
       `https://www.serhiichernenko.com/blog/keystatic`.
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

## 6. 🟡 Giscus comments

`.dev.vars.example` has empty `PUBLIC_GISCUS_REPO_ID` and `PUBLIC_GISCUS_CATEGORY_ID`.
Comments render blank without them.

1. [x] Make the GitHub repo **public** (Giscus requires it) and enable
       **Discussions** (Settings → General → Features).
2. [x] Install the [Giscus GitHub App](https://github.com/apps/giscus) on the repo.
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
API token lives in the repo**. The only workflows now are `ci.yml`
(format/lint/typecheck/build — needs no secrets) and `auto-label.yml`
(PR labels and Telegram).

Secrets (**Settings → Secrets and variables → Actions**):

- [ ] `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — used by `auto-label.yml` for the
      "new article" notification (same values as the Worker secrets; Actions and the
      Worker read from separate stores).

Variables (the `vars.*` context):

- [ ] `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` (and the optional `PUBLIC_GISCUS_*` /
      `PUBLIC_CF_ANALYTICS_TOKEN`) — inlined by the `ci.yml` build step so CI builds
      match production shape. Not load-bearing for the gate.

> Cloudflare credentials (`CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_ACCOUNT_SUBDOMAIN`)
> are **no longer GitHub secrets** — Workers Builds authenticates through the
> dashboard Git integration. Configure deploys/previews at Cloudflare → Workers &
> Pages → **portfolio-blog → Settings → Build**.

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

The build outputs two directories:

- `dist/client/` — static assets served by the `ASSETS` binding (scoped to `./dist/client` in `wrangler.jsonc`).
- `dist/server/` — the Worker script. `wrangler.jsonc` `main` points to `@astrojs/cloudflare/entrypoints/server`. Files in `dist/server/` are never served publicly as static assets.

Or just push to `main` — **Cloudflare Workers Builds** runs `pnpm build` + deploy
automatically (dashboard Git integration). Non-`main` branches / PRs get a preview
version with an auto-posted preview URL (see _Preview deployments_ below).

The canonical host is **`www.serhiichernenko.com`**; the bare apex
301-redirects to it. Three things outside the deploy make routing work — see
**`docs/DNS-ROUTING.md`** for the full runbook. **Routes do not create DNS**, and
the wrangler OAuth token and the Workers Builds deploy credential have zone
_read_ only, so the DNS records and the redirect rule are **dashboard/API
actions** (not `wrangler`/CI):

- [ ] **DNS — two Proxied (orange-cloud) records** (Cloudflare → `serhiichernenko.com`
      → **DNS → Records**): `CNAME www → serhiichernenko.com` (so `www` resolves to
      the edge where the Worker routes fire) **and** `AAAA @ → 100::` (so the bare
      apex resolves to the edge where the redirect rule runs). Both must be Proxied.
- [ ] **Redirect rule — apex → www** (**Rules → Redirect Rules**): when hostname
      equals `serhiichernenko.com`, 301 to `https://www.serhiichernenko.com` preserving
      path/query. Scope to the apex only (don't match `www`, or it loops).
- [ ] **Routes deploy to www.** `wrangler.jsonc` declares
      `www.serhiichernenko.com/blog`, `/blog/*`, and `/api/keystatic[/*]` (`zone_name`
      stays the apex). A route change only takes effect after `pnpm wrangler:deploy`
      (the build regenerates the deployed config — a bare `wrangler deploy` reuses the
      old routes). Confirm with `pnpm exec wrangler deploy --dry-run | grep serhii`.
- [ ] Decide what serves the host root `/` (intentionally **not** bound to this
      Worker — open decision #8 in `blog-build-plan.md`; until then `/` returns a CF edge error).
- **Verify:** run `./scripts/verify-routing.sh` (pure `dig`/`curl`, no auth) — it
  checks `www` resolves to a proxied edge IP, `www/blog/en/` returns 2xx, and the
  apex `/blog` 301-redirects to `www`. Then manually confirm
  `www.serhiichernenko.com/blog/keystatic` shows the CMS login. HTTPS may need up
  to 24h for Universal SSL — test `http://` first.

---

## 9b. Preview deployments (Cloudflare Workers Builds)

Once the repo is connected in **Workers & Pages → portfolio-blog → Settings →
Build**, Cloudflare builds every push: `main` → production deploy; any other
branch / PR → a **preview version** (`wrangler versions upload`). Cloudflare
auto-posts a PR comment with the preview URL — no GitHub Action involved.

- [ ] **View content at the `/blog` path.** Preview URLs live on
      `*.workers.dev`, where the production `/blog*` routes do **not** apply — the
      whole Worker answers at every path. But Astro has `base: '/blog'`, so the blog
      is served under `/blog`. The bare preview root **404s by design**:
  - `https://<version>-portfolio-blog.<subdomain>.workers.dev/` → 404
  - `https://<version>-portfolio-blog.<subdomain>.workers.dev/blog` → the blog ✅

  Always append `/blog` to the URL in the PR comment. Do **not** add a
  `/` → `/blog` redirect — the host root is reserved for the future portfolio
  Worker (see `docs/DNS-ROUTING.md`).

- [ ] **If no preview URL appears:** preview URLs are on by default when
      `workers.dev` is enabled (Wrangler ≥ 3.91; this repo is on 4.x). Otherwise
      enable them at **Settings → Domains & Routes → Preview URLs**. No
      `wrangler.jsonc` change is required.
- [ ] **Make drafts visible on previews only.** Draft posts render when
      `PREVIEW_MODE === 'true'` (`src/lib/posts.ts`). Cloudflare has no native
      "preview-only var" (dashboard vars apply to _all_ builds and would leak drafts
      to prod). Set it per-build instead — set the **Non-production branch deploy
      command** (Settings → Build) to export `PREVIEW_MODE=true` before the build on
      non-`main` branches, then `wrangler versions upload`. (A `wrangler.jsonc`
      `env.preview` would also work but forces re-declaring **every** binding — D1,
      KV, send_email, analytics, vars — since named envs don't inherit them.)

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
      `new article` → Workers Builds uploads a preview version → preview URL works
      **at its `/blog` path** (drafts visible — see _Preview deployments_) →
      merge → production redeploys → draft is now hidden on prod.
- [ ] Newsletter round-trip (subscribe → confirm → welcome → unsubscribe).
- [ ] Telegram notifications fire for each event — see `docs/TELEGRAM-TESTING.md`.

---

## Quick reference — placeholders to replace

| Placeholder                                    | File                      | Step |
| ---------------------------------------------- | ------------------------- | ---- |
| `REPLACE_WITH_REAL_ID` (D1)                    | `wrangler.jsonc`          | 1    |
| `REPLACE_WITH_REAL_ID` (KV)                    | `wrangler.jsonc`          | 2    |
| `your-keystatic-github-app-slug`               | `wrangler.jsonc` (`vars`) | 4    |
| empty `PUBLIC_GISCUS_REPO_ID` / `_CATEGORY_ID` | Worker vars               | 6    |
