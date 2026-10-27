# Writing articles — the EmDash flow

Content is managed in the EmDash admin at <https://serhiichernenko.com/_emdash/admin>. Posts, pages, menus, site copy and images live in the CMS database and media bucket, not in the repo: there are no content files to commit, and publishing never needs a site deploy.

Sign in with your passkey (or a magic link, if one was sent to you). Locally, `pnpm dev` serves the admin at <http://localhost:4321/_emdash/admin>; see [`CMS.md`](./CMS.md#local-development). Architecture, deploys and caching are covered there too.

---

## TL;DR — the happy path

1. Open the admin → **Posts** → **New**, with **English** selected as the language.
2. Fill in the title, slug, description and tags.
3. Add a hero image and its alt text (optional).
4. Write the body. Add images, code blocks, callouts and YouTube embeds from the insert menu.
5. Click **Preview** to see the draft on the real site.
6. Click **Publish**. The site refreshes within seconds.
7. To add a Ukrainian version, open **Translations** on the English post → **Translate** to Українська → write it → publish.

---

## Creating a post

The content list shows one language at a time; switch it with the language selector. A new post is created in the selected language, and its language cannot change afterwards.

| Field              | What it does                                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Title**          | Required, up to 120 characters. Used for the `<h1>`, `<title>`, OG tags and RSS.                                                                                                       |
| **Slug**           | Generated from the title; edit it if needed. Lowercase letters, numbers and hyphens only (publishing refuses anything else). Becomes `/blog/{locale}/posts/{slug}/`.                   |
| **Description**    | Required, 50–200 characters. Shows in post listings, RSS, OG and the meta description.                                                                                                 |
| **Updated at**     | Optional (`revised_at`). Set it for meaningful edits; it shows as "Updated …" on the post page.                                                                                        |
| **Tags**           | Free-form labels in order; type a tag and press Enter. Each tag gets a page at `/blog/{locale}/tags/{slug}/`, where the slug is derived from the text. The order is kept for keywords. |
| **Hero image**     | Optional. Pick or upload an image from the **Media Library**. Cards and OG images use the original file.                                                                               |
| **Hero image alt** | Set the alt text on the image whenever a hero image is used. Describe what is actually in the image.                                                                                   |
| **Body**           | The article — see [Writing the body](#writing-the-body).                                                                                                                               |

The post date is the publish date: EmDash sets it when you first publish (or when a scheduled post goes live), and the admin shows it on the entry. The admin validates required fields and length limits before saving.

---

## Writing the body

The body is a rich-text editor (Portable Text). Use the toolbar, the `/` slash menu, or the **+** insert menu.

### Text and headings

- Styles: Normal, Heading 2, Heading 3, Heading 4, Quote.
- Lists: bullet and numbered.
- Marks: bold, italic, inline code, strike-through, link.
- **H1 is reserved for the post title.** Use H2 for sections and H3/H4 for subsections. The table of contents is built from H2 and H3 automatically and appears when there are 3 or more.

### Links

Select text and add a link. Internal links can be relative (`/blog/en/about/`), or `mailto:` / `https:` URLs. Tick **Open in new tab** for external links.

### Images

Insert an **Image** block and pick or upload the file. **Always fill in the alt text**; the caption is optional and renders as a figure caption. The site serves the original file at its own size, so upload a reasonably sized, web-friendly image (for example a JPEG or WebP around 1600–2400 px wide) rather than a huge camera original.

### Code blocks

Insert a **Code** block, pick the language and optionally add a filename. The site highlights it with Shiki in two themes (GitHub Light / GitHub Dark, following the page theme), with a language badge and a copy button on hover.

### Callouts

Insert a **Callout** block, choose a tone (**Info**, **Tip**, **Warning** or **Danger**) and write the text in Markdown: `**bold**`, `_italic_`, `` `code` ``, `[link](https://…)`, `- ` bullets and `1. ` numbered lists. Blank lines separate paragraphs. Links in callouts open in a new tab.

### YouTube embeds

Insert a **YouTube video** block and paste the video ID (the `v=` value of the YouTube URL). Add an optional title. Embeds use the privacy-friendly `youtube-nocookie.com` domain.

---

## Translations

Every post and page is one entry per language, linked to its translations.

1. Open the English post, find **Translations** in the sidebar, and choose **Translate** for Українська.
2. EmDash creates a Ukrainian draft linked to the English one, prefilled with its content. Translate the fields (title, slug, description, tags, body, image alt text) and publish.

The slug belongs to one language: `/blog/en/posts/hello-world/` and `/blog/uk/posts/hello-world/` are different entries that can share a slug, and a translation usually has its own (`hello-world` ↔ `pryvit-svit`).

### What the translation link does

| Feature                                                          | Behavior                                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Language switcher (header dropdown) on an English post           | If a published Ukrainian translation exists, choosing Ukrainian opens that post. If not, it goes to `/blog/uk/`. |
| `<link rel="alternate" hreflang="uk-UA" href="...">` in `<head>` | Emitted only when the translation is published, so SEO never claims a translation that isn't there.              |
| Sitemap                                                          | Lists each language URL with its alternates.                                                                     |

### Posts that exist in only one language

Fine — the blog is bilingual, not parallel. Create the post in the language you want and simply do not translate it. The language switcher on that post goes to the other language's home page, only that language's `hreflang` (and `x-default`) is emitted, and the sitemap lists a single entry. If you translate it later, use **Translations** on the existing post; both sides cross-link as soon as the translation is published.

Write translations whenever you like; publishing one language never waits for the other.

---

## Drafts, publishing and scheduling

| State                                   | Behavior                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Draft** (never published)             | Only visible in the admin and through **Preview**. Not on the site, RSS, sitemap or search. |
| **Published**                           | Live: post lists, post URL, tag pages, RSS, sitemap, search.                                |
| **Published, with unpublished changes** | Readers see the published version; the admin and **Preview** show your pending changes.     |
| **Scheduled**                           | Hidden until the scheduled time, then published automatically (within about a minute).      |

- **Publish** makes the entry live and purges the cached pages, so it appears within seconds. The first publish of a post also posts a "New post published" message to Telegram and pings search engines (IndexNow).
- **Schedule a post**: use **Schedule publication** and pick the date and time. A Cron Trigger publishes it on time and refreshes the site.
- **Edit a live post**: your edits are saved as a pending draft until you click **Publish changes**; readers keep seeing the published version meanwhile. **Revisions** lists earlier versions you can restore.
- **Unpublish** takes an entry down without deleting it.

---

## Editing an existing post

Same editor, same fields. Two notes:

- **Set "Updated at"** when the change is meaningful (factual correction, expanded section). For typo fixes, leave it alone.
- **Don't change the slug** of a published post unless you accept that old links will 404. The site has no automatic redirects for renamed posts.

---

## Pages (about, privacy, support)

Static pages live under **Pages**. Each has a `key` (`about`, `privacy`, `support`) that stays the same in every language, plus a per-language title, slug, description and body. Code and menus find pages by key, so you can change a slug without breaking links. Slugs that clash with site routes (`posts`, `tags`, `subscribe`, `api`, `preview`, …) cannot be published; the full list is in [`CMS.md`](./CMS.md#pages-key-and-reserved-slugs).

---

## Menus, site settings and UI strings

**Menus → header / footer.** Each language has its own copy of both menus; switch the language in the menu editor. Each item has:

- a **label**,
- a **link**: a _Page_ (each language links to its own translation of that page) or a _Custom URL_ for built-in routes and external links (`/blog/en/posts/`, `/blog/uk/subscribe/`, `/blog/en/rss.xml`, `https://…`),
- optional **CSS classes**: `icon-rss`, `icon-github` or `icon-support` show that icon (footer), and
- **Open in new tab**.

Reorder items by dragging them.

**Site settings** (the `site_settings` collection) holds the site name, tagline, meta description, home hero and about copy, one entry per language; the default OG image is shared by both. Empty fields fall back to the defaults in `src/i18n/ui.ts`. Publish changes like any other entry.

**UI strings** override any other interface text from `src/i18n/ui.ts` (buttons, labels, messages). Create a `ui_strings` entry in the language you want to change, choose the **key** (for example `nav.search`) and write the text. Keep placeholders such as `{year}` or `{query}` exactly as they are. Unpublishing or deleting the entry restores the default. New keys appear in the list after a developer adds them to `ui.ts` and to the content type (see [`CMS.md`](./CMS.md#menus-site-settings-and-ui-strings)).

---

## Previewing

Click **Preview** on any post or page. It opens the real site with your draft (or your pending changes to a published entry) through a signed link that is valid for an hour. An **Exit preview** button at the bottom returns to the published page. Preview pages are never cached or indexed. Details are in [`CMS.md`](./CMS.md#preview).

---

## Troubleshooting

**Post is published but not on the site.**

1. Is it scheduled? Scheduled posts appear at their scheduled time.
2. Is the language right? Posts only appear under their own language.
3. Reload without cache. The site normally refreshes within seconds of a publish, and at most an hour later if the cache purge failed (see [`CMS.md`](./CMS.md#troubleshooting)).

**Language switcher links to the home page instead of the translated post.**
The translation isn't linked or isn't published. Create it from **Translations** on the original post rather than as a standalone entry, and publish it.

**"Slug already exists" when creating a post.**
Two posts can't share a slug within the same language. Pick a different one.

**Publishing fails with "The slug … is reserved" or "… can only use lowercase letters".**
Change the slug: pages cannot use the slug of a site route, and slugs may only contain lowercase letters, numbers and hyphens.

**A field I expect isn't in the editor.**
The content model lives in the database. A developer adds it under **Content Types** (and in `seed/seed.json`).
