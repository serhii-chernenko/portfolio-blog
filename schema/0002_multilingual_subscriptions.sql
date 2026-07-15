-- Migration 0002: multilingual subscription preferences, single-use consent
-- intent, and atomic signup throttling.
--
-- Legacy confirmed subscribers keep only the language stored in `locale`.
-- Expanding them to both independently authored editions without fresh consent
-- would exceed the promise they originally accepted.
--
-- This is an expand/contract migration. The legacy `locale` column and narrow
-- compatibility triggers remain temporarily so the old Worker can run during
-- a short rollout/rollback window. A later migration may remove them.

ALTER TABLE subscribers
	ADD COLUMN communication_locale TEXT CHECK (communication_locale IN ('en', 'uk'));

UPDATE subscribers
SET communication_locale = locale;

ALTER TABLE subscribers ADD COLUMN consent_version INTEGER;
ALTER TABLE subscribers ADD COLUMN consented_at INTEGER;

-- New signup requests stage only what confirmation needs: the service-message
-- locale, a fingerprint of the latest bearer, and its 48-hour expiry. Source,
-- User-Agent, and IP evidence are deliberately not copied into subscriber rows.
ALTER TABLE subscribers ADD COLUMN pending_communication_locale TEXT
	CHECK (pending_communication_locale IN ('en', 'uk'));
ALTER TABLE subscribers ADD COLUMN pending_expires_at INTEGER
	CHECK (pending_expires_at IS NULL OR pending_expires_at > 0);
ALTER TABLE subscribers ADD COLUMN confirmation_token_hash TEXT
	CHECK (
		confirmation_token_hash IS NULL
		OR (
			length(confirmation_token_hash) = 43
			AND pending_communication_locale IS NOT NULL
			AND pending_expires_at IS NOT NULL
		)
	);

-- Legacy pending rows have no trustworthy version-2 intent or token expiry.
-- Keep at most one 48-hour compatibility grace from their original creation
-- time, then minimize never-confirmed rows. A malformed historical lifecycle
-- is retained as suppression instead of being deleted.
DELETE FROM subscribers
WHERE status = 'pending'
	AND created_at <= unixepoch() - (48 * 60 * 60)
	AND confirmed_at IS NULL
	AND unsubscribed_at IS NULL;

UPDATE subscribers
SET status = 'unsubscribed',
	unsubscribed_at = COALESCE(unsubscribed_at, unixepoch())
WHERE status = 'pending'
	AND created_at <= unixepoch() - (48 * 60 * 60)
	AND (confirmed_at IS NOT NULL OR unsubscribed_at IS NOT NULL);

-- Preserve a minimal consent audit for legacy confirmed rows. New
-- confirmations use the current consent version in src/lib/d1.ts.
UPDATE subscribers
SET consent_version = 1,
	consented_at = COALESCE(confirmed_at, created_at)
WHERE status = 'confirmed';

-- Suppressed rows do not need historical abuse-attribution metadata.
UPDATE subscribers
SET source = NULL,
	user_agent = NULL,
	ip_hash = NULL
WHERE status = 'unsubscribed';

CREATE TABLE subscriber_language_preferences (
	subscriber_id INTEGER NOT NULL,
	content_locale TEXT NOT NULL CHECK (content_locale IN ('en', 'uk')),
	enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
	PRIMARY KEY (subscriber_id, content_locale),
	FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);

-- Conservative backfill: pending and globally unsubscribed rows get no enabled
-- preference; a confirmed legacy row gets only its former site language.
INSERT INTO subscriber_language_preferences (subscriber_id, content_locale, enabled)
SELECT id, COALESCE(communication_locale, locale), 1
FROM subscribers
WHERE status = 'confirmed';

CREATE INDEX idx_subscriber_language_delivery
	ON subscriber_language_preferences (content_locale, enabled, subscriber_id);

-- Fixed-window counters are keyed only by domain-separated HMACs (`ip:` and
-- `email:` prefixes plus a 32-byte digest). D1 UPSERT + RETURNING makes each
-- increment atomic; rows expire after ten minutes and are cleaned in bounded
-- batches by normal subscription traffic.
CREATE TABLE subscription_rate_limits (
	key_hash TEXT PRIMARY KEY,
	window_started_at INTEGER NOT NULL,
	attempts INTEGER NOT NULL CHECK (attempts > 0),
	expires_at INTEGER NOT NULL CHECK (expires_at > window_started_at)
) WITHOUT ROWID;

CREATE INDEX idx_subscription_rate_limits_expiry
	ON subscription_rate_limits (expires_at);

-- Compatibility for the old Worker during rollout or emergency rollback.
CREATE TRIGGER subscribers_compat_after_insert
AFTER INSERT ON subscribers
WHEN NEW.communication_locale IS NULL
BEGIN
	UPDATE subscribers
	SET communication_locale = NEW.locale
	WHERE id = NEW.id;
END;

CREATE TRIGGER subscribers_compat_after_locale_update
AFTER UPDATE OF locale ON subscribers
WHEN NEW.communication_locale IS NULL OR NEW.communication_locale <> NEW.locale
BEGIN
	UPDATE subscribers
	SET communication_locale = NEW.locale
	WHERE id = NEW.id;
END;

CREATE TRIGGER subscribers_compat_after_confirm
AFTER UPDATE OF status ON subscribers
WHEN NEW.status = 'confirmed' AND OLD.status <> 'confirmed'
BEGIN
	INSERT INTO subscriber_language_preferences
		(subscriber_id, content_locale, enabled, created_at, updated_at)
	VALUES (
		NEW.id,
		COALESCE(NEW.communication_locale, NEW.locale),
		1,
		unixepoch(),
		unixepoch()
	)
	ON CONFLICT(subscriber_id, content_locale) DO UPDATE SET
		enabled = 1,
		updated_at = excluded.updated_at;

	-- A true old-Worker confirmation has no matching server-side fingerprint and
	-- therefore remains version 1 / one-language. A new-Worker update consumes
	-- the stored fingerprint and has already written the version-2 audit.
	UPDATE subscribers
	SET consent_version = CASE
			WHEN (
					OLD.confirmation_token_hash IS NOT NULL
					AND NEW.confirmation_token_hash IS NULL
				)
				OR NEW.consent_version IS NOT OLD.consent_version
				OR NEW.consented_at IS NOT OLD.consented_at
			THEN NEW.consent_version
			ELSE 1
		END,
		consented_at = CASE
			WHEN (
					OLD.confirmation_token_hash IS NOT NULL
					AND NEW.confirmation_token_hash IS NULL
				)
				OR NEW.consent_version IS NOT OLD.consent_version
				OR NEW.consented_at IS NOT OLD.consented_at
			THEN NEW.consented_at
			ELSE COALESCE(NEW.confirmed_at, unixepoch())
		END,
		confirmation_token_hash = NULL,
		pending_communication_locale = NULL,
		pending_expires_at = NULL
	WHERE id = NEW.id;
END;

CREATE TRIGGER subscribers_compat_after_unsubscribe
AFTER UPDATE OF status ON subscribers
WHEN NEW.status = 'unsubscribed' AND OLD.status <> 'unsubscribed'
BEGIN
	UPDATE subscriber_language_preferences
	SET enabled = 0,
		updated_at = unixepoch()
	WHERE subscriber_id = NEW.id;

	UPDATE subscribers
	SET source = NULL,
		user_agent = NULL,
		ip_hash = NULL,
		confirmation_token_hash = NULL,
		pending_communication_locale = NULL,
		pending_expires_at = NULL
	WHERE id = NEW.id;
END;
