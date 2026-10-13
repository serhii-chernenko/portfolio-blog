# Writing articles — the Sanity flow

Content is managed in [Sanity Studio](https://serhiichernenko-blog.sanity.studio). Posts, pages, menus and site copy live in the Sanity dataset, not in the repo: there are no content files to commit, and publishing never needs a site deploy.

Open the Studio at <https://serhiichernenko-blog.sanity.studio> and sign in with your Sanity account. To run it locally instead, see [`SANITY.md`](./SANITY.md#local-development). Architecture, deploys and caching are also covered there.

---

## TL;DR — the happy path

1. Open the Studio → **Posts** → **English** → **Create new** (or use the `+` button).
2. Fill in title, slug (click **Generate**), description, published at, tags.
3. Add a hero image and its alt text (optional).
4. Write the body. Paste images, add code blocks, callouts, YouTube embeds.
5. Switch to the **Presentation** tool to preview the draft on the real site.
6. Click **Publish**. The site refreshes within seconds.
7. To add a Ukrainian version, use the **Translations** button on the English post → create the translation → write it → publish.

---

## Creating a post

Posts are listed per language under **Posts** (English, Українська) and in **All posts**. Create a post in the language you are writing; the language is assigned by the list you create it from and cannot be edited afterwards.

| Field                   | What it does                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Title**               | Required, up to 120 characters. Used for the `<h1>`, `<title>`, OG tags and RSS.                                                               |
| **Slug**                | Click **Generate** to derive it from the title. Lowercase letters, numbers and hyphens only. Becomes `/blog/{locale}/posts/{slug}`.            |
| **Description**         | Required, 50–200 characters. Shows in post listings, RSS, OG and the meta description.                                                         |
| **Published at**        | Required. A date in the future keeps a published post hidden until that time (see [Drafts and scheduling](#drafts-publishing-and-scheduling)). |
| **Updated at**          | Optional. Set it for meaningful edits; it shows as "Updated …" on the post page.                                                               |
| **Tags**                | Free-form labels, one per row. Each tag gets a page at `/blog/{locale}/tags/{slug}`, where the slug is derived from the tag text.              |
| **Hero image**          | Optional. Upload or drag in an image; use the hotspot/crop controls to choose the focal point. Cropped to 16:9 in cards and OG images.         |
| **Hero image alt text** | Fill it in whenever a hero image is set. Describe what is actually in the image.                                                               |
| **Body**                | The article — see [Writing the body](#writing-the-body).                                                                                       |

The Studio validates required fields and length limits and blocks publishing until they pass.

---

## Writing the body

The body is a rich-text editor (Portable Text). Use the toolbar and the **+** insert menu.

### Text and headings

- Styles: Normal, Heading 2, Heading 3, Heading 4, Quote.
- Lists: bullet and numbered.
- Marks: strong, emphasis, inline code, strike-through, link.
- **H1 is reserved for the post title** — it is not offered in the editor. Use H2 for sections and H3/H4 for subsections. The table of contents is built from H2 and H3 automatically and appears when there are 3 or more.

### Links

Select text and add a link. Internal links can be relative (`/blog/en/about`), or `mailto:` / `https:` URLs. Tick **Open in new tab** for external links.

### Images

Insert an **Image** block, upload the file and choose the hotspot. **Alternative text is required**; the caption is optional and renders as a figure caption. Images are served from the Sanity image CDN with responsive sizes, so upload the highest quality you have and avoid pre-compressing.

### Code blocks

Insert a **Code** block, pick the language and optionally add a filename. Available languages: JavaScript, TypeScript, JSON, Shell, SQL, HTML, CSS and Plain text. Output is dual-theme Shiki highlighting (GitHub Light / GitHub Dark, follows the page theme) with a language badge and a copy button on hover.

### Callouts

Insert a **Callout** block and choose a tone: `info`, `tip`, `warn` or `danger`. The callout body supports normal paragraphs, bullet and numbered lists, strong, emphasis, inline code and links.

### YouTube embeds

Insert a **YouTube** block and paste the video ID (the `v=` value of the YouTube URL). Add an optional title. Embeds use the privacy-friendly `youtube-nocookie.com` domain.

---

## Translations

Every post and page is one document per language. Translations are linked through the **Translations** button in the document header (at the top of the editor):

1. Open the English post, click **Translations** → pick **Українська** → create the translation.
2. The Studio creates a Ukrainian document linked to the English one. Translate the fields (title, slug, description, tags, body, hero alt text) and publish.

### Seeing and managing translations

- **Переклади panel**: the top of every post and page form lists the linked document in the other language (title, slug, **Відкрити** to open it). _немає перекладу_ means none is linked yet; create or link one with the **Translations** button. A yellow warning means the other language was edited after this one, so check that the translation is still current.
- **Posts / Pages → З перекладом / Без перекладу**: lists of documents that do or do not have a linked translation. Use **Без перекладу** to find what still needs translating.
- **Переклади** (root of the desk): every translation pair, shown as `Hello, world ↔ Привіт, світ`. It is read-only; links are created and removed with the **Translations** button.
- **AI translation**: in a newly created translation, open the AI Assist menu (sparkle icon in the document header) and run the translate action to fill the fields from the source document in this document's language. Slug, language, page key, dates and code blocks are never touched by AI, so set the slug yourself. Review the result before publishing.

The slug is local to a language: `/blog/en/posts/hello-world` and `/blog/uk/posts/hello-world` are different documents that can share a slug, and a translation usually has its own (`astro-on-cloudflare` ↔ `astro-na-cloudflare`).

### What the translation link does

| Feature                                                          | Behavior                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Language switcher (header dropdown) on an English post           | If a Ukrainian translation exists, choosing Ukrainian opens that exact post. If not, it falls back to `/blog/uk/`. |
| `<link rel="alternate" hreflang="uk-UA" href="...">` in `<head>` | Emitted only when the translation exists, so SEO never claims a translation that isn't there.                      |
| Sitemap                                                          | Lists each language URL with its alternates.                                                                       |

### Posts that exist in only one language

Fine — the blog is bilingual, not parallel. Create the post from the list of the language you want and simply do not create a translation. The language switcher on that post goes to the other language's home page, only that language's `hreflang` (and `x-default`) is emitted, and the sitemap lists a single entry. If you translate it later, use the **Translations** button on the existing post; both sides cross-link as soon as the translation is published.

Write translations whenever you like; publishing one language never waits for the other.

---

## Drafts, publishing and scheduling

| State                                             | Behavior                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Draft** (never published, or unpublished edits) | Only visible in the Studio and in Presentation preview. Not on the site, RSS, sitemap or search.     |
| **Published**, `publishedAt` in the past          | Live: post lists, post URL, tag pages, RSS, sitemap, search.                                         |
| **Published**, `publishedAt` in the future        | Hidden everywhere on the public site (post URL returns 404) until that time, but visible in preview. |

- **Publish** makes the document live; a webhook purges the site cache so it appears within seconds.
- **Schedule a post**: publish it with `publishedAt` in the future. It becomes visible once the cached pages expire after that time, up to about an hour later (see [`SANITY.md`](./SANITY.md#revalidation)). For an exact moment, publish when you want it live.
- **Edit a live post**: changes stay in a draft until you click **Publish** again; readers keep seeing the published version meanwhile.
- **Unpublish** takes a post down without deleting it.

---

## Editing an existing post

Same editor, same fields. Two notes:

- **Set `updatedAt`** when the change is meaningful (factual correction, expanded section). For typo fixes, leave it alone.
- **Don't change the slug** of a published post unless you accept that old links will 404 — there are no automatic redirects.

---

## Pages (about, privacy, support)

Static pages live under **Pages**. Each has a `key` (`about`, `privacy`, `support`) that stays the same in every language, a localized title, slug, description and body. Menus and code link to pages by key, so you can change a slug without breaking the menus. Avoid slugs that clash with site routes; the Studio rejects reserved ones (`posts`, `tags`, `subscribe`, `api`, …). The full list is in [`SANITY.md`](./SANITY.md#pages-key-and-reserved-slugs).

---

## Menus, site settings and UI strings

These are single documents with both languages side by side: each translatable field shows an **EN** and a **UK** input. Use **+ EN** / **+ UK** under a field to add a missing language. Edit and publish them like any other document.

**Navigation → Header / Footer.** Each item has:

- a **label** per language (English is required; without a Ukrainian label the Ukrainian menu shows the English one),
- a **link type**: _Page_ (pick a page key such as `about`; each language links to its own translation of that page), _Site route_ (`home`, `posts`, `tags`, `subscribe`, `rss`) or _External URL_,
- an optional **icon** (`rss`, `github`, `support`) and **open in new tab**.

Reorder items by dragging them. A page item is left out of a language whose translation of that page does not exist yet.

**Site settings** holds the site name, tagline, meta description, home hero and about copy per language, plus one default OG image for both. Empty fields fall back to the defaults in `src/i18n/ui.ts`.

**UI strings** overrides any other interface text from `src/i18n/ui.ts` (buttons, labels, messages). Add an entry, choose the **key** (for example `nav.search`), and fill the text for the languages you want to change; a language left empty keeps the built-in text. Keep placeholders such as `{year}` or `{query}` exactly as they are. Removing the entry restores the default. New keys appear in the list after a developer adds them to `ui.ts` and redeploys the Studio.

---

## Previewing

Use the **Presentation** tool in the Studio. It loads the real site in a frame, shows your draft (including unpublished and future-dated posts), and lets you click text on the page to jump to the field. Setup, security and caching details are in [`SANITY.md`](./SANITY.md#visual-editing--draft-mode).

Draft mode needs the `SANITY_API_READ_TOKEN` and `DRAFT_MODE_COOKIE_SECRET` secrets to be set on the Worker. Preview responses are never cached or indexed.

---

## Troubleshooting

**Post is published but not on the site.**

1. Is `publishedAt` in the future? Future-dated posts stay hidden until that time (plus up to an hour of cache).
2. Is the language right? Posts only appear under their own language.
3. Is the slug set? Posts without a slug are not served.
4. Check the webhook delivery log (see [`SANITY.md`](./SANITY.md#troubleshooting)). Without a successful webhook the site refreshes by cache TTL, up to an hour.

**Language switcher links to the home page instead of the translated post.**
The translation isn't linked. Create it from the **Translations** button of the original post rather than as a standalone document.

**"Slug already exists" when creating a post.**
Two posts can't share a slug within the same language. Pick a different one.

**Presentation preview is blank or asks to log in.**
See the Presentation entry in [`SANITY.md`](./SANITY.md#troubleshooting).

**A field or validation rule I expect isn't in the Studio.**
The hosted Studio needs a redeploy after schema changes (`cd studio && pnpm schema:deploy && pnpm deploy`).
