# portfolio-blog

A bilingual (EN/UK) personal blog. Built per [`blog-build-plan.md`](./blog-build-plan.md) (historical plan; the CMS has since moved to Sanity).

**Stack:** Astro 7 · Cloudflare Workers · Sanity · Tailwind 4 · DaisyUI 5 · Portable Text · D1 · Cloudflare Email · Giscus · Telegram notifications.

**Adapter versions:** `@astrojs/cloudflare` 14 · `@astrojs/node` 11 · `wrangler` 4.

**Served at `www.serhiichernenko.com/blog/*`** — the host root and other paths belong to a separate portfolio app. See [`docs/DNS-ROUTING.md`](./docs/DNS-ROUTING.md).

**Content:** posts, pages, menus and site copy live in [Sanity](https://www.sanity.io) (project `8xspnp7h`, dataset `production`) and are edited in the hosted Studio at <https://serhiichernenko-blog.sanity.studio>. The Studio source is in [`studio/`](./studio). Pages render on demand and are cached on Workers Cache; a signed Sanity webhook purges the cache on publish.

**Docs:**

- [`docs/SANITY.md`](./docs/SANITY.md) — CMS architecture, Studio deploys, Visual Editing, caching, webhook and secrets
- [`docs/CONTENT.md`](./docs/CONTENT.md) — author flow: write, translate, schedule and preview posts in the Studio
- [`docs/EMAIL.md`](./docs/EMAIL.md) — Cloudflare Email Workers setup + newsletter constraints
- [`docs/TELEGRAM.md`](./docs/TELEGRAM.md) — Telegram bot setup + events
- [`docs/DNS-ROUTING.md`](./docs/DNS-ROUTING.md) — hostnames, Worker routes and apex redirect
- [`GO-LIVE.md`](./GO-LIVE.md) — manual production checklist
- [`blog-build-plan.md`](./blog-build-plan.md) — original spec

**Connect:** [YouTube](https://youtube.com/@serhii.chernenko) · [LinkedIn](https://www.linkedin.com/in/serhiichernenko/) · [Instagram](https://www.instagram.com/serhiichernenko.ua) · [TikTok](https://www.tiktok.com/@serhiichernenko.ua) · [Threads](https://www.threads.net/@serhiichernenko.ua) · [Telegram](https://t.me/serhii_chernenko) · [X/Twitter](https://x.com/serhiichernenko)

**Support:** [Buy Me a Coffee](https://www.buymeacoffee.com/serhii.chernenko)

---

## Running locally

There are two ways to run the site. Use them deliberately. Both serve under the `/blog` base path, like production.

### One-time setup — create `.dev.vars` from the example

Both commands read a single `.dev.vars` file (no `.env` involved):

```bash
cp .dev.vars.example .dev.vars
# then fill in SUBSCRIBE_RATE_LIMIT_SECRET (any string locally)
# and, for draft preview, SANITY_API_READ_TOKEN + DRAFT_MODE_COOKIE_SECRET
```

`pnpm dev` uses dotenv-cli to load `.dev.vars` so server secrets and `PUBLIC_*` vars are available. `pnpm wrangler:dev` loads it the same way at build time (so `PUBLIC_*` vars are inlined), and wrangler reads it natively at runtime.

### 1. `pnpm dev` — fast iteration on pages, components, styles

```bash
pnpm install
pnpm dev
```

Opens at <http://localhost:4321/blog/>. HMR and hot-reload. Published content comes from Sanity over the public dataset, so no token is needed to read it. Draft preview needs `SANITY_API_READ_TOKEN` and `DRAFT_MODE_COOKIE_SECRET` in `.dev.vars` (see [`docs/SANITY.md`](./docs/SANITY.md#visual-editing--draft-mode)).

What this gives you:

- All pages, layouts, components, Tailwind/DaisyUI, live Sanity content, search, theme toggle, language switcher
- The email template editor at <http://localhost:4321/blog/admin/emails> (only available in `astro dev`)
- API routes mount, but **they have no Cloudflare bindings here** (no D1). `/api/subscribe`, `/api/confirm`, `/api/unsubscribe` throw "D1 binding 'DB' is not available". For full API testing, use option 2.

What this does **not** give you:

- Real Cloudflare runtime — no D1, secrets binding, send_email
- Workers Cache — route caching and the revalidation webhook only run on the Cloudflare adapter

#### Why `pnpm dev` uses the Node adapter

`pnpm dev` sets `ASTRO_NODE_DEV=true`, and `astro.config.mts` then selects `@astrojs/node` instead of `@astrojs/cloudflare`. The email template editor reads and writes `src/emails/*.json` with Node `fs`, which workerd does not have. Without the flag (`pnpm build`, `pnpm wrangler:dev`, production) the Cloudflare adapter and Workers Cache are used.

### 2. `pnpm wrangler:dev` — built Worker on the workerd runtime

Builds the project, then runs `wrangler dev` on the output. This is the closest you can get to production locally: the real route table (including injected routes), Workers Cache, D1, the assets binding and the `send_email` binding (logs locally, no real delivery).

```bash
pnpm wrangler:dev       # build with .dev.vars loaded, then wrangler dev
```

Open <http://localhost:8787/blog/> (`dev.host` in `wrangler.jsonc`). Requires `.dev.vars` (see above): `SUBSCRIBE_RATE_LIMIT_SECRET` is required, the rest are optional (Telegram, Sanity). Apply the local D1 schema once with `pnpm d1:apply:local`.

What this gives you:

- Full CF runtime: D1, assets binding, send_email binding, Workers Cache, the Sanity revalidation route
- The subscribe/confirm/unsubscribe flow end-to-end against local D1

What this does **not** give you:

- HMR — every code change needs another `pnpm wrangler:dev` cycle
- Real email send — log only
- Real Telegram notifications (unless `.dev.vars` has real bot credentials)

> `pnpm preview` runs `astro preview` in isolation. It does not replicate Cloudflare routes faithfully (injected routes can 404 falsely), so use `pnpm wrangler:dev` to verify behavior.

### Studio

The Studio is a separate package:

```bash
cd studio && pnpm install && pnpm dev
```

See [`docs/SANITY.md`](./docs/SANITY.md#local-development).

---

## Build

```bash
pnpm build         # wrangler types + astro build + post-build (production build, base /blog)
pnpm build:astro   # just astro build — fastest when iterating
```

Build output:

- `dist/client/` — static assets (CSS, JS, fonts, favicons). This is what the `ASSETS` binding in `wrangler.jsonc` (`"directory": "./dist/client"`) serves publicly.
- `dist/server/` — the Worker script. `wrangler.jsonc` `main` points to `@astrojs/cloudflare/entrypoints/server`. Files here are never served as public assets.

Content routes are rendered on demand from Sanity, so content changes never need a rebuild.

`pnpm wrangler:dev` and `pnpm wrangler:deploy` both call `pnpm build` — the local preview and the prod deploy share the same artifact.

## Deploy

This is the deploy-ready scaffold. **Before the first deploy you must do the steps in "Placeholders to fill" below and in [`GO-LIVE.md`](./GO-LIVE.md).**

```bash
pnpm wrangler:deploy
```

Production deploys run through Cloudflare Workers Builds (dashboard Git integration) on push to `main`; GitHub Actions only runs CI. The Sanity Studio is deployed separately from `studio/` — see [`docs/SANITY.md`](./docs/SANITY.md#deploys).

## D1 schema

```bash
pnpm d1:apply:local    # against local sqlite (.wrangler/state/...)
pnpm d1:apply:remote   # against the real D1 instance
```

Migrations live in `schema/`.

---

## Placeholders to fill before first production deploy

These are intentionally left as placeholders — none of them have safe defaults.

1. **`wrangler.jsonc`** — set `d1_databases[0].database_id` after running:
   ```bash
   pnpm wrangler d1 create portfolio-blog
   ```
2. **`astro.config.mts`** — canonical `SITE` constant (used for sitemap/RSS absolute links) is hardcoded. Edit the file to change it. Runtime URLs (e.g. subscribe confirm links) are derived from the incoming request, so previews and `wrangler dev` self-reference automatically.
3. **Cloudflare Email Service** — outbound email uses CF's native `send_email` Worker binding (no third-party API key needed). Before the first deploy:
   - Enable **Email Routing** on `serhiichernenko.com` in the Cloudflare dashboard (Email → Email Routing).
   - Add a verified sender address matching `MAIL_FROM` (e.g. `hello@serhiichernenko.com`). CF will send a verification email to the address — click the link.
   - The `send_email` binding with no `destination_address` restriction enables the Cloudflare Email Service API, which supports sending to **arbitrary subscriber addresses** (newsletter use case). This is currently in **beta** — if you hit delivery issues at scale, consider adding Resend/Postmark as a fallback.
   - `MAIL_FROM` is set as a `var` in `wrangler.jsonc` (default: `hello@serhiichernenko.com`). Override per environment if needed.
4. **Sanity** — project `8xspnp7h` and the Studio already exist. Create a Viewer token and a webhook as described in [`docs/SANITY.md`](./docs/SANITY.md).
5. **`.github/workflows/ci.yml`** — uses these repo vars:
   - Vars: `PUBLIC_GISCUS_*`
6. **Wrangler secrets** (set with `pnpm wrangler secret put <NAME>`):
   - `SUBSCRIBE_RATE_LIMIT_SECRET` — random 32+ bytes, used to derive opaque tokens and keyed abuse hashes. Accessed via `astro:env/server` (required, validated at runtime).
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — optional; accessed via `astro:env/server`. Empty/unset values cause `notify()` to no-op silently.
   - `SANITY_API_READ_TOKEN`, `DRAFT_MODE_COOKIE_SECRET`, `SANITY_WEBHOOK_SECRET` — optional; Sanity Viewer token and draft-session signing key (draft preview needs both), and the secret that signs the cache-purge webhook. Read on demand through `src/lib/server-secrets.ts`, so an invalid secret never breaks content routes. See [`docs/SANITY.md`](./docs/SANITY.md#secrets).
7. **`.github/labels.yml`** — optional: create the `dev` label manually in repo settings, or wire `crazy-max/ghaction-github-labeler` to do it.
8. **Giscus** — install the [Giscus GitHub App](https://github.com/apps/giscus), enable Discussions on the repo, then visit [giscus.app](https://giscus.app) to get the `PUBLIC_GISCUS_*` values and put them in repo vars.
9. **`public/og-default.png`** — replace the 1×1 placeholder with a real 1200×630 PNG. Phase 2 per the plan generates per-post OGs via satori.

---

## Environment variable / secret access model

There are three distinct sources for runtime values — use the right one for each variable:

| Source               | What it covers                                                                                                                                                                              | How to access in code                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `astro:env/server`   | Worker secrets: `SUBSCRIBE_RATE_LIMIT_SECRET` (required); `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SANITY_API_READ_TOKEN`, `SANITY_WEBHOOK_SECRET`, `DRAFT_MODE_COOKIE_SECRET` (optional) | `import { SUBSCRIBE_RATE_LIMIT_SECRET } from 'astro:env/server'` |
| `astro:env/client`   | Public build-time vars: `PUBLIC_GISCUS_*`                                                                                                                                                   | `import { PUBLIC_GISCUS_REPO } from 'astro:env/client'`          |
| `cloudflare:workers` | Bindings (DB, SEND_EMAIL, ASSETS) and wrangler.jsonc `vars` (MAIL_FROM)                                                                                                                     | `import { env } from 'cloudflare:workers'`                       |

> `Astro.locals.runtime.env` no longer exists (removed in `@astrojs/cloudflare` v13). All binding access goes through `cloudflare:workers`.

`MAIL_FROM` stays a wrangler.jsonc `var` (non-secret, inlined into the Worker bundle). The Sanity project ID, dataset and API version are constants in `src/lib/sanity/config.ts`.

`.dev.vars` is the single local env file for both `pnpm dev` and `pnpm wrangler:dev`. No `.env` file is used. `.gitignore` excludes `.dev.vars*` (all variants).

---

## Skipped intentionally (Phase 2 per plan)

- Custom OG image generator — MVP uses a single default (or the Sanity `defaultOgImage`).
- Custom comment system — Giscus is MVP.
- Newsletter campaigns — MVP supports subscribe/confirm/unsubscribe only.

---

## Repository layout

See `blog-build-plan.md` §5 for the original layout (historical). Notable deviations:

- `studio/` — the Sanity Studio, a standalone package with its own lockfile.
- `src/lib/sanity/` — Sanity client, request context, GROQ queries, image URL helpers, draft-mode helpers.
- `src/components/portable-text/` — Portable Text rendering (code, image, callout, YouTube, headings, links).
- `wrangler.jsonc` (not `.toml`).
- Pagination: `posts/page/[page].astro` (subdir) rather than `posts/[page].astro` (collision with `[slug]`).
- Sitemap, RSS, `llms.txt` and search (`/blog/api/search`) are on-demand routes backed by Sanity.

---

## Tooling notes

- Installed agent skills under `.agents/skills/`: `wrangler`, `workers-best-practices`, `astro`. They're available to any tool that respects `.agents/skills/`.
- The Vercel plugin auto-injects "use the next-forge skill"-style suggestions on file writes. **Ignore them** — this project is Astro on Cloudflare, not Next.js on Vercel.
