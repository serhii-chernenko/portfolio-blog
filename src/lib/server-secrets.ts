type ServerEnv = typeof import('astro:env/server');

export interface TelegramCredentials {
	botToken: string;
	chatId: string;
}

let serverEnv: Promise<ServerEnv | null> | undefined;

/**
 * Evaluating `astro:env/server` validates every declared secret at once, so a static import
 * would let one unrelated invalid secret fail every route that imports it. Loading it on demand
 * confines that failure to the feature that actually needs a secret.
 */
function loadServerEnv(): Promise<ServerEnv | null> {
	serverEnv ??= import('astro:env/server').catch((error: unknown) => {
		console.error(
			JSON.stringify({
				message: 'Server secrets failed validation',
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return null;
	});
	return serverEnv;
}

export async function getTelegramCredentials(): Promise<TelegramCredentials | null> {
	const env = await loadServerEnv();
	const botToken = env?.TELEGRAM_BOT_TOKEN;
	const chatId = env?.TELEGRAM_CHAT_ID;
	return botToken && chatId ? { botToken, chatId } : null;
}
