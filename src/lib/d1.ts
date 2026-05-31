import { env } from 'cloudflare:workers';

export function getDB(): D1Database {
	if (!env.DB) {
		throw new Error('D1 binding "DB" is not available');
	}
	return env.DB;
}

export function getKV(binding: 'RATE_LIMIT'): KVNamespace {
	const kv = env[binding] as KVNamespace | undefined;
	if (!kv) {
		throw new Error(`KV binding "${binding}" is not available`);
	}
	return kv;
}

export interface SubscriberRow {
	id: number;
	email: string;
	locale: 'en' | 'uk';
	status: 'pending' | 'confirmed' | 'unsubscribed';
	created_at: number;
	confirmed_at: number | null;
	unsubscribed_at: number | null;
	source: string | null;
	user_agent: string | null;
	ip_hash: string | null;
}

export async function upsertPendingSubscriber(
	db: D1Database,
	row: {
		email: string;
		locale: 'en' | 'uk';
		source?: string;
		user_agent?: string;
		ip_hash?: string;
	},
): Promise<SubscriberRow> {
	await db
		.prepare(
			`INSERT INTO subscribers (email, locale, status, source, user_agent, ip_hash)
			 VALUES (?, ?, 'pending', ?, ?, ?)
			 ON CONFLICT(email) DO UPDATE SET
			   locale = excluded.locale,
			   status = CASE
			     WHEN subscribers.status = 'unsubscribed' THEN 'pending'
			     ELSE subscribers.status
			   END,
			   source = excluded.source,
			   user_agent = excluded.user_agent,
			   ip_hash = excluded.ip_hash`,
		)
		.bind(row.email, row.locale, row.source ?? null, row.user_agent ?? null, row.ip_hash ?? null)
		.run();

	const result = await db
		.prepare('SELECT * FROM subscribers WHERE email = ?')
		.bind(row.email)
		.first<SubscriberRow>();
	if (!result) throw new Error('Failed to read back subscriber');
	return result;
}

export async function markConfirmed(db: D1Database, email: string): Promise<void> {
	await db
		.prepare(
			`UPDATE subscribers
			 SET status = 'confirmed', confirmed_at = unixepoch()
			 WHERE email = ? AND status = 'pending'`,
		)
		.bind(email)
		.run();
}

export async function markUnsubscribed(db: D1Database, email: string): Promise<void> {
	await db
		.prepare(
			`UPDATE subscribers
			 SET status = 'unsubscribed', unsubscribed_at = unixepoch()
			 WHERE email = ?`,
		)
		.bind(email)
		.run();
}
