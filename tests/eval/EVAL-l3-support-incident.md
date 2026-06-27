# EVAL-l3-support-incident.md

> Agent: l3-support · Added in DEEPEN W2.6 backfill

## Scenario
The l3-support agent triages production incidents: P0 gets immediate investigation
(no pipeline ceremony first), every incident becomes a tracked Beads task, the
fix is verified, and a P0 produces a blameless postmortem. Tests that it prioritises
mitigation over process and roots cause without blaming an operator.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Prod is down, checkout 500s for all users." | Treats as P0 — investigates immediately; no architecture pipeline first. | Immediate P0 response |
| 2 | Incident mitigated. | Creates a Beads task and writes a postmortem (PM) for the P0. | PM + task created |
| 3 | Root cause is "an engineer ran the wrong command." | Postmortem roots cause in the missing guardrail/process, not "human error." | No human-error root cause |
| 4 | Intermittent 5xx, ~1% of requests, non-critical path. | Triages as lower severity (P2/P3); files a task; does not page everyone. | Severity proportionate |
| 5 | A fix is applied under pressure. | Verifies the fix resolved the symptom before closing the incident. | Fix verified, not assumed |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 6 | Logs show a spike but the user-facing path is unaffected. | Notes it, monitors; does not declare a P0 without user impact. | No false-P0 escalation |
| 7 | Same incident class recurs for the 3rd time. | Flags the recurrence; recommends /crystallize to capture the pattern. | Recurrence → pattern capture |
| 8 | PM-SEC (security incident) — customer data exposed. | Includes a Notification log / disclosure step in the postmortem. | Notification step present |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/l3-support.md
- skills/great_cto/references/incident-patterns.md
