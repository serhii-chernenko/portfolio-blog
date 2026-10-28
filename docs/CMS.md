# EmDash — CMS Setup, Deploys and Caching

Blog content (posts, pages, menus, site copy, media) lives in [EmDash](https://emdashcms.com), an Astro-native CMS that runs inside this Worker. Content is stored in a Cloudflare D1 database, media in R2, and authors edit everything in the admin at `/_emdash/admin`.

| Piece         | Value                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Admin         | <https://serhiichernenko.com/_emdash/admin> (local: <http://localhost:4321/_emdash/admin>)     |
| Version       | `emdash` / `@emdash-cms/cloudflare` 1.3.1 (pinned in `package.json`)                           |
| Database      | D1 `portfolio-blog-cms`, binding `CMS_DB` (separate from the subscriber DB `DB`)               |
| Media         | R2 bucket `portfolio-blog-media`, binding `MEDIA`, served at `/_emdash/api/media/file/<key>`   |
| Content model | `seed/seed.json` (applied once, at setup)                                                      |
| Site plugin   | `plugins/emdash-site/` (custom Portable Text blocks, publish hooks, slug policy)               |
| Data layer    | `src/lib/cms/` (`entries.ts`, `translations.ts`, `context.ts`, `media.ts`, `config.ts`)        |
| Worker entry  | `src/worker.ts` (the Astro handler plus EmDash's Cron Trigger handler)                         |
| Docs          | <https://docs.emdashcms.com>, and the `emdash-docs` MCP server (see [AI tooling](#ai-tooling)) |

Authoring steps (create a post, translate, schedule, preview) are in [`CONTENT.md`](./CONTENT.md). This document covers architecture, setup, deploys, preview and caching.

> Migrated from Sanity (project `8xspnp7h`). The Studio, the GROQ client, draft mode, Visual Editing and the revalidate webhook are gone. `scripts/migrate-sanity-to-emdash.mjs` copies the Sanity content into EmDash; see [Migrating the Sanity content](#migrating-the-sanity-content).

---

## Architecture

```
EmDash admin (/_emdash/admin, same Worker)
        │ edit / publish
        ▼
EmDash runtime ── D1 (CMS_DB) + R2 (MEDIA) + KV (SESSION, admin sessions)
        │ getEmDashCollection / getEmDashEntry / getMenu (in-process, no HTTP)
        ▼
Astro pages under src/pages/blog/ ── route cache (Workers Cache, tags = collection names)
        ▲
        └── publish / unpublish / menu edit → EmDash purges the matching tags
```

### Why the pages live in `src/pages/blog/`

EmDash only works when the site is mounted at the root: its middleware and routes assume `/_emdash/...`, and Astro's `base` option breaks them (in dev Astro re-adds the base to every request URL). So `astro.config.mts` has no `base`; the blog routes live under `src/pages/blog/`, static files under `public/blog/`, and built assets under `/blog/_astro/` (`build.assets`). Public URLs did not change. Code that needs the prefix uses `BASE_PATH` from `src/lib/base-path.ts` (or `localeHref()` / `withBase()` from `src/i18n/utils.ts`).

The Worker is bound to `serhiichernenko.com/blog*` plus `serhiichernenko.com/_emdash/*` (admin, API and media), see [`DNS-ROUTING.md`](./DNS-ROUTING.md).

### Collections

The content model is defined in `seed/seed.json`, which EmDash applies on the first request before setup. After that, the schema lives in the database: change it in the admin (**Content Types**) or with `pnpm exec emdash schema …`, and mirror the change in `seed/seed.json` so a fresh install matches.

| Collection      | Per language                       | Fields                                                                                                                  |
| --------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `posts`         | one entry per language, translated | `title`, `description` (50–200 chars), `revised_at`, `hero_image`, `body` (Portable Text); tags from the `tag` taxonomy |
| `pages`         | one entry per language, translated | `key` (shared), `title`, `description`, `category` (`static`/`legal`, shared), `revised_at`, `body`                     |
| `site_settings` | one entry per language             | `site_name`, `tagline`, `description`, `hero_*`, `about_*`                                                              |
| `ui_strings`    | one entry per key and language     | `key` (shared, select of the keys in `src/i18n/ui.ts`), `value`                                                         |

System fields cover the rest: `slug`, `locale`, `status`, `publishedAt` (the post date), `createdAt`, `updatedAt` and the translation group. Posts and pages support drafts, revisions, preview and the SEO panel; posts also support scheduling. Posts and pages are indexed by EmDash's full-text search.

### What the admin controls

Everything editorial is edited in the admin; code only holds defaults for empty values.

| Admin screen         | Used by the site for                                                                                                                                         | Fallback when empty                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Posts, Pages         | Content, per-entry **SEO** panel (title, description, social image, canonical URL, noindex)                                                                  | Entry title and description, hero image                                                                       |
| Tags                 | Post tags, tag pages and their translations                                                                                                                  | –                                                                                                             |
| Bylines              | Post author in structured data (`BlogPosting`, `WebSite`, `Blog`): name, profile URLs as `sameAs`                                                            | Site name, Settings → Social                                                                                  |
| Menus                | Header and footer                                                                                                                                            | Built-in links                                                                                                |
| Site → Site settings | Per-language site name, tagline, description, home hero and about copy                                                                                       | Settings → General title/tagline, then `src/i18n/ui.ts`                                                       |
| Site → UI strings    | Overrides of interface strings                                                                                                                               | `src/i18n/ui.ts`                                                                                              |
| Settings → General   | Title and tagline (fallbacks, above), Logo (header, instead of the text name), Favicon, Timezone of displayed dates                                          | Text name, `public/blog/favicon.*`, UTC                                                                       |
| Settings → Reading   | Posts per page (posts index, pagination, sitemap)                                                                                                            | 10                                                                                                            |
| Settings → Social    | Profile URLs added to the author's `sameAs`                                                                                                                  | –                                                                                                             |
| Settings → SEO       | Title separator (`{title}{separator}{site name}` on every page but home), default social image, Google/Bing verification, robots.txt, "Disallow AI training" | No suffix, `public/blog/og-default.png`, `PUBLIC_*_SITE_VERIFICATION` build vars, EmDash's default robots.txt |
| Comments             | Comments on posts: moderation queue, approve, spam, trash. Per-collection settings in Content Types → Posts                                                  |
| Redirects            | Redirects of any `/blog/...` path, applied by EmDash before the page renders                                                                                 | –                                                                                                             |

Settings → General's **Date Format** is not used: one pattern can't produce correct dates in both languages, so each language keeps its own `Intl` format (`src/lib/dates.ts`). Categories, Widgets and Sections are EmDash features the site doesn't render.

The built-in settings are read through `src/lib/cms/settings.ts`; the per-entry SEO panel through `src/lib/cms/seo.ts` and `BaseHead.astro`.

### Tags

Tags are terms of EmDash's `tag` taxonomy (admin → **Tags**, and the Tags box on a post). Each language has its own terms; a Ukrainian term is linked to its English one as a translation (`database` ↔ `база-даних`). Term assignments belong to a post's translation group, so a post and its translation carry the same tags, each language showing its own translation of a term (`src/lib/cms/tags.ts`). A term without a translation in a language falls back to the English one there, so translate every term that is used on a Ukrainian post.

The term slug is the URL segment of `/blog/{locale}/tags/{slug}/`, and the tag page's language switcher links to the translated term's page. Tags are listed in label order.

### Bylines

The author is the post's primary byline (admin → **Bylines**), one byline per language (`Serhii Chernenko` / `Сергій Черненко`). Every post credits it explicitly (`pnpm cms:adopt` sets missing credits); pages, site settings and UI strings have no author. Profile URLs live in **Site settings → Author profiles** (one per line, shared by both languages) and become the author's schema.org `sameAs` together with the byline's website and Settings → Social (`BaseHead.astro`, `src/lib/cms/author.ts`).

Keep bylines without custom fields (**Byline Schema** empty) and credit a byline on new posts: EmDash then reads bylines inside the content query. A custom byline field, or an entry with an author but no byline credit, makes every list of that collection load bylines with several extra queries.

### Internationalization

Languages are `en` (default) and `uk`, set in `astro.config.mts` (`i18n.locales`). Astro's i18n routing is `manual`: the site builds its own `/blog/{locale}/` URLs, and EmDash only uses the locale list (it treats `manual` as "no prefix for the default locale", which keeps the admin working).

A translation is a separate entry with its own slug, linked to the original through a translation group (admin: **Translations** panel on the entry). The site reads the group to build the language switcher and `hreflang` alternates (`src/lib/cms/translations.ts`). An entry without a live translation emits no alternates, and the switcher sends the other language to its home page. Fields marked shared (`key`, `category`) are not translatable: a new translation copies them from the original.

Slugs must match `^[a-z0-9-]+$` and are unique per collection and language, so an English and a Ukrainian entry can share a slug. A request for a slug that only exists in the other language is a 404 (EmDash's locale fallback is not used).

### Menus, site settings and UI strings

- **Menus** are native EmDash menus, `header` and `footer`, one per language (admin: **Menus**). An item links to a page (resolved to that language's translation), or to a custom URL. Built-in routes use custom URLs (`/blog/uk/posts/`). The icon is stored in the item's CSS classes as `icon-<name>` (`rss`, `github` or `support`, `NAV_ICONS` in `src/lib/site.ts`), and **Open in new tab** sets `target="_blank"`. If a menu is missing, the header and footer fall back to built-in links.
- **Site settings** is one `site_settings` entry per language. Empty fields fall back to `src/i18n/ui.ts`.
- **UI strings** override interface strings from `src/i18n/ui.ts`, which stays the typed source of truth. Create a `ui_strings` entry per key and language. The middleware loads them once per request into `Astro.locals.uiOverrides`, and `useTranslations(locale, Astro.locals.uiOverrides)` prefers them. Placeholders such as `{year}` still work; empty values are ignored. API routes, emails and the MCP server keep plain `ui.ts`.

The `key` select only offers valid keys. After adding or renaming a key in `ui.ts`, run `pnpm ui-keys:sync` (updates `seed/seed.json`) and add the option to the live schema (admin → **Content Types** → `ui_strings` → `key`). `pnpm test:ui-keys` (also in CI) fails when `ui.ts` and the seed drift.

### Pages: `key` and reserved slugs

`pages.key` is a stable cross-language identifier (`about`, `privacy`, `support`). Code looks pages up by key, so the Ukrainian slug can differ (`pro-mene`) and a page can be renamed without touching code. Pages are served at `/blog/{locale}/{slug}/`, so the site plugin refuses to publish or schedule a page whose slug collides with a site route (`posts`, `tags`, `subscribe`, `unsubscribe`, `rss.xml`, `page`, `api`, `admin`, `search`, `preview`, `sitemap-index.xml`, `sitemap-0.xml`), and any post or page slug outside `^[a-z0-9-]+$`. The list is `RESERVED_PAGE_SLUGS` in `plugins/emdash-site/src/slug-policy.ts`.

### Portable Text

Bodies are Portable Text, rendered by the site's own components (`src/components/portable-text/`):

| Block                                                      | Source        | Notes                                                                                              |
| ---------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| Text, h2–h4, lists, quotes, bold/italic/code/strike, links | EmDash editor | **Open in new tab** on a link stores `blank: true`.                                                |
| Image                                                      | EmDash editor | Alt text, optional caption; the original file is served (no resizing, no `srcset`).                |
| Code                                                       | EmDash editor | `code`, `language`, optional `filename`; highlighted with Shiki on render.                         |
| Callout                                                    | site plugin   | `tone` (`info`/`tip`/`warn`/`danger`) and `text` in Markdown; links in callouts open in a new tab. |
| YouTube                                                    | site plugin   | `id` (the part after `v=`) and optional `title`; embedded from youtube-nocookie.com.               |

### Media

Uploads go to R2 through the EmDash media library. Pages link the original file (`/_emdash/api/media/file/<key>`) with its stored width and height; there is no image transformation (`images: false` in the EmDash config). OG images use the same original file and its real dimensions.

---

## Local development

```bash
pnpm dev                       # site at http://localhost:4321/blog/en/, admin at /_emdash/admin
```

`pnpm dev` runs on the Node adapter with a local SQLite database (`data.db`) and an `uploads/` directory, both gitignored. On a fresh checkout EmDash creates the schema from `seed/seed.json` on the first request. To skip the passkey setup locally, open <http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin>, which signs you in as `dev@emdash.local` (dev only; the route returns 403 in production builds).

To load the real content into the local database, run the migration against the dev server (see [Migrating the Sanity content](#migrating-the-sanity-content)), or copy a production export.

`pnpm wrangler:dev` builds and runs the Worker in workerd with local D1, R2 and KV under `.wrangler/state/`, the closest match to production. Route caching only exists on the Cloudflare adapter, so cache behaviour is only exercised there and in production.

`emdash-env.d.ts` (generated content types) is rewritten by the dev server whenever the schema changes; commit it so `pnpm typecheck` works on a fresh checkout.

---

## Preview

The admin's **Preview** button asks EmDash for a signed, one-hour preview URL. `import.meta.env.EMDASH_PREVIEW_PATH_PATTERN` (set in `astro.config.mts`) points it at `/blog/preview/{collection}/{id}`, and `src/pages/blog/preview/[collection]/[id].ts` redirects to the entry's public URL with the `?_preview=` token. With a valid token the site renders the draft (or the pending draft of a published entry) and shows an **Exit preview** button.

Preview responses are never cached: EmDash keeps `_preview` requests out of the route cache, and the middleware adds `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` and a `noindex` meta tag. Telemetry is off in preview.

The visual-editing toolbar is disabled (`toolbar: false`).

---

## Caching

Content routes are rendered on demand and cached in Workers Cache through Astro's route cache (`cache.provider` in `astro.config.mts`). `src/middleware.ts` sets the policy for every cacheable `GET` (`maxAge` 1 hour, `swr` 1 day) and tags it by what the page shows (`src/lib/cms/config.ts`):

| Pages                                                                           | Tags                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Every page (layout)                                                             | `site_settings`, `ui_strings`, `pages` (menu links), `emdash:menu:header`, `emdash:menu:footer`, `emdash:settings`              |
| A post                                                                          | the layout's, plus the post's ID and its translations' IDs, `posts:group:{translationGroup}`, `emdash:taxonomy:tag`, `comments` |
| A page (about, privacy, support)                                                | the layout's only                                                                                                               |
| Everything else: home, post lists, tag pages, RSS, sitemaps, `llms.txt`, search | every collection and taxonomy (`CMS_CACHE_TAGS`)                                                                                |

A route declares its tags through `Astro.locals.cacheTags`; routes that don't get the full set. Publishing a post therefore purges the lists and that post's pages, not the other posts or the about page.

EmDash purges those tags itself: publishing, unpublishing, deleting, restoring or saving a live entry purges its collection tag, editing a menu purges `emdash:menu:{name}`, editing tags purges `emdash:taxonomy:tag` and saving Settings purges `emdash:settings`. EmDash purges the changed entry's ID as well, and the site plugin purges `posts:group:{translationGroup}` on publish and unpublish, because the other language's switcher and hreflang change too (`src/lib/cache-purge.ts`). Byline edits purge nothing; they show once a page expires or its post is saved. Content changes therefore show up within seconds and never need a deploy. Scheduled posts are purged when the cron publishes them. 404s, preview responses and pages rendered for signed-in editors are never stored.

EmDash doesn't purge anything for comments, so `src/middleware.ts` does: after a successful comment submission or moderation action (`POST /_emdash/api/comments/…`, any write under `/_emdash/api/admin/comments`) it purges the `comments` tag, which only post pages carry. Likes don't purge; their counts update in the browser and refresh with the page.

If a purge fails, pages refresh when their TTL expires.

After a publish or unpublish the site plugin also warms the cache: once the response is sent (EmDash purges before it), it renders the home pages and post lists of both languages and the entry's own page through the Worker's loopback entrypoint (`ctx.exports`), which goes through Workers Cache like a visitor's request (`warmPages` in `src/lib/cache-purge.ts`).

### Deploys keep the cache

An uncached render costs one D1 round trip per query, about 30 ms from the colo that runs the Worker, plus 200–400 ms to start a fresh isolate. EmDash reports the numbers in the `Server-Timing` response header (`db.count`, `db.total`, `rt`); setting `EMDASH_QUERY_LOG=1` for `pnpm dev` logs every query. A post page makes 16 queries, other pages 12–13 (37 and 30+ before bylines were folded into the content query, see [Bylines](#bylines)). The layout's data (`getLayoutData`, memoized per request) starts in the middleware, so it loads alongside the page's own queries. Cached responses take about 50 ms.

Workers Cache keys on the Worker version by default, which made every page uncached after each deploy. `wrangler.jsonc` sets `cache.cross_version_cache: true`, so cached pages survive deploys. As a consequence:

- **Code changes** (markup, styles) reach cached pages when they expire: after 1 hour the stale copy is served once while the new version re-renders it in the background. To apply a deploy to every page at once, save **Settings** in the admin (every page carries the `emdash:settings` tag).
- **Stylesheets are inlined** (`build.inlineStylesheets: 'always'` in `astro.config.mts`). Each deploy replaces the hashed `/blog/_astro/*` files, and old ones return 404, so a page cached by an older version must not link to them. Scripts are inline already, and font files are named by content hash.
- **Content changes** are unaffected: tag purges work the same.

`placement.mode: "smart"` is also on, so Cloudflare can run uncached renders near the D1 primary. So far it keeps the Worker local (`cf-placement: local-…`), most likely because traffic is too low.

---

## Comments

EmDash's built-in comments, enabled for `posts`. `src/components/PostComments.astro` renders EmDash's `Comments` (approved comments, threaded replies, likes) and `CommentForm` from `emdash/ui/comments`, with the UI strings (`comments.*`, Ukrainian plural forms included) and the DaisyUI theme colours mapped to their `--ec-*` custom properties. Comments belong to one language's entry, so each translation has its own thread.

- **Moderation** (Content Types → Posts): a commenter's first comment is held for review, later ones publish directly; comments never close (EmDash's default is 90 days, which would lock older posts); comments from signed-in admin users are approved.
- **Spam:** a honeypot field and a per-IP rate limit (salted hash, no raw IPs stored) are always on. [Turnstile](https://developers.cloudflare.com/turnstile/) is optional: `PUBLIC_TURNSTILE_SITE_KEY` (build variable) plus the `EMDASH_TURNSTILE_SECRET_KEY` Worker secret.
- **Notifications:** the site plugin's `comment:afterCreate` hook (`src/lib/comment-hooks.ts`, production host only) sends `💬 New comment` to Telegram with the post, the author, an excerpt and the admin link. EmDash's own comment emails need an email provider, which isn't configured.
- **Privacy:** the privacy pages describe what is stored (name, email, comment, salted IP hash).

## Publish side effects

The site plugin's `content:afterPublish` hook (`src/lib/publish-hooks.ts`) replaces the Sanity webhook:

- **IndexNow:** on the production host only, submits the entry's URL and, for posts, the locale home and posts index (`src/lib/indexnow.ts`). Posts dated in the future are skipped. See [`SEO.md`](./SEO.md#indexnow).
- **Telegram:** the first time a post goes live (its `publishedAt` is within the last hour), sends `📝 New post published` with the title, language and URL. A plugin KV flag per entry makes it fire at most once, so republishing or editing never repeats it. See [`TELEGRAM.md`](./TELEGRAM.md).

Both run after the response (`after()`) and never fail the publish.

### Scheduled publishing

Scheduled posts are published by a Cron Trigger (`triggers.crons` `* * * * *` in `wrangler.jsonc`, handled in `src/worker.ts`), which also runs the publish hooks and the cache purge. Under `pnpm dev` (Node), EmDash runs the same sweep on a timer.

---

## Deploys

Site and CMS deploy together: Cloudflare Workers Builds runs `pnpm build` and deploys on push to `main` (see [`GO-LIVE.md`](../GO-LIVE.md)). EmDash runs its pending database migrations on the first request after a deploy.

### First production setup

1. **Resources** (done). D1 `portfolio-blog-cms` (`database_id` `2ffe316d-927f-4c83-acce-5f0ff72e893b`, region WEUR) and R2 `portfolio-blog-media` were created with `wrangler d1 create` / `wrangler r2 bucket create`. The Cloudflare adapter adds the `SESSION` KV namespace for admin sessions, which `wrangler deploy` provisions.
2. **Deploy**, then open <https://serhiichernenko.com/_emdash/admin>. The setup wizard creates the first admin with a passkey. Until content is migrated, the blog has no posts.
3. **API token:** admin → **Settings** → **API Tokens** → create a token with admin scope.
4. **Migrate the content** (next section), then check the site and the admin.

No new secrets are needed. EmDash generates its preview-signing secret on first use and stores it in D1. `EMDASH_ENCRYPTION_KEY` (`pnpm exec emdash secrets generate`) is only required if a plugin declares secret settings; neither plugin here does.

### Migrating the Sanity content

`scripts/migrate-sanity-to-emdash.mjs` reads the Sanity dataset over the export API and writes it through the EmDash REST API:

```bash
# local dev server (uses the dev bypass for a token)
pnpm cms:migrate-sanity -- --url http://localhost:4321

# production
EMDASH_TOKEN=<admin API token> SANITY_API_READ_TOKEN=<Sanity viewer token> \
  pnpm cms:migrate-sanity -- --url https://serhiichernenko.com
```

It uploads the 28 images to the media library, creates pages and posts per language with their translation links, original publish and creation dates, site settings, UI string overrides and both menus. With a Sanity token it also copies unpublished drafts: a draft-only post becomes an EmDash draft, and pending edits of a published entry become its pending draft. Entries that already exist (same collection, language and slug) and existing menus are skipped, so the script can be re-run safely. `--dry-run` reports without writing.

Verified locally: after migrating, a crawl of all 113 public URLs (pages, tags, RSS, sitemaps, `llms.txt`, search API) matched the Sanity-backed site, except the OG image URLs.

### Moving an existing site onto the built-in features

`scripts/cms-adopt-emdash-features.mjs` (`pnpm cms:adopt`) brings a site migrated before tags, bylines and the SEO panel were wired up to the current model. It is idempotent and never overwrites values already set in the admin:

1. turns on the SEO panel for posts and pages;
2. turns the legacy `posts.tags` list into `tag` terms per language, links Ukrainian terms to their English ones and assigns them (`швидкодія` is the Ukrainian term for `performance`, since the old data used `продуктивність` for both performance and productivity);
3. creates the author byline (English and Ukrainian), linked to the signed-in user, moves profile URLs from the old `profiles` byline field to Site settings → Author profiles and deletes that field, credits the byline on every post without one and clears the author of pages, site settings and UI strings (so bylines load without extra queries);
4. prefills Settings → SEO robots.txt (from `seed/robots.txt`), the default social image (`public/blog/og-default.png`), the site URL and the social links;
5. with `--remove-legacy-fields`, deletes `posts.tags` and `site_settings.default_og_image`.

```bash
EMDASH_TOKEN=<admin API token> pnpm cms:adopt -- --url https://serhiichernenko.com            # before deploying the code
EMDASH_TOKEN=<admin API token> pnpm cms:adopt -- --url https://serhiichernenko.com --remove-legacy-fields  # after
```

Run steps 1–4 before deploying code that reads taxonomy terms, so tags never disappear, and remove the legacy fields after the deploy.

### Decommissioning Sanity

After the production content is verified:

- [ ] Delete the old Worker secrets: `pnpm exec wrangler secret delete SANITY_API_READ_TOKEN`, `SANITY_WEBHOOK_SECRET`, `DRAFT_MODE_COOKIE_SECRET`.
- [ ] Delete the revalidate webhook in the Sanity project (manage → API → Webhooks).
- [ ] Undeploy the Studio (`serhiichernenko-blog.sanity.studio`) and archive or delete project `8xspnp7h` once an export is kept somewhere.

---

## AI tooling

- **Docs MCP:** `emdash-docs` (`https://docs.emdashcms.com/mcp`, public, read-only) is configured for Claude Code (`.mcp.json`), Cursor (`.cursor/mcp.json`), VS Code (`.vscode/mcp.json`) and OpenCode (`opencode.jsonc`). Codex: `codex mcp add emdash-docs --url https://docs.emdashcms.com/mcp`.
- **Agent skills:** `building-emdash-site`, `creating-plugins`, `emdash-cli` and `upgrading-emdash` from `emdash-cms/skills` are installed in `.agents/skills/` (tracked in `skills-lock.json`).
- **Site MCP:** EmDash also serves a content-management MCP server at `/_emdash/api/mcp` (OAuth). It is separate from the blog's public read-only MCP at `/blog/api/mcp` ([`MCP.md`](./MCP.md)).

---

## Troubleshooting

**A change in the admin does not show on the site.**
Check that the entry is published, not only saved as a draft. Then check the Worker logs for a purge error; without a purge the page refreshes within an hour.

**The admin shows a 404 or the blog layout.**
The request did not reach the Worker's `/_emdash/*` route. Check the Worker routes (`wrangler.jsonc` `routes[]`, then the zone's Workers Routes page).

**Publishing fails with "The slug … is reserved" or "… can only use lowercase letters".**
The [slug policy](#pages-key-and-reserved-slugs) rejected it. Change the slug.

**Under `pnpm dev`, a hook fails with "Vite module runner has been closed".**
The dev server restarted after a config change while EmDash kept the old plugin instance. Stop and start `pnpm dev`.

**Upgrading EmDash.** Follow the `upgrading-emdash` skill: bump `emdash` and `@emdash-cms/cloudflare` together, run `pnpm typecheck` and `pnpm build`, and read the release notes for schema migrations.
