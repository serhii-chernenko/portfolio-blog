import { env } from 'cloudflare:workers';
import type { Locale } from '../i18n/config';
import {
	CLEAR_EXPIRED_PENDING_INTENTS_SQL,
	DELETE_EXPIRED_NEVER_CONFIRMED_SQL,
	DISABLE_EXPIRED_SUPPRESSION_PREFERENCES_SQL,
	LEGACY_PENDING_GRACE_SECONDS,
	UPSERT_PENDING_SUBSCRIBER_SQL,
} from './subscription-cleanup-sql';

export const CURRENT_CONSENT_VERSION = 2;

export type ContentLocale = Locale;
export type PreferenceAction = ContentLocale | 'all' | 'subscribe_all';

export function getDB(): D1Database {
	if (!env.DB) {
		throw new Error('D1 binding "DB" is not available');
	}
	return env.DB;
}

const SUBSCRIBE_RATE_LIMIT_ATTEMPTS = 3;
const SUBSCRIBE_RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const OPPORTUNISTIC_CLEANUP_LIMIT = 100;

export interface SubscriberRow {
	id: number;
	email: string;
	communication_locale: Locale;
	status: 'pending' | 'confirmed' | 'unsubscribed';
	created_at: number;
	confirmed_at: number | null;
	unsubscribed_at: number | null;
	consent_version: number | null;
	consented_at: number | null;
	source: string | null;
	user_agent: string | null;
	ip_hash: string | null;
}

export interface SubscriberPreferences {
	subscriber: SubscriberRow;
	languages: Record<ContentLocale, boolean>;
}

export interface DeliveryRecipient {
	email: string;
	communication_locale: Locale;
}

interface PreferenceSummaryRow extends SubscriberRow {
	en_enabled: number;
	uk_enabled: number;
}

export interface SubscriberPreferenceTransition {
	before: SubscriberPreferences;
	after: SubscriberPreferences;
}

interface RateLimitRow {
	attempts: number;
	expires_at: number;
}

export interface SubscribeRateLimitResult {
	allowed: boolean;
	retryAfterSeconds: number;
}

function assertD1Success(result: D1Result<unknown>, operation: string): void {
	if (!(result as D1Result<unknown> & { success?: boolean }).success) {
		throw new Error(`D1 operation failed: ${operation}`);
	}
}

function changes(result: D1Result<unknown>): number {
	const value = result.meta.changes;
	return typeof value === 'number' ? value : 0;
}

export async function upsertPendingSubscriber(
	db: D1Database,
	row: {
		email: string;
		communication_locale: Locale;
		confirmation_token_hash: string;
		pending_expires_at: number;
	},
): Promise<void> {
	const write = await db
		.prepare(UPSERT_PENDING_SUBSCRIBER_SQL)
		.bind(
			row.email,
			row.communication_locale,
			row.communication_locale,
			row.confirmation_token_hash,
			row.communication_locale,
			row.pending_expires_at,
		)
		.run();
	assertD1Success(write, 'upsert pending subscriber');
}

function rateLimitStatement(db: D1Database, keyHash: string, now: number): D1PreparedStatement {
	const expiresAt = now + SUBSCRIBE_RATE_LIMIT_WINDOW_SECONDS;
	return db
		.prepare(
			`INSERT INTO subscription_rate_limits
			   (key_hash, window_started_at, attempts, expires_at)
			 VALUES (?, ?, 1, ?)
			 ON CONFLICT(key_hash) DO UPDATE SET
			   window_started_at = CASE
			     WHEN subscription_rate_limits.expires_at <= excluded.window_started_at
			     THEN excluded.window_started_at
			     ELSE subscription_rate_limits.window_started_at
			   END,
			   attempts = CASE
			     WHEN subscription_rate_limits.expires_at <= excluded.window_started_at THEN 1
			     WHEN subscription_rate_limits.attempts <= ? THEN subscription_rate_limits.attempts + 1
			     ELSE subscription_rate_limits.attempts
			   END,
			   expires_at = CASE
			     WHEN subscription_rate_limits.expires_at <= excluded.window_started_at
			     THEN excluded.expires_at
			     ELSE subscription_rate_limits.expires_at
			   END
			 RETURNING attempts, expires_at`,
		)
		.bind(keyHash, now, expiresAt, SUBSCRIBE_RATE_LIMIT_ATTEMPTS);
}

/**
 * Atomically consumes both the IP and address fixed-window limits. Keys are
 * domain-separated HMACs; neither raw value is written to D1. A bounded expiry
 * cleanup rides along in the same transactional D1 batch.
 */
export async function consumeSubscribeRateLimit(
	db: D1Database,
	keys: { ipHash: string; emailHash: string },
	now = Math.floor(Date.now() / 1000),
): Promise<SubscribeRateLimitResult> {
	const results = await db.batch<RateLimitRow>([
		db
			.prepare(
				`DELETE FROM subscription_rate_limits
				 WHERE key_hash IN (
				   SELECT key_hash
				   FROM subscription_rate_limits
				   WHERE expires_at <= ?
				   ORDER BY expires_at
				   LIMIT ?
				 )`,
			)
			.bind(now, OPPORTUNISTIC_CLEANUP_LIMIT),
		rateLimitStatement(db, `ip:${keys.ipHash}`, now),
		rateLimitStatement(db, `email:${keys.emailHash}`, now),
	]);
	results.forEach((result, index) => assertD1Success(result, `consume rate limit (${index})`));

	const rows = [results[1]!.results[0], results[2]!.results[0]];
	if (rows.some((row) => !row)) throw new Error('Rate-limit UPSERT returned no state');
	const populatedRows = rows.filter((row): row is RateLimitRow => row !== undefined);
	const allowed = populatedRows.every((row) => row.attempts <= SUBSCRIBE_RATE_LIMIT_ATTEMPTS);
	const retryAfterSeconds = allowed
		? 0
		: Math.max(1, ...populatedRows.map((row) => row.expires_at - now));
	return { allowed, retryAfterSeconds };
}

/**
 * Removes expired unconfirmed rows and clears expired staged intent on durable
 * subscriber records. Work is bounded so public requests cannot trigger an
 * unbounded maintenance query.
 */
export async function cleanupExpiredPendingIntents(
	db: D1Database,
	now = Math.floor(Date.now() / 1000),
): Promise<void> {
	const legacyCutoff = now - LEGACY_PENDING_GRACE_SECONDS;
	const results = await db.batch([
		db
			.prepare(DELETE_EXPIRED_NEVER_CONFIRMED_SQL)
			.bind(now, legacyCutoff, OPPORTUNISTIC_CLEANUP_LIMIT),
		db
			.prepare(DISABLE_EXPIRED_SUPPRESSION_PREFERENCES_SQL)
			.bind(now, now, legacyCutoff, OPPORTUNISTIC_CLEANUP_LIMIT),
		db
			.prepare(CLEAR_EXPIRED_PENDING_INTENTS_SQL)
			.bind(now, now, legacyCutoff, OPPORTUNISTIC_CLEANUP_LIMIT),
	]);
	results.forEach((result, index) =>
		assertD1Success(result, `cleanup expired confirmation intent (${index})`),
	);
}

export async function getSubscriberPreferences(
	db: D1Database,
	email: string,
): Promise<SubscriberPreferences | null> {
	const row = await subscriberPreferencesStatement(db, email).first<PreferenceSummaryRow>();

	return row ? preferencesFromRow(row) : null;
}

function subscriberPreferencesStatement(db: D1Database, email: string): D1PreparedStatement {
	return db
		.prepare(
			`SELECT s.id,
			        s.email,
			        COALESCE(s.communication_locale, s.locale) AS communication_locale,
			        s.status,
			        s.created_at,
			        s.confirmed_at,
			        s.unsubscribed_at,
			        s.consent_version,
			        s.consented_at,
			        s.source,
			        s.user_agent,
			        s.ip_hash,
			        COALESCE(MAX(CASE WHEN p.content_locale = 'en' THEN p.enabled END), 0) AS en_enabled,
			        COALESCE(MAX(CASE WHEN p.content_locale = 'uk' THEN p.enabled END), 0) AS uk_enabled
			 FROM subscribers s
			 LEFT JOIN subscriber_language_preferences p ON p.subscriber_id = s.id
			 WHERE s.email = ?
			 GROUP BY s.id`,
		)
		.bind(email);
}

function preferencesFromRow(row: PreferenceSummaryRow): SubscriberPreferences {
	const { en_enabled, uk_enabled, ...subscriber } = row;
	return {
		subscriber,
		languages: { en: en_enabled === 1, uk: uk_enabled === 1 },
	};
}

function preferencesFromResult(
	result: D1Result<PreferenceSummaryRow>,
): SubscriberPreferences | null {
	const row = result.results[0];
	return row ? preferencesFromRow(row) : null;
}

function enableLanguageStatement(
	db: D1Database,
	email: string,
	contentLocale: ContentLocale,
	enabled: boolean,
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO subscriber_language_preferences
			   (subscriber_id, content_locale, enabled, created_at, updated_at)
			 SELECT id, ?, ?, unixepoch(), unixepoch()
			 FROM subscribers
			 WHERE email = ?
			 ON CONFLICT(subscriber_id, content_locale) DO UPDATE SET
			   enabled = excluded.enabled,
			   updated_at = excluded.updated_at
			 WHERE subscriber_language_preferences.enabled <> excluded.enabled`,
		)
		.bind(contentLocale, enabled ? 1 : 0, email);
}

function confirmLanguageStatement(
	db: D1Database,
	email: string,
	confirmationTokenHash: string,
	contentLocale: ContentLocale,
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO subscriber_language_preferences
			   (subscriber_id, content_locale, enabled, created_at, updated_at)
			 SELECT id, ?, 1, unixepoch(), unixepoch()
			 FROM subscribers
			 WHERE email = ?
			   AND confirmation_token_hash = ?
			   AND pending_expires_at >= unixepoch()
			 ON CONFLICT(subscriber_id, content_locale) DO UPDATE SET
			   enabled = excluded.enabled,
			   updated_at = excluded.updated_at
			 WHERE subscriber_language_preferences.enabled <> excluded.enabled`,
		)
		.bind(contentLocale, email, confirmationTokenHash);
}

/**
 * Completes double opt-in and enables every currently supported content
 * language in one atomic D1 batch. The conditional update makes repeat visits
 * idempotent and lets callers avoid duplicate welcome messages.
 */
export async function confirmSubscriberAndEnableAll(
	db: D1Database,
	email: string,
	confirmationTokenHash: string,
): Promise<{ preferences: SubscriberPreferences; changed: boolean } | null> {
	const results = await db.batch<PreferenceSummaryRow>([
		subscriberPreferencesStatement(db, email),
		// Preference writes run before the subscriber update consumes the intent.
		// D1 executes a batch sequentially and atomically, so concurrent replays
		// cannot pass this predicate after the first batch commits.
		confirmLanguageStatement(db, email, confirmationTokenHash, 'en'),
		confirmLanguageStatement(db, email, confirmationTokenHash, 'uk'),
		db
			.prepare(
				`UPDATE subscribers
				 SET status = 'confirmed',
				     locale = COALESCE(pending_communication_locale, communication_locale, locale),
				     communication_locale = COALESCE(pending_communication_locale, communication_locale, locale),
				     confirmed_at = COALESCE(confirmed_at, unixepoch()),
				     unsubscribed_at = NULL,
				     consent_version = ?,
				     consented_at = unixepoch(),
				     confirmation_token_hash = NULL,
				     pending_communication_locale = NULL,
				     pending_expires_at = NULL
				 WHERE email = ?
				   AND confirmation_token_hash = ?
				   AND pending_expires_at >= unixepoch()`,
			)
			.bind(CURRENT_CONSENT_VERSION, email, confirmationTokenHash),
		subscriberPreferencesStatement(db, email),
	]);

	results.forEach((result, index) => assertD1Success(result, `confirm subscriber (${index})`));

	// The final statement is the single-use consume. A zero-change result means
	// that this otherwise valid signed link is stale, superseded, or replayed.
	// Do not report success or trigger welcome/analytics in that case.
	const accepted = changes(results[3]!) > 0;
	if (!accepted) return null;

	const before = preferencesFromResult(results[0]!);
	const preferences = preferencesFromResult(results[4]!);
	if (!before) throw new Error('Confirmed subscriber was missing before atomic batch');
	if (!preferences) throw new Error('Confirmed subscriber disappeared after atomic batch');

	return {
		preferences,
		changed: true,
	};
}

function reconcileSubscriberStatusStatement(db: D1Database, email: string): D1PreparedStatement {
	return db
		.prepare(
			`UPDATE subscribers
			 SET status = CASE
			       WHEN EXISTS (
			         SELECT 1 FROM subscriber_language_preferences p
			         WHERE p.subscriber_id = subscribers.id AND p.enabled = 1
			       ) THEN 'confirmed'
			       ELSE 'unsubscribed'
			     END,
			     unsubscribed_at = CASE
			       WHEN EXISTS (
			         SELECT 1 FROM subscriber_language_preferences p
			         WHERE p.subscriber_id = subscribers.id AND p.enabled = 1
			       ) THEN NULL
			       ELSE COALESCE(unsubscribed_at, unixepoch())
			     END,
			     source = CASE
			       WHEN EXISTS (
			         SELECT 1 FROM subscriber_language_preferences p
			         WHERE p.subscriber_id = subscribers.id AND p.enabled = 1
			       ) THEN source ELSE NULL END,
			     user_agent = CASE
			       WHEN EXISTS (
			         SELECT 1 FROM subscriber_language_preferences p
			         WHERE p.subscriber_id = subscribers.id AND p.enabled = 1
			       ) THEN user_agent ELSE NULL END,
			     ip_hash = CASE
			       WHEN EXISTS (
			         SELECT 1 FROM subscriber_language_preferences p
			         WHERE p.subscriber_id = subscribers.id AND p.enabled = 1
			       ) THEN ip_hash ELSE NULL END,
			     confirmation_token_hash = NULL,
			     pending_communication_locale = NULL,
			     pending_expires_at = NULL
			 WHERE email = ?`,
		)
		.bind(email);
}

/** Applies a signed preference action atomically and returns the resulting state. */
export async function applySubscriberPreferenceAction(
	db: D1Database,
	email: string,
	action: PreferenceAction,
): Promise<SubscriberPreferenceTransition | null> {
	let statements: D1PreparedStatement[];

	if (action === 'subscribe_all') {
		statements = [
			db
				.prepare(
					`UPDATE subscribers
						 SET status = 'confirmed',
						     confirmed_at = COALESCE(confirmed_at, unixepoch()),
						     unsubscribed_at = NULL,
						     consent_version = ?,
						     consented_at = unixepoch(),
						     confirmation_token_hash = NULL,
						     pending_communication_locale = NULL,
						     pending_expires_at = NULL
						 WHERE email = ?
						   AND (
						     status <> 'confirmed'
						     OR unsubscribed_at IS NOT NULL
						     OR consent_version IS NULL
						     OR consent_version <> ?
						     OR confirmation_token_hash IS NOT NULL
						     OR (
					       SELECT COUNT(*)
					       FROM subscriber_language_preferences p
					       WHERE p.subscriber_id = subscribers.id
					         AND p.content_locale IN ('en', 'uk')
					         AND p.enabled = 1
					     ) <> 2
					   )`,
				)
				.bind(CURRENT_CONSENT_VERSION, email, CURRENT_CONSENT_VERSION),
			enableLanguageStatement(db, email, 'en', true),
			enableLanguageStatement(db, email, 'uk', true),
		];
	} else {
		const languages: ContentLocale[] = action === 'all' ? ['en', 'uk'] : [action];
		statements = [
			...languages.map((contentLocale) => enableLanguageStatement(db, email, contentLocale, false)),
			reconcileSubscriberStatusStatement(db, email),
		];
	}

	const results = await db.batch<PreferenceSummaryRow>([
		subscriberPreferencesStatement(db, email),
		...statements,
		subscriberPreferencesStatement(db, email),
	]);
	results.forEach((result, index) =>
		assertD1Success(result, `apply subscriber preference (${index})`),
	);

	const before = preferencesFromResult(results[0]!);
	const after = preferencesFromResult(results[results.length - 1]!);
	return before && after ? { before, after } : null;
}

/** Provider-agnostic audience query for a future article delivery pipeline. */
export async function getConfirmedRecipientsForLanguage(
	db: D1Database,
	contentLocale: ContentLocale,
): Promise<DeliveryRecipient[]> {
	const result = await db
		.prepare(
			`SELECT s.email, COALESCE(s.communication_locale, s.locale) AS communication_locale
			 FROM subscriber_language_preferences p
			 JOIN subscribers s ON s.id = p.subscriber_id
			 WHERE p.content_locale = ?
			   AND p.enabled = 1
			   AND s.status = 'confirmed'
			 ORDER BY s.id`,
		)
		.bind(contentLocale)
		.all<DeliveryRecipient>();
	assertD1Success(result, 'select language recipients');
	return result.results;
}
