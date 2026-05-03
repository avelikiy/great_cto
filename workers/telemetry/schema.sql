-- great_cto telemetry D1 schema
-- Apply: npx wrangler d1 execute great-cto-telemetry --file=schema.sql

CREATE TABLE IF NOT EXISTS installs (
  install_id   TEXT NOT NULL,
  cli_version  TEXT NOT NULL,
  archetype    TEXT,
  node_version TEXT,
  platform     TEXT,
  arch         TEXT,
  country      TEXT,
  ts           INTEGER NOT NULL,
  PRIMARY KEY (install_id, ts)
);

CREATE INDEX IF NOT EXISTS idx_installs_ts ON installs(ts);
CREATE INDEX IF NOT EXISTS idx_installs_archetype ON installs(archetype);
CREATE INDEX IF NOT EXISTS idx_installs_version ON installs(cli_version);
