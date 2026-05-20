# Personal Blog — MVP Build Plan & Blueprint

This document is a complete brief for building a personal technical blog from scratch. It contains the architecture, stack choices, file structure, configuration, acceptance criteria, and implementation order. The goal is that an AI assistant or another developer can pick this up and execute without ambiguity.

---

## 1. Project Goals & Non-Goals

### Goals
- Personal portfolio blog with technical articles
- Content-first, fast page loads, near-zero JS where possible
- Bilingual: English (default) + Ukrainian
- **Rich WYSIWYG editing experience via Keystatic CMS** with paste/drag-drop images, YouTube embeds, code blocks with language selection
- **Branch-based preview deployments** so unpublished content is viewable on a real URL before merging
- **Auto-labeled PRs** distinguishing content work from dev work
- Newsletter subscription for readers
- Comments on posts (Giscus initially, custom later)
- Strong SEO including hreflang, sitemap, OG, RSS
- All infrastructure on Cloudflare (single platform, single bill)
- Markdown/Markdoc content in git, no external CMS database

### Non-Goals (MVP)
- Paid content / subscriptions
- Custom comment authentication (Giscus is enough for MVP)
- Scheduled posts (manual publish via PR merge)
- Multi-author support
- Admin web UI beyond Keystatic (Telegram bot handles ops)
- Automatic translation
- e-commerce
- Image storage on R2 (defer to Phase 2 — see Section 17)

---

## 2. Tech Stack (Exact Versions)

| Layer | Choice | Version |
|---|---|---|
| Framework | Astro | ^6.0 |
| Adapter | `@astrojs/cloudflare` | latest compatible with Astro 6 |
| CMS | Keystatic | ^0.5+ |
| Keystatic Astro integration | `@keystatic/astro` | ^5.x |
| React (required by Keystatic Admin UI) | `@astrojs/react` | ^4.x |
| Markdoc | `@astrojs/markdoc` | ^0.13+ |
| CSS | Tailwind CSS | ^4.0 (via `@tailwindcss/vite`) |
| Component library | DaisyUI | ^5.0 |
| Content | Astro Content Collections (Content Layer API) | built-in |
| Code highlighting | Shiki (Astro built-in) | built-in |
| Search | Pagefind | ^1.x |
| Comments | Giscus | latest |
| Newsletter sending | Resend | latest SDK |
| Notifications | Telegram Bot API (no SDK needed) | n/a |
| Analytics | Cloudflare Web Analytics | n/a |
| Package manager | pnpm | ^9.x |
| Node | local dev only | ≥20 |
| Hosting | Cloudflare Workers (Static Assets + SSR) | n/a |
| Database | Cloudflare D1 | n/a |
| Tooling | Wrangler | latest |
| Type safety | TypeScript (strict) | ^5.x |
| Linting | ESLint + Prettier | latest |

**Decisions explained briefly:**
- Astro 6 (not Nuxt/Next): Cloudflare-acquired in Jan 2026, first-class Workers support, smallest JS bundle for content sites
- DaisyUI 5: user is already comfortable with it, theme system fits bilingual + dark mode
- Tailwind 4 via Vite plugin: replaces the deprecated `@astrojs/tailwind` integration
- Keystatic: best git-based CMS for Astro, `branchPrefix` support gives a clean PR workflow, Markdoc support gives rich blocks
- Markdoc over MDX or plain markdown: safer (no arbitrary JS), rich custom blocks (YouTube, callouts), works natively with Keystatic
- D1 over KV for subscribers: relational queries are simpler in SQL
- Pagefind: zero-backend search, multilingual-aware, builds at deploy time
- Resend: free tier covers personal blog scale (3k/month), works inside Workers with no Node polyfills

---

## 3. Cloudflare Resources Required

| Resource | Name | Purpose |
|---|---|---|
| Worker | `blog` | Hosts the Astro app (static assets + SSR routes), production |
| Worker | `blog-pr-*` | Per-PR preview deployments |
| D1 Database | `blog-db` | Subscribers, future comments |
| KV Namespace | `RATE_LIMIT` | Rate limiting for subscribe endpoint |
| Custom Domain | e.g. `yourdomain.com` | Bound to the production Worker |
| Web Analytics | site token | Privacy-friendly analytics |

**Secrets (via `wrangler secret put` for both production and preview envs):**
- `RESEND_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `SUBSCRIBE_RATE_LIMIT_SECRET`
- `KEYSTATIC_GITHUB_CLIENT_ID`
- `KEYSTATIC_GITHUB_CLIENT_SECRET`
- `KEYSTATIC_SECRET`
- `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` (public-safe, can be a var)

---

## 4. Bootstrap Commands

```bash
# 1. Create project
pnpm create astro@latest blog -- --template minimal --typescript strict
cd blog

# 2. Add Cloudflare adapter
pnpm astro add cloudflare

# 3. Add React (required for Keystatic Admin UI)
pnpm astro add react

# 4. Add Markdoc
pnpm astro add markdoc

# 5. Add Keystatic
pnpm add @keystatic/core @keystatic/astro

# 6. Add Tailwind 4 (NOT the deprecated @astrojs/tailwind)
pnpm add -D tailwindcss @tailwindcss/vite

# 7. Add DaisyUI 5
pnpm add -D daisyui@latest

# 8. Add other integrations
pnpm astro add sitemap mdx
pnpm add -D @astrojs/rss

# 9. Pagefind
pnpm add -D pagefind

# 10. Resend
pnpm add resend

# 11. Wrangler + Cloudflare
pnpm add -D wrangler
npx wrangler login

# 12. Create D1 database
npx wrangler d1 create blog-db
# Copy the database_id from output into wrangler.toml

# 13. Create KV namespace for rate limiting
npx wrangler kv:namespace create RATE_LIMIT

# 14. Initial schema
npx wrangler d1 execute blog-db --remote --file=./schema/0001_init.sql
```

---

## 5. Project Structure

```
blog/
├── astro.config.mjs
├── keystatic.config.ts            # CMS schema
├── wrangler.toml
├── tsconfig.json
├── package.json
├── .env                           # Local dev secrets (gitignored)
├── .env.example                   # Committed
├── .github/
│   ├── workflows/
│   │   ├── deploy.yml             # Production deploy on push to main
│   │   ├── preview.yml            # Preview deploy on PR open/sync
│   │   ├── preview-cleanup.yml    # Tear down preview Worker on PR close
│   │   └── auto-label.yml         # Auto-label PRs based on file changes
│   └── labels.yml                 # Repo label definitions
├── schema/
│   ├── 0001_init.sql
│   └── 0002_add_indexes.sql       # Future migrations
├── public/
│   ├── favicon.svg
│   ├── robots.txt
│   └── og-default.png
├── src/
│   ├── env.d.ts
│   ├── content.config.ts          # Astro content collection definitions
│   ├── styles/
│   │   └── global.css             # Tailwind + DaisyUI imports
│   ├── i18n/
│   │   ├── config.ts
│   │   ├── ui.ts
│   │   └── utils.ts
│   ├── content/
│   │   └── posts/
│   │       ├── en/
│   │       │   ├── hello-world.mdoc
│   │       │   └── photography-tips.mdoc
│   │       └── uk/
│   │           ├── hello-world.mdoc
│   │           └── photography-tips.mdoc
│   ├── assets/
│   │   └── posts/                 # Images committed to git (MVP); migrate to R2 in Phase 2
│   ├── components/
│   │   ├── BaseHead.astro
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── LanguageSwitcher.astro
│   │   ├── ThemeToggle.astro
│   │   ├── PostCard.astro
│   │   ├── PostMeta.astro
│   │   ├── TableOfContents.astro
│   │   ├── Giscus.astro
│   │   ├── SearchModal.astro
│   │   ├── SubscribeForm.astro
│   │   ├── Prose.astro
│   │   └── markdoc/
│   │       ├── YouTube.astro      # Custom Markdoc tag
│   │       ├── Callout.astro      # Custom Markdoc tag
│   │       └── CodeBlock.astro    # Custom fence renderer
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── PostLayout.astro
│   ├── lib/
│   │   ├── seo.ts
│   │   ├── og.ts
│   │   ├── reading-time.ts
│   │   ├── posts.ts               # Helper that filters drafts/future posts
│   │   ├── d1.ts
│   │   ├── resend.ts
│   │   ├── telegram.ts
│   │   └── tokens.ts
│   ├── markdoc.config.mjs         # Markdoc tag + fence configuration
│   └── pages/
│       ├── index.astro                       # Redirect → /en/
│       ├── 404.astro
│       ├── keystatic/
│       │   └── [...params].ts                # Keystatic Admin UI mount
│       ├── api/
│       │   ├── keystatic/
│       │   │   └── [...params].ts            # Keystatic API mount
│       │   ├── subscribe.ts
│       │   ├── confirm.ts
│       │   └── unsubscribe.ts
│       ├── [...locale]/
│       │   ├── index.astro
│       │   ├── about.astro
│       │   ├── posts/
│       │   │   ├── index.astro
│       │   │   └── [slug].astro
│       │   ├── tags/
│       │   │   ├── index.astro
│       │   │   └── [tag].astro
│       │   ├── subscribe.astro
│       │   └── rss.xml.ts
│       └── sitemap-index.xml.ts
└── README.md
```

---

## 6. Configuration Files

### `astro.config.mjs`

```js
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import keystatic from '@keystatic/astro';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://yourdomain.com',
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'compile',
  }),
  i18n: {
    locales: ['en', 'uk'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: true,
    },
  },
  integrations: [
    react(),
    markdoc(),
    keystatic(),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en-US', uk: 'uk-UA' },
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
```

### `keystatic.config.ts`

```ts
import { config, fields, collection } from '@keystatic/core';

const isProd = process.env.NODE_ENV === 'production';

export default config({
  storage: isProd
    ? {
        kind: 'github',
        repo: 'YOUR_GITHUB_ORG/blog',
        branchPrefix: 'post/',
      }
    : { kind: 'local' },

  ui: {
    brand: { name: 'Your Blog', mark: () => '✍️' },
  },

  collections: {
    postsEn: collection({
      label: 'Posts (English)',
      slugField: 'slug',
      path: 'src/content/posts/en/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.text({
          label: 'Title',
          validation: { length: { min: 1, max: 120 } },
        }),
        slug: fields.slug({ name: { label: 'Slug' } }),
        translationKey: fields.text({
          label: 'Translation Key',
          description: 'Shared identifier across translations of the same article.',
          validation: { length: { min: 1, max: 80 } },
        }),
        description: fields.text({
          label: 'Description',
          multiline: true,
          validation: { length: { min: 50, max: 200 } },
        }),
        publishedAt: fields.datetime({ label: 'Published at' }),
        updatedAt: fields.datetime({ label: 'Updated at' }),
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags',
          itemLabel: (props) => props.value,
        }),
        heroImage: fields.image({
          label: 'Hero image',
          directory: 'src/assets/posts',
          publicPath: '/src/assets/posts/',
        }),
        heroImageAlt: fields.text({ label: 'Hero image alt text' }),
        draft: fields.checkbox({ label: 'Draft', defaultValue: true }),
        content: fields.markdoc({
          label: 'Content',
          options: {
            image: {
              directory: 'src/assets/posts',
              publicPath: '/src/assets/posts/',
            },
          },
        }),
      },
    }),

    postsUk: collection({
      label: 'Статті (Українською)',
      slugField: 'slug',
      path: 'src/content/posts/uk/*',
      format: { contentField: 'content' },
      schema: {
        // Mirror the English schema with localized labels
        title: fields.text({ label: 'Заголовок' }),
        slug: fields.slug({ name: { label: 'Slug' } }),
        translationKey: fields.text({ label: 'Translation Key' }),
        description: fields.text({ label: 'Опис', multiline: true }),
        publishedAt: fields.datetime({ label: 'Опубліковано' }),
        updatedAt: fields.datetime({ label: 'Оновлено' }),
        tags: fields.array(fields.text({ label: 'Тег' }), {
          label: 'Теги',
          itemLabel: (props) => props.value,
        }),
        heroImage: fields.image({
          label: 'Головне зображення',
          directory: 'src/assets/posts',
          publicPath: '/src/assets/posts/',
        }),
        heroImageAlt: fields.text({ label: 'Alt тексту' }),
        draft: fields.checkbox({ label: 'Чернетка', defaultValue: true }),
        content: fields.markdoc({
          label: 'Текст статті',
          options: {
            image: {
              directory: 'src/assets/posts',
              publicPath: '/src/assets/posts/',
            },
          },
        }),
      },
    }),
  },
});
```

### `src/markdoc.config.mjs`

```js
import { defineMarkdocConfig, component, nodes } from '@astrojs/markdoc/config';
import shiki from '@astrojs/markdoc/shiki';

export default defineMarkdocConfig({
  extends: [shiki({ themes: { light: 'github-light', dark: 'github-dark' } })],
  tags: {
    youtube: {
      render: component('./src/components/markdoc/YouTube.astro'),
      attributes: {
        id: { type: String, required: true },
        title: { type: String },
      },
    },
    callout: {
      render: component('./src/components/markdoc/Callout.astro'),
      attributes: {
        type: { type: String, default: 'info', matches: ['info', 'warn', 'tip', 'danger'] },
      },
    },
  },
  nodes: {
    fence: {
      render: component('./src/components/markdoc/CodeBlock.astro'),
      attributes: { ...nodes.fence.attributes },
    },
  },
});
```

### `wrangler.toml`

```toml
name = "blog"
main = "./dist/_worker.js/index.js"
compatibility_date = "2026-05-15"
compatibility_flags = ["nodejs_compat"]

[assets]
binding = "ASSETS"
directory = "./dist"

[[d1_databases]]
binding = "DB"
database_name = "blog-db"
database_id = "REPLACE_WITH_REAL_ID"

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "REPLACE_WITH_REAL_ID"

[observability]
enabled = true

[vars]
SITE_URL = "https://yourdomain.com"
PUBLIC_KEYSTATIC_GITHUB_APP_SLUG = "your-github-app-slug"

# Preview environments are deployed by GitHub Actions with `--name` override
# and inherit the bindings from this base config.
```

### `src/styles/global.css`

```css
@import "tailwindcss";
@plugin "daisyui" {
  themes: ["light", "dark"];
  darkTheme: "dark";
}
```

### `src/env.d.ts`

```ts
/// <reference path="../.astro/types.d.ts" />

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

interface Env {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  ASSETS: Fetcher;
  RESEND_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  SUBSCRIBE_RATE_LIMIT_SECRET: string;
  KEYSTATIC_GITHUB_CLIENT_ID: string;
  KEYSTATIC_GITHUB_CLIENT_SECRET: string;
  KEYSTATIC_SECRET: string;
  PUBLIC_KEYSTATIC_GITHUB_APP_SLUG: string;
  SITE_URL: string;
}
```

---

## 7. i18n Architecture

### Locale codes & rationale
- ISO 639-1 requires `uk` for Ukrainian (NOT `ua`, which is a region code only)
- Internal: `uk`. `<html lang>` and hreflang: `uk-UA` (explicit, removes ambiguity). URL paths: `/uk/`

### `src/i18n/config.ts`

```ts
export const locales = ['en', 'uk'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const htmlLangAttribute: Record<Locale, string> = {
  en: 'en',
  uk: 'uk-UA',
};

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  uk: 'Українська',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇬🇧',
  uk: '🇺🇦',
};
```

### `src/i18n/ui.ts`
Contains UI string maps for both locales (`nav.*`, `post.*`, `subscribe.*`, `search.*`, `comments.*`).

### `src/i18n/utils.ts`

```ts
import { ui } from './ui';
import { defaultLocale, locales, type Locale } from './config';

export function getLocaleFromUrl(url: URL): Locale {
  const [, maybeLocale] = url.pathname.split('/');
  if (locales.includes(maybeLocale as Locale)) return maybeLocale as Locale;
  return defaultLocale;
}

export function useTranslations(locale: Locale) {
  return function t(key: keyof typeof ui[typeof defaultLocale], vars?: Record<string, string | number>) {
    let value: string = ui[locale][key] ?? ui[defaultLocale][key];
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  };
}

/**
 * Given a translationKey, returns the URL for the same post in each locale.
 * Returns null for locales where the translation doesn't exist.
 */
export async function getTranslatedPostUrls(
  translationKey: string
): Promise<Record<Locale, string | null>> {
  const { getCollection } = await import('astro:content');
  const all = [
    ...(await getCollection('postsEn')),
    ...(await getCollection('postsUk')),
  ];
  const matches = all.filter((p) => p.data.translationKey === translationKey);
  const result: Record<Locale, string | null> = { en: null, uk: null };
  for (const m of matches) {
    const locale = m.collection === 'postsEn' ? 'en' : 'uk';
    result[locale] = `/${locale}/posts/${m.data.slug}`;
  }
  return result;
}
```

---

## 8. Content Collections

Keystatic writes `.mdoc` files. Astro content collections load them via the glob loader.

### `src/content.config.ts`

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const postSchema = ({ image }: any) =>
  z.object({
    title: z.string().max(120),
    slug: z.string(),
    description: z.string().min(50).max(200),
    translationKey: z.string().regex(/^[a-z0-9-]+$/),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    heroImage: image().optional(),
    heroImageAlt: z.string().optional(),
    draft: z.boolean().default(true),
  });

const postsEn = defineCollection({
  loader: glob({ pattern: '*.mdoc', base: './src/content/posts/en' }),
  schema: postSchema,
});

const postsUk = defineCollection({
  loader: glob({ pattern: '*.mdoc', base: './src/content/posts/uk' }),
  schema: postSchema,
});

export const collections = { postsEn, postsUk };
```

### Why two collections instead of one
Keystatic configures collections as independent units (each tied to a `path`). Mirroring this on the Astro side keeps the data layer aligned with the CMS layer and avoids runtime locale filtering on every query. `translationKey` bridges them when needed.

---

## 9. Keystatic CMS Setup (Detailed)

### Local dev workflow
- `pnpm dev` boots Astro at `http://127.0.0.1:4321`
- Visit `/keystatic` to open the Admin UI
- In local mode, saves write directly to `src/content/posts/{locale}/*.mdoc`
- No auth required locally

### Production workflow (GitHub mode)
1. Deploy the Astro site with Keystatic loaded (it requires the env vars to enable GitHub mode)
2. Visit `https://yourdomain.com/keystatic` — Keystatic prompts to create a GitHub App if one isn't connected
3. Create the GitHub App via Keystatic's flow (gives you the 4 env vars)
4. Set those env vars in Cloudflare Worker via `wrangler secret put`
5. Anyone with write access to the repo can now log in at `/keystatic`

### Branch behaviour
With `branchPrefix: 'post/'`:
- Creating or editing a post in the Admin UI creates a branch like `post/hello-world`
- Saving commits to that branch
- Keystatic auto-opens (or updates) a PR from that branch to `main`
- The PR is auto-labeled and gets a preview deployment (see Sections 22 and 23)
- Merging the PR publishes the content; production redeploys via the deploy workflow

### Draft handling

The `draft: true` checkbox is the source of truth. Behaviour by environment:

| Environment | Drafts visible? | Future-dated posts visible? |
|---|---|---|
| Local dev (`pnpm dev`) | Yes | Yes |
| Preview deployment (`PREVIEW_MODE=true`) | Yes | Yes |
| Production | No | No |

Single helper used by all collection consumers:

```ts
// src/lib/posts.ts
import { getCollection } from 'astro:content';
import type { Locale } from '../i18n/config';

const showDrafts =
  import.meta.env.DEV ||
  import.meta.env.PREVIEW_MODE === 'true';

export async function getPublishedPosts(locale: Locale) {
  const collection = locale === 'en' ? 'postsEn' : 'postsUk';
  const all = await getCollection(collection);
  return all.filter((p) => {
    if (!showDrafts) {
      if (p.data.draft) return false;
      if (p.data.publishedAt > new Date()) return false;
    }
    return true;
  });
}
```

Critical: this filter must also be applied in `getStaticPaths()` for `[slug].astro`, otherwise the route exists and the draft is publicly accessible even if not linked.

### Image handling (MVP)
- Keystatic image fields commit images to `src/assets/posts/` via the GitHub API on save
- Astro `<Image />` handles optimization at build time (WebP/AVIF, lazy loading)
- Tradeoff: images bloat the repo over time, ~50KB per image, but for a personal blog with <500 images this is fine for years
- **Phase 2 migration:** when repo size becomes a concern, switch to Keystatic Cloud Images ($10/mo) or a custom upload handler pushing to R2

### Markdoc custom blocks (rich content features)

Defined in `src/markdoc.config.mjs`:
- `{% youtube id="..." title="..." /%}` — privacy-friendly YouTube embed (nocookie)
- `{% callout type="info" %}...{% /callout %}` — info / warn / tip / danger callout boxes
- ` ```language ` fenced code blocks — Shiki syntax highlighting with manual language selection

### Keystatic UI features used
- Image paste from clipboard (built-in)
- Image drag-drop (built-in)
- Code block with language dropdown (built-in via Markdoc fence)
- YouTube embed via custom tag with id field (shows the user a preview in the editor)
- Slug auto-generation from title
- Auto-save to localStorage as you type (prevents loss on accidental tab close)

---

## 10. Route Inventory

| Route | Type | Notes |
|---|---|---|
| `/` | Redirect → `/en/` | Via Astro middleware |
| `/en/` | Prerendered | Home: latest 10 posts, intro |
| `/uk/` | Prerendered | Same, Ukrainian |
| `/en/about` | Prerendered | Markdoc-driven page |
| `/uk/about` | Prerendered | " |
| `/en/posts/` | Prerendered, paginated | 10 posts per page |
| `/uk/posts/` | Prerendered, paginated | " |
| `/en/posts/[slug]` | Prerendered | Individual post |
| `/uk/posts/[slug]` | Prerendered | " |
| `/en/tags/` | Prerendered | Tag index |
| `/uk/tags/` | Prerendered | " |
| `/en/tags/[tag]` | Prerendered | Posts by tag |
| `/uk/tags/[tag]` | Prerendered | " |
| `/en/subscribe` | Prerendered | Standalone signup |
| `/uk/subscribe` | Prerendered | " |
| `/en/rss.xml` | Built at deploy | Locale RSS |
| `/uk/rss.xml` | Built at deploy | " |
| `/sitemap-index.xml` | Built at deploy | With hreflang annotations |
| `/robots.txt` | Static | |
| `/keystatic/*` | SSR | Keystatic Admin UI |
| `/api/keystatic/*` | SSR | Keystatic API |
| `/api/subscribe` | SSR | Newsletter |
| `/api/confirm` | SSR | " |
| `/api/unsubscribe` | SSR | " |
| `/404` | Prerendered | Custom 404 |
| `/pagefind/*` | Static | Built by `pagefind` after Astro build |

Pages set `export const prerender = true` by default; `/api/*` and `/keystatic/*` routes are SSR.

---

## 11. Styling: Tailwind 4 + DaisyUI

### Theme
- DaisyUI's `light` and `dark` themes
- Persisted in localStorage as `theme`, applied via `data-theme` on `<html>`
- Toggle in header
- Pre-paint inline script in `<head>` prevents FOUC
- Theme change postMessages to Giscus iframe to sync

### Typography
- Tailwind `@tailwindcss/typography` plugin for `prose` class
- Article body: `<article class="prose dark:prose-invert lg:prose-lg">`

### Component patterns
- DaisyUI primitives: `btn`, `card`, `alert`, `input`, `toggle`, `dropdown`, `menu`, `modal`, `navbar`
- Search modal uses DaisyUI `modal`
- Subscribe form uses DaisyUI `input` + `btn` + `alert` for state feedback
- Language switcher uses DaisyUI `dropdown` on mobile

---

## 12. SEO Infrastructure

### `BaseHead.astro` emits, in order:
1. `<meta charset="utf-8">` + viewport
2. `<title>` and `<meta name="description">`
3. Canonical (self-referential)
4. Hreflang alternates: one per existing translation + `x-default`
5. OpenGraph + Twitter Card
6. JSON-LD: `Article` for posts, `WebSite` for home, `Person` for about
7. RSS auto-discovery for current locale
8. Cloudflare Web Analytics beacon (deferred)
9. `theme-color`

### Hreflang implementation
For a post in `/en/posts/hello-world` with a translation at `/uk/posts/привіт-світ`:

```html
<link rel="canonical" href="https://yourdomain.com/en/posts/hello-world" />
<link rel="alternate" hreflang="en" href="https://yourdomain.com/en/posts/hello-world" />
<link rel="alternate" hreflang="uk-UA" href="https://yourdomain.com/uk/posts/привіт-світ" />
<link rel="alternate" hreflang="x-default" href="https://yourdomain.com/en/posts/hello-world" />
```

Hreflang must be **reciprocal** and only emit for translations that actually exist.

### JSON-LD example for a post

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Hello, world",
  "description": "...",
  "image": "https://yourdomain.com/og/hello-world.png",
  "datePublished": "2026-06-01",
  "dateModified": "2026-06-15",
  "author": { "@type": "Person", "name": "Your Name", "url": "https://yourdomain.com/en/about" },
  "publisher": { "@type": "Person", "name": "Your Name" },
  "inLanguage": "en",
  "mainEntityOfPage": "https://yourdomain.com/en/posts/hello-world"
}
```

---

## 13. RSS Feeds

Two feeds: `/en/rss.xml` and `/uk/rss.xml`. Use `@astrojs/rss`. Each uses `getPublishedPosts(locale)` from `src/lib/posts.ts` so drafts and future-dated posts are correctly filtered.

---

## 14. Search: Pagefind

- Build script: `"build": "astro build && pagefind --site dist"`
- Pagefind auto-detects `<html lang>` and builds per-language indexes
- `data-pagefind-body` on article body in `PostLayout.astro`
- Search modal mounts Pagefind UI on first open, filters by current locale
- Keyboard shortcut `/` opens it

---

## 15. Comments: Giscus

- GitHub Discussions enabled on the repo
- Giscus GitHub App installed
- Configured per locale via `data-lang`
- Theme synced with site theme via `postMessage`
- Mapping by pathname → separate threads per EN/UK post

---

## 16. Newsletter Subscription

### D1 Schema (`schema/0001_init.sql`)

```sql
CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'uk')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  confirmed_at INTEGER,
  unsubscribed_at INTEGER,
  source TEXT,
  user_agent TEXT,
  ip_hash TEXT
);

CREATE INDEX idx_subscribers_status ON subscribers(status);
CREATE INDEX idx_subscribers_email ON subscribers(email);
```

### Endpoints
- `POST /api/subscribe` — validate, rate limit (KV: 3 reqs/IP/10min), insert pending, send confirmation, Telegram notify
- `GET /api/confirm?token=...` — verify HMAC token, mark confirmed, send welcome, Telegram notify
- `GET /api/unsubscribe?token=...` — verify token, mark unsubscribed, Telegram notify

### Token format
`base64url(email + ':' + expiresAt + ':' + hmacSha256(secret, email + ':' + expiresAt))`. 48h expiry.

### Resend templates
- Confirmation: subject + link, per locale, plain HTML
- Welcome: per locale, plain HTML

---

## 17. Image Storage Decision (MVP)

- **MVP:** Images commit to `src/assets/posts/` via Keystatic's GitHub API
- **Why:** zero extra infrastructure, simplest path, works
- **Tradeoff:** repo size grows ~50KB per image
- **Phase 2 migration triggers:** repo > 500MB OR > 300 image-heavy posts OR clone time > 30s
- **Phase 2 options:**
  - Keystatic Cloud Images: $10/mo, drop-in
  - Custom flow: GitHub Action on merge → upload new images to R2 → rewrite markdown references → commit back
  - Cloudinary: free 25GB tier with custom Keystatic upload handler

---

## 18. Telegram Notifications

### Setup
1. Create bot via `@BotFather`, save token
2. Send `/start` to bot, find chat ID at `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Save as Wrangler secrets

### `src/lib/telegram.ts`

```ts
export async function notify(env: Env, text: string, parseMode: 'HTML' | 'Markdown' = 'HTML') {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  });
}
```

### Events notified
- New pending subscriber
- Subscriber confirmed
- Unsubscribe
- Deploy failure (from GitHub Actions)
- Preview deployed (from GitHub Actions)
- New PR labeled `new article` (from GitHub Actions)

---

## 19. Analytics

Cloudflare Web Analytics:
- Enable in CF dashboard, get site token
- Deferred beacon script in `BaseHead.astro`
- No cookie banner required
- Provides page views, referrers, browsers, countries, Web Vitals

---

## 20. Theme & Image Handling

### Theme
- DaisyUI `light` and `dark`
- localStorage key `theme`
- Pre-paint inline `<head>` script sets `data-theme` before render
- Toggle in header
- postMessage to Giscus on change

### Images
- Astro `<Image />` everywhere
- WebP + AVIF, `loading="lazy"`, `decoding="async"`
- `imageService: 'compile'` (build-time only, no runtime processing on Workers)
- Markdoc images use the `image` config in `src/markdoc.config.mjs`

---

## 21. Performance Budget

| Metric | Target |
|---|---|
| Lighthouse Performance | ≥ 95 |
| Lighthouse Accessibility | ≥ 95 |
| Lighthouse Best Practices | ≥ 95 |
| Lighthouse SEO | 100 |
| First Contentful Paint | < 1.0s |
| Largest Contentful Paint | < 1.5s |
| Total Blocking Time | < 100ms |
| Cumulative Layout Shift | < 0.05 |
| Page weight (HTML+CSS, no images) | < 100 KB |
| Initial JS | < 30 KB (Pagefind UI lazy-loaded) |

`/keystatic/*` routes are exempt from this budget (they're a React admin app).

---

## 22. Branch-based Preview Deployments

### How it works
1. Keystatic creates a `post/...` branch and opens a PR
2. `preview.yml` triggers on `pull_request: [opened, synchronize, reopened]`
3. Workflow builds with `PREVIEW_MODE=true` (drafts render)
4. Deploys to a uniquely-named Worker: `blog-pr-{number}`
5. Posts or updates a comment on the PR with the preview URL
6. On PR close, `preview-cleanup.yml` tears down the preview Worker

### `.github/workflows/preview.yml`

```yaml
name: Preview Deploy

on:
  pull_request:
    types: [opened, synchronize, reopened]

concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  preview:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with: { version: 9 }

      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }

      - run: pnpm install --frozen-lockfile

      - name: Build with preview mode
        env:
          PREVIEW_MODE: 'true'
        run: pnpm build

      - name: Deploy preview Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: deploy --name blog-pr-${{ github.event.pull_request.number }}

      - name: Comment PR with preview URL
        uses: actions/github-script@v7
        env:
          CF_ACCOUNT_SUBDOMAIN: ${{ secrets.CF_ACCOUNT_SUBDOMAIN }}
        with:
          script: |
            const url = `https://blog-pr-${context.issue.number}.${process.env.CF_ACCOUNT_SUBDOMAIN}.workers.dev`;
            const body = `🔍 **Preview deployed:** ${url}\n\nDrafts are visible on this URL until the PR is merged.`;
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const existing = comments.find((c) => c.body.startsWith('🔍 **Preview deployed:**'));
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }

      - name: Notify Telegram
        if: success()
        run: |
          curl -s -X POST "https://api.telegram.org/bot${{ secrets.TELEGRAM_BOT_TOKEN }}/sendMessage" \
            -d "chat_id=${{ secrets.TELEGRAM_CHAT_ID }}" \
            -d "parse_mode=HTML" \
            -d "text=📝 Preview deployed for PR #${{ github.event.pull_request.number }}: <a href=\"https://blog-pr-${{ github.event.pull_request.number }}.${{ secrets.CF_ACCOUNT_SUBDOMAIN }}.workers.dev\">View</a>"
```

### `.github/workflows/preview-cleanup.yml`

```yaml
name: Preview Cleanup

on:
  pull_request:
    types: [closed]

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Delete preview Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: delete --name blog-pr-${{ github.event.pull_request.number }} --force
```

---

## 23. Auto-Label PRs Workflow

### Label definitions

| Label | Color | Description |
|---|---|---|
| `new article` | `#0e8a16` (green) | PR adds a new post |
| `edit article` | `#1d76db` (blue) | PR modifies an existing post |
| `dev` | `#5319e7` (purple) | PR is dev / infrastructure work |
| `mixed` | `#fbca04` (yellow) | PR has both content and dev — consider splitting |

### Detection logic
- Look at all files changed in the PR
- Files matching `src/content/posts/**` are **content files**; everything else is **dev files**
- If ANY content file is `added` AND no dev files → **new article**
- If only content files are `modified` (none added) AND no dev files → **edit article**
- If only dev files → **dev**
- If both content and dev files → **mixed**

The `post/` branch prefix is a hint, not authoritative; file changes are the source of truth. This means the labeling works even if branches are created manually.

### `.github/workflows/auto-label.yml`

```yaml
name: Auto-label PR

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - name: Detect and apply label
        uses: actions/github-script@v7
        with:
          script: |
            const POST_PATH_PREFIX = 'src/content/posts/';

            const { data: files } = await github.rest.pulls.listFiles({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number,
              per_page: 100,
            });

            const postFiles = files.filter((f) => f.filename.startsWith(POST_PATH_PREFIX));
            const devFiles = files.filter((f) => !f.filename.startsWith(POST_PATH_PREFIX));

            const hasAddedPost = postFiles.some((f) => f.status === 'added');

            let label;
            if (postFiles.length > 0 && devFiles.length > 0) {
              label = 'mixed';
            } else if (postFiles.length > 0) {
              label = hasAddedPost ? 'new article' : 'edit article';
            } else if (devFiles.length > 0) {
              label = 'dev';
            }

            if (!label) return;

            const managedLabels = ['new article', 'edit article', 'dev', 'mixed'];
            const { data: currentLabels } = await github.rest.issues.listLabelsOnIssue({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });

            for (const l of currentLabels) {
              if (managedLabels.includes(l.name) && l.name !== label) {
                await github.rest.issues.removeLabel({
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  issue_number: context.issue.number,
                  name: l.name,
                });
              }
            }

            await github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              labels: [label],
            });

      - name: Notify Telegram on new article
        if: contains(github.event.pull_request.labels.*.name, 'new article')
        run: |
          curl -s -X POST "https://api.telegram.org/bot${{ secrets.TELEGRAM_BOT_TOKEN }}/sendMessage" \
            -d "chat_id=${{ secrets.TELEGRAM_CHAT_ID }}" \
            -d "text=📝 New article PR opened: ${{ github.event.pull_request.html_url }}"
```

### One-time labels setup

`.github/labels.yml`:

```yaml
- name: new article
  color: '0e8a16'
  description: PR adds a new blog post
- name: edit article
  color: '1d76db'
  description: PR modifies an existing post
- name: dev
  color: '5319e7'
  description: Dev / infrastructure work
- name: mixed
  color: 'fbca04'
  description: PR contains both content and dev — consider splitting
```

Create these manually in repo settings, or add a `labels-sync.yml` workflow using `crazy-max/ghaction-github-labeler` to apply this file.

---

## 24. Production Deploy Workflow

### `.github/workflows/deploy.yml`

```yaml
name: Production Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: prod
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: deploy
      - name: Notify on failure
        if: failure()
        run: |
          curl -s -X POST "https://api.telegram.org/bot${{ secrets.TELEGRAM_BOT_TOKEN }}/sendMessage" \
            -d "chat_id=${{ secrets.TELEGRAM_CHAT_ID }}" \
            -d "text=❌ Production deploy failed on commit ${{ github.sha }}"
      - name: Notify on success
        if: success()
        run: |
          curl -s -X POST "https://api.telegram.org/bot${{ secrets.TELEGRAM_BOT_TOKEN }}/sendMessage" \
            -d "chat_id=${{ secrets.TELEGRAM_CHAT_ID }}" \
            -d "text=✅ Production deployed: ${{ github.event.head_commit.message }}"
```

### D1 Migrations
- New migration files in `schema/` numbered sequentially
- Apply: `pnpm wrangler d1 migrations apply blog-db --remote`

---

## 25. Acceptance Criteria

### A. Internationalization
- [ ] Default `/` redirects to `/en/`
- [ ] Both `/en/` and `/uk/` render correctly
- [ ] UI strings switch per locale
- [ ] `<html lang>` is `uk-UA` on Ukrainian pages, `en` on English
- [ ] Language switcher routes to the corresponding translation if it exists; hides or falls back to locale home otherwise
- [ ] Hreflang reciprocal across all translated pages, including `x-default`
- [ ] Hreflang only emits for existing translations
- [ ] Validates clean via app.hreflang.org

### B. Content & CMS
- [ ] Posts authored via Keystatic at `/keystatic` (local + production)
- [ ] Local mode saves directly to git working tree
- [ ] Production mode creates `post/...` branches and opens PRs automatically
- [ ] Image paste/drag-drop works and commits images to `src/assets/posts/`
- [ ] Markdoc custom blocks render: YouTube embed, callouts, code blocks with manual language selection + Shiki highlighting
- [ ] Posts with `draft: true` are filtered from listings, RSS, sitemap, AND `getStaticPaths` in production builds
- [ ] Posts with `publishedAt` in the future are filtered the same way
- [ ] Drafts ARE visible on preview deployments and in local dev
- [ ] Tags aggregate correctly per locale
- [ ] Reading time computed and displayed
- [ ] Headings get anchor links; TOC shows for posts with 3+ headings

### C. Branch Previews
- [ ] PR opened triggers preview deployment within 3 minutes
- [ ] Preview URL is posted as a PR comment (updated, not duplicated, on subsequent pushes)
- [ ] Preview URL is accessible publicly (by design)
- [ ] Drafts are visible on preview but NOT on production
- [ ] PR closed (merged or not) tears down the preview Worker
- [ ] Telegram receives a notification with the preview link

### D. Auto-labeling
- [ ] PR with only post additions → labeled `new article`
- [ ] PR with only post modifications → labeled `edit article`
- [ ] PR with only non-content changes → labeled `dev`
- [ ] PR with both content and dev → labeled `mixed`
- [ ] Labels update if PR scope changes after push
- [ ] Only one of the four managed labels is applied at a time
- [ ] `new article` PRs trigger a Telegram notification

### E. SEO
- [ ] Each page has unique title + description
- [ ] Canonical is self-referential
- [ ] OpenGraph tags present
- [ ] JSON-LD `Article` on every post, valid
- [ ] `sitemap-index.xml` includes hreflang
- [ ] `robots.txt` allows all, references sitemap
- [ ] RSS validates as RSS 2.0

### F. Styling & UX
- [ ] DaisyUI light + dark themes work
- [ ] Theme persists; no FOUC
- [ ] All interactive elements have visible focus styles
- [ ] All images have `alt`
- [ ] WCAG AA color contrast on both themes

### G. Search
- [ ] Pagefind index builds on `pnpm build`
- [ ] `/` shortcut and header button open the modal
- [ ] EN searches return EN results only; UK same
- [ ] Results link to correct URLs

### H. Comments
- [ ] Giscus loads on every post page
- [ ] Theme syncs (light/dark)
- [ ] `data-lang` matches page locale
- [ ] EN and UK use separate discussion threads

### I. Newsletter
- [ ] `POST /api/subscribe` returns 200 for valid, 400 for invalid, 429 when rate-limited
- [ ] D1 row created `status='pending'`
- [ ] Confirmation email sent via Resend (locale-correct template)
- [ ] Token expires in 48h
- [ ] Confirm flow flips status to `confirmed`, sends welcome
- [ ] Unsubscribe works
- [ ] Telegram fires on each event
- [ ] IP stored only as HMAC hash

### J. Notifications
- [ ] Telegram receives: new subscriber, confirm, unsubscribe, deploy success/failure, preview deployed, new article PR
- [ ] Messages are HTML-formatted, concise, actionable

### K. Analytics
- [ ] CF Web Analytics beacon loaded
- [ ] No cookie banner
- [ ] Web Vitals reported

### L. Build & Deploy
- [ ] `pnpm build` succeeds with no errors
- [ ] Lighthouse on production hits Section 21 budget
- [ ] Push to `main` triggers production deploy
- [ ] PR open triggers preview deploy
- [ ] PR close triggers preview cleanup
- [ ] Deploy failures notify Telegram

---

## 26. Implementation Order (6 Milestones)

### Milestone 1: Skeleton + Local Keystatic (1–2 evenings)
- Bootstrap Astro 6, Cloudflare adapter, React, Markdoc, Tailwind 4, DaisyUI
- Keystatic in local mode, two collections (postsEn / postsUk)
- Markdoc config with YouTube / Callout / CodeBlock custom blocks
- i18n config (`uk-UA`, EN default)
- Base layout, header, footer, theme toggle
- First hello-world post in both languages via Keystatic UI
- Deploy initial version to Cloudflare Workers
- **Exit criteria:** site live, Keystatic admin works locally, can create posts in both languages

### Milestone 2: Content Layer & SEO (1 evening)
- Full content collection schemas with Zod
- PostLayout: reading time, TOC, prose styling, hero image
- BaseHead: canonical, hreflang, OG, JSON-LD, RSS auto-discovery
- Per-locale RSS feeds, sitemap with hreflang, robots.txt, 404 page
- `src/lib/posts.ts` draft + future-date filter applied everywhere including `getStaticPaths`
- **Exit criteria:** hreflang validates, RSS validates, Lighthouse SEO = 100

### Milestone 3: Routes & Listings (1 evening)
- Posts list (paginated), tag index, tag detail
- Language switcher with translation-aware routing
- PostCard, PostMeta components
- About page (Markdoc-driven)
- **Exit criteria:** all routes from Section 10 render correctly in both locales

### Milestone 4: Keystatic Production + Preview Workflow (1–2 evenings)
- Switch Keystatic to GitHub mode with `branchPrefix: 'post/'`
- GitHub App created via Keystatic flow
- Secrets set in Cloudflare via Wrangler
- `deploy.yml`, `preview.yml`, `preview-cleanup.yml`, `auto-label.yml` written and tested
- Repo labels created (manually or via labels-sync)
- **Exit criteria:** create a post via production Keystatic → branch `post/<name>` created → PR opened and auto-labeled `new article` → preview deployed → preview URL works → merging publishes to production

### Milestone 5: Search & Comments (1 evening)
- Pagefind in build pipeline
- Search modal with `/` shortcut
- Giscus on post pages with theme + lang sync
- **Exit criteria:** Sections 25.G and 25.H pass

### Milestone 6: Newsletter & Notifications (1–2 evenings)
- D1 schema applied
- Resend account + templates
- Telegram bot + secrets
- `/api/subscribe`, `/api/confirm`, `/api/unsubscribe`
- SubscribeForm component with loading/success/error states
- Rate limiting via KV
- All Telegram notification events wired
- **Exit criteria:** Sections 25.I and 25.J pass

### Polish (parallel)
- Performance tuning to hit budget
- Accessibility audit (axe-core + manual screen reader pass)
- Smoke test on clean mobile + desktop browsers
- Write first real post in both languages

Total estimate: **6–9 focused evenings**.

---

## 27. Phase 2 Roadmap

- **R2 image storage** — migrate from git-committed images per Section 17 triggers
- **Scheduled posts** — Cron Trigger Worker that opens a deploy when `publishedAt` hits
- **OG image generation per post** — `/api/og/[slug].png` using `satori` + `@resvg/resvg-js`
- **Custom comments** — Hono Worker at `api.yourdomain.com` with magic-link auth (Better Auth), D1 storage, Telegram moderation
- **Newsletter campaigns** — Admin endpoint that fetches confirmed subscribers and sends a post via Resend
- **Series / multi-part posts** — `series` and `seriesOrder` frontmatter
- **Webmentions** — Webmention.io integration
- **Translation diffing** — workflow that warns when an EN post is updated but the UK translation isn't

---

## 28. Open Decisions for the Developer

1. **Domain name and DNS provider** — must be on Cloudflare or transferable
2. **GitHub repo visibility** — public or private (affects Giscus discussions visibility)
3. **Default theme on first visit** — `light`, `dark`, or `prefers-color-scheme` (recommend the last)
4. **Author profile data** — name, bio, avatar, social links
5. **OG image style** — solid color + title text vs photo background (start simple)
6. **Privacy policy page content** — required for EU/UA audience
7. **Keystatic Cloud vs self-hosted GitHub App** — Cloud free tier covers up to 3 users and handles OAuth; self-hosted means setting up the GitHub App yourself. **Recommend Cloud for simplicity.**

---

## 29. Things Deliberately NOT in This Plan

- No custom CMS / admin UI beyond Keystatic
- No user accounts beyond Phase 2 comment auth
- No payments / paywall
- No third-party tracking (no GA, no FB pixel)
- No A/B testing
- No machine translation
- No PWA / service worker
- No native mobile app
- No realtime features
- No AI-generated content
- No view-count widgets (Phase 3 maybe)

---

## 30. Reference Links

- Astro 6 docs: https://docs.astro.build
- Astro i18n routing: https://docs.astro.build/en/guides/internationalization/
- Astro + Keystatic guide: https://docs.astro.build/en/guides/cms/keystatic/
- Keystatic docs: https://keystatic.com/docs
- Keystatic GitHub mode: https://keystatic.com/docs/github-mode
- Astro Markdoc: https://docs.astro.build/en/guides/integrations-guide/markdoc/
- Cloudflare Workers framework guides — Astro: https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/
- DaisyUI 5: https://daisyui.com
- Tailwind 4: https://tailwindcss.com
- Pagefind: https://pagefind.app
- Giscus: https://giscus.app
- Resend: https://resend.com/docs
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Hreflang validator: https://app.hreflang.org
- ISO 639-1 reminder: `uk` is Ukrainian, NEVER `ua`

---

End of plan. Ship Milestone 1 this week.
