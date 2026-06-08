# PLAN — Autopilot Tier-2 (quality & trust) · Wave G

Status: in progress · Created 2026-06-08 · Reference vertical: rcm

Tier-1 (Wave F) made the autopilot *really operated* — webhooks, tamper-evident audit, encryption,
receipts, attestation. Tier-2 makes it *calibrated, provable, and self-reacting*. Every item is
✅-buildable + testable here — no external IdP / sandbox creds.

## Items (PLAN-autopilot-production-depth.md §Tier-2, 5–8)

### 5. Calibrated confidence + closed-loop learning ✅
The `recommend()` confidence isn't tied to real error rates. Add:
- **Calibration curve** — `calibration({tenant})`: bucket decided runs by `recoConfidence`, measure how
  often the AI was actually right (no override, no failing QA). Report a reliability curve + **ECE**
  (expected calibration error).
- **Closed loop** — `suggestFloor({tenant,target})`: from the curve, recommend the lowest confidence
  band that hits the target accuracy → a data-driven `confidenceFloor`. Overrides + low QA scores are
  the training signal. Admin applies via existing `setConfig`.

### 6. Eval rigor — ×3 median CI gate ✅
A single scorecard run is noisy (cro 82→97 was median noise). Add to `vertical-scorecard.mjs`:
- `--median N` — run the full case+judge eval N times, take the **median** total score.
- `--ci <threshold>` — exit non-zero if the median < threshold (a real CI gate).

### 7. SLA auto-escalation ✅
`sla.mjs` only *shows* the countdown. Make it *act*:
- `slaState(run, nowMs)` — `ok` / `at-risk` (≤25% of the window left) / `breached`.
- `autoEscalateStale({tenant, nowMs, atRisk})` — escalate awaiting runs whose SLA is breached (or
  at-risk) and that the monitor hasn't already escalated (idempotent via `slaEscalated`). Audit event
  `sla-escalated`.
- Board cron (`sla.escalate`, 5 min) calls it across tenants + fires email/push.

### 8. Sequential review pipelines ✅
Multi-gate flows already chain stages (tax: preparer→8879→efile). Formalize the view:
- `stageProgress(run)` — the ordered gate stages with signer + signed-by, so the console/export show
  `intake → QC → review → submit` progress, not just a flat step list.

## Acceptance
- `calibration()` returns a bucketed reliability curve + ECE; `suggestFloor()` proposes a floor from
  observed accuracy.
- `vertical-scorecard.mjs <v> --median 3 --ci 85` runs 3×, prints the median, exits 1 if median < 85.
- A breached awaiting run is auto-escalated exactly once; the audit records `sla-escalated`; a healthy
  run is untouched.
- `stageProgress()` on a multi-gate run lists each stage with its signer + status.
- All existing lib tests stay green; new tests cover each item.
