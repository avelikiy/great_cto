# Monitoring the great_cto board

Observability counters added in BH-13 (commit `1ace021`) surface internal
queue sizes through the existing `/api/metrics` endpoint. Use them to
detect leaks or runaway state before users notice.

## Key counters

```bash
curl -sf http://localhost:3141/api/metrics | jq .server
```

```json
{
  "sse_clients": 0,
  "bd_cache_entries": 1
}
```

| Counter | What it tracks | Healthy range |
|---|---|---|
| `sse_clients` | Active Server-Sent Event connections | 0–10 typical (one per open board tab) |
| `bd_cache_entries` | Cached `bd list` results, one per project | 0–20 (matches `/api/projects` count) |

## Diagnostic patterns

### SSE leak suspicion

If `sse_clients` keeps growing while you have 1 board tab open:

```bash
# Sample every 30s for 5 minutes
for i in $(seq 10); do
  curl -sf http://localhost:3141/api/metrics | jq -r '.server.sse_clients'
  sleep 30
done
```

Healthy: stays at 1 (or 0 between heartbeats). Leak: monotonically increases.

If you see a leak: the `req.on('close', () => sseClients.delete(res))`
handler in `packages/board/server.mjs` failed. Reproduce by opening
multiple tabs, switching focus, force-closing, and watching the counter.

### bd cache bloat

If `bd_cache_entries` exceeds `/api/projects` count by more than 2-3:

```bash
curl -sf http://localhost:3141/api/projects | jq length
curl -sf http://localhost:3141/api/metrics | jq -r '.server.bd_cache_entries'
```

Cache grows when projects are registered then removed without
`bdCacheInvalidate`. Fix: restart the board (`/board --restart`)
or add explicit invalidation in the project-removal path.

### Memory growth — when to worry

Run for a session length you care about, then sample:

```bash
PID=$(lsof -ti :3141 | head -1)
ps -o rss,vsz -p $PID
```

Baseline (fresh start): ~60-65 MB RSS.

Acceptable growth over 1 hour: < 20 MB (V8 GC + accumulated session data).
Growth > 100 MB / hour with idle dashboard = real leak, file an issue.

## When the dashboard freezes

Most common cause: **stale `.beads/.lock`**. After a crashed bd write
(crashed test runner, killed server during write, etc.), Dolt leaves
a stale lock that blocks all subsequent bd operations.

Recovery:

```bash
# 1. Kill any bd processes
pkill -9 -f "\bbd\b"
sleep 2

# 2. Remove stale lock files (safe if no bd procs alive)
cd /your/project
find .beads -name "*.lock" -o -name "LOCK" | xargs rm -f

# 3. Restart board
/board --restart
```

The 5-second `bd` timeout (BH-10 fix) caps individual write failures —
without that, a single stuck `bd` blocked the server indefinitely.

Concurrent writes are now serialised through `bdWriteSerialised` (BH-12
fix), so this only happens after a crash mid-write.

## Long-running test recommendation

For deployments with 8+ hour uptimes, add a daily snapshot of
`sse_clients` and `bd_cache_entries` to your monitoring system:

```bash
# Cron @ daily 03:00
curl -sf http://localhost:3141/api/metrics \
  | jq -c '.server + {ts: now | strftime("%Y-%m-%dT%H:%M:%SZ")}' \
  >> ~/.great_cto/metrics-history.jsonl
```

Trend the result. A healthy great_cto board over 30 days shows
both counters bounded (no upward trend).
