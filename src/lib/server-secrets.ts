type ServerEnv = typeof import('astro:env/server');

export interface DraftModeSecrets {
	readToken: string;
	cookieSecret: string;
}

export interface TelegramCredentials {
	botToken: string;
	chatId: string;
}

const MIN_DRAFT_MODE_COOKIE_SECRET_LENGTH = 32;

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

export async function getDraftModeSecrets(): Promise<DraftModeSecrets | null> {
	const env = await loadServerEnv();
	const readToken = env?.SANITY_API_READ_TOKEN;
	const cookieSecret = env?.DRAFT_MODE_COOKIE_SECRET;
	if (!readToken || !cookieSecret) return null;
	if (cookieSecret.length < MIN_DRAFT_MODE_COOKIE_SECRET_LENGTH) return null;
	return { readToken, cookieSecret };
}

export async function getSanityWebhookSecret(): Promise<string | null> {
	const env = await loadServerEnv();
	return env?.SANITY_WEBHOOK_SECRET || null;
}

export async function getTelegramCredentials(): Promise<TelegramCredentials | null> {
	const env = await loadServerEnv();
	const botToken = env?.TELEGRAM_BOT_TOKEN;
	const chatId = env?.TELEGRAM_CHAT_ID;
	return botToken && chatId ? { botToken, chatId } : null;
}
