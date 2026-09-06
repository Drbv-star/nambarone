CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (key, value)
VALUES ('version', '1');

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  platform TEXT NOT NULL,
  photo TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  today INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  clicks_today INTEGER NOT NULL DEFAULT 0,
  today_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_listings_total ON listings(total DESC);
CREATE INDEX IF NOT EXISTS idx_listings_today ON listings(today DESC);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER,
  name TEXT NOT NULL,
  bid INTEGER NOT NULL,
  rank INTEGER,
  board TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);

CREATE TABLE IF NOT EXISTS click_guard (
  visitor_id TEXT NOT NULL,
  listing_id INTEGER NOT NULL,
  last_clicked_at INTEGER NOT NULL,
  PRIMARY KEY (visitor_id, listing_id)
);

CREATE TABLE IF NOT EXISTS creators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  platform_handle TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  display_name TEXT,
  photo TEXT,
  verified_at TEXT,
  UNIQUE(platform, platform_handle)
);

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL,
  listing_id INTEGER,
  amount INTEGER NOT NULL,
  payment_provider TEXT NOT NULL,
  payment_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(creator_id) REFERENCES creators(id),
  FOREIGN KEY(listing_id) REFERENCES listings(id)
);

CREATE INDEX IF NOT EXISTS idx_claims_creator ON claims(creator_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

CREATE TABLE IF NOT EXISTS processed_webhooks (
  webhook_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
