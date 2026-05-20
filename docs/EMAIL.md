# Email — Cloudflare Email Service

The blog sends transactional email (subscription confirmation, welcome) using **Cloudflare's native `send_email` Worker binding** — no third-party API key, no SMTP server, no MailChannels.

There is no marketing-style bulk newsletter sending in MVP — only:
- **Confirmation email** when someone subscribes (`/api/subscribe` flow).
- **Welcome email** when they click the confirmation link (`/api/confirm` flow).
- **No unsubscribe email** (the unsubscribe action just flips a D1 row).

Phase 2 will add newsletter campaign sending — same binding, fan-out over the `subscribers` D1 table.

---

## How it works

`src/lib/email.ts` exposes two functions:

```ts
sendConfirmation({ env, to, locale, confirmUrl })
sendWelcome({ env, to, locale })
```

Both call `env.SEND_EMAIL.send({ from, to, subject, html })`. The `SEND_EMAIL` binding is a Cloudflare `SendEmail` binding declared in `wrangler.jsonc`:

```jsonc
"send_email": [
  {
    "name": "SEND_EMAIL"
  }
]
```

The plain-object overload of `.send()` targets the newer Cloudflare Email Service API and **does not** require recipients to be pre-verified in Email Routing. That's what makes the newsletter use case viable. The raw-MIME overload (`new EmailMessage(from, to, raw)`) is the older one that restricts recipients to verified destinations — we don't use it.

---

## Setup (one-time, on Cloudflare dashboard)

### 1. Enable Email Routing on the domain

Cloudflare dashboard → your domain (`chernenko.digital`) → **Email** → **Email Routing**. Click **Enable Email Routing**.

CF adds the required MX, SPF, and DKIM records to the zone automatically.

If your domain already has MX records (you receive email at `you@chernenko.digital`), Email Routing will warn — you can either:
- Replace them with CF's (incoming mail then routes through CF), or
- Skip — you can still **send** via the binding even if incoming mail goes elsewhere. Sending only needs SPF and DKIM, not MX.

### 2. Verify the sender address

In the CF dashboard → **Email** → **Email Routing** → **Routes** (or **Destinations** depending on UI version):

Add the sender address you want to send **from**. Example: `hello@serhiichernenko.com`.

CF emails a verification link to that address. Click it. Now the address can be used as the `from` field.

> **Note:** If you don't actually have an inbox at `hello@serhiichernenko.com`, set up an Email Routing forwarding rule first: `hello@serhiichernenko.com → your-personal@gmail.com`. Then verify against your personal inbox.

### 3. Set `MAIL_FROM`

`wrangler.jsonc` already has a default:

```jsonc
"vars": {
  "MAIL_FROM": "hello@serhiichernenko.com"
}
```

Change it to whatever sender address you verified in step 2. Re-deploy.

### 4. Verify in production

Deploy, then run through the subscribe flow on the live site (`https://chernenko.digital/blog/en/subscribe`):

1. Submit your email — you should get a confirmation email within seconds.
2. Click the link — you should get a welcome email.

If you don't receive either: check `pnpm wrangler tail` for errors. Common ones below.

---

## Local development

`pnpm dev` (plain Astro): the runtime has no CF bindings, so `env.SEND_EMAIL` is undefined and the API routes throw before reaching the email module. That's fine — you don't want to send real emails from dev.

`pnpm wrangler:dev`: the `send_email` binding is simulated locally. **It does not actually send email** — the request is logged to the console only. To test real send, you have to deploy to a preview Worker or production.

If you want real email send in local dev: the simplest path is to add a `.dev.vars` flag like `EMAIL_PROVIDER=stub` and write a stub implementation in `src/lib/email.ts` that just logs to console when the flag is set. But honestly, just deploy a preview Worker and test there — it's faster.

---

## Per-locale templates

EN and UK templates live in `src/lib/email.ts`. The structure is:

```ts
const CONFIRM_TEMPLATES: Record<Locale, { subject, intro, cta, outro }>;
const WELCOME_TEMPLATES: Record<Locale, { subject, body }>;
```

To edit the copy, change those objects. The HTML wrapper (typography, container width) is in `emailLayout()`.

To add a third locale: extend both template objects and update `src/i18n/config.ts`.

---

## Troubleshooting

**"You can only send messages from verified addresses" (or similar 403)**
The `MAIL_FROM` address isn't verified in Email Routing on the sending zone. Go through Setup step 2.

**"Email Routing is not enabled on this zone"**
You skipped Setup step 1. Enable Email Routing on the domain referenced by the `from` address.

**Confirmation email never arrives**
1. Check `pnpm wrangler tail` for errors during the subscribe POST.
2. Check the recipient's spam folder.
3. Verify the `MAIL_FROM` domain has DKIM and SPF set correctly (CF auto-sets these when you enable Email Routing — they should be green in the dashboard).
4. If the recipient is on Gmail and `MAIL_FROM` is a brand-new domain, expect deliverability issues for the first few sends. Send a few test emails, mark them "not spam" in Gmail, and rapport improves.

**Sending is fine but newsletter campaigns hit rate limits**
The CF Email Service is in beta. Limits aren't published; you may hit them at scale. For a personal blog at single-digit-thousand subscribers this is unlikely to matter. If you grow past that, swap `src/lib/email.ts` for Resend/Postmark — the function signatures stay the same, only the implementation changes.

**"The address X is not authorised to send mail on behalf of Y"**
The `from` address you passed to `.send()` doesn't match what you verified. Make sure `MAIL_FROM` (and the `FROM_NAME <addr>` formatted string built in `email.ts`) uses the verified address.

---

## Migrating away from CF Email later

If CF Email Service deliverability bites you and you need to switch providers (Resend, Postmark, SES, etc.), here's the minimal-change path:

1. Add the provider SDK / fetch call in `src/lib/email.ts`. Replace the `env.SEND_EMAIL.send(...)` lines with the provider's API.
2. Add the provider's API key as a wrangler secret. Add it to `Env` in `src/env.d.ts`.
3. Remove the `send_email` binding from `wrangler.jsonc` (or leave it — it's free to have unused bindings).
4. Done. No callers change because `sendConfirmation()` and `sendWelcome()` keep their signatures.
