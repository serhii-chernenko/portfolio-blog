# Keystatic — Dev & Production Setup

Two modes live in this repo:

| Where                                  | Mode    | Auth        | Storage                    |
| -------------------------------------- | ------- | ----------- | -------------------------- |
| `pnpm dev` (Astro dev server, Node.js) | local   | none        | local files                |
| `pnpm wrangler:dev` (Workers preview)  | github  | GitHub OAuth| commits → PRs to this repo |
| Deployed Worker (production)           | github  | GitHub OAuth| commits → PRs to this repo |

`pnpm dev` sets `PUBLIC_KEYSTATIC_MODE=local`. The Astro dev server runs in
real Node.js, so Keystatic's local kind (which needs `fs`) works there and
writes go straight to `src/content/posts/{en,uk}/`.

`pnpm wrangler:dev` and the deployed Worker both run in the Cloudflare
Worker runtime, which is not Node.js — local storage cannot work there.
Both use GitHub OAuth instead, identical flow, different secret sources
(`.dev.vars` locally vs. `wrangler secret put` in prod).

The Admin UI at `/keystatic` is blocked from search engines via `robots.txt`
and is only accessible to GitHub users with write access to the repo.

---

## Production: one-time GitHub App setup

The cleanest path is Keystatic's own onboarding wizard, which creates a
properly-scoped GitHub App for you. You'll do this **once**, after the site
is first deployed and reachable.

### 1. Deploy the app at least once

The wizard needs a live URL. Deploy first (with placeholder Keystatic secrets
if needed — `KEYSTATIC_SECRET=temp` etc. — anything non-empty so the build
doesn't fail), then come back to this step.

### 2. Open the Keystatic onboarding URL

Visit:

```
https://serhiichernenko.com/blog/keystatic/setup
```

Keystatic detects that no GitHub App is connected and walks you through
creating one. Approve the suggested permissions (Contents R/W, Metadata R,
Pull requests R/W on this repo).

When it finishes, GitHub redirects back with **four** values:

- `client_id`
- `client_secret`
- App slug (the part after `/apps/` in the GitHub App URL)
- A redirect URL that Keystatic stored in the App config

### 3. Capture the values

The wizard shows the client ID and secret **only once**. Copy them
immediately into a password manager.

The app slug is visible at any time at
`https://github.com/apps/<slug>` (or under your account's *Developer
settings → GitHub Apps*).

### 4. Generate KEYSTATIC_SECRET

```bash
openssl rand -hex 32
```

Save the output. This is the cookie-signing key for Keystatic's auth session.

### 5. Set the Worker secrets

```bash
pnpm wrangler secret put KEYSTATIC_SECRET
pnpm wrangler secret put KEYSTATIC_GITHUB_CLIENT_ID
pnpm wrangler secret put KEYSTATIC_GITHUB_CLIENT_SECRET
```

Wrangler prompts for each value. After all three are set, also update the
public app slug in `wrangler.jsonc`:

```jsonc
"vars": {
  "PUBLIC_KEYSTATIC_GITHUB_APP_SLUG": "your-actual-slug-here"
}
```

Commit and redeploy.

### 6. Verify

Visit `https://serhiichernenko.com/blog/keystatic`. You should see a "Sign in
with GitHub" button. Sign in; you'll be redirected through the App's OAuth
flow. After approval the Admin UI loads with the same collections you see
locally, except editing now writes to a `post/*` branch and opens a PR.

---

## How the base-path / API-path mismatch is solved

`@keystatic/astro`'s React client has ~20 hardcoded absolute paths to
`/api/keystatic/*`. With Astro `base: '/blog'`, the UI loads at
`/blog/keystatic` but its fetches hit `/api/keystatic/*` (apex), which the
blog Worker route (`serhiichernenko.com/blog/*`) does **not** serve.

This repo solves that with two pieces, no Keystatic patching required:

1. **Apex Worker route binding.** `wrangler.jsonc` binds the same Worker to
   `serhiichernenko.com/api/keystatic` and `serhiichernenko.com/api/keystatic/*`
   in addition to `/blog/*`. So the UI's apex API fetches actually reach the
   Worker.

2. **Astro middleware rewrite.** `src/middleware.ts` intercepts incoming apex
   `/api/keystatic/*` requests and rewrites them to `/blog/api/keystatic/*`
   before Astro routes them. Astro's router then matches the
   `base`-prefixed Keystatic API routes normally and responds.

Net effect: the browser sees a normal `200` from `/api/keystatic/...`, the
Keystatic UI is unaware that anything special is happening, and you don't
maintain a fork.

---

## Local development with `pnpm dev`

`pnpm dev` is the fast iteration loop for content. It uses Keystatic's local
kind — saves write straight to `src/content/posts/{en,uk}/` on disk. No
secrets, no GitHub round-trip. The Admin UI lives at
`http://127.0.0.1:4321/keystatic`.

## Local Worker preview with `pnpm wrangler:dev`

`pnpm wrangler:dev` mirrors production: Keystatic runs in GitHub mode and
needs the same three secrets. Put them in `.dev.vars` (gitignored — copy
from `.dev.vars.example`):

```
KEYSTATIC_SECRET=<32-byte random>
KEYSTATIC_GITHUB_CLIENT_ID=<from your GitHub App>
KEYSTATIC_GITHUB_CLIENT_SECRET=<from your GitHub App>
```

Then the Admin UI at `http://127.0.0.1:8787/blog/keystatic` will use the
real GitHub OAuth flow exactly like production.

---

## Required secrets — one-shot setup

Copy-paste once you have the values from the wizard:

```bash
# Generate cookie-signing key
KEYSTATIC_SECRET=$(openssl rand -hex 32)

pnpm wrangler secret put KEYSTATIC_SECRET <<<"$KEYSTATIC_SECRET"
pnpm wrangler secret put KEYSTATIC_GITHUB_CLIENT_ID
pnpm wrangler secret put KEYSTATIC_GITHUB_CLIENT_SECRET

# Other prod secrets unrelated to Keystatic but listed here for convenience:
pnpm wrangler secret put SUBSCRIBE_RATE_LIMIT_SECRET <<<"$(openssl rand -hex 32)"
pnpm wrangler secret put TELEGRAM_BOT_TOKEN
pnpm wrangler secret put TELEGRAM_CHAT_ID
```

Then list to confirm:

```bash
pnpm wrangler secret list
```

You should see all six names without their values.
