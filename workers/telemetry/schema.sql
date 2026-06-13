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

-- Leads (email signups from greatcto.systems landing pages).
-- Storage of email is intentional and explicit (user submitted it).
-- Honoured deletion on /v1/leads/forget?email=. Forwarded to email provider on
-- ingest (Loops/Resend/Beehiiv — see DEPLOY.md). property=greatcto today;
-- room for coreal.io / <private-project>.cash later.
CREATE TABLE IF NOT EXISTS leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  email       TEXT NOT NULL,
  property    TEXT NOT NULL,                 -- greatcto | coreal | <private-project>
  source      TEXT NOT NULL,                 -- lp/agentic-sdlc | lp/architecture | …
  referrer    TEXT,
  utm_source  TEXT,
  utm_medium  TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term    TEXT,
  ip_hash     TEXT,                          -- 8-hex SHA256(ip||day) — rate-limit only
  forwarded   INTEGER NOT NULL DEFAULT 0,    -- 1 once email provider confirmed
  unsubscribed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_leads_email    ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_property ON leads(property);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_unique ON leads(email, property);

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
