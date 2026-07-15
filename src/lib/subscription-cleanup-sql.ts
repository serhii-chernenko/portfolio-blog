export const LEGACY_PENDING_GRACE_SECONDS = 48 * 60 * 60;

// A current intent expires at pending_expires_at. Old-Worker rows created
// during the migration overlap have no expiry/fingerprint; they receive one
// conservative 48-hour grace measured from row creation, then expire too.
const EXPIRED_INTENT_PREDICATE = `(
	(pending_expires_at IS NOT NULL AND pending_expires_at <= ?)
	OR (
		pending_expires_at IS NULL
		AND status = 'pending'
		AND confirmation_token_hash IS NULL
		AND created_at <= ?
	)
)`;

const HAS_SUPPRESSION_HISTORY = `(
	confirmed_at IS NOT NULL
	OR consent_version IS NOT NULL
	OR consented_at IS NOT NULL
	OR unsubscribed_at IS NOT NULL
)`;

export const UPSERT_PENDING_SUBSCRIBER_SQL = `INSERT INTO subscribers
	(email, locale, communication_locale, status,
	 confirmation_token_hash, pending_communication_locale, pending_expires_at)
VALUES (?, ?, ?, 'pending', ?, ?, ?)
ON CONFLICT(email) DO UPDATE SET
	confirmation_token_hash = excluded.confirmation_token_hash,
	pending_communication_locale = excluded.pending_communication_locale,
	pending_expires_at = excluded.pending_expires_at`;

export const DELETE_EXPIRED_NEVER_CONFIRMED_SQL = `DELETE FROM subscribers
WHERE id IN (
	SELECT id FROM subscribers
	WHERE status = 'pending'
		AND confirmed_at IS NULL
		AND consent_version IS NULL
		AND consented_at IS NULL
		AND unsubscribed_at IS NULL
		AND ${EXPIRED_INTENT_PREDICATE}
	ORDER BY COALESCE(pending_expires_at, created_at)
	LIMIT ?
)`;

export const DISABLE_EXPIRED_SUPPRESSION_PREFERENCES_SQL = `UPDATE subscriber_language_preferences
SET enabled = 0,
	updated_at = ?
WHERE subscriber_id IN (
	SELECT id FROM subscribers
	WHERE status IN ('pending', 'unsubscribed')
		AND ${HAS_SUPPRESSION_HISTORY}
		AND ${EXPIRED_INTENT_PREDICATE}
	ORDER BY COALESCE(pending_expires_at, created_at)
	LIMIT ?
)`;

export const CLEAR_EXPIRED_PENDING_INTENTS_SQL = `UPDATE subscribers
SET status = CASE
		WHEN status = 'pending' AND ${HAS_SUPPRESSION_HISTORY} THEN 'unsubscribed'
		ELSE status
	END,
	unsubscribed_at = CASE
		WHEN status = 'pending' AND ${HAS_SUPPRESSION_HISTORY}
		THEN COALESCE(unsubscribed_at, ?)
		ELSE unsubscribed_at
	END,
	confirmation_token_hash = NULL,
	pending_communication_locale = NULL,
	pending_expires_at = NULL
WHERE id IN (
	SELECT id FROM subscribers
	WHERE ${EXPIRED_INTENT_PREDICATE}
	ORDER BY COALESCE(pending_expires_at, created_at)
	LIMIT ?
)`;
