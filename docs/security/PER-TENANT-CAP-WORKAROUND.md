# Per-tenant budget caps — workaround until leash v2.24+

## TL;DR

llm-leash v2.23 has **per-agent** budget caps but no native **per-tenant** cap.
This workaround lets you set a daily cap per `tenant_id` (= per great_cto
project) and have the board enforce it best-effort by pausing the tenant
when today's spend crosses the cap.

When upstream adds the native feature, this file + the code referenced below
gets deleted.

## How it works

```
                                                            ┌──────────────────┐
operator sets cap                                           │ ~/.great_cto/    │
─── POST /api/leash/per-tenant-caps/<tenant> {cap_usd:N} ──→│ per-tenant-caps  │
                                                            │ .json            │
                                                            └──────────────────┘
board polls every 10s while Security panel is active                 │
─── GET /api/leash/per-tenant-status ───────────────────────→        │
                                                              ┌──────┴──────┐
                                                              │ getStatus() │ ◄── reads audit JSONL
                                                              │             │     per tenant_id
                                                              └──────┬──────┘
                                                                     │
                              spent ≥ cap?                            │
                                     │                               │
                                ┌────┴───┐                           │
                                │ yes    │ no                        │
                                │        │                           │
                                ▼        ▼                           ▼
                  POST /admin/tenant/<t>/pause       ┌──────────────────────────┐
                  (kills every active session        │ status: ok / warn / over │
                   of that tenant via leash)         └──────────────────────────┘
                                │
                                ▼
                  ~/.great_cto/per-tenant-locks.json
                  records {locked_at, reason}
```

## Files

| File | Purpose |
|---|---|
| `packages/board/per-tenant-caps.mjs` | Storage + spend computation + pause-fire logic |
| `packages/board/server.mjs` (4 routes) | `/api/leash/per-tenant-caps`, `/api/leash/per-tenant-status`, `POST /api/leash/per-tenant-caps/{tenant}`, `POST /api/leash/per-tenant-unlock/{tenant}` |
| `packages/board/public/index.html` (Budgets sub-tab) | UI block "Per-tenant caps" with table + add-cap form + unlock button |
| `~/.great_cto/per-tenant-caps.json` | Cap configuration (operator-managed) |
| `~/.great_cto/per-tenant-locks.json` | Active locks set by enforcement (operator can clear via UI) |

## API

```bash
# List configured caps (no spend lookup, fast)
GET /api/leash/per-tenant-caps
→ {"caps": {"<tenant>": {"cap_usd": 5.0, "updated_at": "..."}}}

# Caps + current spend + lock state. May trigger pause (enforce=0 to disable).
GET /api/leash/per-tenant-status[?enforce=0]
→ {"ok": true, "tenants": [
    {"tenant": "billing-api", "cap_usd": 5, "spent_usd": 2.3,
     "ratio": 0.46, "status": "ok",   "locked_at": null, "pause_fired": null},
    {"tenant": "trading",     "cap_usd": 10, "spent_usd": 11.7,
     "ratio": 1.17, "status": "locked", "locked_at": "2026-05-18T16:00:00Z", "pause_fired": true},
    {"tenant": "scratch",     "cap_usd": null, "spent_usd": 0.42,
     "ratio": 0, "status": "no-cap", "locked_at": null, "pause_fired": null}
  ]}

# Set or clear a cap
POST /api/leash/per-tenant-caps/<tenant>  {"cap_usd": 5.0}
POST /api/leash/per-tenant-caps/<tenant>  {"cap_usd": null}   # clear

# Clear a lock (operator override)
POST /api/leash/per-tenant-unlock/<tenant>
```

## Status values

| Status | Meaning |
|---|---|
| `ok` | spent < 80 % of cap |
| `warn` | 80 % ≤ spent < 100 % — UI shows amber |
| `over` | spent ≥ 100 % — board attempts pause on next poll |
| `locked` | pause was fired (tenant currently paused on the proxy) |
| `no-cap` | tenant has audit activity but no cap configured |

## Limitations

1. **Not real-time.** Enforcement runs only when the board polls `/api/leash/per-tenant-status` (every 10 s while the Security panel is open). A burst of LLM calls between polls can spike past the cap before the pause lands. Native upstream support will be synchronous.
2. **Pause is global per tenant.** `/admin/tenant/<t>/pause` kills *all* active sessions of the tenant — not just the over-budget agent. Operators can't selectively pause one agent of a tenant via this workaround.
3. **Day rollover is manual.** Today's spend is computed from the UTC-day start. Locks **do not** auto-clear at midnight UTC. Operators must press "unlock" the next day, or write a cron to call `/api/leash/per-tenant-unlock/<t>` at 00:00 UTC.
4. **Single-machine.** The cap state is local to one board instance — there's no central coordination across machines.

## Migration when upstream adds native support

When `llm-leash` ships `/admin/tenant/<t>/budget` (tracked in their roadmap):

1. Update `packages/board/per-tenant-caps.mjs` to proxy reads + writes to the upstream admin API.
2. Drop `~/.great_cto/per-tenant-caps.json` reads (keep file for backwards compat).
3. Remove `~/.great_cto/per-tenant-locks.json` (upstream handles state).
4. Delete this doc.

Estimated effort: 30–60 minutes once the upstream API stabilises.
