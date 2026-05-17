# great_cto Cloudflare Worker

Two surfaces on `greatcto.systems`:

| Route | Purpose |
|-------|---------|
| `POST /r/`         | Publish a share-report HTML snapshot, returns `{hash, url}` |
| `POST /r/<hash>`   | Update report (e.g. `{enabled: false}` to pause) |
| `GET  /r/<hash>`   | Serve the published HTML |
| `POST /notify/verify`  | Start email verification — sends 6-digit code |
| `POST /notify/confirm` | Confirm code → marks email as verified |
| `GET  /notify/status?to=...` | Check if email is verified + 24h count |
| `POST /notify`     | Send an alert email (rate-limited 100/24h per email) |
| `GET  /healthz`    | Liveness probe |

## Setup (first time)

1. **Create the KV namespace** (one-time):
   ```bash
   cd packages/board/cloudflare-worker
   npx wrangler kv namespace create STATE
   ```
   Paste the returned `id` into `wrangler.toml` under `[[kv_namespaces]]`.

2. **Set the Resend secret**:
   ```bash
   npx wrangler secret put RESEND_API_KEY
   # paste your re_... key when prompted
   ```

3. **Deploy**:
   ```bash
   npx wrangler deploy
   ```

4. **Verify domain in Resend** (for the long term):
   - https://resend.com/domains → Add `greatcto.systems`
   - Add SPF / DKIM / DMARC records in Cloudflare DNS
   - Once verified, update `wrangler.toml`:
     ```
     RESEND_FROM = "GreatCTO <notifications@greatcto.systems>"
     ```
   - Redeploy.

   Until verified, the worker sends from the Resend sandbox sender
   (`onboarding@resend.dev`) — works but looks less trustworthy in Inbox.

## Iteration

Local testing of the worker:
```bash
npx wrangler dev
# Worker runs at http://localhost:8787
```

Smoke-test alert flow:
```bash
# 1. Start verification (sends a code email to you)
curl -X POST http://localhost:8787/notify/verify \
  -H 'content-type: application/json' \
  -d '{"to":"you@example.com"}'

# 2. Confirm with the code from email
curl -X POST http://localhost:8787/notify/confirm \
  -H 'content-type: application/json' \
  -d '{"to":"you@example.com","code":"123456"}'

# 3. Send a test alert
curl -X POST http://localhost:8787/notify \
  -H 'content-type: application/json' \
  -d '{"to":"you@example.com","title":"Test alert","level":"info","project":"great_cto","body":"It works!"}'

# 4. Status
curl 'http://localhost:8787/notify/status?to=you@example.com'
```

## KV schema

```
report:<hash>      {"html","paused","published_at"}             TTL 30d
verified:<email>   {"verified_at","last_send_at","count_24h"}   no TTL
code:<email>       "<6-digit>"                                   TTL 10m
code_sent:<email>  "1" (throttle: 1 code per 60s per email)      TTL 60s
```

## Rate limits

- **100 emails / 24h per verified email** — counter resets after 24h of no sends
- **1 verification code / 60s per email** — prevents code spam
- Verification code expires after 10 minutes
