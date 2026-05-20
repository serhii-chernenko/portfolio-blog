type ParseMode = 'HTML' | 'Markdown';

export async function notify(
	env: Pick<Env, 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_CHAT_ID'>,
	text: string,
	parseMode: ParseMode = 'HTML',
): Promise<void> {
	if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
	const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			chat_id: env.TELEGRAM_CHAT_ID,
			text,
			parse_mode: parseMode,
			disable_web_page_preview: true,
		}),
	});
	if (!res.ok) {
		// Don't throw — telegram is best-effort
		console.warn(`Telegram notify failed: ${res.status}`);
	}
}

export function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}
