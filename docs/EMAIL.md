# Email delivery

Provider guidance last reviewed: 2026-07-15.

The blog uses Cloudflare Email Service's `send_email` Worker binding for two transactional
messages:

- a confirmation email after `POST /api/subscribe`;
- a welcome email after the confirmation link successfully enables the subscription.

There is **no article campaign sender**. Publishing a post does not send email. Cloudflare states
that Email Service is currently intended only for transactional email, with marketing/bulk tooling
planned for the future
([Cloudflare Email Service FAQ](https://developers.cloudflare.com/email-service/reference/faq/)).
Use a dedicated newsletter/marketing provider for article campaigns unless that policy has changed
when campaign delivery is implemented.

The multilingual product, consent, preference, migration, suppression, audience-query, and future
campaign contracts are in [Multilingual subscriptions](./SUBSCRIPTIONS.md).

## Implemented lifecycle

### Confirmation

`POST /api/subscribe` validates the address, rate-limits the request, stages the latest request,
and sends a localized confirmation message. The requested site locale is stored as
`pending_communication_locale` and localizes that message; it does not limit article languages or
overwrite an existing subscriber's authoritative `communication_locale`. Both EN and UK
confirmation templates explicitly say that confirming subscribes the reader to independently
authored English and Ukrainian posts.

The authenticated, encrypted confirmation link expires after 48 hours. `GET /api/confirm` is the deliberate
double-opt-in action: it validates the token and atomically sets the subscriber to `confirmed`,
enables both current content preferences, and records the current consent version. It redirects to
the localized success page with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and
`X-Robots-Tag: noindex, nofollow, noarchive`.

Each signup stores a domain-separated HMAC fingerprint, its expiry, and the requested communication
locale; the raw bearer, IP, User-Agent, and source are not retained in the subscriber row. Atomic
D1 counters keyed by short-lived IP/address HMACs limit abuse and expire after ten minutes. Only
the newest fingerprint can confirm, and the same D1 batch consumes it, promotes the staged locale,
records consent version `2`, and enables English and Ukrainian. A stale, superseded, expired,
consumed, replayed, or pre-v2 link without stored intent is rejected and cannot mutate state. The
reader must submit the current form again to create a fresh explicit intent.

The database locale is authoritative after token verification. A query-string locale is not
trusted to choose subscriber state or outbound copy.

This release preserves exact legacy email spelling for D1 uniqueness, lookup, and tokens; it does
not trim or lower-case submitted addresses. Canonicalization requires a separate collision audit,
deduplication migration, and coordinated lookup/token change.

### Welcome and preferences

The first successful confirmation sends one localized welcome email. It contains:

- equivalent HTML and plain-text bodies;
- an explicit reminder that EN and UK may contain different posts;
- a localized **Manage language preferences or unsubscribe** body link;
- a privacy-policy link;
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers for a global one-click opt-out.

The body link opens `/{locale}/unsubscribe?token=...`. Its GET renders current preferences and does
not mutate D1. Native POST actions let the reader stop English (`en`), stop Ukrainian (`uk`), stop
all (`all`), or enable both again (`subscribe_all`). If the final enabled language is stopped, the
global lifecycle becomes `unsubscribed`; a partial subscriber remains `confirmed` for the other
language. Preference changes send no follow-up email.

`GET /api/unsubscribe` is a read-only compatibility entry point for older links and redirects to
the localized page. The welcome header targets
`POST /api/unsubscribe?token=...&action=all&oneclick=1`; it returns an empty `200` response without
a redirect, as required for the machine-to-machine one-click path.

Astro's default origin check is reproduced in `src/middleware.ts` so normal unsafe form requests
keep the same-origin requirement while an RFC 8058 provider can make this one originless POST. The
exception is limited to the base-aware unsubscribe path, form URL encoding, and the exact
`token` + `action=en|uk|all` + `oneclick=1` query shape. The route separately requires the exact
`List-Unsubscribe=One-Click` body and verifies the token; do not disable CSRF checks without those
equivalent controls. Its encrypted token is cryptographically scoped to that exact disable action;
it cannot open the preference UI or authorize `subscribe_all`.

The welcome message is about the newly confirmed relationship, so its inbox-level RFC 8058 action
is global. Future article messages must instead use edition-specific one-click tokens and stable
per-language `List-ID` values; see [the list-identity contract](./SUBSCRIPTIONS.md#one-click-unsubscribe-and-list-identity).

## Code and templates

`src/lib/email.ts` exports:

```ts
sendConfirmation({ to, locale, confirmUrl, privacyUrl });
sendWelcome({
	to,
	locale,
	manageUrl,
	globalOneClickUrl,
	privacyUrl,
});
```

Both call `env.SEND_EMAIL.send(...)`. The implementation always supplies `html` and `text`.
Welcome additionally supplies the two RFC 8058 headers. Cloudflare allowlists these custom headers
and applies the DKIM signature
([Cloudflare Email headers](https://developers.cloudflare.com/email-service/reference/headers/)).

Localized source templates are:

```text
src/emails/confirm-en.json
src/emails/confirm-uk.json
src/emails/welcome-en.json
src/emails/welcome-uk.json
```

Each file contains `subject`, `html`, and `text` plus the editor's structured JSON. Keep HTML and
plain text semantically equivalent and preserve all required variables:

| Template     | Variables                          |
| ------------ | ---------------------------------- |
| Confirmation | `{{confirmUrl}}`, `{{privacyUrl}}` |
| Welcome      | `{{manageUrl}}`, `{{privacyUrl}}`  |

The local admin at `/admin/emails` can edit both body formats. A missing variable remains visibly
unexpanded, so preview and exercise every link before deploy. Adding a communication locale
requires a complete set of templates and TypeScript mappings; adding a content edition also
requires the consent and audience work in `SUBSCRIPTIONS.md`.

## Binding and sender setup

Wrangler declares the binding:

```jsonc
"send_email": [
  {
    "name": "SEND_EMAIL",
  },
]
```

The sender defaults to `hello@serhiichernenko.com` and can be changed with the public `MAIL_FROM`
variable. The configured domain must be onboarded for Cloudflare Email Sending before production
send. Current setup commands are:

```bash
pnpm exec wrangler email sending list
pnpm exec wrangler email sending enable serhiichernenko.com
pnpm exec wrangler types
```

Verify the current commands against
[Cloudflare Email Service setup](https://developers.cloudflare.com/email-service/) because the
service is evolving. Onboarding establishes the sending-domain authentication Cloudflare needs;
also publish and monitor DMARC. Use a recognizable From name and an address that can receive
replies or configure an explicit Reply-To.

## Local and production verification

`pnpm dev` uses the Node adapter and has no Cloudflare bindings, so real email sending is
unavailable. `pnpm wrangler:dev` runs the Worker-compatible build with the configured local
bindings, but the current binding is not configured with `remote: true`; do not assume a console
success means an internet message was delivered. Use controlled addresses on a preview Worker or
production for an end-to-end send.

For each communication locale:

1. Submit a controlled address from the localized subscribe form.
2. Confirm that the confirmation subject, HTML, text alternative, both-language promise, privacy
   link, and 48-hour confirmation URL are correct.
3. For an existing confirmed or partial subscriber, request confirmation twice from different site
   locales. Before confirmation, verify that only pending fields changed. Verify the older link
   returns the localized invalid result, then follow the newest link and verify its
   locale/attribution was promoted, both D1 preferences are enabled, and exactly one welcome
   arrives.
4. Inspect the raw welcome source for SPF/DKIM/DMARC results and both list-unsubscribe headers.
5. Open the visible preference link and prove GET does not change D1.
6. Exercise `en`, `uk`, `all`, and `subscribe_all`; verify localized outcome copy and D1 state.
7. Replay the consumed confirmation and preference requests; confirm no state regression, welcome,
   or duplicate conversion. Also request a fresh link, apply a preference action, and prove that
   the now-invalidated confirmation link cannot re-enable either language or promote staged data.

Never test with invented recipient domains. Hard bounces damage sender reputation and may add the
address to the provider suppression list.

## Troubleshooting

**`SEND_EMAIL` is unavailable**

The request is running without the Cloudflare Worker binding, normally under `pnpm dev`, or the
binding name does not match `SEND_EMAIL` in `wrangler.jsonc`. Run `pnpm exec wrangler types` after
binding changes.

**Sender/domain authorization error**

Confirm the domain appears in `wrangler email sending list`, that `MAIL_FROM` uses it, and that DNS
authentication is healthy. Do not retry a permanent configuration error.

**Confirmation never arrives**

Check Worker logs for the structured send failure, inspect spam, verify sender authentication, and
try one real address you control. The API stores pending state before sending; a send failure is
reported to the caller and a later signup can request a fresh link.

**Confirmation succeeds but welcome does not arrive**

Confirmation state is committed before welcome sending. A welcome-provider failure is logged and
does not roll back consent. Do not repeatedly click the link expecting another welcome: the
single-use confirmation intent has already been consumed. Diagnose the original send error.

**A recently requested confirmation link is reported as invalid**

Only the latest requested confirmation link is active. Use the newest message; requesting another
one supersedes earlier links. A link is also invalid after it is consumed or after any preference
action, which prevents an old confirmation from undoing a later opt-out. Do not manually restore
the intent or bypass double opt-in.

**Preference link changes state on GET**

This is a regression. The localized page and any manual GET of the API must be read-only; only a
validated POST may mutate preferences. Stop email sends until fixed because scanners can fetch
links automatically.

**Recipient is suppressed**

Do not bypass a complaint or hard-bounce suppression. Inspect and remediate it through the sending
provider. D1 re-subscription is not permission to clear a provider suppression automatically.

## Requirements before article campaigns

Article campaigns are a separate system, not an extension that should simply loop over
`subscribers`. Before implementing them:

- choose a provider whose terms explicitly permit subscribed/marketing bulk mail;
- use the exact D1 audience query and no-stale-export rule in `SUBSCRIPTIONS.md`;
- separate transactional and campaign mail by sending subdomain/stream where the provider supports
  it;
- configure SPF, DKIM, DMARC alignment, TLS, forward/reverse DNS where applicable, and reputation
  monitoring;
- include accurate sender/subject information and any physical-address or message-identification
  disclosures required for the message and recipient jurisdictions;
- add one stable `List-ID` and one-click scope per content edition, plus a visible body preference
  link;
- honor D1 preferences, global opt-outs, complaints, and hard-bounce suppressions before each
  enqueue/send;
- implement idempotent campaign/recipient delivery and bounce/complaint ingestion;
- keep recipient identifiers out of product analytics and never put multiple subscribers in a
  visible recipient header.

Google requires authentication for all senders and adds DMARC, alignment, and RFC 8058 one-click
requirements for high-volume subscribed/marketing mail
([Google sender guidelines](https://support.google.com/mail/answer/81126?hl=en)). Yahoo publishes
similar bulk-sender requirements, requires a visible unsubscribe link, and says opt-outs must be
honored within two days
([Yahoo sender best practices](https://senders.yahooinc.com/best-practices/)). Re-check both at
launch because provider requirements change.

Cloudflare's own deliverability documentation covers authentication, suppressions, and reputation
for the transactional messages that remain on Email Service
([Cloudflare deliverability guidance](https://developers.cloudflare.com/email-service/concepts/deliverability/)).
Do not send article campaigns through the current binding until Cloudflare explicitly permits that
traffic and provides the required bulk controls.
