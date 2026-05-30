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
| Adapter | `@astrojs/cloudflare` | 13.x (production/preview) |
| Adapter (local dev) | `@astrojs/node` | 10.x (pnpm dev only — workerd has no fs) |
| CMS | Keystatic | ^0.5+ |
| Keystatic Astro integration | `@keystatic/astro` | ^5.x |
| React (required by Keystatic Admin UI) | `@astrojs/react` | ^4.x |
| Markdoc | `@astrojs/markdoc` | ^0.13+ |
| CSS | Tailwind CSS | ^4.0 (via `@tailwindcss/vite`) |
| CSS typography | `@tailwindcss/typography` | ^0.5 |
| Component library | DaisyUI | ^5.0 |
| Content | Astro Content Collections (Content Layer API) | built-in |
| Code highlighting | Shiki (Astro built-in) | built-in |
| Search | Pagefind | ^1.x |
| Comments | Giscus | latest |
| Newsletter sending | Cloudflare Email Service (`send_email` binding) | built-in |
| Notifications | Telegram Bot API (no SDK needed) | n/a |
| Analytics | Cloudflare Web Analytics | n/a |
| Package manager | pnpm | ^9.x |
| Node | local dev only | ≥20 |
| Hosting | Cloudflare Workers (Static Assets + SSR) | n/a |
| Database | Cloudflare D1 | n/a |
| Tooling | Wrangler | latest |
| Type safety | TypeScript (strict) | ^5.x |
| Workers types | `@cloudflare/workers-types` | ^4.x |
| Email templates | `@react-email/editor` (admin UI only) | ^1.x |
| Linting | ESLint + Prettier | latest |

**Decisions explained briefly:**
- Astro 6 (not Nuxt/Next): Cloudflare-acquired in Jan 2026, first-class Workers support, smallest JS bundle for content sites
- DaisyUI 5: user is already comfortable with it, theme system fits bilingual + dark mode
- Tailwind 4 via Vite plugin: replaces the deprecated `@astrojs/tailwind` integration
- Keystatic: best git-based CMS for Astro, `branchPrefix` support gives a clean PR workflow, Markdoc support gives rich blocks
- Markdoc over MDX or plain markdown: safer (no arbitrary JS), rich custom blocks (YouTube, callouts), works natively with Keystatic
- D1 over KV for subscribers: relational queries are simpler in SQL
- Pagefind: zero-backend search, multilingual-aware, builds at deploy time
- **Cloudflare Email Service** (`send_email` binding): replaces Resend — no external SDK, no API key to manage, no Node polyfills needed inside Workers. Free on Workers paid plan; sender domain verified via Cloudflare Email Routing. Resend was the original choice but the Cloudflare-native approach eliminates a dependency, a secret, and an outbound network hop.

---

## 3. Cloudflare Resources Required

| Resource | Name | Purpose |
|---|---|---|
| Worker | `blog` | Hosts the Astro app (static assets + SSR routes), production |
| Worker | `blog-pr-*` | Per-PR preview deployments |
| D1 Database | `portfolio-blog` | Subscribers, future comments |
| KV Namespace | `RATE_LIMIT` | Rate limiting for subscribe endpoint |
| Custom Domain | e.g. `yourdomain.com` | Bound to the production Worker |
| Web Analytics | site token | Privacy-friendly analytics |

**Secrets (via `wrangler secret put` for production; preview envs use GitHub Actions secrets):**
Accessed at runtime via `astro:env/server` typed imports:
- `SUBSCRIBE_RATE_LIMIT_SECRET` — required (min: 1)
- `TELEGRAM_BOT_TOKEN` — optional (notify() no-ops when absent)
- `TELEGRAM_CHAT_ID` — optional
Accessed via Keystatic's own auth layer (not through astro:env):
- `KEYSTATIC_GITHUB_CLIENT_ID`
- `KEYSTATIC_GITHUB_CLIENT_SECRET`
- `KEYSTATIC_SECRET`

**Public vars (in `wrangler.jsonc` `vars`):**
- `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG`
- `MAIL_FROM` (sender address, e.g. `hello@yourdomain.com`)
Accessed via `cloudflare:workers` env (same as bindings):
- `MAIL_FROM`

**Bindings (in `wrangler.jsonc`):**
- `SEND_EMAIL` — Cloudflare Email Service binding for outbound email (replaces Resend)

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

# 10. Cloudflare Email Service (replaces Resend)
pnpm add -D wrangler
npx wrangler login

# NOTE: No Resend SDK needed. Outbound email uses the Cloudflare Email
# Service `send_email` Worker binding (configured in wrangler.jsonc).
# The sender domain must have Cloudflare Email Routing enabled.

# 12. Create D1 database
npx wrangler d1 create portfolio-blog
# Copy the database_id from output into wrangler.jsonc

# 13. Create KV namespace for rate limiting
npx wrangler kv:namespace create RATE_LIMIT

# 14. Initial schema
npx wrangler d1 execute portfolio-blog --remote --file=./schema/0001_init.sql

# 15. Add Cloudflare Workers types (for Env interface)
pnpm add -D @cloudflare/workers-types

# 16. Add Tailwind Typography plugin
pnpm add -D @tailwindcss/typography
```

---

## 5. Project Structure

```
blog/
├── astro.config.mts              # .mts (not .mjs) for TS import support
├── keystatic.config.ts            # CMS schema + Keystatic content components
├── markdoc.config.mts             # Markdoc tags + Shiki config (.mts)
├── wrangler.jsonc                 # .jsonc (not .toml) for comment support
├── tsconfig.json
├── package.json
├── pnpm-workspace.yaml            # pnpm build allowlist + patched deps
├── patches/                       # Patched dependencies (keystatic, react-email)
├── scripts/
│   └── post-build.mjs             # Apex redirect for local wrangler dev
├── .dev.vars.example              # Committed template; copy to .dev.vars (gitignored)
├── .github/
│   ├── workflows/
│   │   ├── deploy.yml             # Production deploy on push to main
│   │   ├── preview.yml            # Preview deploy on PR open/sync
│   │   ├── preview-cleanup.yml    # Tear down preview Worker on PR close
│   │   └── auto-label.yml         # Auto-label PRs based on file changes
│   └── labels.yml                 # Repo label definitions
├── schema/
│   └── 0001_init.sql
├── public/
│   ├── robots.txt
│   └── og-default.png
├── src/
│   ├── env.d.ts
│   ├── middleware.ts              # Rewrites apex /api/keystatic/* to /blog/api/keystatic/*
│   ├── content.config.ts          # Astro content collection definitions
│   ├── styles/
│   │   └── global.css             # Tailwind + DaisyUI + custom theme definitions
│   ├── i18n/
│   │   ├── config.ts
│   │   ├── ui.ts
│   │   └── utils.ts
│   ├── content/
│   │   └── posts/
│   │       ├── en/
│   │       │   ├── hello-world.mdoc
│   │       │   └── draft-example.mdoc
│   │       └── uk/
│   │           └── pryvit-svit.mdoc
│   ├── emails/                    # JSON email templates (loaded at build time)
│   │   ├── confirm-en.json
│   │   ├── confirm-uk.json
│   │   ├── welcome-en.json
│   │   └── welcome-uk.json
│   ├── assets/
│   │   └── posts/                 # Images committed to git (MVP); migrate to R2 in Phase 2
│   ├── components/
│   │   ├── BaseHead.astro
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── LanguageSwitcher.astro
│   │   ├── ThemeToggle.astro
│   │   ├── PostCard.astro
│   │   ├── TableOfContents.astro
│   │   ├── Giscus.astro
│   │   ├── SearchModal.astro
│   │   ├── SubscribeForm.astro
│   │   ├── Prose.astro
│   │   ├── Carousel.astro         # Horizontal scroll carousel for home page
│   │   ├── CarouselItem.astro
│   │   ├── EmailEditorIsland.tsx  # React island for email template editing
│   │   ├── EmailTemplateListIsland.tsx
│   │   └── markdoc/
│   │       ├── YouTube.astro      # Custom Markdoc tag
│   │       └── Callout.astro      # Custom Markdoc tag (no CodeBlock.astro — Shiki is kept)
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   ├── PostLayout.astro
│   │   └── AdminLayout.astro      # Layout for /admin/* pages
│   ├── lib/
│   │   ├── seo.ts
│   │   ├── og.ts
│   │   ├── reading-time.ts
│   │   ├── posts.ts               # Helper that filters drafts/future posts
│   │   ├── post-slug.ts           # Resolves slug from post data or ID fallback
│   │   ├── d1.ts
│   │   ├── email.ts               # Cloudflare Email Service (replaces resend.ts)
│   │   ├── emails-store.ts        # File-based email template CRUD (Node.js only)
│   │   ├── telegram.ts
│   │   └── tokens.ts
│   └── pages/
│       ├── index.astro                       # Static meta-refresh → /en/ (or /blog/en/)
│       ├── 404.astro
│       ├── admin/
│       │   └── emails/           # Email template management UI
│       ├── api/
│       │   ├── subscribe.ts
│       │   ├── confirm.ts
│       │   ├── unsubscribe.ts
│       │   └── emails/
│       │       ├── templates.ts
│       │       └── templates/[slug].ts
│       └── [...locale]/
│           ├── index.astro
│           ├── about.astro
│           ├── posts/
│           │   ├── index.astro
│           │   ├── [slug].astro
│           │   └── page/[page].astro  # Pagination pages 2+
│           ├── tags/
│           │   ├── index.astro
│           │   └── [tag].astro
│           ├── subscribe.astro
│           └── rss.xml.ts
└── docs/
    ├── KEYSTATIC.md
    ├── CONTENT.md
    ├── EMAIL.md
    ├── EMAILS.md
    └── TELEGRAM.md
```

---

## 6. Configuration Files

### `astro.config.mts`

> **Note:** The file is `.mts` (not `.mjs`) so that TypeScript imports like `keystatic.config.ts` resolve naturally.

The production site lives at `yourdomain.com/blog` (base path `/blog`). In local dev (`pnpm dev`), the base path collapses to `/` so Keystatic's hardcoded `/api/keystatic/*` paths line up without middleware rewriting. This dual-mode base path is driven by the `PUBLIC_KEYSTATIC_MODE` env var.

```js
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import keystatic from '@keystatic/astro';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const LOCAL_MODE = process.env.PUBLIC_KEYSTATIC_MODE === 'local';
const BASE_PATH = LOCAL_MODE ? '/' : '/blog';

export default defineConfig({
  site: 'https://yourdomain.com',
  base: BASE_PATH,               // '/blog' in prod/preview, '/' in local dev
  output: 'server',
  // adapter branches on PUBLIC_KEYSTATIC_MODE:
  //   local (pnpm dev)  → @astrojs/node  (workerd has no fs; Keystatic local needs fs)
  //   otherwise         → @astrojs/cloudflare  (production / wrangler:dev)
  adapter: LOCAL_MODE
    ? node({ mode: 'standalone' })
    : cloudflare({
        // 'passthrough' avoids bundling sharp into the Worker.
        // sharp cannot run in the Workers runtime.
        imageService: 'passthrough',
      }),
  image: {
    // No-op service prevents sharp from being pulled into the bundle.
    service: { entrypoint: 'astro/assets/services/noop' },
  },
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
    // Keystatic UI needs Vite to pre-bundle (CJS→ESM) react-dom/client and the
    // React Spectrum / Keystatic UI modules. Including them eagerly avoids the
    // "createRoot is not exported" runtime hydration error.
    optimizeDeps: {
      include: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'react-dom/client',
        '@keystatic/core/ui',
        '@keystatic/astro/ui',
      ],
    },
  },
  markdown: {
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
```

**Why `imageService: 'passthrough'` + noop service, not `'compile'`:** The `compile` image service requires `sharp`, which cannot run in the Cloudflare Workers runtime (no native binaries). The noop service prevents `sharp` from being bundled. Images are served as-is; Phase 2 can add a Workers-compatible image pipeline (e.g. Cloudflare Image Resizing) if needed.

### `keystatic.config.ts`

```ts
import { config, fields, collection } from '@keystatic/core';
import { block, wrapper } from '@keystatic/core/content-components';
import { createElement, type ReactNode } from 'react';

// Mode selection.
//
//   `import.meta.env.PUBLIC_*` is the Astro idiom: Vite substitutes it at
//   build time into both server and client bundles, so the storage kind is a
//   literal in the shipped output.
//
//   Local kind: ONLY `pnpm dev` (Astro dev server, real Node.js). Sets
//   PUBLIC_KEYSTATIC_MODE=local, which also flips Astro's base path to apex
//   so Keystatic's hardcoded /api/keystatic/* paths line up. Saves write
//   directly to `src/content/posts/{en,uk}/`.
//
//   GitHub kind: `pnpm wrangler:dev` AND production. The flag is unset, base
//   path is `/blog`, and the integration uses the GitHub App credentials.
//   Keystatic's local storage requires `fs`, so it cannot run inside a
//   Cloudflare Worker.
const useLocal = import.meta.env.PUBLIC_KEYSTATIC_MODE === 'local';

const GITHUB_REPO = 'YOUR_GITHUB_ORG/blog';

// Keystatic content components: provide live previews inside the Admin UI
// editor for custom Markdoc blocks. Without these, the editor shows a blank
// placeholder for {% callout %} and {% youtube %} tags.
const markdocComponents = {
  callout: wrapper({
    label: 'Callout',
    schema: {
      type: fields.select({
        label: 'Type',
        defaultValue: 'info',
        options: [
          { label: 'Info', value: 'info' },
          { label: 'Tip', value: 'tip' },
          { label: 'Warning', value: 'warn' },
          { label: 'Danger', value: 'danger' },
        ],
      }),
    },
    ContentView: ({ value, children }) =>
      createElement('div', {
        style: {
          borderLeft: '4px solid var(--ks-colors-border-accent)',
          padding: '12px 16px',
          margin: '12px 0',
          background: 'var(--ks-colors-background-secondary)',
          borderRadius: '8px',
        },
      }, children),
  }),
  youtube: block({
    label: 'YouTube',
    schema: {
      id: fields.text({ label: 'Video ID', validation: { isRequired: true } }),
      title: fields.text({ label: 'Title', defaultValue: '' }),
    },
    ContentView: ({ value }) =>
      createElement('div', {
        style: {
          padding: '12px 16px',
          margin: '12px 0',
          background: 'var(--ks-colors-background-secondary)',
          border: '1px solid var(--ks-colors-border-muted)',
          borderRadius: '8px',
        },
      }, `YouTube embed: ${value.title || value.id}`),
  }),
};

export default config({
  storage: useLocal
    ? { kind: 'local' }
    : {
        kind: 'github',
        repo: GITHUB_REPO,
        branchPrefix: 'post/',
      },

  ui: {
    brand: { name: 'Your Blog', mark: () => createElement('span', null, '✍️') },
  },

  collections: {
    postsEn: collection({
      label: 'Posts (English)',
      // `slugField: 'title'` tells Keystatic to use the title field's slug part
      // as the filename. `fields.slug` is a COMPOUND field: it renders a name
      // input AND a slug input derived from it. So one field, two UI inputs —
      // no separate `slug` field needed.
      slugField: 'title',
      path: 'src/content/posts/en/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({
          name: {
            label: 'Title',
            validation: { length: { min: 1, max: 120 } },
          },
          slug: {
            label: 'Slug',
            description: 'URL slug — auto-generated from the title. Override if needed.',
          },
        }),
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
          components: markdocComponents,
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
      slugField: 'title',
      path: 'src/content/posts/uk/*',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({
          name: {
            label: 'Заголовок',
            validation: { length: { min: 1, max: 120 } },
          },
          slug: {
            label: 'Slug',
            description: 'URL slug — генерується автоматично, можна змінити вручну.',
          },
        }),
        translationKey: fields.text({
          label: 'Translation Key',
          description: 'Спільний ідентифікатор для перекладів однієї статті.',
          validation: { length: { min: 1, max: 80 } },
        }),
        description: fields.text({
          label: 'Опис',
          multiline: true,
          validation: { length: { min: 50, max: 200 } },
        }),
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
          components: markdocComponents,
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

**Key differences from a naive Keystatic setup:**
1. **`slugField: 'title'`** — uses the compound `fields.slug({ name, slug })` so the title IS the slug field. There is no separate `slug` field. The `slug` sub-field auto-generates from the `name` sub-field but is manually editable.
2. **`components: markdocComponents`** — registers Keystatic content components (`block`, `wrapper`) so the Admin UI editor shows live previews for custom Markdoc tags like `{% callout %}` and `{% youtube %}`. Without these, the editor renders a blank placeholder.
3. **`import.meta.env` instead of `process.env.NODE_ENV`** — Keystatic's storage kind must be a build-time literal (Vite inlines `import.meta.env.PUBLIC_*` into both server and client bundles). Using `process.env.NODE_ENV === 'production'` would fail in the browser bundle where `process` doesn't exist. The `PUBLIC_KEYSTATIC_MODE` flag also drives the Astro base path in `astro.config.mts`.
4. **`useLocal` boolean** — The Worker runtime is not Node.js, so Keystatic's local storage (which requires `fs`) cannot work there. `pnpm dev` (Node.js) uses local; `pnpm wrangler:dev` and production both use GitHub mode.

### `markdoc.config.mts`

> **Critical:** Do NOT override the `fence` node. Shiki transforms ` ```lang ` fenced blocks into dual-theme HTML (one `<pre>` per theme, CSS-variable-switched). Overriding `fence` discards Shiki's output. Language badge and copy button are layered on by a client-side script in `PostLayout.astro` (see `.code-block-wrap`, `.lang-badge`, `.copy-btn` in `global.css`).

```js
import { defineMarkdocConfig, component } from '@astrojs/markdoc/config';
import shiki from '@astrojs/markdoc/shiki';

export default defineMarkdocConfig({
  extends: [shiki({ themes: { light: 'github-light', dark: 'github-dark' }, wrap: true })],
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
        type: {
          type: String,
          default: 'info',
          matches: ['info', 'warn', 'tip', 'danger'],
        },
      },
    },
  },
  // Do NOT add a `nodes.fence` override here.
});
```

### `wrangler.jsonc`

> Uses `.jsonc` (not `.toml`) for comment support. Wrangler supports both formats; `.jsonc` is preferred for its comment syntax and because the Astro Cloudflare adapter generates JSON-compatible output.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "blog",
  "main": "@astrojs/cloudflare/entrypoints/server",
  "compatibility_date": "2026-05-15",
  "compatibility_flags": ["nodejs_compat"],

  "assets": {
    "binding": "ASSETS",
    "directory": "./dist/client"
  },

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "portfolio-blog",
      "database_id": "REPLACE_WITH_REAL_ID",
      "migrations_dir": "./schema"
    }
  ],

  "kv_namespaces": [
    {
      "binding": "RATE_LIMIT",
      "id": "REPLACE_WITH_REAL_ID"
    }
  ],

  // Cloudflare Email Service binding for outbound email.
  // Requires Email Routing enabled on the sender domain.
  "send_email": [
    {
      "name": "SEND_EMAIL"
    }
  ],

  "observability": {
    "enabled": true
  },

  // Route topology:
  //
  //   /blog, /blog/*   → all blog routes (incl. /blog/keystatic UI)
  //   /api/keystatic, /api/keystatic/*
  //                    → apex Keystatic API. The Keystatic React UI
  //                      fetches these absolute paths; src/middleware.ts
  //                      rewrites them to /blog/api/keystatic/* so Astro
  //                      (running with base: '/blog') can serve them.
  //
  // Apex `/` is intentionally NOT bound — the root domain serves
  // a separate site (e.g. portfolio landing page).
  "routes": [
    { "pattern": "yourdomain.com/blog", "zone_name": "yourdomain.com" },
    { "pattern": "yourdomain.com/blog/*", "zone_name": "yourdomain.com" },
    { "pattern": "yourdomain.com/api/keystatic", "zone_name": "yourdomain.com" },
    { "pattern": "yourdomain.com/api/keystatic/*", "zone_name": "yourdomain.com" }
  ],

  // Public (non-secret) vars. These are inlined into the deployed Worker bundle.
  // Anything sensitive belongs in `wrangler secret put`.
  "vars": {
    "MAIL_FROM": "hello@yourdomain.com",
    "PUBLIC_KEYSTATIC_GITHUB_APP_SLUG": "your-keystatic-github-app-slug"
  },

  // `dev.host` is only relevant if you run `wrangler dev` directly.
  // `pnpm wrangler:dev` runs `pnpm build && astro preview` instead (the v13
  // approach via @cloudflare/vite-plugin, serving at :4321), so this entry
  // does not affect normal local development.
  "dev": {
    "host": "localhost:8787"
  }
}
```

**Why `send_email` binding, not Resend SDK:** The Cloudflare Email Service binding sends email directly from the Worker with zero dependencies, no API key secret, and no outbound network hop. The tradeoff is that the sender domain must have Cloudflare Email Routing enabled and the `MAIL_FROM` address must be a verified sender. For a personal blog on Cloudflare, this is strictly simpler than adding Resend as a third-party service.

### `src/styles/global.css`

> Uses custom DaisyUI theme definitions instead of the built-in `light`/`dark` presets. The `themes: false` flag disables all built-in themes so only the explicitly-defined custom themes are available. This gives full control over the color palette.

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
@plugin "daisyui" {
  themes: false;  /* Disable built-in themes; define custom ones below */
  logs: false;
}

@plugin "daisyui/theme" {
  name: "light";
  default: true;
  prefersdark: false;
  color-scheme: "light";
  /* ... custom color variables ... */
}

@plugin "daisyui/theme" {
  name: "dark";
  default: false;
  prefersdark: false;
  color-scheme: "dark";
  /* ... custom color variables ... */
}

/* Custom variants for data-theme-based light/dark styling */
@custom-variant light {
  &:where([data-theme="light"], [data-theme="light"] *) {
    @slot;
  }
}

@custom-variant dark {
  &:where([data-theme="dark"], [data-theme="dark"] *) {
    @slot;
  }
}
```

The full `global.css` also includes:
- Custom utilities: `.hitslop`, `.icon`, `.cta-icon`, `.cta-icon-left`
- Code block styling: `.code-block-wrap`, `.lang-badge`, `.copy-btn` (hover-to-reveal copy button + language badge, layered over Shiki output via client-side JS in `PostLayout.astro`)
- Anchor scroll margin for sticky header
- Prose link styling tweaks
- Shiki dual-theme CSS variable switching (light/dark mode)
- Pagefind UI dark mode overrides
- Smooth scroll behavior

### `src/env.d.ts`

```ts
/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

// NOTE (@astrojs/cloudflare v13): Astro.locals.runtime.env was removed.
// Bindings are accessed via `import { env } from 'cloudflare:workers'`.
// Server secrets (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
// SUBSCRIBE_RATE_LIMIT_SECRET) are accessed via `astro:env/server`.
// This Env interface is kept for wrangler type generation; it is not used
// directly in app code to read values.

interface Env {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  ASSETS: Fetcher;
  /** Cloudflare Email Service binding — see `send_email` in wrangler.jsonc. */
  SEND_EMAIL: SendEmail;
  /** Sender address, e.g. "hello@yourdomain.com". Set as a wrangler var (not a secret). */
  MAIL_FROM: string;
  PUBLIC_KEYSTATIC_GITHUB_APP_SLUG: string;
}

interface ImportMetaEnv {
  readonly PREVIEW_MODE?: string;
  /**
   * Drives Keystatic storage kind AND Astro base path. Set to `'local'`
   * by `pnpm dev` only. Unset for `pnpm wrangler:dev` and `pnpm build`
   * (both use GitHub OAuth and base `/blog`).
   */
  readonly PUBLIC_KEYSTATIC_MODE?: 'local';
  readonly PUBLIC_KEYSTATIC_GITHUB_APP_SLUG?: string;
  readonly PUBLIC_GISCUS_REPO?: string;
  readonly PUBLIC_GISCUS_REPO_ID?: string;
  readonly PUBLIC_GISCUS_CATEGORY?: string;
  readonly PUBLIC_GISCUS_CATEGORY_ID?: string;
  readonly PUBLIC_CF_ANALYTICS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

**Key differences from the initial plan:**
- `SEND_EMAIL: SendEmail` and `MAIL_FROM: string` — replaces `RESEND_API_KEY` since we use Cloudflare Email Service instead of the Resend SDK. Both accessed via `cloudflare:workers` env.
- `@cloudflare/workers-types` reference — provides `D1Database`, `KVNamespace`, `Fetcher`, `SendEmail` type definitions.
- `ImportMetaEnv` with `PUBLIC_*` and `PREVIEW_MODE` — these are build-time constants (Vite inlines them). They're needed for Keystatic mode, Giscus, and Cloudflare Analytics configuration.
- `PREVIEW_MODE` — set to `'true'` in the preview deploy workflow so drafts are visible on preview URLs.
- Server secrets (`SUBSCRIBE_RATE_LIMIT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) are no longer in the `Env` interface — they are accessed via `astro:env/server` typed imports instead of `Astro.locals.runtime.env` (which was removed in `@astrojs/cloudflare` v13).

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

export const ogLocale: Record<Locale, string> = {
  en: 'en_US',
  uk: 'uk_UA',
};

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  uk: 'Українська',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇬🇧',
  uk: '🇺🇦',
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
```

**`ogLocale`** is needed for OpenGraph `og:locale` meta tags (format: `en_US`, `uk_UA`).
**`isLocale()`** is a type guard used by API endpoints and `getLocaleFromUrl()` to validate locale strings.

### `src/i18n/ui.ts`
Contains UI string maps for both locales (`nav.*`, `post.*`, `subscribe.*`, `search.*`, `comments.*`).

### `src/i18n/utils.ts`

```ts
import { ui, type UIKey } from './ui';
import { defaultLocale, isLocale, type Locale } from './config';
import { getPostSlug } from '../lib/post-slug';

export function getLocaleFromUrl(url: URL): Locale {
  const [, maybeLocale] = url.pathname.split('/');
  if (maybeLocale && isLocale(maybeLocale)) return maybeLocale;
  return defaultLocale;
}

export function useTranslations(locale: Locale) {
  return function t(key: UIKey, vars?: Record<string, string | number>): string {
    let value: string = ui[locale][key] ?? ui[defaultLocale][key];
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replaceAll(`{${k}}`, String(v));
      }
    }
    return value;
  };
}

/**
 * Prepends Astro's BASE_URL (e.g. `/blog`) to a path.
 * Always inserts exactly one slash between base and path.
 */
export function withBase(path: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  const clean = path.replace(/^\/+/, '');
  return clean ? `${base}/${clean}` : `${base}/`;
}

export function localeHref(locale: Locale, path = ''): string {
  const clean = path.replace(/^\/+/, '');
  return withBase(clean ? `${locale}/${clean}` : `${locale}/`);
}

/**
 * Returns the URL for the same post in each locale.
 * Returns null for locales where the translation doesn't exist.
 */
export async function getTranslatedPostUrls(
  translationKey: string,
): Promise<Record<Locale, string | null>> {
  const { getCollection } = await import('astro:content');
  const all = [
    ...(await getCollection('postsEn')),
    ...(await getCollection('postsUk')),
  ];
  const matches = all.filter(
    (p) => p.data.translationKey === translationKey,
  );
  const result: Record<Locale, string | null> = { en: null, uk: null };
  for (const m of matches) {
    const locale: Locale = m.collection === 'postsEn' ? 'en' : 'uk';
    result[locale] = withBase(`${locale}/posts/${getPostSlug(m)}`);
  }
  return result;
}
```

**Key addition:** `withBase()` is critical because the site uses `base: '/blog'` in production. Every internal link (nav, PostCard, RSS, etc.) must go through `withBase()` or `localeHref()` to produce `/blog/en/posts/...` instead of `/en/posts/...`. The `getPostSlug()` helper resolves the slug from `post.data.slug` (set by Keystatic's compound `fields.slug`) with a fallback to `post.id` for content files that don't have the slug field.

---

## 8. Base Path Architecture (`/blog`)

The production blog lives at `yourdomain.com/blog` (not the domain root). This is a deliberate choice: the root domain (`yourdomain.com`) may serve a separate portfolio or landing page in the future.

### How it works
- `astro.config.mts` sets `base: '/blog'` when `PUBLIC_KEYSTATIC_MODE` is not `local`
- In local dev (`pnpm dev`), `base` is `/` because Keystatic's React Admin UI hardcodes ~20 fetch URLs to `/api/keystatic/*` (root-relative, no `basePath` option). With `base: '/'`, those paths naturally line up.
- In production and `wrangler dev`, `base: '/blog'` shifts all Astro routes under `/blog/*`

### The Keystatic API path mismatch
Keystatic's React client makes absolute fetches to `/api/keystatic/*`. With `base: '/blog'`, the Astro API routes actually live at `/blog/api/keystatic/*`. The mismatch is solved by two pieces:

1. **Apex Worker route binding** — `wrangler.jsonc` binds the Worker to `yourdomain.com/api/keystatic` and `yourdomain.com/api/keystatic/*` in addition to `/blog/*`. So the UI's apex fetches reach this Worker.
2. **Astro middleware rewrite** — `src/middleware.ts` intercepts incoming apex `/api/keystatic/*` requests and rewrites them to `/blog/api/keystatic/*` so Astro's router (which lives under `base: '/blog'`) can serve them. The browser sees a normal `200` from `/api/keystatic/...`.

### `src/middleware.ts`

```ts
import { defineMiddleware } from 'astro:middleware';

const BASE = '/blog';
const APEX_PREFIXES = ['/api/keystatic'];

export const onRequest = defineMiddleware((context, next) => {
  if (import.meta.env.PUBLIC_KEYSTATIC_MODE === 'local') {
    return next();
  }

  const { pathname, search } = context.url;

  for (const prefix of APEX_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return context.rewrite(`${BASE}${pathname}${search}`);
    }
  }

  return next();
});
```

### URL helpers
All internal links must go through `withBase()` or `localeHref()` (from `src/i18n/utils.ts`) to produce correct paths like `/blog/en/posts/...` in production and `/en/posts/...` in local dev. Never hardcode locale paths.

### `robots.txt`
Blocks both `/blog/keystatic` and `/keystatic` (and their `/api/` counterparts) from indexing, covering both the base-path and apex-path forms.

---

## 9. Content Collections

Keystatic writes `.mdoc` files. Astro content collections load them via the glob loader.

### `src/content.config.ts`

```ts
import { defineCollection, z } from 'astro:content';
import type { SchemaContext } from 'astro:content';
import { glob } from 'astro/loaders';

const postSchema = ({ image }: SchemaContext) =>
  z.object({
    title: z.string().min(1).max(120),
    // `slug` is optional in Zod because Keystatic's compound `fields.slug`
    // writes the slug to the filename (not as a separate frontmatter key).
    // When absent, `getPostSlug()` falls back to `post.id.replace(/\.mdoc$/, '')`.
    slug: z.string().optional(),
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

**Note on `slug: z.string().optional()`:** Keystatic's compound `fields.slug({ name, slug })` writes the slug value to the **filename** (e.g. `hello-world.mdoc`), not as a separate `slug:` frontmatter key. The `post.data.slug` field is therefore absent in most `.mdoc` files. The `getPostSlug()` helper in `src/lib/post-slug.ts` resolves this by falling back to `post.id.replace(/\.mdoc$/, '')` when `post.data.slug` is undefined.

### Why two collections instead of one
Keystatic configures collections as independent units (each tied to a `path`). Mirroring this on the Astro side keeps the data layer aligned with the CMS layer and avoids runtime locale filtering on every query. `translationKey` bridges them when needed.

---

## 10. Keystatic CMS Setup (Detailed)

### Local dev workflow
- `pnpm dev` boots Astro at `http://127.0.0.1:4321` (base path `/`)
- Visit `/keystatic` to open the Admin UI
- In local mode, saves write directly to `src/content/posts/{locale}/*.mdoc`
- No auth required locally
- `PUBLIC_KEYSTATIC_MODE=local` env var is set by the `dev` script

### Production workflow (GitHub mode)
1. Deploy the Astro site with Keystatic loaded (it requires the env vars to enable GitHub mode)
2. Visit `https://yourdomain.com/blog/keystatic` — Keystatic prompts to create a GitHub App if one isn't connected
3. Create the GitHub App via Keystatic's flow (gives you the 3 secrets + public slug)
4. Set secrets in Cloudflare Worker via `wrangler secret put`, update `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` in `wrangler.jsonc`
5. Anyone with write access to the repo can now log in at `/blog/keystatic`

### Branch behaviour
With `branchPrefix: 'post/'`:
- Creating or editing a post in the Admin UI creates a branch like `post/hello-world`
- Saving commits to that branch
- Keystatic auto-opens (or updates) a PR from that branch to `main`
- The PR is auto-labeled and gets a preview deployment (see Sections 23 and 24)
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

Defined in `markdoc.config.mts` with corresponding Keystatic content components in `keystatic.config.ts`:
- `{% youtube id="..." title="..." /%}` — privacy-friendly YouTube embed (nocookie). Keystatic content component (`block`) shows a preview card with the video ID/title.
- `{% callout type="info" %}...{% /callout %}` — info / warn / tip / danger callout boxes. Keystatic content component (`wrapper`) renders a styled preview with a left-border accent.
- ` ```language ` fenced code blocks — Shiki syntax highlighting. **Do NOT override the `fence` node** — Shiki emits dual-theme HTML that would be discarded by a custom renderer. Language badge + copy button are layered on client-side by `PostLayout.astro`'s script (see `.code-block-wrap`, `.lang-badge`, `.copy-btn` in `global.css`).

### Keystatic UI features used
- Image paste from clipboard (built-in)
- Image drag-drop (built-in)
- Code block with language dropdown (built-in via Markdoc fence)
- YouTube embed via Keystatic content component with id field (shows a preview card in the editor)
- Callout via Keystatic content component with type selector (shows a styled preview in the editor)
- Slug auto-generation from title (compound `fields.slug` field)
- Auto-save to localStorage as you type (built-in, prevents loss on accidental tab close)

---

## 11. Route Inventory

| Route | Type | Notes |
|---|---|---|
| `/` | Static meta-refresh | Redirect → `/en/` (or `/blog/en/` in prod) |
| `/en/` | Prerendered | Home: latest 6 posts (carousel), tags, about teaser, subscribe |
| `/uk/` | Prerendered | Same, Ukrainian |
| `/en/about` | Prerendered | Inline content (not Markdoc-driven) |
| `/uk/about` | Prerendered | " |
| `/en/posts/` | Prerendered, paginated | 10 posts per page; page 1 |
| `/uk/posts/` | Prerendered, paginated | " |
| `/en/posts/page/[page]` | Prerendered | Pagination pages 2+ |
| `/uk/posts/page/[page]` | Prerendered | " |
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
| `/sitemap-index.xml` | Built at deploy | Auto-generated by `@astrojs/sitemap` with hreflang annotations |
| `/robots.txt` | Static | Blocks `/keystatic` and `/api/keystatic` in both base-path and apex forms |
| `/keystatic/*` | SSR | Keystatic Admin UI (auto-mounted by `@keystatic/astro`) |
| `/api/keystatic/*` | SSR | Keystatic API (auto-mounted by `@keystatic/astro`, apex routes rewritten by middleware) |
| `/api/subscribe` | SSR | Newsletter subscribe |
| `/api/confirm` | SSR | Newsletter confirm (redirects to subscribe page with `?confirmed=1`) |
| `/api/unsubscribe` | SSR | Newsletter unsubscribe (returns HTML page) |
| `/admin/emails/*` | SSR | Email template management UI (React island) |
| `/api/emails/templates/*` | SSR | Email template CRUD API |
| `/404` | Prerendered | Custom 404 |
| `/pagefind/*` | Static | Built by `pagefind` after Astro build |

Pages set `export const prerender = true` by default; `/api/*`, `/keystatic/*`, and `/admin/*` routes are SSR.

**Note on Keystatic routes:** `@keystatic/astro` auto-mounts the Admin UI at `/keystatic` and API at `/api/keystatic`. There are NO explicit `src/pages/keystatic/[...params].ts` or `src/pages/api/keystatic/[...params].ts` files — the integration handles them internally.

---

## 12. Styling: Tailwind 4 + DaisyUI

### Theme
- DaisyUI's `light` and `dark` themes
- Persisted in localStorage as `theme`, applied via `data-theme` on `<html>`
- Toggle in header
- Pre-paint inline script in `<head>` prevents FOUC
- Theme change postMessages to Giscus iframe to sync

### Typography
- `@tailwindcss/typography` plugin for `prose` class (added via `@plugin` in CSS, not as a Vite plugin)
- Article body: `<article class="prose dark:prose-invert lg:prose-lg">`
- Callout and YouTube blocks use `not-prose` to escape typography styling

### Component patterns
- DaisyUI primitives: `btn`, `card`, `alert`, `input`, `toggle`, `dropdown`, `menu`, `modal`, `navbar`
- Search modal uses DaisyUI `modal`
- Subscribe form uses DaisyUI `input` + `btn` + `alert` for state feedback
- Language switcher uses DaisyUI `dropdown` on mobile

---

## 13. SEO Infrastructure

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

## 14. RSS Feeds

Two feeds: `/en/rss.xml` and `/uk/rss.xml`. Use `@astrojs/rss`. Each uses `getPublishedPosts(locale)` from `src/lib/posts.ts` so drafts and future-dated posts are correctly filtered.

---

## 15. Search: Pagefind

- Build script: `"build": "astro build && pagefind --site dist/blog --output-path dist/blog/pagefind && node ./scripts/post-build.mjs"`
- The `--site dist/blog` flag points Pagefind to the base-path subdirectory (Astro outputs to `dist/blog/` when `base: '/blog'`)
- Pagefind auto-detects `<html lang>` and builds per-language indexes
- `data-pagefind-body` on article body in `PostLayout.astro`
- `data-pagefind-meta="locale:..."` on article body for locale-aware filtering
- Search modal mounts Pagefind UI on first open; Pagefind's per-language index provides natural locale isolation
- Keyboard shortcut `/` opens it

---

## 16. Comments: Giscus

- GitHub Discussions enabled on the repo
- Giscus GitHub App installed
- Configured via `PUBLIC_GISCUS_*` env vars (set in `.dev.vars` for local dev, GitHub Actions `vars` for CI, and Cloudflare Worker vars for production)
- Configured per locale via `data-lang` attribute
- Theme synced with site theme via `postMessage`
- Theme synced with site theme via `postMessage`
- Mapping by pathname → separate threads per EN/UK post

---

## 17. Newsletter Subscription

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
- `POST /api/subscribe` — validate, rate limit (KV: 3 reqs/IP/10min), insert pending, send confirmation via Cloudflare Email Service, Telegram notify
- `GET /api/confirm?token=...` — verify HMAC token, mark confirmed, send welcome via Cloudflare Email Service, Telegram notify
- `GET /api/unsubscribe?token=...` — verify token, mark unsubscribed, Telegram notify

### Token format
`base64url(email + ':' + expiresAt + ':' + hmacSha256(secret, email + ':' + expiresAt))`. 48h expiry for confirm, ~10 years for unsubscribe.

### Email templates
- JSON files in `src/emails/` (e.g. `confirm-en.json`, `welcome-uk.json`)
- Loaded at build time via static imports (Worker runtime has no filesystem)
- Template variables: `{{confirmUrl}}`, `{{unsubscribeUrl}}` replaced at send time
- Each template has `subject`, `html`, `locale`, and `name` fields
- Editable via the admin UI at `/admin/emails` (React island using `@react-email/editor`)

### Cloudflare Email Service setup
1. Enable Cloudflare Email Routing on the sender domain (e.g. `yourdomain.com`)
2. Verify the sender address (`MAIL_FROM`, e.g. `hello@yourdomain.com`)
3. The `send_email` binding in `wrangler.jsonc` provides `env.SEND_EMAIL.send({ from, to, subject, html })`
4. No API key needed — it's a Worker binding, not a third-party service

---

## 18. Image Storage Decision (MVP)

- **MVP:** Images commit to `src/assets/posts/` via Keystatic's GitHub API
- **Why:** zero extra infrastructure, simplest path, works
- **Tradeoff:** repo size grows ~50KB per image
- **Phase 2 migration triggers:** repo > 500MB OR > 300 image-heavy posts OR clone time > 30s
- **Phase 2 options:**
  - Keystatic Cloud Images: $10/mo, drop-in
  - Custom flow: GitHub Action on merge → upload new images to R2 → rewrite markdown references → commit back
  - Cloudinary: free 25GB tier with custom Keystatic upload handler

---

## 19. Telegram Notifications

### Setup
1. Create bot via `@BotFather`, save token
2. Send `/start` to bot, find chat ID at `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Save as Wrangler secrets

### `src/lib/telegram.ts`

```ts
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are optional secrets accessed via
// astro:env/server. notify() no-ops when either is absent.
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from 'astro:env/server';

export async function notify(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML') {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
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

## 20. Analytics

Cloudflare Web Analytics:
- Enable in CF dashboard, get site token
- Deferred beacon script in `BaseHead.astro`
- No cookie banner required
- Provides page views, referrers, browsers, countries, Web Vitals

---

## 21. Theme & Image Handling

### Theme
- DaisyUI `light` and `dark`
- localStorage key `theme`
- Pre-paint inline `<head>` script sets `data-theme` before render
- Toggle in header
- postMessage to Giscus on change

### Images
- Hero images use `<img>` (not `<Image />`) because `imageService: 'passthrough'` + noop service disables Astro's built-in image optimization
- `loading="lazy"` and `decoding="async"` on all images except hero (which is `loading="eager"`)
- Markdoc images use the `image` config in `keystatic.config.ts` and resolve via the `publicPath`
- **Phase 2:** Add Cloudflare Image Resizing or a custom image pipeline for WebP/AVIF optimization. Astro's built-in image service cannot run in Workers (requires `sharp` / native binaries).

---

## 22. Performance Budget

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

## 23. Branch-based Preview Deployments

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

      - name: Build with preview mode (drafts visible)
        env:
          PREVIEW_MODE: 'true'
          PUBLIC_KEYSTATIC_GITHUB_APP_SLUG: ${{ vars.PUBLIC_KEYSTATIC_GITHUB_APP_SLUG }}
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

## 24. Auto-Label PRs Workflow

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

## 25. Production Deploy Workflow

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
- Apply: `pnpm wrangler d1 migrations apply portfolio-blog --remote`

### Post-build script
`scripts/post-build.mjs` runs after `astro build` and Pagefind indexing. It writes a `dist/index.html` that meta-refreshes `/` → `/blog/en/`. This redirect is only relevant during `wrangler dev` (where the Worker handles all requests including the apex). In production, the Worker's route pattern (`yourdomain.com/blog/*`) doesn't match the apex, so this file is never served.

---

## 26. Acceptance Criteria

### A. Internationalization
- [ ] Default `/` redirects to `/en/` (or `/blog/en/` in production)
- [ ] Both `/en/` and `/uk/` render correctly
- [ ] UI strings switch per locale
- [ ] `<html lang>` is `uk-UA` on Ukrainian pages, `en` on English
- [ ] Language switcher routes to the corresponding translation if it exists; falls back to locale home otherwise
- [ ] Hreflang reciprocal across all translated pages, including `x-default`
- [ ] Hreflang only emits for existing translations
- [ ] Validates clean via app.hreflang.org
- [ ] Base path `/blog` applied correctly to all internal links (nav, PostCard, RSS, etc.)

### B. Content & CMS
- [ ] Posts authored via Keystatic at `/keystatic` (local) or `/blog/keystatic` (production)
- [ ] Local mode saves directly to git working tree
- [ ] Production mode creates `post/...` branches and opens PRs automatically
- [ ] Keystatic content components show live previews for YouTube and Callout tags in the editor
- [ ] Image paste/drag-drop works and commits images to `src/assets/posts/`
- [ ] Markdoc custom blocks render: YouTube embed, callouts; code blocks have Shiki highlighting + language badge + copy button
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
- [ ] Confirmation email sent via Cloudflare Email Service (locale-correct template)
- [ ] Confirm token expires in 48h; unsubscribe token ~10 years
- [ ] Confirm flow flips status to `confirmed`, sends welcome, redirects to subscribe page with `?confirmed=1`
- [ ] Unsubscribe returns HTML page (not JSON)
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
- [ ] Lighthouse on production hits Section 22 budget
- [ ] Push to `main` triggers production deploy
- [ ] PR open triggers preview deploy
- [ ] PR close triggers preview cleanup
- [ ] Deploy failures notify Telegram

---

## 27. Implementation Order (6 Milestones)

### Milestone 1: Skeleton + Local Keystatic (1–2 evenings)
- Bootstrap Astro 6, Cloudflare adapter, React, Markdoc, Tailwind 4, DaisyUI (with custom theme definitions)
- `pnpm-workspace.yaml` for build allowlists and patched dependencies
- Keystatic in local mode, two collections (postsEn / postsUk) with compound `fields.slug` and content components
- Markdoc config with YouTube / Callout custom tags (no fence node override)
- Base path dual-mode: `/` in local dev, `/blog` in production
- Middleware for apex `/api/keystatic/*` rewrite
- i18n config (`uk-UA`, EN default, `withBase()` helper)
- Base layout, header, footer, theme toggle, language switcher
- First hello-world post in both languages via Keystatic UI
- Deploy initial version to Cloudflare Workers
- **Exit criteria:** site live at `/blog`, Keystatic admin works locally, can create posts in both languages

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
- PostCard component
- About page (inline content, not Markdoc-driven)
- Subscribe page with form and `?confirmed=1` banner
- Pagination for posts list (pages 2+ at `/[locale]/posts/page/[page]/`)
- **Exit criteria:** all routes from Section 11 render correctly in both locales

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
- Cloudflare Email Service configured (sender domain + `send_email` binding in `wrangler.jsonc`)
- Email templates in `src/emails/` (JSON, per locale)
- Telegram bot + secrets
- `/api/subscribe`, `/api/confirm`, `/api/unsubscribe`
- SubscribeForm component with loading/success/error states
- Rate limiting via KV
- All Telegram notification events wired
- **Exit criteria:** Sections 26.I and 26.J pass

### Polish (parallel)
- Performance tuning to hit budget
- Accessibility audit (axe-core + manual screen reader pass)
- Smoke test on clean mobile + desktop browsers
- Write first real post in both languages

Total estimate: **6–9 focused evenings**.

---

## 28. Phase 2 Roadmap

- **R2 image storage** — migrate from git-committed images per Section 17 triggers
- **Scheduled posts** — Cron Trigger Worker that opens a deploy when `publishedAt` hits
- **OG image generation per post** — `/api/og/[slug].png` using `satori` + `@resvg/resvg-js`
- **Custom comments** — Hono Worker at `api.yourdomain.com` with magic-link auth (Better Auth), D1 storage, Telegram moderation
- **Newsletter campaigns** — Admin endpoint that fetches confirmed subscribers and sends a post via Cloudflare Email Service
- **Series / multi-part posts** — `series` and `seriesOrder` frontmatter
- **Webmentions** — Webmention.io integration
- **Translation diffing** — workflow that warns when an EN post is updated but the UK translation isn't

---

## 29. Open Decisions for the Developer

1. **Domain name and DNS provider** — must be on Cloudflare or transferable
2. **GitHub repo visibility** — public or private (affects Giscus discussions visibility)
3. **Default theme on first visit** — `prefers-color-scheme` (implemented in BaseHead inline script: checks localStorage first, then `prefers-color-scheme`)
4. **Author profile data** — name, bio, avatar, social links
5. **OG image style** — solid color + title text vs photo background (start simple)
6. **Privacy policy page content** — required for EU/UA audience
7. **Keystatic Cloud vs self-hosted GitHub App** — Cloud free tier covers up to 3 users and handles OAuth; self-hosted means setting up the GitHub App yourself. **Recommend Cloud for simplicity.**
8. **Portfolio at domain root** — the blog lives at `/blog`; will `yourdomain.com` serve a separate portfolio/landing page, or redirect to `/blog`?

---

## 30. Things Deliberately NOT in This Plan

- No custom CMS / admin UI beyond Keystatic (note: the email template editor at `/admin/emails` is a convenience, not a full admin UI)
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

## 31. Reference Links

- Astro 6 docs: https://docs.astro.build
- Astro i18n routing: https://docs.astro.build/en/guides/internationalization/
- Astro + Keystatic guide: https://docs.astro.build/en/guides/cms/keystatic/
- Keystatic docs: https://keystatic.com/docs
- Keystatic GitHub mode: https://keystatic.com/docs/github-mode
- Keystatic content components: https://keystatic.com/docs/content-components
- Astro Markdoc: https://docs.astro.build/en/guides/integrations-guide/markdoc/
- Cloudflare Workers framework guides — Astro: https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/
- Cloudflare Email Service: https://developers.cloudflare.com/workers/runtime-apis/send-email/
- DaisyUI 5: https://daisyui.com
- Tailwind 4: https://tailwindcss.com
- Pagefind: https://pagefind.app
- Giscus: https://giscus.app
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Hreflang validator: https://app.hreflang.org
- ISO 639-1 reminder: `uk` is Ukrainian, NEVER `ua`

### Project docs
- `docs/KEYSTATIC.md` — Keystatic setup, local vs GitHub mode, base-path/API-path mismatch solution
- `docs/CONTENT.md` — Content authoring workflow
- `docs/EMAIL.md` — Cloudflare Email Service setup
- `docs/EMAILS.md` — Email template system
- `docs/TELEGRAM.md` — Telegram bot setup

---

End of plan. Ship Milestone 1 this week.
