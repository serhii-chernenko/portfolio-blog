import type { APIRoute } from 'astro';
import { SUBSCRIBE_RATE_LIMIT_SECRET } from 'astro:env/server';
import { getDB, markConfirmed } from '../../lib/d1';
import { verifyToken, issueToken } from '../../lib/tokens';
import { sendWelcome } from '../../lib/email';
import { notify, escapeHtml } from '../../lib/telegram';
import { trackEvent } from '../../lib/analytics';
import { isLocale, type Locale } from '../../i18n/config';
import { ui } from '../../i18n/ui';

export const prerender = false;

function homeHrefFor(locale: Locale): string {
	const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
	return `${base}/${locale}/`;
}

function htmlPage(title: string, body: string, locale: Locale): Response {
	const siteName = ui[locale]['site.name'];
	const homeHref = homeHrefFor(locale);
	const html = `<!doctype html>
<html lang="${locale === 'uk' ? 'uk-UA' : 'en'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — ${siteName}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f6f6f6; margin: 0; padding: 24px; color: #111; }
    .card { max-width: 480px; margin: 60px auto; background: #fff; border-radius: 12px; padding: 40px; border: 1px solid #eee; text-align: center; }
    h1 { font-size: 1.5rem; margin: 0 0 12px; }
    p { color: #555; line-height: 1.6; margin: 0 0 24px; }
    a { display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${body}</p>
    <a href="${homeHref}">${ui[locale]['404.cta']}</a>
  </div>
</body>
</html>`;
	return new Response(html, {
		status: 200,
		headers: { 'content-type': 'text/html; charset=utf-8' },
	});
}

export const GET: APIRoute = async (context) => {
	const url = new URL(context.request.url);
	const token = url.searchParams.get('token') ?? '';
	const rawLocale = url.searchParams.get('locale') ?? 'en';
	const locale: Locale = isLocale(rawLocale) ? rawLocale : 'en';

	// Defense-in-depth: astro:env validates undefined but not empty string.
	if (!SUBSCRIBE_RATE_LIMIT_SECRET) {
		return htmlPage(
			ui[locale]['subscribe.confirm.invalid'],
			ui[locale]['subscribe.confirm.invalid'],
			locale,
		);
	}

	const result = await verifyToken(SUBSCRIBE_RATE_LIMIT_SECRET, token, 'confirm');

	if (!result) {
		return htmlPage(
			ui[locale]['subscribe.confirm.invalid'],
			ui[locale]['subscribe.confirm.invalid'],
			locale,
		);
	}

	const { email } = result;

	try {
		const db = getDB();
		await markConfirmed(db, email);
	} catch (err) {
		console.error('Failed to mark confirmed:', err);
	}

	try {
		const unsubscribeToken = await issueToken(SUBSCRIBE_RATE_LIMIT_SECRET, email, 'unsubscribe');
		const origin = new URL(context.request.url).origin;
		const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
		const unsubscribeUrl = `${origin}${base}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&locale=${locale}`;
		const privacyUrl = `${origin}${homeHrefFor(locale)}privacy/`;
		await sendWelcome({ to: email, locale, unsubscribeUrl, privacyUrl });
	} catch (err) {
		console.error('Failed to send welcome email:', err);
	}

	await notify(`✅ Subscriber confirmed: ${escapeHtml(email)} (${locale})`);

	// Analytics Engine event (fire-and-forget, never throws, no PII)
	trackEvent('subscribe_confirmed', { locale, status: 'confirmed' });

	// Redirect to subscribe page with confirmed flag
	return context.redirect(`${homeHrefFor(locale)}subscribe?confirmed=1`, 302);
};
