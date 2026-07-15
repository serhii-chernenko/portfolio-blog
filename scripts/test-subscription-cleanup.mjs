import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
	CLEAR_EXPIRED_PENDING_INTENTS_SQL,
	DELETE_EXPIRED_NEVER_CONFIRMED_SQL,
	DISABLE_EXPIRED_SUPPRESSION_PREFERENCES_SQL,
	LEGACY_PENDING_GRACE_SECONDS,
	UPSERT_PENDING_SUBSCRIBER_SQL,
} from '../src/lib/subscription-cleanup-sql.ts';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec(readFileSync(new URL('../schema/0001_init.sql', import.meta.url), 'utf8'));

const now = Math.floor(Date.now() / 1000);
const insertLegacy = db.prepare(`INSERT INTO subscribers
	(email, locale, status, created_at, confirmed_at, unsubscribed_at)
	VALUES (?, 'en', 'pending', ?, ?, ?)`);
insertLegacy.run('old-pending@example.test', now - LEGACY_PENDING_GRACE_SECONDS - 1, null, null);
insertLegacy.run('recent-pending@example.test', now, null, null);
insertLegacy.run(
	'historical-pending@example.test',
	now - LEGACY_PENDING_GRACE_SECONDS - 1,
	now - 100,
	now - 50,
);

db.exec(
	readFileSync(new URL('../schema/0002_multilingual_subscriptions.sql', import.meta.url), 'utf8'),
);
assert.equal(
	db
		.prepare(`SELECT COUNT(*) AS n FROM subscribers WHERE email = ?`)
		.get('old-pending@example.test').n,
	0,
	'migration removes a legacy never-confirmed row after its 48-hour grace',
);
assert.equal(
	db.prepare(`SELECT status FROM subscribers WHERE email = ?`).get('recent-pending@example.test')
		.status,
	'pending',
	'migration preserves a recent legacy pending row only for the bounded grace',
);
assert.equal(
	db
		.prepare(`SELECT status FROM subscribers WHERE email = ?`)
		.get('historical-pending@example.test').status,
	'unsubscribed',
	'migration retains historical pending data as durable suppression',
);

function cleanup(at) {
	const cutoff = at - LEGACY_PENDING_GRACE_SECONDS;
	db.exec('BEGIN IMMEDIATE');
	try {
		db.prepare(DELETE_EXPIRED_NEVER_CONFIRMED_SQL).run(at, cutoff, 100);
		db.prepare(DISABLE_EXPIRED_SUPPRESSION_PREFERENCES_SQL).run(at, at, cutoff, 100);
		db.prepare(CLEAR_EXPIRED_PENDING_INTENTS_SQL).run(at, at, cutoff, 100);
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}

cleanup(now + LEGACY_PENDING_GRACE_SECONDS + 1);
assert.equal(
	db
		.prepare(`SELECT COUNT(*) AS n FROM subscribers WHERE email = ?`)
		.get('recent-pending@example.test').n,
	0,
	'runtime cleanup does not retain a legacy null-expiry row indefinitely',
);

const suppressedEmail = 'suppressed@example.test';
db.prepare(
	`INSERT INTO subscribers
	(email, locale, communication_locale, status, created_at, confirmed_at,
	 unsubscribed_at, consent_version, consented_at)
	VALUES (?, 'uk', 'uk', 'unsubscribed', ?, ?, ?, 2, ?)`,
).run(suppressedEmail, now - 1_000, now - 900, now - 800, now - 900);
const suppressedId = db
	.prepare(`SELECT id FROM subscribers WHERE email = ?`)
	.get(suppressedEmail).id;
db.prepare(
	`INSERT INTO subscriber_language_preferences
	(subscriber_id, content_locale, enabled) VALUES (?, 'en', 0), (?, 'uk', 0)`,
).run(suppressedId, suppressedId);

const upsert = db.prepare(UPSERT_PENDING_SUBSCRIBER_SQL);
const intentExpiry = now + 100;
upsert.run(suppressedEmail, 'en', 'en', 'x'.repeat(43), 'en', intentExpiry);
assert.equal(
	db.prepare(`SELECT status FROM subscribers WHERE email = ?`).get(suppressedEmail).status,
	'unsubscribed',
	'an anonymous re-subscribe request must not remove durable suppression before confirmation',
);

// Simulate a row already relabelled by the previously deployed regression.
// Cleanup must repair it rather than treating it as disposable new pending.
db.prepare(`UPDATE subscribers SET status = 'pending' WHERE email = ?`).run(suppressedEmail);
db.prepare(
	`UPDATE subscriber_language_preferences SET enabled = 1 WHERE subscriber_id = ? AND content_locale = 'en'`,
).run(suppressedId);
cleanup(intentExpiry + 1);
const suppressed = db
	.prepare(
		`SELECT status, unsubscribed_at, confirmation_token_hash, pending_expires_at
		FROM subscribers WHERE email = ?`,
	)
	.get(suppressedEmail);
assert.equal(suppressed.status, 'unsubscribed');
assert.equal(
	suppressed.unsubscribed_at,
	now - 800,
	'the original unsubscribe timestamp is retained',
);
assert.equal(suppressed.confirmation_token_hash, null);
assert.equal(suppressed.pending_expires_at, null);
assert.equal(
	db
		.prepare(
			`SELECT COUNT(*) AS n FROM subscriber_language_preferences
		WHERE subscriber_id = ? AND enabled <> 0`,
		)
		.get(suppressedId).n,
	0,
	'suppressed preferences remain disabled',
);

const newEmail = 'never-confirmed@example.test';
upsert.run(newEmail, 'en', 'en', 'y'.repeat(43), 'en', intentExpiry);
cleanup(intentExpiry + 1);
assert.equal(
	db.prepare(`SELECT COUNT(*) AS n FROM subscribers WHERE email = ?`).get(newEmail).n,
	0,
	'a brand-new never-confirmed row is minimized after intent expiry',
);

console.log('subscription cleanup regression tests passed');
