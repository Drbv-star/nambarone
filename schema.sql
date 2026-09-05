CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO meta(key, value) VALUES ('version', 0);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  platform TEXT NOT NULL,
  photo TEXT DEFAULT '',
  total INTEGER NOT NULL DEFAULT 0,
  today INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  clicks_today INTEGER NOT NULL DEFAULT 0,
  today_date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_total ON listings(total DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_listings_today ON listings(today DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL,
  name TEXT NOT NULL,
  bid INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  board TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(listing_id) REFERENCES listings(id)
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);

CREATE TABLE IF NOT EXISTS click_guard (
  visitor_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  last_clicked_at INTEGER NOT NULL,
  PRIMARY KEY(visitor_id, listing_id)
);

CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_handle TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  display_name TEXT NOT NULL,
  photo TEXT DEFAULT '',
  verified_at INTEGER NOT NULL,
  UNIQUE(platform, platform_handle)
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  payment_provider TEXT NOT NULL,
  payment_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(creator_id) REFERENCES creators(id),
  FOREIGN KEY(listing_id) REFERENCES listings(id)
);
CREATE INDEX IF NOT EXISTS idx_claims_creator ON claims(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_listing ON claims(listing_id, created_at DESC);
