import type { APIRoute } from 'astro';
import { SUBSCRIBE_RATE_LIMIT_SECRET } from 'astro:env/server';
import { cleanupExpiredPendingIntents, confirmSubscriberAndEnableAll, getDB } from '../../lib/d1';
import { hashConfirmationToken, issueToken, verifyToken } from '../../lib/tokens';
import { sendWelcome } from '../../lib/email';
import { notify } from '../../lib/telegram';
import { trackEvent } from '../../lib/analytics';
import { isLocale, type Locale } from '../../i18n/config';
import { ui } from '../../i18n/ui';
import { resolvePageSlug } from '../../lib/pages';

export const prerender = false;

function homeHrefFor(locale: Locale): string {
	const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
	return `${base}/${locale}/`;
}

function tokenHeaders(): Record<string, string> {
	return {
		'cache-control': 'no-store',
		'referrer-policy': 'no-referrer',
		'x-robots-tag': 'noindex, nofollow, noarchive',
	};
}

function htmlPage(title: string, body: string, locale: Locale, status = 200): Response {
	const siteName = ui[locale]['site.name'];
	const homeHref = homeHrefFor(locale);
	const html = `<!doctype html>
<html lang="${locale === 'uk' ? 'uk-UA' : 'en'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="robots" content="noindex,nofollow,noarchive" />
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
		status,
		headers: { 'content-type': 'text/html; charset=utf-8', ...tokenHeaders() },
	});
}

function tokenRedirect(context: Parameters<APIRoute>[0], location: string): Response {
	const response = context.redirect(location, 303);
	for (const [key, value] of Object.entries(tokenHeaders())) response.headers.set(key, value);
	return response;
}

export const GET: APIRoute = async (context) => {
	const url = new URL(context.request.url);
	const token = url.searchParams.get('token') ?? '';
	const rawLocale = url.searchParams.get('locale') ?? 'en';
	const locale: Locale = isLocale(rawLocale) ? rawLocale : 'en';

	// Defense-in-depth: astro:env validates undefined but not empty string.
	if (!SUBSCRIBE_RATE_LIMIT_SECRET) {
		return htmlPage(
			ui[locale]['subscribe.confirm.error'],
			ui[locale]['subscribe.confirm.error'],
			locale,
			503,
		);
	}

	const result = await verifyToken(SUBSCRIBE_RATE_LIMIT_SECRET, token, { purpose: 'confirm' });

	if (!result) {
		return htmlPage(
			ui[locale]['subscribe.confirm.invalid'],
			ui[locale]['subscribe.confirm.invalid'],
			locale,
			400,
		);
	}

	const { email } = result;
	const confirmationTokenHash = await hashConfirmationToken(SUBSCRIBE_RATE_LIMIT_SECRET, token);
	let db: D1Database;
	try {
		db = getDB();
		await cleanupExpiredPendingIntents(db);
	} catch {
		console.error(JSON.stringify({ message: 'Failed to clean expired confirmation intent' }));
		return htmlPage(
			ui[locale]['subscribe.confirm.error'],
			ui[locale]['subscribe.confirm.error'],
			locale,
			503,
		);
	}

	let confirmation: Awaited<ReturnType<typeof confirmSubscriberAndEnableAll>>;
	try {
		confirmation = await confirmSubscriberAndEnableAll(db, email, confirmationTokenHash);
	} catch {
		console.error(JSON.stringify({ message: 'Failed to confirm subscriber' }));
		return htmlPage(
			ui[locale]['subscribe.confirm.error'],
			ui[locale]['subscribe.confirm.error'],
			locale,
			503,
		);
	}

	if (!confirmation) {
		return htmlPage(
			ui[locale]['subscribe.confirm.invalid'],
			ui[locale]['subscribe.confirm.invalid'],
			locale,
			400,
		);
	}

	// The database value is authoritative. The unsigned locale query is only a
	// fallback for invalid/error pages where there is no subscriber to consult.
	const communicationLocale = confirmation.preferences.subscriber.communication_locale;

	if (confirmation.changed) {
		try {
			const [manageToken, globalOneClickToken] = await Promise.all([
				issueToken(SUBSCRIBE_RATE_LIMIT_SECRET, email, { purpose: 'manage' }),
				issueToken(SUBSCRIBE_RATE_LIMIT_SECRET, email, {
					purpose: 'oneclick',
					action: 'all',
				}),
			]);
			const origin = new URL(context.request.url).origin;
			const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
			const manageUrl = `${origin}${base}/${communicationLocale}/unsubscribe?token=${encodeURIComponent(manageToken)}`;
			const globalOneClickUrl = `${origin}${base}/api/unsubscribe?token=${encodeURIComponent(globalOneClickToken)}&action=all&oneclick=1`;
			const privacySlug = await resolvePageSlug('privacy', communicationLocale, 'privacy');
			const privacyUrl = `${origin}${homeHrefFor(communicationLocale)}${privacySlug}/`;
			await sendWelcome({
				to: email,
				locale: communicationLocale,
				manageUrl,
				globalOneClickUrl,
				privacyUrl,
			});
		} catch {
			console.error(JSON.stringify({ message: 'Failed to send welcome email' }));
		}

		await notify(`✅ Subscription confirmed (${communicationLocale})`);

		// Analytics Engine event (synchronous non-throwing binding call; no PII)
		trackEvent('subscribe_confirmed', {
			locale: communicationLocale,
			status: 'confirmed_all_languages',
		});
	}

	// Redirect to subscribe page with confirmed flag
	return tokenRedirect(context, `${homeHrefFor(communicationLocale)}subscribe?confirmed=1`);
};
