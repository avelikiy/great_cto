# PLAN: demo case feeder — make the operator console come alive

**Date:** 2026-06-13 · **Status:** IN PROGRESS
**Why:** the operator console is empty until a source system pushes cases. For demos / first-run /
sales, that's a dead screen. A demo feeder periodically injects realistic stub cases so the Inbox
fills, gates wait for a signature, and the flow diagram shows real work — without any external system.

## Scope (opt-in, never on by default)

- **Off unless explicitly enabled** — `GREAT_CTO_DEMO_FEED=1` (or `--demo` on `great-cto board/console`).
  Production deployments are unaffected.
- **Stub mode only** — `startRun(vertical, { mode:'stub', source:'demo' })`. No live connectors, no real
  writes; everything pauses at the human gate as usual.
- **Capped** — only feed while pending demo cases `< cap` (default 12), so the inbox doesn't flood; it
  refills as the operator signs.

## Build

1. **`scripts/lib/demo-feeder.mjs`**
   - `feedOnce({ verticals, tenant })` → picks the next vertical (round-robin over a curated demo set),
     mints a synthetic case ref (CLAIM-1042, CASE-1043, …), calls `startRun` with `source:'demo'`.
   - `startDemoFeeder({ intervalMs, verticals, tenant, cap, log })` → `setInterval`; seeds one
     immediately; skips a tick when pending demo cases ≥ cap. `stopDemoFeeder()` clears it.
   - Curated verticals (recognisable, varied recommendations): rcm, aml, mortgage, prior-auth,
     insurance, tax, collections, soc.

2. **`packages/board/server.mjs`** — import `startRun`/`listRuns` + the feeder; after `server.listen`,
   if `GREAT_CTO_DEMO_FEED` or `--demo`, start it (interval `GREAT_CTO_DEMO_INTERVAL` seconds, default 30;
   tenant `GREAT_CTO_DEMO_TENANT`, default 'default'). Log a clear "DEMO feeder ON" line. Safe-mode `halt`
   naturally blocks it (startRun throws → tick skips).

3. **`packages/cli` (optional)** — `--demo` flag on `board`/`console` sets `GREAT_CTO_DEMO_FEED=1` for the
   child. Env alone is enough for v1.

## Tests (`tests/lib/demo-feeder.test.mjs`)
- `feedOnce` creates an awaiting-approval run with `source:'demo'` and a synthetic ref.
- Round-robin covers multiple verticals across calls.
- The cap is honoured (no new case once pending ≥ cap).

## Verify
Start the board with `GREAT_CTO_DEMO_FEED=1 GREAT_CTO_DEMO_INTERVAL=2`; the console Inbox fills with
varied cases within seconds; the Flow tab shows the autopilot for a fed vertical; safe-mode halt stops
new cases. Then off by default → no cases.
