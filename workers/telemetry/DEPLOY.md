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

# Unsubscribe / delete a lead:
curl -s "$WORKER_URL/v1/leads/forget?email=user@example.com"
```

## Leads endpoint (added 2026-05-17)

Landing pages on greatcto.systems POST email signups to `/v1/leads`.
Stored in D1 `leads` table; best-effort forwarded to an email provider if
secrets are configured.

```bash
# Apply the new leads table (idempotent — IF NOT EXISTS):
wrangler d1 execute great-cto-telemetry --remote --file=schema.sql

# Email-provider configuration (Resend, transactional only — we own the audience in D1):
wrangler secret put EMAIL_PROVIDER   # set to: resend
wrangler secret put EMAIL_API_KEY    # Resend API key (send-only is enough)
wrangler secret put EMAIL_FROM       # e.g. "GreatCTO <hi@updates.greatcto.systems>" (must be on verified domain)
# Optional welcome-email overrides:
wrangler secret put EMAIL_WELCOME_SUBJECT
wrangler secret put EMAIL_WELCOME_HTML

# EMAIL_LIST_ID is NOT needed — Resend Audiences are not used. D1 `leads` is
# the source of truth. Weekly digest is sent by site-repo cron script:
#   marketing/scripts/send-weekly-digest.mjs --week=YYYY-WW

# Before the worker can actually send to arbitrary recipients (not just your
# own verified email), verify the From-domain at https://resend.com/domains
# — Resend prints the exact SPF + DKIM + DMARC records; add them to
# Cloudflare DNS for greatcto.systems. Until then, the worker will fail with
# "you can only send to your own email" — which is fine for smoke-tests.

# Smoke-test:
curl -s -X POST "$WORKER_URL/v1/leads" -H 'Content-Type: application/json' -d '{
  "email":"smoke@example.com","property":"greatcto","source":"lp/agentic-sdlc"
}' | jq .
# → {"ok":true,"forwarded":false}  (or true if provider configured)

# Inspect:
wrangler d1 execute great-cto-telemetry --remote \
  --command="SELECT received_at,email,property,source,forwarded FROM leads ORDER BY id DESC LIMIT 20"
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
