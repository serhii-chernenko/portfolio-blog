import type { APIRoute } from 'astro';
import { SUBSCRIBE_RATE_LIMIT_SECRET } from 'astro:env/server';
import { getDB, getKV, upsertPendingSubscriber } from '../../lib/d1';
import { issueToken, hashIp } from '../../lib/tokens';
import { sendConfirmation } from '../../lib/email';
import { notify, escapeHtml } from '../../lib/telegram';
import { isLocale, type Locale } from '../../i18n/config';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST: APIRoute = async (context) => {
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  if (!body || typeof body !== 'object') {
    return jsonError('Invalid request body', 400);
  }

  const { email, locale: rawLocale, source } = body as Record<string, unknown>;

  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return jsonError('Invalid email address', 400);
  }

  if (typeof rawLocale !== 'string' || !isLocale(rawLocale)) {
    return jsonError('Invalid locale', 400);
  }

  const locale = rawLocale as Locale;

  // Defense-in-depth: astro:env validates undefined but not empty string.
  if (!SUBSCRIBE_RATE_LIMIT_SECRET) {
    return jsonError('Service unavailable', 503);
  }

  // Rate limit: 3 requests per IP per 10 minutes
  let kv: KVNamespace;
  try {
    kv = getKV('RATE_LIMIT');
  } catch {
    return jsonError('Service unavailable', 503);
  }

  const ip =
    context.request.headers.get('cf-connecting-ip') ??
    context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';

  const ipHash = await hashIp(SUBSCRIBE_RATE_LIMIT_SECRET, ip);
  const rateLimitKey = `subscribe:${ipHash}`;
  const existing = await kv.get(rateLimitKey);
  const count = existing ? parseInt(existing, 10) : 0;

  if (count >= 3) {
    return jsonError('Too many attempts. Try again in a few minutes.', 429);
  }

  // Increment rate limit counter (10 min window)
  await kv.put(rateLimitKey, String(count + 1), { expirationTtl: 600 });

  let db: D1Database;
  try {
    db = getDB();
  } catch {
    return jsonError('Service unavailable', 503);
  }

  const userAgent = context.request.headers.get('user-agent') ?? undefined;

  await upsertPendingSubscriber(db, {
    email,
    locale,
    source: typeof source === 'string' ? source : undefined,
    user_agent: userAgent,
    ip_hash: ipHash,
  });

  const token = await issueToken(SUBSCRIBE_RATE_LIMIT_SECRET, email, 'confirm');
  // Derive origin from the incoming request so prod, preview Workers, and
  // local `wrangler dev` each produce a link that points back to themselves.
  // Note: `wrangler dev` defaults `request.url`'s host to the first route's
  // hostname (production) — override via `dev.host` in wrangler.jsonc.
  const origin = new URL(context.request.url).origin;
  // Astro injects the base path (e.g. `/blog/` in prod, `/` locally).
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  const confirmUrl = `${origin}${base}/api/confirm?token=${encodeURIComponent(token)}&locale=${locale}`;
  const privacyUrl = `${origin}${base}/${locale}/privacy/`;

  try {
    await sendConfirmation({ to: email, locale, confirmUrl, privacyUrl });
  } catch (err) {
    console.error('Failed to send confirmation email:', err);
    return jsonError('Failed to send confirmation email', 500);
  }

  // Telegram notify (best-effort)
  await notify(`📬 New pending subscriber: ${escapeHtml(email)} (${locale})`);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
