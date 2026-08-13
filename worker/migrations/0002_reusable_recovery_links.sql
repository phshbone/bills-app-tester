-- Reusable, revocable family recovery links for reinstalling trusted devices.
-- Tokens are never stored directly; only SHA-256 hashes are persisted.
CREATE TABLE IF NOT EXISTS frannie_recovery_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_device_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  FOREIGN KEY (created_by_device_id) REFERENCES frannie_devices(id)
);

CREATE INDEX IF NOT EXISTS idx_frannie_recovery_links_token ON frannie_recovery_links(token_hash);
