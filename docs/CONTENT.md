# Writing articles — the Keystatic flow

This blog uses [Keystatic](https://keystatic.com) as a git-backed CMS. Posts are Markdoc files (`.mdoc`) committed to the repo.

**The CMS runs locally only.** It's mounted at:

- <http://127.0.0.1:4321/keystatic> (when running `pnpm dev`)
- <http://127.0.0.1:4321/blog/keystatic> (when running `pnpm wrangler:dev`)

There is **no `/keystatic` route in production**. The integration isn't even bundled into the prod build — visiting `chernenko.digital/blog/keystatic` returns 404, by construction.

Why local-only:
1. **Security.** Without a deployed admin auth gate, anyone hitting `/keystatic` could read or modify content. Keeping it off prod removes that entire class of risk.
2. **Crawlers.** No public CMS URL means nothing for search engines to index or leak.
3. **Keystatic's React UI** hardcodes its API at root-relative `/api/keystatic/...` and doesn't support a base path, so it can't coexist cleanly with our production `/blog/*` mount anyway.

You write content locally → commit and push → CI deploys the post to production. The PR workflow gives you an auto-labeled preview URL before merge.

---

## TL;DR — the happy path

1. `pnpm dev` (or `pnpm wrangler:dev` if you want full prod-parity preview)
2. Open <http://127.0.0.1:4321/keystatic>
3. Click **Posts (English)** → **Add Post**
4. Type a title — slug auto-generates
5. Fill in description, tags, hero image (optional), translationKey
6. Write the body using the WYSIWYG editor. Paste images directly. Embed YouTube via the `youtube` tag. Use `callout` for highlighted notes
7. Toggle **Draft** off when you're ready to publish
8. Hit **Save** — Keystatic writes the `.mdoc` file to disk and the dev server hot-reloads
9. `git add` + `git commit` + `git push` (or open a PR for review)
10. Merge to `main` — CI deploys to production

---

## Writing flow

```bash
pnpm dev
# in another window — open the browser
open http://127.0.0.1:4321/keystatic
```

In Keystatic's left sidebar:

- **Posts (English)** → English collection
- **Статті (Українською)** → Ukrainian collection

Both are independent collections. They share the same schema. They're linked by the **Translation Key** field (see below).

### Creating a new post

Click the collection, then **+ Add Post**. You'll see a form with:

| Field | What it does |
|---|---|
| **Title** | The post title. Used in the URL slug, `<h1>`, `<title>`, OG tags. |
| **Slug** | Auto-generated from the title. You can override. Becomes the URL: `/blog/{locale}/posts/{slug}`. |
| **Translation Key** | A short identifier that ties EN and UK versions of the same article together. **Use the same string in both languages.** Lowercase, kebab-case, e.g. `astro-on-cloudflare`. Used for hreflang and the language switcher. |
| **Description** | 50–200 chars. Shows in post listings, RSS, OG, and meta description. |
| **Published at** | ISO datetime. Posts dated in the future are hidden until that time passes (production only). |
| **Updated at** | Optional. Set when you make a meaningful edit. Shows as "Updated …" on the post page. |
| **Tags** | One tag per row. Tags become DaisyUI chips, and each gets its own page at `/blog/{locale}/tags/{slug}`. |
| **Hero image** | Optional. Drag-drop or paste an image. Keystatic writes it to `src/assets/posts/`. |
| **Hero image alt text** | Required for accessibility when a hero image is set. |
| **Draft** | Checkbox. While checked, the post is invisible in production but visible in local dev and on PR preview URLs. |
| **Content** | The article body — see "Writing the body" below. |

Click **Save**. Locally, this writes a `.mdoc` file in `src/content/posts/{locale}/`. The dev server hot-reloads. Open the post URL to verify it looks right.

### Committing

Keystatic saves to disk, not to git. When you're done iterating:

```bash
git add src/content/posts/ src/assets/posts/
git commit -m "post: hello world"
git push -u origin main         # if you're on main and confident
# OR
git checkout -b post/hello-world
git push -u origin post/hello-world
# then open a PR → auto-labeled `new article`, gets a preview deploy
```

The PR workflow gives you a public preview URL and CI checks before merging. Use it for anything non-trivial.

---

## Publishing flow (after you've saved in Keystatic locally)

Keystatic writes to disk, not to git. When you're done iterating:

### Option A — straight to main (low-risk drafts, typo fixes)

```bash
git add src/content/posts/ src/assets/posts/
git commit -m "post: hello world"
git push
```

The `deploy.yml` workflow rebuilds and deploys to production. Telegram pings you on success/failure.

### Option B — PR with preview deploy (recommended for new posts)

```bash
git checkout -b post/hello-world
git add src/content/posts/ src/assets/posts/
git commit -m "post: hello world"
git push -u origin post/hello-world
```

Open a PR on GitHub. The CI workflows do the rest:

- `auto-label.yml` tags the PR `new article` (or `edit article`). A Telegram notification fires for new articles.
- `preview.yml` builds with `PREVIEW_MODE=true` (drafts visible!) and deploys to `blog-pr-{number}.<your-cf-subdomain>.workers.dev`. The preview URL is commented on the PR.
- Open the preview URL. Verify the post looks right with real production styling, hreflang, etc.
- When happy, merge the PR. `deploy.yml` redeploys main. `preview-cleanup.yml` tears down the preview Worker.

Total: a couple commits, ~2 min until preview is up, 1 click to merge, ~2 min until prod.

---

## Writing the body — Markdoc cheat sheet

The Content field is a WYSIWYG editor backed by [Markdoc](https://markdoc.dev). It saves to a `.mdoc` file that looks like markdown with some extensions.

### Inline formatting

The toolbar has the usual: bold, italic, link, inline code, lists, headings (H2/H3), blockquotes.

Keyboard shortcuts: `Cmd/Ctrl-B` (bold), `Cmd/Ctrl-I` (italic), `Cmd/Ctrl-K` (link).

### Code blocks

Insert via **Insert** → **Code block**, or type ` ``` ` then a language identifier:

```` markdown
```ts
import { something } from 'somewhere';
```
````

Languages we use most: `ts`, `tsx`, `js`, `jsx`, `astro`, `bash`, `sh`, `json`, `jsonc`, `yaml`, `toml`, `sql`, `html`, `css`, `mdx`.

Output: dual-theme Shiki syntax highlighting (GitHub Light / GitHub Dark, switches with the page theme), with a language badge top-right and a copy button on hover.

### Callouts

Four variants — `info`, `tip`, `warn`, `danger`:

```markdoc
{% callout type="tip" %}
You can mark important context here. Inline **markdown** works inside callouts.
{% /callout %}
```

In the Keystatic editor: **Insert** → **Callout**, pick the type.

### YouTube embeds

Privacy-friendly nocookie embed:

```markdoc
{% youtube id="dQw4w9WgXcQ" title="Optional title" /%}
```

In the editor: **Insert** → **YouTube**, paste the video ID (the `v=` parameter from a YouTube URL).

### Images inline

Drag a file into the editor, or paste from clipboard (Cmd/Ctrl-V works with screenshots and copied images). Keystatic uploads to `src/assets/posts/`, inserts a markdown image reference.

### Links

`Cmd/Ctrl-K` opens the link dialog. Internal links can be absolute (`/blog/en/about`) — they get the `/blog` base path baked in already. External links open in the same tab by default.

### Headings

Use H2 for top-level sections and H3 for subsections. **H1 is reserved for the post title** — don't use it in the body. The TOC sidebar shows H2 and H3 automatically when there are 3+ of them.

---

## Slug vs Translation Key — what each is for

Three things that look related but do different jobs.

### **`slug`** — the URL and the filename

There's no `slug:` line in your frontmatter. **The slug IS the filename** (without the `.mdoc` extension). When you set the "Slug" field in Keystatic, it renames the file on disk.

| What you do | Result |
|---|---|
| File `src/content/posts/en/hello-world.mdoc` | URL becomes `/blog/en/posts/hello-world/` |
| Rename to `src/content/posts/en/why-i-moved-to-astro.mdoc` | URL becomes `/blog/en/posts/why-i-moved-to-astro/` |
| In Keystatic UI, change Slug → "moved-to-astro" + save | File renamed to `moved-to-astro.mdoc`, URL updates |

**The slug is local to each language directory.** Two files at:

- `src/content/posts/en/hello-world.mdoc` → `/blog/en/posts/hello-world/`
- `src/content/posts/uk/hello-world.mdoc` → `/blog/uk/posts/hello-world/`

…are *different posts* that happen to share a slug. The locale folder is part of the address.

### **`translationKey`** — pairs one post with its translation

This is a separate frontmatter field. It's an arbitrary string that you set the **same** on the EN and UK versions of the same post. It's how the system knows they're translations of each other.

```yaml
# en/astro-on-cloudflare.mdoc
title: Astro on Cloudflare
translationKey: astro-on-cloudflare
```

```yaml
# uk/astro-na-cloudflare.mdoc
title: Astro на Cloudflare
translationKey: astro-on-cloudflare    # SAME as the EN version
```

Note the slugs differ (`astro-on-cloudflare` vs `astro-na-cloudflare`) — that's fine and expected. The `translationKey` is what links them.

The convention I'd suggest: **use the English slug as the translationKey, always**. So if the EN slug is `astro-on-cloudflare`, set `translationKey: astro-on-cloudflare` on both versions. Easy to remember, consistent, deterministic.

### What the `translationKey` actually does

| Feature | Behavior |
|---|---|
| Language switcher (header dropdown) on an EN post | If a UK post with the same `translationKey` exists, clicking 🇺🇦 navigates to that exact post. If not, falls back to `/uk/`. |
| `<link rel="alternate" hreflang="uk-UA" href="...">` in `<head>` | Emitted only when a UK translation exists, so SEO doesn't claim a translation that isn't there. |
| Sitemap | Groups EN and UK URLs as alternates of the same logical article. |

If `translationKey` is missing or unique, the language switcher just goes to the locale's home page. Nothing breaks; you just don't get the cross-linking magic.

---

## Posts that exist in only one language

Completely fine. The system is designed to handle it.

### Case 1 — you write an EN post, no UK version planned

```yaml
# en/notes-on-osprey-cameras.mdoc
title: Notes on Osprey cameras
translationKey: notes-on-osprey-cameras    # unique — no other post uses this
```

Behavior:

- URL: `/blog/en/posts/notes-on-osprey-cameras/`
- Language switcher on this page: 🇺🇦 link goes to `/blog/uk/` (the UK home), since no UK translation exists.
- Hreflang: only `en` and `x-default` emitted. No `uk-UA` alternate.
- Sitemap: just the EN entry.

### Case 2 — you write a UK-only post, no EN version

```yaml
# uk/zustrich-z-leshchenkom.mdoc
title: Зустріч із Лещенком
translationKey: zustrich-z-leshchenkom    # unique — no EN counterpart
```

Same as Case 1, mirrored. The 🇬🇧 link from this post goes to `/blog/en/`.

**What to put in `translationKey` when the post is single-language:**

Pick a unique value that won't accidentally collide with any future post. The simplest rule: **use the same string as the slug**. Since slugs are unique within a locale and there's no parallel post in the other locale, collisions are impossible.

```yaml
# uk-only post — translationKey === slug
title: Зустріч із Лещенком     # the "name" of the slug field
translationKey: zustrich-z-leshchenkom    # same as filename
```

Filename: `zustrich-z-leshchenkom.mdoc`. Slug: `zustrich-z-leshchenkom`. translationKey: `zustrich-z-leshchenkom`. All three line up. Clean.

### Case 3 — you publish EN first, write UK later

Day 1, EN only:

```yaml
# en/astro-on-cloudflare.mdoc
translationKey: astro-on-cloudflare
```

Day 30, you decide to write the UK version. Create a new file in `uk/`, use the **same** `translationKey`:

```yaml
# uk/astro-na-cloudflare.mdoc
translationKey: astro-on-cloudflare    # same as the EN file
```

Next build, the language switcher on both posts now cross-links to the other. Hreflang gets emitted on both. No retroactive changes needed on the EN file.

### Case 4 — different topics in each language

Totally fine. Your blog is bilingual, not parallel. Most posts may be EN-only, some UK-only, some both. Just use a unique `translationKey` per post (same as the slug works) and the system handles all three cases.

---

## Quick reference table

| Field | Where it lives | What it controls | Example for EN post | Example for UK translation of that post | Example for UK-only post |
|---|---|---|---|---|---|
| Filename | `src/content/posts/{en,uk}/<slug>.mdoc` | The URL slug | `hello-world.mdoc` | `pryvit-svit.mdoc` | `zustrich-z-leshchenkom.mdoc` |
| `title:` (frontmatter) | Inside the `.mdoc` file | Display title (h1, OG, RSS) | `Hello, world` | `Привіт, світ` | `Зустріч із Лещенком` |
| `translationKey:` | Inside the `.mdoc` file | Cross-language pairing | `hello-world` | `hello-world` ← SAME | `zustrich-z-leshchenkom` ← unique |

---

## Writing both translations

You don't have to write them at the same time. Publish whichever is ready, write the other later — just remember to reuse the `translationKey`. The cross-linking activates automatically once both exist.

---

## Drafts and future-dated posts

`Draft: true` and `publishedAt` in the future both mean **not yet published**.

| Where | Behavior |
|---|---|
| Local dev (`pnpm dev`, `pnpm wrangler:dev`) | All drafts and future posts visible |
| Preview deploy (PR Worker, `PREVIEW_MODE=true`) | All drafts and future posts visible |
| Production (`main` branch deployed) | Drafts and future-dated posts filtered out everywhere: post lists, individual URLs (404), RSS, sitemap, tag pages |

Useful patterns:

- **Schedule a post**: set `publishedAt` to a future datetime, `draft: false`, push to main. The post will go live at that exact time on the next deploy after that timestamp. (Note: this doesn't auto-redeploy at the timestamp — the next push to main triggers it. For an actual auto-publish, look at the Phase 2 "Scheduled posts" cron in the plan.)
- **WIP article**: keep `draft: true`, push to main, share the preview URL. Drafts on `main` are still hidden in prod.
- **Verify draft filtering**: the seed `draft-example.mdoc` exists to prove drafts don't leak. After production deploy, hitting `/blog/en/posts/draft-example/` should 404.

---

## Editing an existing post

Same editor, same fields. Two notes:

- **Set `updatedAt`** when the change is meaningful (re-published, factual correction, expanded section). For typo fixes, leave it alone.
- **Don't change the slug** of a published post unless you also add a redirect — old links will 404 otherwise. Slug changes are noisy; if you must, push the renamed file and add a redirect in `astro.config.mjs` `redirects:`.

In GitHub mode, editing creates a new commit on the same `post/<slug>` branch (or a new branch if you create a new post). The auto-label workflow tags the PR `edit article` instead of `new article`.

---

## Auto-labeling for PRs

The `.github/workflows/auto-label.yml` workflow inspects every PR and applies exactly one of:

| Label | When |
|---|---|
| `new article` | PR adds a new file under `src/content/posts/**` (no dev file changes) |
| `edit article` | PR only modifies existing posts (no dev files) |
| `dev` | PR only touches non-content files |
| `mixed` | Both content and dev files changed — consider splitting |

This is just for your sanity when reviewing the PR queue. The actual gate to publish is still merging the PR.

`new article` PRs also fire a Telegram notification to you. The others don't.

---

## Images: where they go, how big they get

Keystatic writes images to `src/assets/posts/`. They're committed to the repo as part of the post's PR. Astro serves them as static assets at `/blog/_astro/<hash>.{ext}`.

Practical implications:

- ✅ Zero infrastructure (no R2, no Cloudinary). Just git.
- ⚠️ Repo size grows with every image. ~50 KB per typical screenshot, more for photos. For a personal blog, this is fine for years.
- ⚠️ Big photos (multi-MB) shouldn't go in git. Compress before uploading. ImageOptim or `pnpx @squoosh/cli` can help.
- 🔜 When repo size becomes painful (Phase 2 trigger: >500 MB or >300 image-heavy posts), the migration path is in `blog-build-plan.md` §17 — Keystatic Cloud Images or a custom R2 upload handler.

---

## Cheat sheet — frontmatter as raw YAML

If you ever edit a `.mdoc` file directly in your editor instead of Keystatic, this is the shape:

```mdoc
---
title: A Practical Title
slug: a-practical-title
translationKey: a-practical-title
description: A 50-to-200-character summary that's also the meta description and RSS excerpt.
publishedAt: 2026-05-19T09:00:00.000Z
updatedAt: 2026-06-01T12:00:00.000Z
tags:
  - engineering
  - astro
heroImage: ../../../assets/posts/hero.jpg
heroImageAlt: Description of the hero for screen readers
draft: false
---

# DO NOT WRITE H1 HERE — the title above becomes the H1 on the page.

Open with one paragraph that previews what the post is about.

## First section

Body…

{% callout type="tip" %}
A tip callout.
{% /callout %}

```ts
const code = 'goes here';
```

{% youtube id="abc123" /%}
```

The Zod schema in `src/content.config.ts` validates this at build time. If the build fails with a content error, the message points to the exact field.

---

## Troubleshooting

**`/blog/keystatic` returns 404 under `pnpm dev`.**
Expected. `pnpm dev` serves at root, so Keystatic is at `/keystatic` (no `/blog/` prefix). The `/blog/keystatic` path is only valid under `pnpm wrangler:dev` and in production.

**`/keystatic` page is blank (white).**
Usually means the React UI failed to hydrate. Open browser devtools console — most likely an API call to `/api/keystatic/...` 404'd. Confirm you're running `pnpm dev` (which sets `PUBLIC_KEYSTATIC_MODE=local`), not `astro dev` directly without the flag.

**Save in Keystatic does nothing (local).**
Check the `pnpm dev` terminal for an error. Usually a permission issue on `src/content/posts/` or `src/assets/posts/`. `chmod -R u+w` the dirs.

**Post visible on prod even though it's marked `draft: true`.**
Check `src/lib/posts.ts` — the `getPublishedPosts` helper filters drafts based on `import.meta.env.DEV` and `import.meta.env.PREVIEW_MODE`. If neither is set, drafts should be hidden. Confirm `PREVIEW_MODE` is **not** baked into your production build (only the preview workflow sets it).

**Post not appearing on prod even though `draft: false` and `publishedAt` is in the past.**
1. Did you push and merge to `main`?
2. Did the `deploy.yml` workflow succeed? Check Actions tab.
3. Cloudflare cache. `wrangler deployments list` to see if the new deploy is live. Try a hard refresh (Cmd/Ctrl-Shift-R) or check the response `cf-cache-status` header.

**Translation key mismatch — language switcher links to the home page instead of the translated post.**
The `translationKey` values in both files don't match. Open both `.mdoc` files, compare the `translationKey:` field. They must be byte-for-byte identical.

**Markdoc tag isn't rendering.**
The tag isn't registered. Check `markdoc.config.mjs` — only `youtube` and `callout` are wired up. To add a new one, register it in `markdoc.config.mjs` and create the corresponding component in `src/components/markdoc/`.

**Image upload fails in Keystatic (local).**
The `directory` in `keystatic.config.ts` is `src/assets/posts` and the `publicPath` is `/src/assets/posts/`. If you moved the assets dir, update both. The directory must exist (we keep `src/assets/posts/.gitkeep` to ensure it does).

**"Slug already exists" when creating a new post.**
Two posts can't share a slug within the same locale (they'd both be at the same URL). Pick a different slug, or delete the old post first.
