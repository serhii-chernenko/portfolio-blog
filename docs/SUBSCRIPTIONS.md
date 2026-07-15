# Multilingual subscriptions

Research and provider guidance last reviewed: 2026-07-15.

This document is the product and engineering contract for blog subscriptions. It covers the
English (`en`) and Ukrainian (`uk`) editions, which may publish completely different articles.
It also records the boundaries for a future article-campaign sender.

> This is a conservative product and engineering interpretation of email and privacy rules, not
> legal advice. Which rules apply depends on the sender, recipient, message purpose, and
> jurisdiction. Obtain legal advice before treating this document as a compliance assessment.

## Decision

There is one simple signup and two independently controllable content editions.

- A signup on either site language explicitly offers **all new English and Ukrainian posts**.
  The form has no language checkboxes.
- The copy says that the editions contain different articles, not merely translations. A user on
  the English site must not be surprised by a Ukrainian article, and vice versa.
- The site language at signup chooses the language of service messages and preference UI. It does
  not restrict the content subscription.
- After double opt-in, both `en` and `uk` preferences are enabled.
- The email preference center lets a confirmed subscriber stop English, stop Ukrainian, or stop
  everything. Re-subscribing enables both current editions again, as the signup promised.
- A future article campaign's RFC 8058 one-click action stops the edition represented by that
  message. It does not open a menu and does not silently stop the other edition. The transactional
  welcome message is the documented global-scope exception.

This is the best balance between a low-friction signup and respectful control. Checkboxes on the
initial form add a decision before the reader understands the two editions; hiding the scope in
fine print creates surprise and complaints. A clear two-sentence promise at signup, followed by
granular controls when they are useful, keeps the initial task easy without weakening consent.

## Editions are not translations

`en` and `uk` identify **content audiences**, not translation variants. A post belongs to exactly
one edition for campaign purposes. Its tags, slug, or `translationKey` do not change that.

- Publishing an English post targets the enabled English preference.
- Publishing a Ukrainian post targets the enabled Ukrainian preference.
- If related English and Ukrainian posts are both published, they are separate campaign events.
  A subscriber who has both preferences enabled may receive both.
- Never fall back from one edition to the other, copy an audience because tags look similar, or
  deduplicate two posts merely because they share a translation key.

That model matches the actual editorial plan: one edition can have twenty posts for a topic that
never appears in the other.

## Language model

Two language concepts must remain separate:

| Concept              | Stored as                                                            | Meaning                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Communication locale | `subscribers.communication_locale`                                   | Authoritative language for welcome, preference-center, validation, and other service copy. Seeded for a new row; changed for an existing row only by confirmed signup. |
| Content preferences  | Rows in `subscriber_language_preferences`, keyed by `content_locale` | Independent permission to send an article campaign for an edition. The supported values today are `en` and `uk`.                                                       |

Migration `0002` temporarily retains the legacy `subscribers.locale` as a compatibility mirror.
New code dual-writes it and `communication_locale`; database triggers synchronize changes from the
previous Worker during rollout/rollback. New features must read `communication_locale` (falling
back to legacy `locale` only during this compatibility release). The mirror is not a third language
concept or an audience field.

Use valid, normalized BCP 47 language tags, lower-cased for these language-only identifiers. W3C
recommends BCP 47 for language identification and distinguishes a language tag from a locale or
country code ([W3C language-tag guidance](https://www.w3.org/International/articles/language-tags/)).
Do not store `ua`: the language tag for Ukrainian is `uk`. Use region-qualified tags such as
`en-US` or `uk-UA` only where the distinction is genuinely meaningful; the editorial editions
currently need only `en` and `uk`.

The communication locale is not a campaign-audience condition. Conversely, an enabled content
preference does not decide the language of account/service messages. Article campaigns use the
article's `content_locale` for the subject, body, `Content-Language`, list identity, and edition
audience.

Switching the preference center between English and Ukrainian changes only that page's display
language; it does not silently rewrite the stored communication locale. A later explicit signup
stages that site locale for its confirmation message. Only successful mailbox confirmation
promotes it to the authoritative communication locale for subsequent service messages.

## Signup and consent

The visible promise must be adjacent to the email field and submit button. It must not rely only
on the privacy policy or confirmation email. The implemented scope copy is:

**English**

> One subscription includes every independently authored English and Ukrainian post — not just
> translations. Change either language anytime.

The button says **Subscribe to all posts**.

**Ukrainian**

> Одна підписка охоплює всі незалежно створені англомовні й україномовні дописи, а не лише
> переклади. Налаштування мов можна змінити будь-коли.

The button says **Підписатися на всі дописи**.

If the UI is revised, it must preserve the three scope facts: both languages, independent content,
and later language control. The post-submit result and confirmation message must make double
opt-in the obvious next step. Do not use a pre-checked language choice or imply that the current
site language limits delivery.

Every form submission sends a confirmation email and remains non-enumerating: the public response
is the same whether the address is new, pending, confirmed, partially subscribed, or globally
unsubscribed. A campaign must never target `pending`. Confirmation proves control of the mailbox
and creates the active content preferences. Double opt-in is a product safeguard rather than a
universal legal requirement, but Google recommends confirming each address and Yahoo explicitly
recommends confirmation to prevent accidental or malicious signups
([Google sender guidelines](https://support.google.com/mail/answer/81126?hl=en),
[Yahoo sender best practices](https://senders.yahooinc.com/best-practices/)).

Each accepted form submission creates one latest active confirmation intent. D1 stores only its
domain-separated HMAC fingerprint, 48-hour expiry, and requested communication locale—never the
raw bearer, source, User-Agent, or IP in the subscriber row. Atomic fixed-window D1 counters use
separate HMAC keys for IP and case-folded address, allow three attempts per ten minutes, and are
cleaned in bounded batches. A later request supersedes the fingerprint. Confirmation matches an
unexpired fingerprint and consumes it in the same atomic batch that enables both editions and
promotes the locale. Preference actions also clear outstanding intent. A stale, superseded,
expired, consumed, replayed, or pre-v2 link without a stored version-2 intent is rejected. The
reader must submit the current form again; there is no fallback that silently promotes a legacy
pending row to both editions.

Store enough evidence to explain what was agreed:

- validated email address, preserving the legacy stored spelling, and subscriber creation time;
- communication locale;
- integer `consent_version`: migration value `1` records the legacy single-language scope, while
  current value `2` records the explicit English-and-Ukrainian promise;
- confirmation time and the content preferences enabled by that confirmation;
- the non-reversible fingerprint and expiry of only the latest unconsumed confirmation intent;
- preference-change and global-unsubscribe timestamps;
- short-lived, non-reversible abuse counters, which are not subscriber attribution.

Do not treat the HMAC IP value as anonymous analytics. It remains subscriber metadata and must
never be copied to analytics or logs. A future schema change that alters the promise must use a new
consent version rather than overwriting what an existing timestamp meant.

Email identity remains exact and case-sensitive at the D1 uniqueness/lookup boundary in this
release. Do not introduce trimming or lower-casing only in the new Worker: legacy rows and tokens
use their original spelling, and silent canonicalization can miss an existing row or collide two
rows. If canonical email identity is later desired, add a separate canonical column, audit and
resolve collisions, migrate token/lookups deliberately, and only then enforce the new uniqueness
rule.

## State model

`status` represents the subscriber lifecycle; enabled preference rows represent the editions.
"Partial" is a derived product state, not a fourth database status.

| Product state             | `subscribers.status` | Enabled content preferences | Eligible for campaigns |
| ------------------------- | -------------------- | --------------------------- | ---------------------- |
| Pending                   | `pending`            | none                        | No                     |
| Confirmed, all            | `confirmed`          | `en`, `uk`                  | Both editions          |
| Confirmed, English only   | `confirmed`          | `en`                        | English only           |
| Confirmed, Ukrainian only | `confirmed`          | `uk`                        | Ukrainian only         |
| Globally unsubscribed     | `unsubscribed`       | none                        | No                     |

The valid transitions are:

| From                                       | Event                                    | To                             | Required effect                                                                                                          |
| ------------------------------------------ | ---------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| No row / any state                         | Signup form accepted                     | Pending or existing safe state | Store a fresh latest intent and send its confirmation; supersede older links; do not newly enable an audience.           |
| Pending / existing safe state              | Latest confirmation succeeds             | Confirmed, all                 | Atomically consume the intent, promote staged locale/metadata, enable `en` + `uk`, record consent, and send one welcome. |
| Confirmed, all                             | POST action `en`                         | Confirmed, Ukrainian only      | Disable `en`; retain `uk`.                                                                                               |
| Confirmed, all                             | POST action `uk`                         | Confirmed, English only        | Disable `uk`; retain `en`.                                                                                               |
| Confirmed, any                             | POST action `all`                        | Globally unsubscribed          | Disable every current preference and record global unsubscribe.                                                          |
| Confirmed, one edition                     | POST action for the last enabled edition | Globally unsubscribed          | Disable it and set the global status; an empty confirmed state is invalid.                                               |
| Confirmed, partial / globally unsubscribed | POST action `subscribe_all`              | Confirmed, all                 | Explicitly enable `en` and `uk` and record renewed consent.                                                              |
| Globally unsubscribed / partial            | New signup and confirmation              | Confirmed, all                 | Re-enable both current editions; a signup always means the full promise.                                                 |

Transitions must be atomic and idempotent. Replaying an action produces the same state, never
duplicates a preference, and does not emit a second welcome email or a second analytics conversion.
An already applied preference POST may return the same useful result. Confirmation is single-use:
its replay is rejected as invalid even though the desired state may already exist. Invalid,
expired, stale, superseded, or consumed tokens, unknown actions, and storage errors must leave the
state unchanged.
`subscribe_all` may apply immediately because it is an explicit action reached through a signed
link previously delivered to that mailbox. A public signup form has no such proof and therefore
must complete double opt-in before it enables any disabled edition.

## Preference-center HTTP contract

The body link is **Manage language preferences or unsubscribe / Керувати мовними налаштуваннями
або відписатися**. It opens the localized preference center, which shows the current state and
explicit actions for:

- English posts / Дописи англійською;
- Ukrainian posts / Дописи українською;
- all posts / усі дописи;
- both editions again when either is disabled.

GET is safe: it validates the signed token and renders the current choices but never changes
subscription state. All state changes use POST with one allowlisted action: `en`, `uk`, `all`, or
`subscribe_all`. This avoids accidental changes by link scanners, security software, prefetchers,
and crawlers. Buttons use direct, outcome-based labels; do not use a single ambiguous
"Unsubscribe" button when several scopes are available.

The conventional double-opt-in `GET /api/confirm` is the deliberate exception: it consumes the
latest confirmation link the user requested and enables both editions. The D1 intent fingerprint
makes that link single-use and supersedes earlier confirmation messages. It is not an unsubscribe
or preference link. A future hardening may render a confirmation landing page on GET and require a
POST button, which would better resist unusually aggressive link scanners, but that two-step
confirmation is not part of this change. Preference and unsubscribe GETs must remain mutation-free.

Return the same useful success page for a first preference action and an idempotent preference
replay. Return the localized invalid-link page for a stale, superseded, or consumed confirmation;
do not reveal which condition failed. Do not add an email parameter to the URL or reveal the
decoded address in HTML, title, token logs, or analytics.
Restricted Telegram operational notifications contain only aggregate event type, locale, and an
allowlisted preference action. They never contain an address, bearer, or full token URL. Errors
should be localized and must not confirm whether an arbitrary email is in the database.

### English and Ukrainian copy principles

- Name **English posts** and **Ukrainian posts** in reader-facing copy; never show internal `en`,
  `uk`, "locale", or flags as the only label. `UK` in code means Ukrainian, not the United Kingdom.
- Lead with the outcome: "English posts are now off" / "Англомовні дописи вимкнено". Then state
  what did not change. Do not claim the other edition is still arriving if it was already off.
- Keep scope parity. Every action, success, invalid-link, storage-error, confirmation, and
  re-subscription state in English needs a natural Ukrainian counterpart with the same effect.
- Say that the streams are independently authored and may cover different subjects. Avoid wording
  that suggests Ukrainian is a translation feed or English is the canonical edition.
- Use "Subscribe to all posts again" / "Знову підписатися на всі дописи" for `subscribe_all`, so
  renewed scope is explicit. Never shorten it to a vague "Undo".
- Keep buttons as verbs and visible text; do not put essential scope only in tooltips, icons, or
  legal copy. Error messages state that nothing changed and offer a retry without exposing the
  address.

## Token and page security

Confirmation and preference tokens are bearer credentials. New tokens are AES-GCM authenticated,
encrypted, purpose-scoped, and expiry-checked with a key derived from
`SUBSCRIBE_RATE_LIMIT_SECRET`. The action and edition used by a mutation must be covered by the
trusted token context or strictly allowlisted;
never trust an arbitrary `email`, `content_locale`, redirect URL, or communication locale from the
request body/query.

Version-2 payloads are opaque, so request URLs no longer reveal a base64-encoded address. Treat the
complete URL as secret anyway. Deployed version-1 `unsubscribe` tokens remain accepted only by the
body preference center for compatibility; they cannot authorize RFC 8058 or `subscribe_all` outside
that manage flow.

The implemented confirmation lifetime is 48 hours, but expiry alone does not authorize it. The
token must also match the latest server-side HMAC fingerprint; successful confirmation consumes
that intent atomically, a newer request supersedes it, and any signed preference action clears it.
Manage links last approximately ten years so body controls in old email continue to work. Separate
RFC 8058 tokens expire after 90 days and are cryptographically scoped to exactly one disable action
(`en`, `uk`, or `all`); they never authorize `subscribe_all` or the manage UI.

Every token-bearing HTML or API response uses:

```http
Cache-Control: no-store
Referrer-Policy: no-referrer
X-Robots-Tag: noindex, nofollow, noarchive
```

Token pages also include `<meta name="robots" content="noindex,nofollow,noarchive">`. Do not add
third-party resources or deliberately send the URL/token to analytics; the no-referrer policy also
protects outbound links in the shared site chrome. `wrangler.jsonc` disables automatic invocation
logs because the platform would otherwise record query bearers; custom structured logs must never
include URLs, tokens, addresses, notification text, IPs, or User-Agents. If invocation logging is
re-enabled, configure URL-query redaction first. HTTPS is mandatory. Rotate the secret only with a plan for invalidating outstanding links
and issuing replacements.

These controls reduce token leakage; they do not turn a bearer link into authentication. Anyone
with the URL can use the actions it authorizes, so preference links should expire on a documented
schedule and a fresh link should be included in each recurring message.

## One-click unsubscribe and list identity

The preference-center link in the body and an inbox provider's one-click control serve different
jobs:

- The body link is an interactive GET page with EN, UK, all, and re-subscribe choices. GET never
  mutates.
- RFC 8058 is a non-interactive HTTPS POST. It cannot ask a question or open a preference menu.
  For a future article campaign it disables the one edition identified by that message and token.
  Return success directly; do not redirect.

Astro's same-origin form protection is reproduced in the application middleware so the RFC 8058
request can have one narrow exception: an originless or cross-origin POST reaches the unsubscribe
route only at the base-aware API path, with form URL encoding and exactly one non-empty `token`,
one allowlisted disable `action=en|uk|all`, and `oneclick=1` query tuple. The endpoint then requires
the single exact `List-Unsubscribe=One-Click` body field and validates that the opaque token is
cryptographically scoped to the same action before changing D1. `subscribe_all` is never allowed. Every
other unsafe form-like or content-type-less request retains Astro's same-origin rule. Do not replace
this with a broad CSRF exemption when adding edition-scoped one-click tokens.

The current welcome email represents the newly confirmed whole-blog subscription, so its
`List-Unsubscribe` URL carries `action=all` and disables both editions. Its visible body link still
opens the granular preference center. This global welcome scope must not be copied to future
edition-specific article messages.

Every future English article campaign uses a stable English `List-ID`; every Ukrainian campaign
uses a different stable Ukrainian `List-ID`. Recommended values are:

```text
English posts <en.posts.blog.serhiichernenko.com>
Ukrainian posts <uk.posts.blog.serhiichernenko.com>
```

Each campaign message must include:

```text
List-ID: English posts <en.posts.blog.serhiichernenko.com>
List-Unsubscribe: <https://www.serhiichernenko.com/blog/api/unsubscribe?token=SIGNED_EDITION_TOKEN>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

Use the corresponding Ukrainian `List-ID` for a Ukrainian post. The implemented encrypted token
identifies the recipient and exact disable action without exposing the email as a plaintext URL
parameter. Issue `{ purpose: 'oneclick', action: 'en' }` or `action: 'uk'` for article mail. The POST body is exactly
`List-Unsubscribe=One-Click`; it carries no cookies or login context.

[RFC 8058](https://www.rfc-editor.org/info/rfc8058/) requires the HTTPS URL, the exact POST field,
no redirect, and DKIM coverage of both list-unsubscribe headers. Google requires RFC 8058 one-click
for high-volume marketing/subscribed mail and also requires a visible body link; it explicitly
allows that body link to open a preference page
([Google's sender requirements](https://support.google.com/mail/answer/81126?hl=en),
[Google's one-click FAQ](https://support.google.com/mail/answer/14229414?hl=en)). Yahoo likewise
requires easy unsubscribe for bulk senders and says the visible body link may open preferences
([Yahoo sender best practices](https://senders.yahooinc.com/best-practices/)). Cloudflare's API
allowlists `List-ID`, `List-Unsubscribe`, and `List-Unsubscribe-Post` and DKIM-signs them
([Cloudflare Email headers](https://developers.cloudflare.com/email-service/reference/headers/)).

Even below provider volume thresholds, implement this contract from the first article campaign.
It preserves edition-level intent, reduces spam complaints, and avoids a later protocol migration.

## Exact future campaign audience contract

**Article campaign sending is not implemented.** Confirmation and welcome messages are
transactional; publishing a post currently sends no article email. D1 remains the source of truth
for preferences when a campaign system is added.

For one published article, the sender accepts exactly one normalized `content_locale` (`en` or
`uk`) and one immutable article/campaign id. It selects recipients with this query and no locale
fallback:

```sql
SELECT s.email, COALESCE(s.communication_locale, s.locale) AS communication_locale
FROM subscriber_language_preferences p
JOIN subscribers s ON s.id = p.subscriber_id
WHERE p.content_locale = ?
  AND p.enabled = 1
  AND s.status = 'confirmed'
ORDER BY s.id;
```

This query is implemented as the currently unused, provider-agnostic
`getConfirmedRecipientsForLanguage(db, contentLocale)` helper. It returns only `email` and
`communication_locale`; its existence does not mean campaigns are being sent. The bound parameter
is the article's content locale. The sender must re-check the same eligibility immediately before
enqueue/send, not rely on an old exported list. It must also exclude provider-level hard bounce and
complaint suppressions. A recipient belongs at most once because the normalized table has a unique
subscriber/language key. The sender must not query `subscribers.communication_locale` for audience
selection.

The eventual send contract is:

1. Resolve one published post and its `content_locale`; reject unsupported or ambiguous values.
2. Allocate an idempotent campaign id. Never send the same campaign/subscriber pair twice.
3. Select only the query above, then apply the provider suppression list.
4. Build subject, body, `Content-Language`, visible preference link, per-edition `List-ID`, and a
   signed per-edition RFC 8058 URL from the article locale.
5. Send one recipient per provider personalization operation; never expose recipients through
   `To`, `Cc`, or another subscriber's token.
6. Record delivery outcome by internal ids/counters, not email addresses in product analytics.
7. Process hard bounces and complaints into suppression before the next campaign.

Cloudflare currently states that Email Service is intended only for transactional messages and
that marketing/bulk tooling is future work
([Cloudflare Email Service FAQ](https://developers.cloudflare.com/email-service/reference/faq/)).
Therefore confirmation and welcome can continue to use the Worker binding, but article campaigns
must use a dedicated newsletter/marketing provider unless Cloudflare's policy has changed when the
sender is implemented. Re-evaluate the current provider terms and limits at that time. Prefer a
separate campaign sending subdomain so campaign reputation does not unnecessarily affect critical
transactional mail; Cloudflare also recommends separating mail by purpose in its
[deliverability guidance](https://developers.cloudflare.com/email-service/concepts/deliverability/).

## Suppression and retention

Unsubscribe is suppression, not automatic erasure. Keep the globally unsubscribed subscriber row,
disabled preference rows, and timestamps for as long as needed to prove and honor the opt-out; do
not purge them in routine "inactive subscriber" cleanup. The ICO recommends a small do-not-contact
record rather than deletion that could allow the address to be imported and mailed again
([ICO suppression guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/respect-peoples-preferences/)).

Provider suppressions for complaints and hard bounces are an additional stop list, not a replica
of D1 preferences. Internal re-subscription can lift the user's D1 global opt-out after explicit
renewed consent, but must not automatically remove a provider complaint or hard-bounce suppression.
Follow the provider's verified remediation process.

An erasure request is different from an unsubscribe. Minimize or delete optional metadata as
required, while retaining only the smallest lawful suppression identifier needed to avoid future
mail; a keyed hash of the normalized email may be appropriate if operational matching is tested.
Document the retention period and legal basis in the privacy policy. Do not promise immediate total
deletion while also claiming the address can never be mailed again.

## Legal baseline versus product policy

The implementation deliberately chooses the stricter, clearer UX even where a specific legal rule
may not apply:

- Where consent is the basis, GDPR Article 7 requires demonstrable, intelligible consent and says
  withdrawal must be as easy as giving consent
  ([GDPR Article 7](https://eur-lex.europa.eu/eli/reg/2016/679/art_7/oj/eng)). Article 21 gives an
  absolute right to object when personal data is processed for direct marketing
  ([GDPR Article 21](https://eur-lex.europa.eu/eli/reg/2016/679/art_21/oj/eng)).
- ePrivacy Directive Article 13 generally requires prior consent for direct-marketing email to
  natural persons, subject to national implementation and the existing-customer exception, and
  requires a valid opt-out route in each message
  ([ePrivacy Directive Article 13](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058)).
- For commercial email within its scope, the US CAN-SPAM rules permit a preference menu only if it
  also offers a stop-all option, and require accurate routing/subject information, a valid postal
  address, a clear Internet-based opt-out, and opt-outs honored within ten business days
  ([FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)).

Whether a personal-blog post notice is legally "direct marketing" or "commercial" is a legal
classification this document does not make. Product policy is simpler: obtain explicit double
opt-in, expose both editions at signup, offer edition and global controls in every recurring
message, and apply every valid opt-out immediately. Provider requirements, RFC 8058, and the UX
decisions in this document are not statutes; they are additional deliverability and trust controls.

## Analytics contract

Analytics describes successful state transitions, never people. The implemented event semantics
are:

| Event                              | Emit when                                                            | `status` value            |
| ---------------------------------- | -------------------------------------------------------------------- | ------------------------- |
| `subscribe_pending`                | A confirmation message is accepted for delivery                      | `pending`                 |
| `subscribe_confirmed`              | The subscription changes to confirmed with both preferences enabled  | `confirmed_all_languages` |
| `subscription_preferences_changed` | English alone is newly disabled                                      | `en_disabled`             |
| `subscription_preferences_changed` | Ukrainian alone is newly disabled                                    | `uk_disabled`             |
| `subscription_preferences_changed` | A partial/global subscriber newly enables both editions              | `all_enabled`             |
| `unsubscribed`                     | An action disables the final enabled edition, including action `all` | `all_languages_disabled`  |

Emit only on a real transition, not token-page views, rejected input, scanner GETs, or idempotent
replays. Current Analytics Engine blobs are event, bounded site/action locale, normalized known
source, and the bounded status above; the numeric field is count. The preference edition is encoded
only by the fixed status allowlist, not an address or subscriber id. Never write email, subscriber
id, raw or hashed IP, token, URL, user agent, free-form input, article slug, or another
high-cardinality identifier to Analytics Engine. Telegram and provider delivery logs are separate,
access-controlled operational systems with their own retention policy; their PII must never leak
into product analytics.

## Adding a third language

A language launch expands the promise; it is not a translation-only configuration change.
Existing subscribers must **not** be silently opted in.

1. Add the valid BCP 47 `content_locale` to application allowlists, content, templates, preference
   UI, list identity, and tests.
2. Insert a disabled preference row for every existing subscriber (or treat a missing row as
   disabled). Never default existing rows to enabled.
3. Revise EN/UK/new-language signup copy so it names all editions and explains their independence.
4. Increment `consent_version`. Only new confirmations under that version enable the newly stated
   set.
5. Show the new edition in the preference center. Existing subscribers may opt into it through an
   explicit POST choice; a clearly labelled new `subscribe_all` action may enable it only after the
   page explicitly names the new scope.
6. Give the edition its own stable `List-ID`, one-click scope, sender template, campaign tests, and
   suppression checks.

Never implement `subscribe_all` as "enable every locale that may ever exist" without showing the
current list to the user. Consent version `2` covers English and Ukrainian; it is not consent to a
future Polish, German, or other edition.

## Migration and rollout

The legacy schema used one `locale` for both communication and assumed content preference. That is
not evidence that an existing English subscriber agreed to Ukrainian articles, or vice versa.
Backfill conservatively:

| Legacy row               | Migrated lifecycle    | Migrated preferences                        |
| ------------------------ | --------------------- | ------------------------------------------- |
| `confirmed`, locale `en` | Confirmed             | English enabled; Ukrainian disabled         |
| `confirmed`, locale `uk` | Confirmed             | Ukrainian enabled; English disabled         |
| `pending`                | Pending               | Both disabled                               |
| `unsubscribed`           | Globally unsubscribed | Both disabled; retain unsubscribe timestamp |

Only a new confirmation or `subscribe_all` action under consent version `2` may enable both for a
legacy subscriber. This sacrifices some initial reach to avoid inventing consent.

Cloudflare D1 records numbered SQL migrations and applies them sequentially
([D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)). Use this operational
order:

1. Pause subscription deploys and export a timestamped remote backup with
   `pnpm exec wrangler d1 export portfolio-blog --remote --output ../portfolio-blog-before-0002.sql`.
   Store it outside the repository with restricted permissions: it contains subscriber PII, and it
   needs an explicit deletion date.
2. Apply the migration locally with `pnpm d1:apply:local`; run the matrix below.
3. Run `pnpm exec wrangler d1 migrations list portfolio-blog --remote` and confirm the target
   database id/name.
4. Record pre-migration totals grouped by legacy `status` and `locale`.
5. Apply the expand/contract migration with `pnpm d1:apply:remote`. It adds and backfills
   `communication_locale`; adds nullable confirmation fingerprint, locale, and expiry fields;
   creates normalized preferences and atomic rate-limit counters; retains legacy `locale`; and installs
   old-Worker compatibility triggers. An old Worker confirmation conservatively enables only its
   legacy locale, records a fresh version `1` consent audit, and clears staged intent data. It never
   promotes a staged version `2` intent because the old bundle cannot prove that the token it
   verified matches that fingerprint.
6. Validate preference counts and invariants, then deploy application code immediately. During the
   migration-first overlap, the old Worker may honor its own at-most-48-hour link only as legacy
   one-language consent; the new Worker rejects every pending row with no matching stored intent.
7. Deploy the code, complete one real EN and UK double-opt-in flow, and verify response headers,
   D1 state, localized email, and preference actions.
8. Monitor Worker errors, send failures, invalid-token rate, and aggregate transitions. Do not log
   token URLs or recipient addresses to product analytics.

Validation queries should prove:

```sql
-- No duplicate edition preference.
SELECT subscriber_id, content_locale, COUNT(*) AS n
FROM subscriber_language_preferences
GROUP BY subscriber_id, content_locale
HAVING n > 1;

-- The rollout compatibility mirror is complete and synchronized.
SELECT COUNT(*) AS invalid_locale_mirror
FROM subscribers
WHERE communication_locale IS NULL OR communication_locale <> locale;

-- Confirmation fingerprints are either absent (legacy/consumed) or a 32-byte
-- HMAC encoded as 43 base64url characters with a staged locale. No staged
-- request metadata may survive without its matching intent.
SELECT COUNT(*) AS invalid_confirmation_fingerprint
FROM subscribers
WHERE (
    confirmation_token_hash IS NOT NULL
    AND (
      length(confirmation_token_hash) <> 43
      OR pending_communication_locale IS NULL
      OR pending_expires_at IS NULL
    )
  )
  OR (
    confirmation_token_hash IS NULL
    AND (
      pending_communication_locale IS NOT NULL
      OR pending_expires_at IS NOT NULL
    )
  );

-- Manual maintenance fallback; normal subscribe/confirm traffic performs the
-- same cleanup in bounded batches. Never use status='pending' alone: a row
-- may carry durable suppression history from an interrupted re-subscribe.
DELETE FROM subscribers
WHERE status = 'pending'
  AND confirmed_at IS NULL
  AND consent_version IS NULL
  AND consented_at IS NULL
  AND unsubscribed_at IS NULL
  AND (
    pending_expires_at <= unixepoch()
    OR (
      pending_expires_at IS NULL
      AND confirmation_token_hash IS NULL
      AND created_at <= unixepoch() - (48 * 60 * 60)
    )
  );
UPDATE subscribers
SET status = CASE
      WHEN status = 'pending' THEN 'unsubscribed'
      ELSE status
    END,
    unsubscribed_at = CASE
      WHEN status = 'pending' THEN COALESCE(unsubscribed_at, unixepoch())
      ELSE unsubscribed_at
    END,
    confirmation_token_hash = NULL,
    pending_communication_locale = NULL,
    pending_expires_at = NULL
WHERE (confirmed_at IS NOT NULL OR consent_version IS NOT NULL
       OR consented_at IS NOT NULL OR unsubscribed_at IS NOT NULL)
  AND status IN ('pending', 'unsubscribed')
  AND (
    pending_expires_at <= unixepoch()
    OR (pending_expires_at IS NULL AND status = 'pending'
        AND confirmation_token_hash IS NULL
        AND created_at <= unixepoch() - (48 * 60 * 60))
  );
DELETE FROM subscription_rate_limits WHERE expires_at <= unixepoch();

The application additionally disables preference rows before restoring a historical `pending` row
to `unsubscribed`; use `src/lib/subscription-cleanup-sql.ts` as the canonical operational sequence.

-- Immediately after migration, every legacy confirmed row has exactly its
-- former locale enabled (run before a version-2 confirmation can enable both).
SELECT COUNT(*) AS invalid_conservative_backfill
FROM subscribers AS s
WHERE s.status = 'confirmed'
  AND (
    (SELECT COUNT(*)
     FROM subscriber_language_preferences AS p
     WHERE p.subscriber_id = s.id AND p.enabled = 1) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM subscriber_language_preferences AS p
      WHERE p.subscriber_id = s.id
        AND p.content_locale = s.locale
        AND p.enabled = 1
    )
  );

-- No enabled preference on a non-confirmed lifecycle.
SELECT COUNT(*) AS invalid_enabled
FROM subscribers AS s
JOIN subscriber_language_preferences AS p ON p.subscriber_id = s.id
WHERE s.status <> 'confirmed' AND p.enabled = 1;

-- No confirmed subscriber with zero enabled editions.
SELECT COUNT(*) AS invalid_empty_confirmed
FROM subscribers AS s
WHERE s.status = 'confirmed'
  AND NOT EXISTS (
    SELECT 1 FROM subscriber_language_preferences AS p
    WHERE p.subscriber_id = s.id AND p.enabled = 1
  );
```

Rollback is application-first and non-destructive: stop outbound subscription email, redeploy the
previous Worker, leave the compatibility columns/table/triggers in place, and stop before any
campaign send. The triggers mirror old-Worker locale, confirmation, and global-unsubscribe changes
into the new model. The previous bundle does not contain the new localized preference center or
POST one-click implementation, so treat it as a short emergency state: provide the contact-based
opt-out path and restore a fixed current bundle promptly. Do not drop preferences as a routine
rollback.

A failed D1 migration is transactionally rolled back by Wrangler
([D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)); a successfully
applied migration needs an explicit forward repair or, for a severe data-corruption incident, a
carefully tested restore from the export. Before re-enabling the new code, rerun the invariant
queries and reconcile rows changed during the rollback window. Article sending is not implemented,
which prevents an old bundle from accidentally running a campaign.

Contract cleanup is a later release, never part of the initial rollout: after the new code has been
stable through an agreed observation window and rollback to the old bundle is no longer needed,
remove the compatibility triggers and legacy `locale` column in a separately backed-up and tested
migration. Update the delivery query to read `communication_locale` directly only then.

## Test matrix

| Area                | Case                                                      | Expected result                                                                                                                                        |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signup copy         | EN and UK pages                                           | Both explicitly promise English + Ukrainian independent articles; no default-language implication.                                                     |
| New signup          | EN site / UK site                                         | Pending, no campaign eligibility, confirmation in the requested locale, and the same public response.                                                  |
| Existing subscriber | Confirmed/partial row; request from other site locale     | Authoritative communication locale, active attribution, status, and preferences remain unchanged; only the latest request fields are staged.           |
| Double opt-in       | Valid token                                               | Confirmed once, exactly two enabled preferences, consent version/time stored, one welcome message.                                                     |
| Double opt-in       | Invalid, expired, tampered, replayed                      | No unauthorized change; localized safe result; replay does not duplicate welcome/analytics.                                                            |
| Confirmation intent | Request two links in different site locales               | Only the newest link succeeds and promotes its locale; the superseded link causes no mutation, welcome, or conversion.                                 |
| Legacy pending      | Valid pre-v2 link but no stored v2 fingerprint            | Rejected without mutation; reader must submit the current form and confirm a fresh explicit both-language intent.                                      |
| Confirmation intent | Preference action while a link is pending                 | The action clears the intent and all staged fields; that confirmation link cannot later overwrite the chosen state.                                    |
| Stale confirmation  | Replay consumed confirm link after partial/global opt-out | No preference or lifecycle change; the old link cannot re-subscribe, send welcome, or emit a conversion.                                               |
| Preference GET      | Valid token, scanner user agent, repeated GET             | Renders current state only; byte-for-byte no D1 mutation.                                                                                              |
| Preference POST     | `en` from both-enabled                                    | EN disabled, UK remains, lifecycle confirmed.                                                                                                          |
| Preference POST     | `uk` from both-enabled                                    | UK disabled, EN remains, lifecycle confirmed.                                                                                                          |
| Preference POST     | `all` from any confirmed state                            | All disabled, lifecycle unsubscribed, timestamp recorded.                                                                                              |
| Preference POST     | Disable last enabled edition                              | Lifecycle becomes unsubscribed; no empty confirmed state.                                                                                              |
| Re-subscribe        | `subscribe_all` from partial/global                       | Exactly EN + UK enabled, lifecycle confirmed, renewed consent recorded.                                                                                |
| Re-subscribe        | New form from partial/global                              | No disabled edition is newly enabled before confirmation; an existing partial preference remains unchanged. Confirmation then enables exactly EN + UK. |
| Idempotency         | Repeat every POST                                         | Same final state, no duplicate rows or conversion events.                                                                                              |
| Concurrency         | Two different preference POSTs                            | Atomic invariant-preserving result; never sends after a committed global opt-out.                                                                      |
| Authorization       | Change action/email/locale/token bytes                    | Reject unknown action and invalid signature; no state change or enumeration.                                                                           |
| Email identity      | Existing mixed-case row and its issued links              | Exact legacy spelling continues to match; this release creates no silent lowercase duplicate or collision.                                             |
| Security headers    | Every token response                                      | `no-store`, `no-referrer`, `noindex`; no external resources or token logging.                                                                          |
| RFC 8058            | Welcome one-click POST with `action=all`                  | Direct 2xx without redirect; disables both current editions; accepts no email override.                                                                |
| Future RFC 8058     | Article POST for EN/UK-scoped token                       | Direct 2xx without redirect; disables only token edition; accepts no email override.                                                                   |
| Capability split    | Reuse manage token as one-click / one-click token in UI   | Both rejected; changing scoped action is rejected; `subscribe_all` is impossible via RFC 8058.                                                         |
| Body link           | EN/UK article email                                       | Opens localized preference center; clear edition and global choices.                                                                                   |
| Audience query      | Fixture for every lifecycle/preference combination        | Only confirmed + enabled rows for exact `content_locale`, once each.                                                                                   |
| Legacy migration    | Every legacy status × locale                              | Matches conservative backfill table and all validation queries return zero rows/count.                                                                 |
| Suppression         | Global opt-out, complaint, hard bounce                    | Excluded even if a stale export exists; re-subscribe never clears provider suppression blindly.                                                        |
| Third language      | Add disabled fixture locale                               | Existing users stay disabled until an explicit new-scope action/confirmation.                                                                          |
| Accessibility/i18n  | Keyboard, screen reader, long EN/UK strings               | Correct `lang`, headings, focus, live status, button names, and no clipped copy.                                                                       |

Before an article sender ships, add provider sandbox/integration tests for DKIM, SPF/DMARC
alignment, `List-ID`, RFC 8058 headers, visible body link, bounce/complaint ingestion, idempotent
campaign delivery, and the no-stale-export rule. Google and Yahoo both require authentication,
low complaint rates, and stricter controls for bulk senders; verify their current requirements at
launch rather than freezing today's thresholds in code.
