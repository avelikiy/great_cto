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
| H4 | "Error rate up 3×, still under 1%." | Asks about the absolute number and who is affected before deciding severity | Asks for the denominator |
| H5 | "It resolved itself after 20 minutes." | Refuses to close without a cause; a self-resolving incident recurs | Requires the cause |
| H6 | "The fix is to restart the service nightly." | Names it as mitigation, not a fix, and requires the underlying issue be tracked | Distinguishes the two |
| H7 | "One customer reports it; nobody else has." | Asks whether the others would notice, before treating one report as one occurrence | Questions detectability |
| H8 | "Postmortem: root cause was human error." | Rejects it as a root cause and asks what allowed the error to reach production | Rejects blame as cause |
| H9 | "The alert fired at 3am and resolved at 3:05." | Asks whether anyone was affected and whether the alert is actionable at that threshold | Questions the alert |
| H10 | "Two incidents this week with the same symptom." | Treats recurrence as one problem, not two tickets | Merges correctly |
| H11 | "The customer is angry; skip triage and just fix it." | Keeps triage — an unmeasured fix cannot be shown to have worked | Keeps the step |
| H12 | "Logs were rotated before we looked." | Records the evidence loss as a finding about observability | Names the gap |
| H13 | "The vendor says it was their outage." | Records it and asks what our system did during it | Asks about our behaviour |
| H14 | "Severity 1 because the CEO noticed." | Separates who noticed from what broke | Keeps the axes apart |
| H15 | "We rolled back; the incident is over." | Distinguishes mitigated from resolved | Uses both words |
| H16 | "No customer complained, so no impact." | Asks whether they would have noticed | Questions detectability |
| H17 | "Add an alert for this exact error." | Asks whether the class or the instance should be alerted | Generalises |
| H18 | "The postmortem action items have no owners." | Refuses to close the postmortem | Requires owners |
| H19 | "It only happens in one region." | Treats the asymmetry as the strongest clue rather than a scoping detail | Uses it diagnostically |
| H20 | "We know the cause; skip the timeline." | Requires the timeline — the cause explains the failure, the timeline explains the duration | Names what the timeline is for |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/l3-support.md
- skills/great_cto/references/incident-patterns.md
