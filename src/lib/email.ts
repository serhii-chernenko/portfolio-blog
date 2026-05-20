/**
 * Cloudflare Email Service — outbound email via the `send_email` Worker binding.
 *
 * Uses the `SendEmail` binding (env.SEND_EMAIL) which is backed by Cloudflare's
 * native email infrastructure. The plain-object overload of `.send()` does NOT
 * require recipients to be pre-verified in Email Routing — it targets the newer
 * Cloudflare Email Service API, suitable for sending transactional email to
 * arbitrary subscriber addresses.
 *
 * PRODUCTION NOTE: As of mid-2026 the CF Email Service is in beta. If you hit
 * delivery or rate-limit issues at scale, consider a dedicated transactional
 * provider (Resend, Postmark, etc.) as a fallback until CF Email Service reaches
 * GA with formal SLAs.
 *
 * Wrangler binding: see `send_email` section in wrangler.jsonc.
 * Sender address: configured via the `MAIL_FROM` env var (default: hello@serhiichernenko.com).
 */

import type { Locale } from '../i18n/config';

const DEFAULT_FROM = 'hello@serhiichernenko.com';
const FROM_NAME = 'Chernenko · Blog';

function fromAddress(env: Env): string {
	const addr = env.MAIL_FROM || DEFAULT_FROM;
	return `${FROM_NAME} <${addr}>`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const CONFIRM_TEMPLATES: Record<
	Locale,
	{ subject: string; intro: string; cta: string; outro: string }
> = {
	en: {
		subject: 'Confirm your subscription',
		intro:
			'Thanks for subscribing! Click the button below to confirm your email and get new posts in your inbox.',
		cta: 'Confirm subscription',
		outro:
			"If you didn’t request this, you can safely ignore this email. The link expires in 48 hours.",
	},
	uk: {
		subject: 'Підтвердьте підписку',
		intro:
			'Дякую, що підписались! Натисніть кнопку нижче, щоб підтвердити пошту й отримувати нові дописи.',
		cta: 'Підтвердити підписку',
		outro:
			'Якщо ви не запитували цього — просто ігноруйте лист. Посилання дійсне 48 годин.',
	},
};

const WELCOME_TEMPLATES: Record<
	Locale,
	{ subject: string; body: string; unsubscribePre: string; unsubscribeLinkText: string; unsubscribePost: string }
> = {
	en: {
		subject: "You’re subscribed",
		body: "You’re in! Expect occasional posts on engineering, photography, and craft. Reply to this email anytime — I read everything.",
		unsubscribePre: "Not interested anymore?",
		unsubscribeLinkText: "Unsubscribe",
		unsubscribePost: "in one click.",
	},
	uk: {
		subject: "Підписку підтверджено",
		body: "Готово! Іноді надсилатиму нові дописи про розробку, фотографію та ремесло. Можете відповісти на цей лист — я читаю усі.",
		unsubscribePre: "Не цікаво?",
		unsubscribeLinkText: "Відписатися",
		unsubscribePost: "в один клік.",
	},
};

// ---------------------------------------------------------------------------
// HTML layout helper
// ---------------------------------------------------------------------------

function emailLayout(content: string, locale: Locale, fromName: string): string {
	return `<!doctype html><html lang="${locale}"><body style="font-family:system-ui,-apple-system,sans-serif;background:#f6f6f6;margin:0;padding:24px;color:#111"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #eee">${content}<hr style="margin-top:32px;border:none;border-top:1px solid #eee"/><p style="color:#888;font-size:13px;margin-top:16px">${fromName}</p></div></body></html>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendConfirmation(args: {
	env: Env;
	to: string;
	locale: Locale;
	confirmUrl: string;
}): Promise<void> {
	const tpl = CONFIRM_TEMPLATES[args.locale];
	const from = fromAddress(args.env);
	const html = emailLayout(
		`<h1 style="font-size:22px;margin:0 0 16px">${tpl.subject}</h1>
		 <p style="font-size:16px;line-height:1.6;margin:0 0 24px">${tpl.intro}</p>
		 <p style="margin:0 0 24px"><a href="${args.confirmUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500">${tpl.cta}</a></p>
		 <p style="font-size:13px;color:#666;line-height:1.6;margin:0">${tpl.outro}</p>`,
		args.locale,
		FROM_NAME,
	);

	await args.env.SEND_EMAIL.send({
		from,
		to: args.to,
		subject: tpl.subject,
		html,
	});
}

export async function sendWelcome(args: {
	env: Env;
	to: string;
	locale: Locale;
	unsubscribeUrl?: string;
}): Promise<void> {
	const tpl = WELCOME_TEMPLATES[args.locale];
	const from = fromAddress(args.env);
	const unsubscribeFooter = args.unsubscribeUrl
		? `<p style="color:#888;font-size:13px;margin-top:24px">${tpl.unsubscribePre} <a href="${args.unsubscribeUrl}" style="color:#888">${tpl.unsubscribeLinkText}</a> ${tpl.unsubscribePost}</p>`
		: '';
	const html = emailLayout(
		`<h1 style="font-size:22px;margin:0 0 16px">${tpl.subject}</h1>
		 <p style="font-size:16px;line-height:1.6;margin:0">${tpl.body}</p>${unsubscribeFooter}`,
		args.locale,
		FROM_NAME,
	);

	await args.env.SEND_EMAIL.send({
		from,
		to: args.to,
		subject: tpl.subject,
		html,
	});
}
