/**
 * Cloudflare Email Service — outbound email via the `send_email` Worker binding.
 *
 * Template bodies live in `src/emails/{slug}.json` and are edited locally
 * through the admin UI at `/admin/emails` (see docs/EMAILS.md). They are
 * statically imported here so they ship in the Worker bundle — the Worker
 * runtime has no filesystem, so on-disk reads aren't an option.
 *
 * Wrangler binding: see `send_email` section in wrangler.jsonc.
 * Sender address: configured via the `MAIL_FROM` env var (default: hello@serhiichernenko.com).
 */

import type { Locale } from '../i18n/config';
import confirmEn from '../emails/confirm-en.json' with { type: 'json' };
import confirmUk from '../emails/confirm-uk.json' with { type: 'json' };
import welcomeEn from '../emails/welcome-en.json' with { type: 'json' };
import welcomeUk from '../emails/welcome-uk.json' with { type: 'json' };

const DEFAULT_FROM = 'hello@serhiichernenko.com';
const FROM_NAME = 'Chernenko · Blog';

interface EmailTemplateFile {
	subject: string;
	html: string;
}

const CONFIRM: Record<Locale, EmailTemplateFile> = {
	en: confirmEn,
	uk: confirmUk,
};

const WELCOME: Record<Locale, EmailTemplateFile> = {
	en: welcomeEn,
	uk: welcomeUk,
};

function fromAddress(env: Env): string {
	const addr = env.MAIL_FROM || DEFAULT_FROM;
	return `${FROM_NAME} <${addr}>`;
}

function applyVars(html: string, vars: Record<string, string>): string {
	return html.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
		Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
	);
}

export async function sendConfirmation(args: {
	env: Env;
	to: string;
	locale: Locale;
	confirmUrl: string;
}): Promise<void> {
	const tpl = CONFIRM[args.locale];
	const html = applyVars(tpl.html, { confirmUrl: args.confirmUrl });

	await args.env.SEND_EMAIL.send({
		from: fromAddress(args.env),
		to: args.to,
		subject: tpl.subject,
		html,
	});
}

export async function sendWelcome(args: {
	env: Env;
	to: string;
	locale: Locale;
	unsubscribeUrl: string;
}): Promise<void> {
	const tpl = WELCOME[args.locale];
	const html = applyVars(tpl.html, { unsubscribeUrl: args.unsubscribeUrl });

	await args.env.SEND_EMAIL.send({
		from: fromAddress(args.env),
		to: args.to,
		subject: tpl.subject,
		html,
	});
}
