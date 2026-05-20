# portfolio-blog

A bilingual (EN/UK) personal blog. Built per [`blog-build-plan.md`](./blog-build-plan.md).

**Stack:** Astro 6 · Cloudflare Workers · Keystatic · Tailwind 4 · DaisyUI 5 · Markdoc · D1 · KV · Pagefind · Cloudflare Email · Giscus · Telegram notifications.

**Mounted at `/blog/*`** on `chernenko.digital` — the apex and other paths are served by a separate React portfolio app.

**Docs:**
- [`docs/CONTENT.md`](./docs/CONTENT.md) — author flow: how to write, edit, translate, schedule posts via Keystatic
- [`docs/EMAIL.md`](./docs/EMAIL.md) — Cloudflare Email Workers setup + newsletter constraints
- [`docs/TELEGRAM.md`](./docs/TELEGRAM.md) — Telegram bot setup + events
- [`blog-build-plan.md`](./blog-build-plan.md) — original spec

---

## Running locally

There are **three** different ways to run this project. Use them deliberately.

> ⚠️ **`pnpm dev` URLs differ from production.** The Astro dev server serves at `/` (e.g. `http://127.0.0.1:4321/en/posts/hello-world/`) so Keystatic local mode works. `pnpm wrangler:dev` and production both serve at `/blog/` (e.g. `https://chernenko.digital/blog/en/posts/hello-world/`). See "Why `pnpm dev` drops `/blog/`" below.

### 1. `pnpm dev` — fast iteration on pages, components, styles, and content

```bash
pnpm install
pnpm dev
```

Opens at `http://127.0.0.1:4321`. HMR, hot-reload, draft posts visible. Sets `PUBLIC_KEYSTATIC_MODE=local` for you.

What this gives you:
- All pages, layouts, components, Tailwind/DaisyUI
- **Keystatic CMS at <http://127.0.0.1:4321/keystatic>** (local kind — writes directly to `src/content/posts/`, no GitHub round-trip)
- Markdoc rendering, theme toggle, language switcher
- API routes mount, but **they have no Cloudflare bindings here** (no D1, no KV). The `/api/subscribe`, `/api/confirm`, `/api/unsubscribe` endpoints will throw "D1 binding 'DB' is not available". For full API testing, use option 2.

What this does **not** give you:
- **Pagefind search.** Pagefind builds its index from the static HTML produced by `pnpm build` — there is no index for it to query until you've built.
- Real Cloudflare runtime — no D1, KV, secrets, send_email.

### Why `pnpm dev` drops `/blog/`

Keystatic's React UI hardcodes its API at root-relative `/api/keystatic/...` and doesn't support a base path. With Astro `base: '/blog'`, the UI loads at `/blog/keystatic` but its API calls go to `/api/keystatic/...` (404) — the UI renders blank.

`pnpm dev` (`PUBLIC_KEYSTATIC_MODE=local`) collapses the base to `/` so the paths line up. `pnpm wrangler:dev` and production both keep `base: '/blog'` and rely on `src/middleware.ts` to rewrite apex `/api/keystatic/*` requests onto the prefixed routes — see [`docs/KEYSTATIC.md`](./docs/KEYSTATIC.md).

### 2. `pnpm wrangler:dev` — Worker preview with real CF bindings

Runs the built Worker against local simulations of D1, KV, and Send Email. Closest you can get to production locally — Keystatic (GitHub OAuth), Pagefind, API endpoints, and D1 all work. Same base path (`/blog`) and same auth flow as production.

**One-time setup** — copy `.dev.vars.example` and fill in the required secrets:

```bash
cp .dev.vars.example .dev.vars
```

Required in `.dev.vars`:
- `SUBSCRIBE_RATE_LIMIT_SECRET` — any non-empty string locally
- `KEYSTATIC_SECRET`, `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET` — needed because the Worker runtime cannot use Keystatic local storage. See [`docs/KEYSTATIC.md`](./docs/KEYSTATIC.md) for the GitHub App setup.

Optional: Telegram bot credentials. Empty values are fine — the helpers no-op gracefully.

**Run:**

```bash
pnpm wrangler:dev       # builds then serves at http://127.0.0.1:8787
```

Open <http://127.0.0.1:8787/blog/>. Keystatic is at <http://127.0.0.1:8787/blog/keystatic>.

D1 schema applies automatically on first run.

What this gives you:
- Full CF runtime: Pagefind search, D1, KV, assets binding, send_email binding (logs locally, no real delivery).
- Keystatic UI with real GitHub OAuth — commits go to a `post/*` branch and open PRs, just like prod.
- The subscribe/confirm/unsubscribe flow works end-to-end against local D1 (verified: POST returns `{ok:true}`, row lands in `subscribers` table).

What this does **not** give you:
- HMR — every code change needs another `pnpm wrangler:dev` cycle.
- Real email send — log only.
- Real Telegram notifications (unless `.dev.vars` has real bot creds).

### 3. `pnpm preview` — DOES NOT WORK with the Cloudflare adapter

Astro's built-in preview server doesn't support Cloudflare Workers builds. Don't use it. Use `pnpm wrangler:dev` instead.

```
[preview] The @astrojs/cloudflare adapter does not support the preview command.
```

If you see that, you ran the wrong command. Use option 2.

---

## Build

```bash
pnpm build         # production build — base /blog, GitHub-mode Keystatic, full SEO output
pnpm build:astro   # just astro, no pagefind — fastest when iterating
```

Build output goes to `dist/`. The Worker entrypoint is `dist/_worker.js/index.js`. Static assets (HTML, CSS, JS, Pagefind, images) are also under `dist/`.

`pnpm wrangler:dev` and `pnpm wrangler:deploy` both call `pnpm build` — the dev preview and the prod deploy share the exact same artifact.

## Deploy

This is the deploy-ready scaffold. **Before the first deploy you must do the steps in "Placeholders to fill" below.**

```bash
pnpm wrangler:deploy
```

CI does this automatically on push to `main` via `.github/workflows/deploy.yml` once `CF_API_TOKEN` and `CF_ACCOUNT_ID` are set as repo secrets.

## D1 schema

```bash
pnpm d1:apply:local    # against local sqlite (.wrangler/state/...)
pnpm d1:apply:remote   # against the real D1 instance
```

Migrations live in `schema/`.

---

## Placeholders to fill before first production deploy

These are intentionally left as placeholders — none of them have safe defaults.

1. **`wrangler.jsonc`** — replace `REPLACE_WITH_REAL_ID` for both `d1_databases[0].database_id` and `kv_namespaces[0].id` after running:
   ```bash
   pnpm wrangler d1 create blog-db
   pnpm wrangler kv:namespace create RATE_LIMIT
   ```
2. **`keystatic.config.ts`** — `storage.repo` is set to `inevix/portfolio-blog`. Change if the repo lives elsewhere.
3. **`astro.config.mts`** — canonical `SITE` constant (used for sitemap/RSS absolute links) is hardcoded. Edit the file to change it. Runtime URLs (e.g. subscribe confirm links) are derived from the incoming request, so previews and `wrangler dev` self-reference automatically.
4. **Cloudflare Email Service** — outbound email uses CF's native `send_email` Worker binding (no third-party API key needed). Before the first deploy:
   - Enable **Email Routing** on `chernenko.digital` in the Cloudflare dashboard (Email → Email Routing).
   - Add a verified sender address matching `MAIL_FROM` (e.g. `hello@serhiichernenko.com`). CF will send a verification email to the address — click the link.
   - The `send_email` binding with no `destination_address` restriction enables the Cloudflare Email Service API, which supports sending to **arbitrary subscriber addresses** (newsletter use case). This is currently in **beta** — if you hit delivery issues at scale, consider adding Resend/Postmark as a fallback.
   - `MAIL_FROM` is set as a `var` in `wrangler.jsonc` (default: `hello@serhiichernenko.com`). Override per environment if needed.
5. **`.github/workflows/*.yml`** — uses these repo secrets/vars:
   - Secrets: `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_ACCOUNT_SUBDOMAIN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   - Vars: `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`, `PUBLIC_GISCUS_*`, `PUBLIC_CF_ANALYTICS_TOKEN`
6. **Wrangler secrets** (set with `pnpm wrangler secret put <NAME>`):
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   - `SUBSCRIBE_RATE_LIMIT_SECRET` — random 32+ bytes, used for HMAC tokens and IP hashing
   - `KEYSTATIC_SECRET`, `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET` — Keystatic runs in GitHub mode in the deployed Worker (and in `wrangler:dev`). See `docs/KEYSTATIC.md` for the GitHub App setup that produces these values.
7. **`.github/labels.yml`** — apply once: either create the 4 labels manually in repo settings, or wire `crazy-max/ghaction-github-labeler` to do it.
8. **Giscus** — install the [Giscus GitHub App](https://github.com/apps/giscus), enable Discussions on the repo, then visit [giscus.app](https://giscus.app) to get the `PUBLIC_GISCUS_*` values and put them in repo vars.
9. **`public/og-default.png`** — replace the 1×1 placeholder with a real 1200×630 PNG. Phase 2 per the plan generates per-post OGs via satori.

---

## Skipped intentionally (Phase 2 per plan)

- R2 image storage — MVP commits images to `src/assets/posts/`.
- Custom OG image generator — MVP uses a single default.
- Custom comment system — Giscus is MVP.
- Newsletter campaigns — MVP supports subscribe/confirm/unsubscribe only.

---

## Middle decisions I made (override any of these)

1. **Author identity**: `Serhii Chernenko`, site URL `https://blog.chernenko.digital`. Pulled from git config + portfolio URL you shared.
2. **GitHub repo placeholder**: `inevix/portfolio-blog` (set in `keystatic.config.ts`).
3. **Default theme**: `prefers-color-scheme` (DaisyUI auto-detects from the media query).
4. **Keystatic GitHub mode**: self-hosted (you create the GitHub App via Keystatic's onboarding flow on first prod visit). Keystatic Cloud is also viable — flip `kind: 'github'` to `kind: 'cloud'`.
5. **OG image**: single default `og-default.png` for MVP. Per-post OG generation deferred to Phase 2 per plan.
6. **Pagination**: page 1 lives at the canonical `/[locale]/posts/`. Pages 2+ live at `/[locale]/posts/page/[n]/` (moved into a subdir to avoid catch-all collision with `[slug]`).
7. **Privacy policy / about**: placeholder bio content in `src/pages/[...locale]/about.astro`. Replace with your own.
8. **Wrangler config**: `wrangler.jsonc` (JSON-with-comments) instead of `wrangler.toml` per current Cloudflare guidance.
9. **Markdoc config location**: project root (`markdoc.config.mjs`) — auto-discovered by `@astrojs/markdoc`. The plan suggested `src/markdoc.config.mjs` but the integration doesn't see it there.
10. **Sample seed posts**: one bilingual "Hello, world" pair plus one EN draft to verify draft-filtering on production.

---

## What worked / what to verify

End-to-end verified with `pnpm wrangler:dev` against the latest build:

| Check | Result |
|---|---|
| `pnpm build` | ✅ Clean, all 18 routes prerender, Pagefind indexes 2 pages × 2 locales |
| `/blog/` → `/blog/en/` redirect | ✅ Static meta-refresh page (no SSR roundtrip) |
| `/blog/en/`, `/blog/uk/` home pages | ✅ 200 |
| Post detail (`/blog/en/posts/hello-world/`) | ✅ 200 |
| Posts index, tags index, tag detail | ✅ 200 |
| About, Subscribe | ✅ 200 |
| RSS (`/blog/en/rss.xml`, `/blog/uk/rss.xml`) | ✅ 200 |
| Sitemap (`/blog/sitemap-index.xml`) | ✅ 200 with `https://chernenko.digital/blog/...` URLs |
| `robots.txt`, Pagefind bundle | ✅ 200 |
| Keystatic UI (`/blog/keystatic`) | ✅ 200 |
| `POST /blog/api/subscribe` valid | ✅ 200 `{ok:true}`, row in D1 |
| `POST /blog/api/subscribe` invalid | ✅ 400 `{error:"Invalid email address"}` |
| Drafts/future-dated posts | ✅ filtered out of production builds |

- ⚠️ **Not deployed yet** — no Cloudflare/GitHub creds in this session. First `wrangler deploy` needs the placeholders above filled in.
- ⚠️ **Not visually smoke-tested in a browser** — verify the home page, post page, and theme toggle live before pushing to prod.
- ⚠️ **Keystatic flow** — first visit to production `/keystatic` triggers GitHub App creation. Follow Keystatic's UI prompts; it'll give you the `KEYSTATIC_GITHUB_*` env vars.

---

## Repository layout

See `blog-build-plan.md` §5 for the canonical layout. Notable deviations:

- `markdoc.config.mjs` lives at the **project root**, not `src/`.
- `wrangler.jsonc` (not `.toml`).
- Pagination: `posts/page/[page].astro` (subdir) rather than `posts/[page].astro` (collision with `[slug]`).
- No `pages/keystatic/*` files — Keystatic's Astro integration auto-mounts those routes.
- No `pages/sitemap-index.xml.ts` — `@astrojs/sitemap` integration handles it.

---

## Tooling notes

- Installed agent skills under `.agents/skills/`: `wrangler`, `workers-best-practices`, `astro`. They're available to any tool that respects `.agents/skills/`.
- The Vercel plugin auto-injects "use the next-forge skill"-style suggestions on file writes. **Ignore them** — this project is Astro on Cloudflare, not Next.js on Vercel.
