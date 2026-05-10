# Deploying the telemetry Worker

One-time setup. After that, `wrangler deploy` is enough for updates.

## Prerequisites

- `wrangler` CLI: `npm install -g wrangler` (≥ 4.x)
- A Cloudflare API token with these **account-level** scopes:
  - `Workers Scripts: Edit`
  - `D1: Edit`
  - `Workers Routes: Edit` (only if you want a custom domain)
  - `Account Settings: Read` (wrangler probes this)

  Create at: https://dash.cloudflare.com/profile/api-tokens
  → "Create Token" → "Edit Cloudflare Workers" template (covers all of the above).

## One-time setup

```bash
cd workers/telemetry

# Auth (one of the two):
export CLOUDFLARE_API_TOKEN=<your-token>
export CLOUDFLARE_ACCOUNT_ID=<your-account-id>
# OR: wrangler login   (browser-based, easier)

# 1. Create the D1 database (records the database_id).
wrangler d1 create great-cto-telemetry
# → copy the printed database_id into wrangler.toml `database_id`

# 2. Apply the schema to remote D1:
wrangler d1 execute great-cto-telemetry --remote --file=schema.sql

# 3. Deploy the Worker:
wrangler deploy

# 4. (Optional) Bind a custom domain:
#    Cloudflare Dashboard → Workers → Routes → Add route
#       telemetry.greatcto.systems/* → great-cto-telemetry
#    OR via wrangler.toml `routes`:
#       [[routes]]
#       pattern = "telemetry.greatcto.systems/*"
#       zone_name = "greatcto.systems"
```

## Verify deployment

```bash
# Get the Workers.dev URL from the deploy output (e.g. great-cto-telemetry.<sub>.workers.dev)
WORKER_URL="https://great-cto-telemetry.<your-sub>.workers.dev"

# Health check:
curl -s "$WORKER_URL/v1/health" | jq .
# → {"ok":true,"schema":"v1"}

# Stats endpoint (will be empty until first events arrive):
curl -s "$WORKER_URL/v1/stats" | jq .
# → {"days":30,"rows":[]}

# Reject malformed event:
curl -s -X POST "$WORKER_URL/v1/event" -H 'Content-Type: application/json' \
  -d '{"bad":"payload"}' | jq .
# → {"error":"schema validation failed"}

# Accept a valid event:
curl -s -X POST "$WORKER_URL/v1/event" -H 'Content-Type: application/json' -d '{
  "ts":"2026-05-10T12:34:56Z",
  "version":"2.7.0",
  "command":"scan",
  "archetype":"cli",
  "node":"20.11.1",
  "os":"darwin",
  "exit_code":0,
  "duration_ms":1234,
  "anon_id":"a3f2dd91"
}' | jq .
# → {"ok":true}

# Confirm the row landed:
wrangler d1 execute great-cto-telemetry --remote --command="SELECT COUNT(*) FROM events"
# → 1
```

## After deploy — update the CLI endpoint

Once the custom domain is bound, the default in `packages/cli/src/telemetry.ts`
is already `https://telemetry.greatcto.systems/v1/event`. Until then, users
who want to opt-in can override:

```bash
export GREAT_CTO_TELEMETRY_ENDPOINT=https://great-cto-telemetry.<your-sub>.workers.dev/v1/event
export GREAT_CTO_TELEMETRY=on
```

## Routine operations

```bash
# Tail logs:
wrangler tail great-cto-telemetry

# Inspect raw events (last 10):
wrangler d1 execute great-cto-telemetry --remote \
  --command="SELECT received_at, command, archetype, os, exit_code FROM events ORDER BY id DESC LIMIT 10"

# Force-rollup yesterday's stats (cron does this nightly at 03:00 UTC):
wrangler d1 execute great-cto-telemetry --remote \
  --command="SELECT date FROM daily_stats ORDER BY date DESC LIMIT 5"

# Right-to-be-forgotten (manual):
curl -s "$WORKER_URL/v1/forget?anon_id=<8-hex-chars>"
```

## Cost expectation (Cloudflare free tier)

- Workers: 100 000 requests/day free. At 1 000 daily users running 5 commands each,
  we use 5 000 requests/day — 5% of free tier.
- D1: 5 GB storage + 25M reads/day + 50k writes/day free. We're at < 1% of all of these.
- Total expected cost at current volume: **$0/month** until ~50× growth.

## Token rotation

The CF API token used for deploy lives in your shell — do not commit. After the
initial deploy, rotate the token (Dashboard → Profile → API Tokens → Roll).
GitHub Actions deploys (if you set them up) should use a separate token stored
as a repo secret named `CLOUDFLARE_API_TOKEN`.
