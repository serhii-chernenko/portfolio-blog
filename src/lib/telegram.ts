import { getTelegramCredentials } from './server-secrets';

type ParseMode = 'HTML' | 'Markdown';

export async function notify(text: string, parseMode: ParseMode = 'HTML'): Promise<void> {
	const credentials = await getTelegramCredentials();
	if (!credentials) return;
	try {
		const res = await fetch(`https://api.telegram.org/bot${credentials.botToken}/sendMessage`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				chat_id: credentials.chatId,
				text,
				parse_mode: parseMode,
				disable_web_page_preview: true,
			}),
		});
		if (!res.ok) {
			console.warn(
				JSON.stringify({
					message: 'Telegram notification failed',
					reason: 'http_status',
					status: res.status,
				}),
			);
		}
	} catch {
		// Telegram is observability only. Never let a network exception change a
		// committed subscription result, and never log the bot URL, token, or text.
		console.warn(
			JSON.stringify({
				message: 'Telegram notification failed',
				reason: 'network_error',
			}),
		);
	}
}
