# PLAN: lean into the "AI firewall" framing + close the safe-mode gap

**Date:** 2026-06-13 · **Status:** PROPOSED
**Source:** Habr 1043160 ("AI-агентам нужен свой firewall") — an independent security-infra
argument FOR exactly the action-control layer great_cto already is.

## Why

The article argues corporate infra needs a new layer that controls *what an agent does right
now* (action-based), not *who has access* (access-based), with ALLOW / BLOCK / APPROVAL-REQUIRED
decisions and a Tool-Gateway → Policy → Risk → Decision → Audit pipeline. great_cto already
implements all five (connector gateway, roles+packs policy, riskSignal engine, flow-runner
decision with the irreversible⟹gate invariant, AES-256-GCM hash-chained audit). Two gaps and one
positioning opportunity remain.

## P1 — CISO positioning (no plugin code; docs + site) — highest ROI

Reframe great_cto's gate+connector layer as the **"AI firewall / runtime action-control layer for
regulated agents"** — opens a second buyer (security/CISO) alongside the business-function owner,
backed by a third-party security argument.

- **Reference-architecture map** (`docs/` + a diagram): great_cto component → the article's layer:
  connectors→Tool Gateway, roles+packs→Policy Engine, riskSignal+reversible/blastRadius→Risk Engine,
  flow-runner (irreversible⟹gate)→Decision Engine, hash-chained audit→Audit Log, gate signature→
  APPROVAL-REQUIRED. Emphasise: **action-based, not access-based**; the audit is tamper-evident
  (hash-chain + encryption), stronger than a plain log.
- **Site** (`great_cto-site`): add an "action-control / AI-firewall" angle to `/operate` (CISO voice
  alongside the compliance-lead voice) — or a focused `/control` section. Nav + llms.txt + sitemap.
- No runtime change — this is framing of what already exists.
Files: `docs/` (new ADR/diagram), `great_cto-site/operate.html` (+ optionally a new page).

## P2 — Safe-mode switch (the real runtime gap)

The article's "безопасный режим to restrict agents during anomalies." Today `pause` exists only as
the per-run gate pause; there is no tenant-wide freeze. Add a control-plane safe-mode.

**Decision point:** `run-store.mjs startRun()` line ~213 computes `autoEligible` (the ALLOW vs
APPROVAL-REQUIRED decision). Safe-mode intercepts here.

**Config** (`DEFAULT_CONFIG`, per-tenant): add `safeMode: 'off' | 'gate-all' | 'halt'` (default `off`).
- **`gate-all`** (soft freeze — the article's "safe mode"): every new run is forced to the human gate
  — `autoEligible = false` regardless of confidence. The autopilot still does the *reversible* work up
  to the gate; nothing irreversible auto-executes. A human signs everything until cleared.
- **`halt`** (hard kill-switch): `startRun` / ingest refuse to create new runs (return a safe-mode
  status); existing pending runs stay parked at their gates. For a confirmed incident.

**Server** (`autopilot-api.mjs` config POST, ~line 294): whitelist `safeMode` (validate against the
3 values), **admin / compliance-lead only** (control-plane action, same gate as requeue). Ingest
webhook honors `halt` → 503 `{ error: 'safe-mode' }`. Each toggle writes an audit line (who, scope,
from→to); runs created under `gate-all` get an audit note `forced-to-gate: safe-mode`.

**Console** (`autopilot.html` Ops tab): a Safe-mode control (off / gate-all / halt) for admin/
compliance-lead + a persistent banner when active ("🛟 Safe mode: all cases require a signature").
Show it prominently — it's a trust signal.

**Tests** (`tests/lib/run-store.test.mjs` or a new `safe-mode.test.mjs`): gate-all forces
autoEligible=false even above the floor; halt refuses startRun; toggle is audit-logged; off restores
normal routing; non-admin can't toggle (server test).

**⚠ Collision note:** all three files (`run-store.mjs`, `autopilot-api.mjs`, `autopilot.html`) are
currently in another session's uncommitted Flow-tab work. Implement P2 **additively** (a new config
field + a 2-line guard in startRun + one endpoint field + one Ops control) and either (a) land it
after the Flow-tab work commits, or (b) build it in an isolated worktree and rebase. Do NOT clobber
the uncommitted Flow-tab changes.

## P3 — Volume/scope-aware risk (follow-on, not now)

The article's killer example: "CRM access is fine; exporting the *entire* customer base is not."
Today risk is signal/confidence/reversibility-based, not volume-aware. Follow-on: let connectors
surface operation volume/scope (`affectedCount`, `scope: 'bulk'|'single'`); the risk engine escalates
bulk operations to a gate even when per-action they'd auto-clear. Tracked as a separate task.

## Order

P1 ships independently (docs + site, no collision). P2 after the Flow-tab work lands (or in a
worktree). P3 is a follow-on once P2 is in.
