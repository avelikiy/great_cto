# PLAN — Autopilot Tier-3 (ops) · Wave H

Status: done · Created 2026-06-08 · Reference vertical: rcm

Tier-2 (Wave G) made the autopilot calibrated + provable. Tier-3 makes it **operable**: you can see
what it costs, catch a failing connector, and recover a write that didn't land — instead of a silent
"completed". All ✅-buildable + tested here (deterministic cost model + a fault-injection seam).

## Items (PLAN-autopilot-production-depth.md §Tier-3, 9–12)

### 9. Cost/latency budgets + alerts ✅
- `budgets.mjs` — per-vertical `LATENCY_BUDGET_MS` (soc seconds, doc-heavy verticals more) + a flat
  `unitCostUsd()` connector-call cost (env-overridable to model a real provider price).
- `runMetrics(run)` flags `overLatencyBudget`. Board cron surfaces budget/health breaches.

### 10. Retry / dead-letter ✅
- The write step already retries 3× with backoff. Now a write that **exhausts** its retries →
  `status: 'dead-letter'` (not a silent "completed") + audit `dead-lettered` + a `deadLetter` envelope
  (gate, resume index, connectors, attempts, error).
- `deadLetters({tenant})` queue + `requeue(id, who)` re-executes the post-gate write (gate already
  signed) → recovers to `completed`, or stays dead-lettered with attempts bumped. Endpoints + cron.

### 11. Billing / metering ✅
- `metering({tenant})` aggregates runs → connector calls, total latency, total cost, retries,
  over-budget count, per-vertical breakdown. `GET /api/autopilot/metering` (admin/compliance).

### 12. Connector health ✅
- `connectorHealth({tenant})` — per-connector call outcomes across runs: failure rate, p95 latency,
  last error, `healthy` (failureRate < 50%). `GET /api/autopilot/health` + cron `connector.health`
  (flags ≥5 calls and >50% failing) + a dead-letter reminder.

## Test seam
`GREAT_CTO_FAULT_INJECT=1` makes every stub connector call fail deterministically — exercises the
write retry→dead-letter path, requeue recovery, and the unhealthy-connector view (chaos testing).

## Acceptance
- `runMetrics` / `metering` report latency + cost against a per-vertical budget.
- A fault-injected write is dead-lettered (audit `dead-lettered`); `requeue` recovers it once faults
  clear (audit `requeued`); the irreversible write actually runs on recovery.
- `connectorHealth` marks a fault-injected connector `healthy:false`.
- Ops endpoints are admin/compliance-gated (operator → 403). Lib suite green (304/304).
