-- Keep & Flip: encrypted cloud synchronization snapshots (TEST).
-- Only ciphertext is ever stored. This migration does not alter other tables.
CREATE TABLE IF NOT EXISTS keepflip_sync_state (
  id TEXT PRIMARY KEY CHECK (id = 'personal'),
  revision INTEGER NOT NULL CHECK (revision > 0),
  envelope TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  device_id TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0 AND bytes <= 1500000)
);
CREATE TABLE IF NOT EXISTS keepflip_sync_history (
  revision INTEGER PRIMARY KEY,
  envelope TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  device_id TEXT NOT NULL
);
