CREATE TABLE IF NOT EXISTS frannie_care (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_device_id TEXT
);

CREATE TABLE IF NOT EXISTS frannie_devices (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  credential_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS frannie_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_frannie_devices_credential ON frannie_devices(credential_hash);
CREATE INDEX IF NOT EXISTS idx_frannie_invites_token ON frannie_invites(token_hash);
