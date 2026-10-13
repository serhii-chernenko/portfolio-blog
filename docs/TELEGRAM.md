# Telegram notifications

This blog uses a Telegram bot to send you private notifications about events you care about — new subscribers, subscription changes, and newly published posts.

There is no public bot for visitors. This is a one-bot-one-user setup: the bot sends messages to **your** Telegram chat ID, and that's it.

---

## Events you get notified about

| Event                     | Trigger                                  | Source                               |
| ------------------------- | ---------------------------------------- | ------------------------------------ |
| 📬 New pending subscriber | Someone submitted the subscribe form     | `src/pages/api/subscribe.ts`         |
| ✅ Subscriber confirmed   | Someone clicked the confirmation link    | `src/pages/api/confirm.ts`           |
| 🔔 Preferences changed    | A signed POST changes delivery languages | `src/pages/api/unsubscribe.ts`       |
| 📝 New post published     | First publish of a post in Sanity        | `src/pages/api/sanity/revalidate.ts` |

Telegram is best-effort: HTTP failures and fetch/network exceptions are swallowed, so committed
subscription state is never reported as a 500 because Telegram is down. Warnings are structured
and contain only a failure class/status—never notification text, addresses, URLs, or credentials.
Worker subscription notifications contain only event type, locale, and an allowlisted action; no
subscriber address or bearer is sent to Telegram.

Every notification comes from the Worker. Deploys and PR previews run through Cloudflare Workers
Builds, and no GitHub Actions workflow (`.github/workflows/ci.yml`, `indexnow.yml`) sends Telegram
messages, so there are no deploy or preview notifications and no Telegram secrets in GitHub.

---

## Setup (one-time)

### 1. Create a bot

Open Telegram. Search for **[@BotFather](https://t.me/BotFather)**. Send `/newbot`. Follow the prompts:

- **Name** — anything human-readable. Mine is "Blog Notifier".
- **Username** — must end in `bot`. Doesn't matter what — only you and the Worker ever use it.

BotFather returns a token that looks like `8123456789:AAH...`. **Save this** — it's the only time you'll see it. This is `TELEGRAM_BOT_TOKEN`.

If you ever leak it: `/revoke` in BotFather, then `/token` to get a new one. Update the Wrangler secret.

### 2. Get your chat ID

Open your bot's chat (search by username in Telegram). Send any message — `/start` works. The bot doesn't respond yet; that's fine — we just need to register a chat.

Then fetch your latest updates:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
```

Replace `<TOKEN>` with what BotFather gave you. The response has a `result[].message.chat.id` field. Copy that number. It looks like `123456789` for a personal chat (or `-1001234567890` for a group/channel).

This is `TELEGRAM_CHAT_ID`.

Alternative: use **[@userinfobot](https://t.me/userinfobot)** — it replies with your chat ID directly.

### 3. Quick sanity check

```bash
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
  -d "chat_id=<CHAT_ID>" \
  -d "text=hello from the cli"
```

You should see "hello from the cli" appear in the chat instantly. If not, double-check the chat ID and that you've actually sent a message to the bot first (Telegram won't let bots message you cold).

---

## Setup (Wrangler secrets — for the Worker)

These let the API endpoints (`/api/subscribe` etc.) send Telegram notifications.

```bash
pnpm wrangler secret put TELEGRAM_BOT_TOKEN
# paste the token

pnpm wrangler secret put TELEGRAM_CHAT_ID
# paste the chat ID
```

For **local dev** (`pnpm wrangler:dev`), put the same values in `.dev.vars` at the repo root:

```
TELEGRAM_BOT_TOKEN=8123456789:AAH...
TELEGRAM_CHAT_ID=123456789
```

`.dev.vars` is gitignored. **Do not commit it.**

For `pnpm dev` (plain Astro): the runtime has no Cloudflare bindings, so the notification code path is never hit. The API routes throw before reaching Telegram.

---

## Customization

### Send to a group instead of yourself

1. Create a Telegram group.
2. Add your bot to the group.
3. Send any message in the group.
4. `curl "https://api.telegram.org/bot<TOKEN>/getUpdates"` — `chat.id` will be a negative number like `-1001234567890`. Use that as `TELEGRAM_CHAT_ID`.

### Change message formatting

Edit `src/lib/telegram.ts`. The `notify(text, parseMode)` helper accepts `'HTML'` or `'Markdown'`.
Keep runtime subscription messages aggregate and PII-free.

To inline a link: `<a href="https://...">label</a>`. To bold: `<b>...</b>`. To monospace: `<code>...</code>`. Full reference: <https://core.telegram.org/bots/api#html-style>.

### Add a new event

```ts
import { notify } from '@/lib/telegram';

await notify('📊 Aggregate maintenance event completed');
```

### Silence notifications temporarily

The `notify()` helper no-ops gracefully if `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is empty:

```ts
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
```

So if you want to disable notifications, just unset one of the secrets:

```bash
pnpm wrangler secret delete TELEGRAM_BOT_TOKEN
```

The site keeps working. Notifications are off.

---

## Troubleshooting

**No messages arriving in Telegram, no error in logs.**
Check the Worker custom logs (`pnpm wrangler tail`) for a structured `Telegram notification failed`
warning with `http_status` or `network_error`. Automatic invocation logs are disabled to protect
query bearer tokens. Common causes:

- Chat ID is wrong (check sign — personal chats are positive, groups/channels negative)
- Bot was kicked from the group
- You never sent a message to the bot first (Telegram blocks unsolicited bot DMs)

**"Forbidden: bot was blocked by the user"**
You blocked your own bot. Unblock it in Telegram.

**"Bad Request: chat not found"**
Chat ID is wrong, or the chat was deleted, or the bot isn't a member of that group.

**Local dev (`pnpm dev`) doesn't notify.**
Expected. There's no Cloudflare runtime in plain `astro dev`. Use `pnpm wrangler:dev` after building, with `.dev.vars` populated.
