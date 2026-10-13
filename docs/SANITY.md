# Sanity — CMS Setup, Deploys and Caching

Blog content (posts, pages, menus, site copy) lives in [Sanity](https://www.sanity.io). The Astro site reads it on demand; authors edit it in a hosted Studio.

| Piece       | Value                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| Project     | `8xspnp7h`                                                               |
| Dataset     | `production` (public read; drafts are private)                           |
| Studio URL  | <https://serhiichernenko-blog.sanity.studio>                             |
| Studio code | `studio/` (standalone package, own `pnpm-lock.yaml`)                     |
| Site client | `src/lib/sanity/` (`config.ts`, `client.ts`, `request.ts`, `queries.ts`) |
| API version | `2026-10-01`                                                             |

Authoring steps (create a post, translate, schedule, preview) are in [`CONTENT.md`](./CONTENT.md). This document covers architecture, deploys, preview and caching.

> Migrated from Keystatic/Markdoc in `f84d56e`. Keystatic, Markdoc, Pagefind and `@astrojs/sitemap` are gone; search is a GROQ endpoint and the sitemap is rendered on demand. The Keystatic infrastructure still has to be shut down; see [Keystatic decommission](#keystatic-decommission).

---

## Architecture

```
Sanity Studio (studio/, hosted on sanity.studio)
        │ publish / edit
        ▼
Sanity Content Lake (8xspnp7h / production)
        │ GROQ over the API (published, no token; drafts, viewer token)
        ▼
Cloudflare Worker (Astro, SSR) ── Workers Cache (tag `sanity`)
        ▲
        └── signed webhook → POST /blog/api/sanity/revalidate → purge tag
```

### Studio package

`studio/` is a separate pnpm root with its own `package.json` and lockfile. It is not part of the Workers Builds install and is excluded from the site's Prettier, ESLint and typecheck runs (`pnpm typecheck` inside `studio/` checks it). `studio/sanity.config.ts` enables:

- `structureTool` with a localized desk (`studio/src/structure.ts`): Posts and Pages (each grouped by language, plus **З перекладом** / **Без перекладу** lists), **Переклади** (every translation pair), Navigation, Site settings, UI strings.
- `presentationTool` for visual editing against the live site (see [Visual Editing](#visual-editing--draft-mode)).
- `documentInternationalization` for `post` and `page`.
- `internationalizedArray` (`sanity-plugin-internationalized-array`) for field-level translations of menus, site settings and UI strings.
- `assist` (`@sanity/assist`) for AI-assisted document translation of posts and pages.
- `codeInput` and `visionTool` (GROQ playground).

Every post and page form starts with a **Переклади** panel (`studio/src/components/TranslationsPanel.tsx`) that lists the linked translation per language, warns when the other language was edited later, and opens it.

### Document types

| Type           | Localized    | Purpose                                                                                                            |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `post`         | per document | `title`, `slug`, `description`, `publishedAt`, `updatedAt`, `tags`, `heroImage` (+ `alt`), `body` (Portable Text). |
| `page`         | per document | Static pages (about, privacy, support): `key`, `title`, `slug`, `description`, `category`, `updatedAt`, `body`.    |
| `navigation`   | per field    | Header and footer menus (`navItem` list: page key, built-in route, or external URL; optional icon).                |
| `siteSettings` | per field    | Site name, tagline, description, home hero and about copy; one shared default OG image.                            |
| `uiStrings`    | per field    | Optional overrides of interface strings from `src/i18n/ui.ts` (`entries[]` of `key` + localized `value`).          |

Body content (`blockContent`) supports headings h2-h4, quotes, lists, bold/italic/code/strike, links, images (alt required, caption optional), code blocks, `callout` (`info`/`tip`/`warn`/`danger`) and `youtube` embeds. The field-level source of truth is `studio/src/schemaTypes/`.

### Internationalization

Languages are `en` (default) and `uk`, defined once in `studio/src/languages.ts`. `@sanity/document-internationalization` stores one document per language (`language` field, plugin-managed and read-only) and links the translations of a post or page through a `translation.metadata` document. The site reads those links to build the language switcher and `hreflang` alternates. There is no manual pairing field.

Slugs are unique per type and language (`^[a-z0-9-]+$`), so an English and a Ukrainian document can share a slug.

Menus, site settings and UI strings are single documents translated per field instead. `sanity-plugin-internationalized-array` (v5) stores each translatable field as an array with one item per language:

```json
"heroTitle": [
  { "_key": "en", "_type": "internationalizedArrayStringValue", "language": "en", "value": "Building things…" },
  { "_key": "uk", "_type": "internationalizedArrayStringValue", "language": "uk", "value": "Будую речі…" }
]
```

The site selects by the `language` field (`heroTitle[language == $locale][0].value`), never by `_key`; keys of items added in the Studio are random. Stega encodes these values in draft mode when the path ends in `value` under a human-copy field (`label`, the site copy fields, or `entries`), so the overlay jumps to the right language input.

### Singletons: navigation, site settings and UI strings

Menus and site copy are singletons with fixed document IDs, created from Studio templates:

- `navigation-header`, `navigation-footer`: `menu`, `title`, `items[]`. Each `navItem` has a localized `label` (English required; a missing Ukrainian label falls back to English), a `linkType` of `page`, `route` or `external`, and `pageKey`, `route` or `url` accordingly, plus an optional `icon` and `openInNewTab`.
- `siteSettings`: localized `siteName`, `tagline`, `description`, `heroEyebrow`, `heroTitle`, `heroSubtitle`, `aboutTitle`, `aboutBody`, `aboutCta`, and a shared `defaultOgImage`.
- `uiStrings`: `entries[]` of `{ key, value }`, empty by default.

They cannot be created, duplicated or deleted from the Studio, only edited. Presentation shows all three on both home pages.

**Page links by key.** A menu item of type `page` stores the page `key` (the input lists the distinct keys of existing pages), not a reference. Each locale resolves it to its own translation (`*[_type == "page" && key == ^.pageKey && language == $locale][0].slug.current`), so `about` links to `/blog/en/about/` and `/blog/uk/pro-mene/`. If a page has no translation in a locale, the item is left out of that locale's menu. Posts cannot be linked from menus.

**Fallbacks.** When a document or a field is missing for the requested locale, the site falls back to `src/i18n/ui.ts` (the header and footer fall back to built-in menus when their document is missing).

**UI string overrides.** `src/i18n/ui.ts` stays the typed source of truth; `uiStrings` only overrides it. The middleware loads the entries once per page request (published, or the draft perspective in draft mode) into `Astro.locals.uiOverrides`, and pages and components call `useTranslations(locale, Astro.locals.uiOverrides)`, which stays synchronous and prefers an override over `ui.ts`. Placeholders such as `{year}` still work in overrides; unknown keys and empty values are ignored. API routes, emails and the MCP server keep plain `ui.ts`. Translations used in attributes (`aria-label`, `title`, `placeholder`, `data-*`) are stega-cleaned; text nodes keep stega so overrides are clickable in Presentation.

The `key` field only offers valid keys: `studio/src/uiKeys.ts` is generated from `src/i18n/ui.ts`. After adding or renaming a key in `ui.ts`, run `pnpm ui-keys:sync`; `pnpm test:ui-keys` (also in CI) fails when the two drift, and a Studio deploy is needed for the new key to appear.

**Migration.** These documents replaced the per-locale `navigation-{header,footer}-{en,uk}` and `siteSettings-{en,uk}`. `studio/scripts/migrate-layout-i18n.ts` merged them (labels per item position, internal page references converted to page keys, asserting both locales have the same items) and created the empty `uiStrings`; it never deletes the old documents:

```bash
cd studio
pnpm exec sanity exec scripts/migrate-layout-i18n.ts --with-user-token -- --dry-run
pnpm exec sanity exec scripts/migrate-layout-i18n.ts --with-user-token
```

Re-running it overwrites the three layout documents with the content of the old ones, so do not run it after editing the new documents. Delete the six legacy documents once nothing reads them.

### Pages: `key` and reserved slugs

`page.key` is a stable cross-locale identifier (`about`, `privacy`, `support`, unique per language). Code and menus look pages up by `key`, so the Ukrainian slug can differ (`pro-mene`) without breaking links, and a page can be renamed without touching code. Pages are served at `/blog/{locale}/{slug}`, so the Studio rejects slugs that collide with site routes: `posts`, `tags`, `subscribe`, `unsubscribe`, `rss.xml`, `page`, `api`, `admin`, `search`, `sitemap-index.xml`, `sitemap-0.xml` (`RESERVED_PAGE_SLUGS` in `studio/src/schemaTypes/validation.ts`).

---

## Local development

```bash
cd studio
pnpm install
pnpm dev                       # Studio at http://localhost:3333
```

```bash
pnpm dev                       # site at http://localhost:4321/blog/
```

The site always mounts under `/blog`, also in dev. Published content needs no secrets: the public dataset is read without a token. To use the Studio Presentation tool against your local site:

1. Add `SANITY_API_READ_TOKEN` and `DRAFT_MODE_COOKIE_SECRET` to `.dev.vars` (see [Secrets](#secrets)).
2. Start the Studio with `SANITY_STUDIO_PREVIEW_ORIGIN=http://localhost:4321 pnpm dev`. Without that variable Presentation points at `https://serhiichernenko.com`. `http://localhost:*` is an allowed preview origin in `sanity dev` only; the deployed (production) Studio does not allow it.

Run the site against the real Workers runtime (build + `wrangler dev`, served at <http://localhost:8787/blog/>) with `pnpm wrangler:dev`.

`pnpm dev` runs on the Node adapter (needed for the filesystem-based email template editor). Workers Cache is only attached to the Cloudflare adapter, so route caching and the revalidation webhook are only exercised under `pnpm wrangler:dev` and in production.

---

## Deploys

Site deploys are unchanged: Cloudflare Workers Builds runs `pnpm build` and deploys on push (see [`GO-LIVE.md`](../GO-LIVE.md)). Content changes never need a site deploy; they go live through the webhook below.

The Studio and its schema are deployed separately, from `studio/`:

```bash
npx sanity login               # use the account that owns project 8xspnp7h
cd studio
pnpm schema:deploy             # publishes the schema to the Content Lake
pnpm run deploy                # builds and uploads the Studio to serhiichernenko-blog.sanity.studio
```

Redeploy both whenever `studio/src/` changes (new fields, validation, structure). `deployment.appId` in `studio/sanity.cli.ts` (`STUDIO_APP_ID` in `studio/src/project.ts`) pins the existing deployment, so `pnpm run deploy` updates `serhiichernenko-blog.sanity.studio` without asking for a hostname. Use `pnpm run deploy`, not `pnpm deploy` (that is pnpm's own workspace deploy command).

The hosted Studio is a static build: `deployment.autoUpdates` is `false`, so it does not load `sanity` from Sanity's module CDN and never changes on its own. Studio upgrades, schema changes and config such as `SITE_ORIGIN` ship only with the next `cd studio && pnpm run deploy`. Auto-updates were turned off because the CDN build of `sanity` embeds a different `@sanity/ui` 4.4.x than the bundled plugins, and the two stylesheets reuse the same hashed class names for different components, which broke the form layout (buttons rendered as full-size overlays). Keep a single `@sanity/ui` copy in `studio/pnpm-lock.yaml`; check with `pnpm build` + `pnpm exec sanity preview --port 3334` before deploying.

---

## Visual Editing / draft mode

The Studio's Presentation tool opens the live site in an iframe and edits content in place.

1. Presentation calls `/blog/api/draft-mode/enable` with a one-time secret (`@sanity/preview-url-secret`). The route validates it with the viewer token. An invalid secret, or a missing `SANITY_API_READ_TOKEN` or `DRAFT_MODE_COOKIE_SECRET`, returns 401.
2. On success it sets two cookies (`Secure`, `SameSite=None`, `Path=/blog`, and `Partitioned` when loaded as a cross-site iframe) and redirects to a same-origin `/blog/...` page with `?preview=1` appended. Redirect targets outside `/blog/` or under `/blog/api/` fall back to `/blog/en/`.
   - `sanity-draft-session` (`HttpOnly`, 12 h): `<expiry>.<nonce>.<signature>`, where the signature is HMAC-SHA256 over `draft-session:v1:<expiry>.<nonce>` keyed with `DRAFT_MODE_COOKIE_SECRET`. This is the only thing that unlocks draft mode.
   - `sanity-preview-perspective`: only selects the perspective of a valid session. Allowed values are `drafts`, `published`, release ids (`r…`), or a comma-separated stack of those; anything else means `drafts`. On its own it does nothing, so setting it by hand cannot reveal drafts.
3. When the session verifies and has not expired, the middleware serves content from the chosen perspective (drafts and future-dated posts unless the perspective is `published`) through the uncached API with the viewer token, enables stega encoding on that client only, and renders the `VisualEditing` overlay and preview tools. The telemetry element and client events (see [`OBSERVABILITY.md`](./OBSERVABILITY.md)) are not rendered in draft mode or in the Presentation preview, so editing never pollutes analytics.
4. `/blog/api/draft-mode/disable` expires both cookies (plain and `Partitioned` variants) and redirects back. The overlay shows an "Exit preview" link when the page is opened outside the Studio.

### Why `?preview=1`

Workers Cache keys include the path and query string but not cookies. If a draft response shared a cache key with the published page, one could be served as the other. Draft-mode responses are therefore `Cache-Control: private, no-store` with `X-Robots-Tag: noindex`, route caching is switched off for them, and links inside a preview (including search results) carry `preview=1` so they never collide with published URLs. A request with `?preview` but no valid session is redirected (307, `no-store`) to the same URL without the parameter, before any rendering or Sanity call.

Draft mode requires both `SANITY_API_READ_TOKEN` and `DRAFT_MODE_COOKIE_SECRET`. Without them the site only serves published content.

### Secret loading

`astro:env/server` validates every declared secret when the module is first evaluated, so one missing or invalid secret makes every importer fail. The middleware and the Sanity routes therefore load it on demand through `src/lib/server-secrets.ts` (a dynamic import whose failure just disables draft mode, the webhook and Telegram). Content routes never import it, so a broken unrelated secret such as `SUBSCRIBE_RATE_LIMIT_SECRET` only breaks the subscription routes that use it. For the same reason `DRAFT_MODE_COOKIE_SECRET` has no `min` in the schema: values shorter than 32 characters are treated as unset in code instead of failing validation for everything.

---

## Caching

A published page passes through four layers:

1. **Per-request memo** (`src/lib/sanity/request.ts`): identical GROQ queries inside one request (layout, about lookups) run once.
2. **Sanity API origin**: published reads use `useCdn: false`. Workers Cache is the edge layer, and reading from the API origin means a page re-rendered right after a webhook purge never picks up stale data from the Sanity API CDN.
3. **Astro route cache on Workers Cache** (`cacheCloudflare()` in `astro.config.mts`, `"cache": { "enabled": true }` in `wrangler.jsonc`): the middleware tags GET/HEAD 200 responses (HTML, RSS, `llms.txt`, sitemaps, `/blog/api/search`) with `{ maxAge: 3600, swr: 86400, tags: ['sanity'] }`, and 404s with `{ maxAge: 60, tags: ['sanity'] }` (no stale-while-revalidate), so a newly published slug never stays a cached 404 for long; responses that set cookies or are `private`/`no-store` are not. Admin and other API routes are never cached.
4. **Image CDN**: images are served from the Sanity image CDN with immutable URLs.

### Revalidation

Publishing in the Studio fires a webhook to `POST /blog/api/sanity/revalidate`. The route:

1. Rejects a `Content-Length` over 256 KB (413) before reading, then reads the body with a byte-capped reader (413 when it overflows).
2. Parses `t=` from the `sanity-webhook-signature` header and rejects timestamps more than 5 minutes old or in the future (401), which limits replay of a captured request.
3. Verifies the signature against `SANITY_WEBHOOK_SECRET` (401 on mismatch).
4. Purges the `sanity` tag. A purge failure returns 503 so Sanity retries. Everything is purged on any relevant change on purpose: menus, lists, tags and translation links make most pages depend on most documents.
5. When the payload is a `post` with `operation == "create"` (the first publish of that document), sends a Telegram notification, `📝 New post published: <title> (<LANG>) <absolute post URL>`, through `src/lib/telegram.ts` in the background (`waitUntil`). It is sent only after a successful purge, so a 503 retry does not notify twice.
6. Submits the changed URLs to IndexNow in the background, after the purge (see [IndexNow on publish](#indexnow-on-publish)).

Scheduled (future `publishedAt`) posts do not trigger a webhook when their time arrives, so they appear once the cached pages expire, about an hour (`maxAge`) after the scheduled time. To publish immediately, set `publishedAt` to now, or edit any document to fire the webhook. For the same reason neither a cache purge nor an IndexNow submission happens when a scheduled post goes live; the post-deploy IndexNow workflow or a manual run covers it (see [`SEO.md`](./SEO.md#indexnow)).

If the webhook is misconfigured, the site keeps working and pages refresh when their TTL expires (`maxAge` 1h, then `swr` serves stale up to 1 day while revalidating).

### IndexNow on publish

After a successful cache purge, `src/pages/api/sanity/revalidate.ts` submits the affected URLs to [IndexNow](https://www.indexnow.org) so Bing, Yandex and other participating engines learn about them without waiting for a crawl. The logic lives in `src/lib/indexnow.ts`.

- **Where it runs:** in the background (`waitUntil`), and only on the production host (`serhiichernenko.com`). Preview, workers.dev and local requests never submit.
- **Which documents:** only `post` and `page` payloads with a valid `language` and `slug`. Navigation, site settings and translation metadata changes submit nothing.
- **Which URLs:** the document's own URL; its old URL when `previousSlug` differs from `slug` (a slug rename); and, for posts, the locale home and the posts index of that locale.
- **Scheduled posts:** a post whose `publishedAt` is in the future is skipped.
- **Key:** `aa97432c46c58c839540be4d044ece78`, with the key file at `https://serhiichernenko.com/blog/aa97432c46c58c839540be4d044ece78.txt`. Submissions go to `https://api.indexnow.org/indexnow`.
- **Failures:** a rejected or failed submission is logged and never fails the webhook, so Sanity does not retry the delivery because of IndexNow.

The other IndexNow path, the GitHub Actions workflow that runs after each deploy (`indexnow.yml`), is described in [`SEO.md`](./SEO.md#indexnow).

### Webhook setup

Create it once at <https://www.sanity.io/manage> → project `8xspnp7h` → **API** → **Webhooks** → **Create webhook**:

| Setting        | Value                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| URL            | `https://serhiichernenko.com/blog/api/sanity/revalidate`                                                                                   |
| Dataset        | `production`                                                                                                                               |
| Trigger on     | Create, Update, Delete                                                                                                                     |
| Filter (GROQ)  | `_type in ["post","page","navigation","siteSettings","uiStrings","translation.metadata"]`                                                  |
| Projection     | `{_id, _type, "operation": delta::operation(), title, language, "slug": slug.current, publishedAt, "previousSlug": before().slug.current}` |
| HTTP method    | `POST`                                                                                                                                     |
| Include drafts | Off                                                                                                                                        |
| Secret         | The value you set as `SANITY_WEBHOOK_SECRET`                                                                                               |

Keep the projection small: the handler rejects bodies over 256 KB and a full post body can exceed that. `operation`, `title`, `language` and `slug` feed the first-publish Telegram notification. `publishedAt` and `previousSlug` feed [IndexNow](#indexnow-on-publish): `publishedAt` lets the handler skip posts scheduled for the future, and `previousSlug` (the slug before this change) lets it also submit the old URL after a slug rename. Everything else only needs `_id` and `_type`.

Verify with an edit-and-publish in the Studio, then check the Worker logs for the request (the route returns `{"purged":true}`) and reload the page.

---

## Secrets

All are optional; the site builds and serves published content without them. Declared in `astro.config.mts` (`astro:env`, server secrets) and documented in the header of `wrangler.jsonc`.

| Secret                     | What it is                                                                                                           | Without it                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `SANITY_API_READ_TOKEN`    | Sanity **Viewer** token (manage → API → Tokens). Read-only, can see drafts.                                          | Draft mode / Presentation disabled (401).       |
| `SANITY_WEBHOOK_SECRET`    | Random string shared with the Sanity webhook. Generate with `openssl rand -base64 32`.                               | Revalidation returns 401; pages refresh by TTL. |
| `DRAFT_MODE_COOKIE_SECRET` | HMAC key that signs the `sanity-draft-session` cookie, at least 32 characters. Generate with `openssl rand -hex 32`. | Draft mode / Presentation disabled (401).       |

Production:

```bash
pnpm exec wrangler secret put SANITY_API_READ_TOKEN
pnpm exec wrangler secret put SANITY_WEBHOOK_SECRET
pnpm exec wrangler secret put DRAFT_MODE_COOKIE_SECRET
```

Local: add the same names to `.dev.vars` (copied from `.dev.vars.example`). Secrets are read at runtime, so no rebuild is needed after changing them.

---

## Troubleshooting

**Content changed in the Studio but the site still shows the old version.**
Check the webhook delivery log in the Sanity project (API → Webhooks). A 401 means the secret differs from `SANITY_WEBHOOK_SECRET` or the delivery was older than 5 minutes; a 503 means the cache purge failed and will be retried. A scheduled post only appears after the cache expires (see above).

**Presentation shows an empty or erroring preview.**
`SANITY_API_READ_TOKEN` or `DRAFT_MODE_COOKIE_SECRET` is missing (the enable route returns 401), or the site origin is not in `allowOrigins` in `studio/sanity.config.ts` (site origin, `https://*.chernenko.workers.dev`, and `http://localhost:*` outside production Studio builds).

**A new field or validation rule does not appear in the Studio.**
Redeploy: `cd studio && pnpm schema:deploy && pnpm run deploy`.

**`sanity deploy` or `schema deploy` fails to authenticate.**
Run `npx sanity login` with the account that owns project `8xspnp7h`.

---

## Keystatic decommission

Keystatic is no longer used. Remove its leftover infrastructure once the Sanity cutover is verified:

- [ ] Delete the GitHub App `serhii-chernenko-portfolio-blog` (GitHub → Settings → Developer settings → GitHub Apps).
- [ ] Delete the three Worker secrets:
  ```bash
  pnpm exec wrangler secret delete KEYSTATIC_SECRET
  pnpm exec wrangler secret delete KEYSTATIC_GITHUB_CLIENT_ID
  pnpm exec wrangler secret delete KEYSTATIC_GITHUB_CLIENT_SECRET
  ```
- [ ] After the next deploy, confirm in the Cloudflare dashboard (Workers & Pages → portfolio-blog → **Domains** tab, or the zone's **Workers Routes** page) that the old `serhiichernenko.com/keystatic`, `/keystatic/*`, `/api/keystatic` and `/api/keystatic/*` Worker routes are gone. `wrangler deploy` replaces the Worker's route set with the routes in `wrangler.jsonc`, but it only adds routes when it falls back to per-zone route creation, so remove any that remain by hand.
- [x] The `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` var is already removed from `wrangler.jsonc`.
