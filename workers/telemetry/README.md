# great_cto telemetry worker

Anonymous opt-in install pings → Cloudflare D1.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/install` | CLI sends one ping per `npx great-cto init` |
| GET | `/api/stats` | Full stats JSON (24h / 7d / 30d / all-time + archetype/version breakdown) |
| GET | `/api/stats/widget` | Compact JSON for landing page badge (5 min CDN cached) |

## Privacy

What we collect:
- Random `install_id` (UUID v4 generated client-side, not a user id)
- CLI version, archetype, Node version, platform, arch
- Timestamp (epoch seconds)
- Country derived from CF edge headers (no IP stored)

What we **don't** collect:
- IP addresses, hostnames, paths
- Code, repo names, file contents
- Email, username, OS user account
- User-agent string

Users can opt out:
- `GREATCTO_NO_TELEMETRY=1` env var
- `--no-telemetry` CLI flag
- Edit `~/.great_cto/config.json` → `{ "telemetry": false }`

## Deploy

```bash
# 1. Create D1 database (one-time)
npx wrangler d1 create great-cto-telemetry
# → copy the database_id into wrangler.toml

# 2. Apply schema
npx wrangler d1 execute great-cto-telemetry --remote --file=schema.sql

# 3. Deploy worker
npx wrangler deploy
```

## Local dev

```bash
npx wrangler dev --remote
# POST http://localhost:8787/api/install with a sample payload
```

## Querying directly

```bash
# Last-24h unique installs
npx wrangler d1 execute great-cto-telemetry --remote \
  --command="SELECT COUNT(DISTINCT install_id) FROM installs WHERE ts > strftime('%s','now')-86400"

# Top archetypes (last 30 days)
npx wrangler d1 execute great-cto-telemetry --remote \
  --command="SELECT archetype, COUNT(DISTINCT install_id) c FROM installs WHERE ts > strftime('%s','now')-2592000 GROUP BY archetype ORDER BY c DESC"
```
