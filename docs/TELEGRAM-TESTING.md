# Telegram integration — purpose & verification

A focused companion to `docs/TELEGRAM.md` (which covers bot creation and secret
setup). This doc answers two questions: **why is Telegram wired in at all**, and
**how do you prove each notification actually fires?**

---

## What it's for

This is a **private, one-bot-one-owner** notification channel. There is no public
bot and visitors never interact with it. Its only job is to ping _you_ the moment
something noteworthy happens, so you don't have to watch dashboards or inboxes.

It is deliberately **best-effort**: `notify()` in `src/lib/telegram.ts` no-ops when
the token/chat-id are unset and swallows API errors (logs `console.warn`, never
throws). A Telegram outage can never turn a subscribe request into a 500 or fail a
deploy. That's by design — notifications are a convenience, not a dependency.

---

## The seven events

Two sources fire notifications: the **Worker** (runtime API routes) and **GitHub
Actions** (CI). They read from _separate_ credential stores (Worker secrets vs.
repo Actions secrets) — both must be configured.

| #   | Message (prefix)                      | When                                                 | Fired by       | Source                             |
| --- | ------------------------------------- | ---------------------------------------------------- | -------------- | ---------------------------------- |
| 1   | `📬 New pending subscriber`           | Pending row is stored and confirmation email is sent | Worker         | `src/pages/api/subscribe.ts`       |
| 2   | `✅ Subscriber confirmed`             | Confirmation enables both content languages          | Worker         | `src/pages/api/confirm.ts`         |
| 3   | `🔔 Subscription preferences changed` | A signed POST makes a real preference change         | Worker         | `src/pages/api/unsubscribe.ts`     |
| 4   | `📝 Preview deployed for PR #<n>`     | PR opened/synchronized, preview Worker deployed      | GitHub Actions | `.github/workflows/preview.yml`    |
| 5   | `📝 New article PR opened`            | PR gets the `new article` label                      | GitHub Actions | `.github/workflows/auto-label.yml` |
| 6   | `✅ Production deployed`              | Push to `main` deploy succeeds                       | GitHub Actions | `.github/workflows/deploy.yml`     |
| 7   | `❌ Production deploy failed`         | Push to `main` deploy fails                          | GitHub Actions | `.github/workflows/deploy.yml`     |

Events 1–3 deliberately omit the subscriber address. They carry only event type, locale, and for a
preference change the allowlisted action.

---

## Layer 0 — prove the bot works at all (30 seconds)

Before testing the app, confirm the token + chat ID are valid. This isolates
"Telegram is misconfigured" from "the app didn't call Telegram".

```bash
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
  -d "chat_id=<CHAT_ID>" \
  -d "text=layer-0 sanity check"
```

A message appears in your chat instantly → the credentials are good. If not, fix
that first (see Troubleshooting in `docs/TELEGRAM.md` — usually a wrong chat ID,
or you never messaged the bot first).

---

## Layer 1 — Worker events (1, 2, 3)

These only fire in a **Cloudflare runtime** (workerd), never under plain `pnpm dev`.

`pnpm dev` runs on the Node adapter with no CF bindings. More precisely: the
subscribe/confirm/unsubscribe routes need the D1 DB binding (from
`cloudflare:workers`) to proceed past validation, so `notify()` is never reached
there. This is expected behaviour — use `wrangler:dev` for Worker event testing.

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are optional secrets accessed via
`astro:env/server`. When unset (or empty), `notify()` in `src/lib/telegram.ts`
no-ops silently — no error, no notification.

### Local (`wrangler:dev`)

1. Populate `.dev.vars` with real `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
   (and `SUBSCRIBE_RATE_LIMIT_SECRET`, a local D1, etc. — see `GO-LIVE.md`).
2. Apply the schema locally: `pnpm d1:apply:local`.
3. `pnpm wrangler:dev` (builds then serves at `http://127.0.0.1:4321`).

**Event 1 — new subscriber:**

```bash
curl -i -X POST http://127.0.0.1:4321/blog/api/subscribe \
  -H 'content-type: application/json' \
  -d '{"email":"you+test@example.com","locale":"en"}'
```

Expect HTTP 200 **and** a `📬 New pending subscription (en)`
message. The notification fires only after the confirmation email is accepted for
sending; an email failure returns an error and does not report subscribe success.

**Event 2 — confirmed:** grab the confirm token. Easiest is the confirmation
email; or mint one in a `wrangler:dev` session. Then:

```bash
curl -i "http://127.0.0.1:4321/blog/api/confirm?token=<TOKEN>"
```

Expect a 303 redirect to `…/subscribe?confirmed=1` **and** `✅ Subscription
confirmed (en)` (or `uk`).

**Event 3 — change preferences:**

```bash
curl -i -X POST \
  "http://127.0.0.1:4321/blog/api/unsubscribe?token=<UNSUB_TOKEN>&action=all&oneclick=1" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data 'List-Unsubscribe=One-Click'
```

Expect HTTP 200 with an empty body **and** `🔔 Subscription preferences changed (en, all)`.
Repeating the same POST remains successful but sends no duplicate notification.
A GET to the same endpoint only redirects to the preference center and never
changes state or sends a notification.

### If a Worker event doesn't arrive

```bash
wrangler tail            # live-stream Worker logs
```

A failed call emits a structured warning with no notification text or PII. No log line at all means
the code path wasn't reached (check the HTTP status — e.g. a 429 rate-limit or
400 validation error short-circuits before the notify call).

---

## Layer 2 — GitHub Actions events (4, 5, 6, 7)

These need the repo Actions secrets set (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
plus the Cloudflare/`CF_*` secrets the deploy steps use). See `GO-LIVE.md` step 8.

| Event                | How to trigger                                                                              | Expected                                                              |
| -------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 4 — Preview deployed | Open a PR (or push a commit to an open PR)                                                  | `📝 Preview deployed for PR #<n>` + a PR comment with the preview URL |
| 5 — New article PR   | Open a PR that **adds** a file under `src/content/posts/`                                   | PR gets `new article` label → `📝 New article PR opened`              |
| 6 — Prod deploy OK   | Merge to `main` (or run the deploy workflow manually)                                       | `✅ Production deployed: <commit msg>`                                |
| 7 — Prod deploy fail | Hard to force safely; temporarily break the build on a throwaway branch→main in a test repo | `❌ Production deploy failed on commit <sha>`                         |

Debug a CI notification in the Actions run log — the `curl` step prints its own
output, and Telegram's API returns a JSON body describing any rejection.

---

## Common gotchas

- **Works in CI but not the Worker (or vice-versa).** Different secret stores.
  Set both: `wrangler secret put …` _and_ repo Actions secrets.
- **Nothing arrives, no error.** `notify()` is silent on success-with-no-delivery
  only if creds are empty (it early-returns). Confirm `wrangler secret list`
  shows both names and they're non-empty.
- **`pnpm dev` never notifies.** Expected — the Node adapter has no CF bindings,
  so the subscribe routes fail before `notify()` is ever reached. Use
  `wrangler:dev` for end-to-end testing.
- **"chat not found" / "bot was blocked".** Chat ID wrong, or you blocked your
  own bot. See `docs/TELEGRAM.md` troubleshooting.

---

## How to know it's "actually working"

You're done when, in one pass, you've personally seen all seven message types
land in your chat: the three newsletter events from a real subscribe→confirm→
unsubscribe cycle against the deployed Worker, and the four CI events from one
real article PR that you open, get previewed, label, and merge. Until you've seen
a given message at least once end-to-end, treat that event as unverified.
