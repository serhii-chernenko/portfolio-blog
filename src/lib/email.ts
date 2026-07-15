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

import { env } from 'cloudflare:workers';
import type { Locale } from '../i18n/config';
import confirmEn from '../emails/confirm-en.json' with { type: 'json' };
import confirmUk from '../emails/confirm-uk.json' with { type: 'json' };
import welcomeEn from '../emails/welcome-en.json' with { type: 'json' };
import welcomeUk from '../emails/welcome-uk.json' with { type: 'json' };
import { renderEmailTemplate } from './email-template-variables';

const DEFAULT_FROM = 'hello@serhiichernenko.com';
const FROM_NAME = 'Chernenko · Blog';

interface EmailTemplateFile {
	subject: string;
	html: string;
	text: string;
}

const CONFIRM: Record<Locale, EmailTemplateFile> = {
	en: confirmEn,
	uk: confirmUk,
};

const WELCOME: Record<Locale, EmailTemplateFile> = {
	en: welcomeEn,
	uk: welcomeUk,
};

function fromAddress(): string {
	const addr = env.MAIL_FROM || DEFAULT_FROM;
	return `${FROM_NAME} <${addr}>`;
}

export async function sendConfirmation(args: {
	to: string;
	locale: Locale;
	confirmUrl: string;
	privacyUrl: string;
}): Promise<void> {
	const sendEmail = env.SEND_EMAIL;
	if (!sendEmail) {
		throw new Error('Email binding "SEND_EMAIL" is not available');
	}
	const tpl = CONFIRM[args.locale];
	const { html, text } = renderEmailTemplate(`confirm-${args.locale}`, tpl, {
		confirmUrl: args.confirmUrl,
		privacyUrl: args.privacyUrl,
	});

	await sendEmail.send({
		from: fromAddress(),
		to: args.to,
		subject: tpl.subject,
		html,
		text,
	});
}

export async function sendWelcome(args: {
	to: string;
	locale: Locale;
	manageUrl: string;
	globalOneClickUrl: string;
	privacyUrl: string;
}): Promise<void> {
	const sendEmail = env.SEND_EMAIL;
	if (!sendEmail) {
		throw new Error('Email binding "SEND_EMAIL" is not available');
	}
	const tpl = WELCOME[args.locale];
	const { html, text } = renderEmailTemplate(`welcome-${args.locale}`, tpl, {
		manageUrl: args.manageUrl,
		privacyUrl: args.privacyUrl,
	});

	await sendEmail.send({
		from: fromAddress(),
		to: args.to,
		subject: tpl.subject,
		html,
		text,
		headers: {
			'List-Unsubscribe': `<${args.globalOneClickUrl}>`,
			'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
		},
	});
}
