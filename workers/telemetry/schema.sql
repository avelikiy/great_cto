-- great_cto telemetry schema (D1)
-- Schema v1 — see docs/PRIVACY.md for the full collection policy.

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,                -- ISO-8601 UTC, supplied by client
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  version     TEXT NOT NULL,                -- great_cto version
  command     TEXT NOT NULL,                -- one of allowed commands (validated)
  archetype   TEXT NOT NULL,                -- one of allowed archetypes (validated)
  node        TEXT NOT NULL,                -- node version
  os          TEXT NOT NULL,                -- linux/darwin/win32
  exit_code   INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  anon_id     TEXT NOT NULL                 -- 8-hex-char anon hash, see docs/PRIVACY.md
);

CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at);
CREATE INDEX IF NOT EXISTS idx_events_command  ON events(command);
CREATE INDEX IF NOT EXISTS idx_events_anon     ON events(anon_id);

-- Aggregated daily stats (retained indefinitely, no anon_id).
CREATE TABLE IF NOT EXISTS daily_stats (
  date       TEXT NOT NULL,                 -- YYYY-MM-DD
  command    TEXT NOT NULL,
  archetype  TEXT NOT NULL,
  os         TEXT NOT NULL,
  count      INTEGER NOT NULL,
  unique_ids INTEGER NOT NULL,              -- distinct anon_id count for that day+slice
  PRIMARY KEY (date, command, archetype, os)
);
