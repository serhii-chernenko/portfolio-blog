-- Migration 0001: subscribers table
CREATE TABLE subscribers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL UNIQUE,
	locale TEXT NOT NULL CHECK (locale IN ('en', 'uk')),
	status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
	confirmed_at INTEGER,
	unsubscribed_at INTEGER,
	source TEXT,
	user_agent TEXT,
	ip_hash TEXT
);

CREATE INDEX idx_subscribers_status ON subscribers(status);
CREATE INDEX idx_subscribers_email ON subscribers(email);
