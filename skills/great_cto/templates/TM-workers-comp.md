# TM-workers-comp-{slug} — Workers'-Comp Claims-Handling Threat Model

**Owner:** workers-comp-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Determining compensability and terminating benefits is a regulated activity requiring a **licensed claims
> adjuster (examiner)**; the dominant failure mode is **denying an injured worker statutory benefits and
> bad-faith / unfair-claims-practices liability**, not a slow queue. This model forces an adjuster sign-off
> into the pipeline.

## 1. Scope
- Pipeline: First Report of Injury (FROI) / medical records → AOE/COE compensability + AWW / TTD-PPD benefits → utilization review (MTUS/ODG) → EDI claim (IAIABC FROI/SROI, WCB/DWC) → benefit payment / monitoring
- Autonomy: suggest-to-adjuster (assistant) · autonomous-above-confidence (autopilot)
- Jurisdictions: ca · ny · tx · fl …
- Benefit types: ttd · tpd · ppd · ptd …
- Setting: carrier · self-insured-employer · TPA

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| Bad-faith / unfair-claims-practices liability | | negligence → punitive, extracontractual |
| Compensability (AOE/COE) | | arising out of / in the course of employment |
| 50-state workers'-comp acts (WCB/DWC) | | correct jurisdiction's statute |
| AWW computation + benefit type (TTD/TPD/PPD/PTD) | | statutory wage basis, maximums, waiting periods |
| Utilization review + treatment guidelines (MTUS/ODG) | | physician/peer reviewer for medical denials |
| Independent medical exam (IME) + fee schedule | | state fee schedule applies |
| Statutory deadlines (FROI, IAIABC EDI, payment timeliness) | | hard clocks, silent miss is a violation |
| Anti-retaliation | | no retaliatory handling for filing a claim |
| Licensed claims-adjuster (examiner) requirement | | adjuster of record signs the determination |

## 3. Field→document evidence trace (the reasonable-basis / bad-faith defence)
| Field | Evidence span required | Present? |
|---|---|---|
| Compensability (AOE/COE) | FROI + medical record + jurisdiction rule | |
| Average Weekly Wage (AWW) | wage statement / payroll | |
| Benefit type + rate (TTD/PPD) | disability status + state maximum | |
| Medical necessity | UR result vs MTUS/ODG + physician reviewer | |

## 4. Edits & guardrails
- Compensability decided against the correct state act (AOE/COE) with a documented basis: …
- AWW computed on the statutory wage basis + correct benefit type + state maximum: …
- Medical-necessity denials routed through utilization review (MTUS/ODG) with a physician/peer reviewer: …
- Statutory deadlines (FROI, IAIABC EDI reporting, benefit-payment timeliness) tracked with pre-lapse escalation: …

## 5. Autonomy boundary
- Confidence floor below which a determination escalates to a licensed claims adjuster: …
- Bad-faith-high patterns always escalated (auto-deny compensability, benefit termination, UR-less medical denial, AWW understatement, missed statutory deadline): …
- Adjuster-of-record audit trail (who/what determined, computed, screened, and signed each claim): … (composes with service-autopilot audit trail)

## 6. Anti-retaliation, notices & reasonable-basis record
- Anti-retaliation handling (no retaliatory action for filing a claim) enforced: …
- Required adverse-determination / benefit-termination notices issued: …
- Per-claim reasonable-basis record (AOE/COE finding, AWW/benefit computation, UR rationale): …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:claims-adjuster-signoff` — licensed claims adjuster signs off on every compensability decision, denial, and benefit termination and on every bad-faith-high pattern, before the EDI claim is transmitted to the state.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
workers-comp-reviewer-verdict: signed-off | blocked
jurisdictions: [ca | ny | tx | fl …]
benefit-types: [ttd | tpd | ppd | ptd]
bad-faith-high-risk-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Field→document evidence trace (FROI / wage statement / medical record)
  - Compensability (AOE/COE) decided against the correct state act with documented basis
  - AWW computed on the statutory wage basis + correct benefit type + state maximum
  - Medical-necessity denials routed through utilization review (MTUS/ODG) with a physician reviewer
  - Statutory deadlines (FROI, EDI reporting, benefit-payment timeliness) tracked with pre-lapse escalation
  - Anti-retaliation handling + required adverse-determination notices
  - Every compensability/denial/termination → licensed claims adjuster sign-off (gate:claims-adjuster-signoff)
gate: gate:claims-adjuster-signoff
