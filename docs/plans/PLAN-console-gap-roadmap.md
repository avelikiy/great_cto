# PLAN — Console gap roadmap (vs the startups in our verticals)

Status: proposed · Created 2026-06-07

Researched the operator/reviewer consoles of the AI startups in our 19 verticals (Cohere Health,
Anterior, Abridge, Ambience, Medallion, Verifiable, Triomics, ArisGlobal · Hummingbird, Sardine,
Unit21, Checkr, Chargeflow/Justt, Shift, Zest, Tidalwave, GovDash · Sierra, Decagon, HappyRobot,
EliseAI, Scytale/AuditBoard, Descartes · HumanLayer, Langfuse).

## Verdict

Ours is **best-in-class as a HITL signing surface** (named sign-off · N-of-M multi-gate · audit
trail · JSON export · time-in-queue SLA · multi-tenant RBAC · invite onboarding). But it is **a
queue, not yet a platform.** Every benchmarked console invests in analytics, agent observability,
structured decisioning, and in-console configurability — which a pure work-queue misses.

## What we already match (strengths)
Multi-tenant · vertical-scoped RBAC + invite onboarding · immutable audit trail · signer-identity-on-
action · N-of-M multi-gate (more sophisticated than most vendors publish) · per-case time-in-queue.

## Gaps — ranked (convergent across all three research streams)

### Tier 1 — table-stakes / highest leverage
1. **Analytics / automation-rate dashboard** — the headline screen everywhere (Sierra Insights,
   Decagon, EliseAI, Unit21, Chargeflow). Aggregate KPIs: automation rate · escalation/handoff rate ·
   approve-vs-reject ratio · throughput/volume · SLA-breach rate · time-to-decision · (cost/case),
   sliced by vertical / tenant / time. *Without it a buyer can't answer "how much work is the
   autopilot taking off my desk?"* **Biggest single gap.**
2. **Structured dispositions + reason-code taxonomy** — Unit21, Sardine, Checkr, Zest force a
   controlled outcome list rolling up to fixed categories, + reason codes. We have free-text
   approve/reject — an auditor can't aggregate free text.
3. **Escalation as a first-class state** — escalate-to-senior / send-back-for-info / refer-out, not
   only approve/reject (Sardine, Shift).
4. **AI recommendation + confidence per case** — vendors surface a *suggested decision* + confidence
   so the human triages fast (Cohere, Anterior, Triomics, Unit21, Sardine). Derivable from our
   compliance-step connector outputs (um-criteria requiresMdReview, fraud-score refer, OFAC HARD BLOCK…).
5. **Override logging** — explicitly record "AI recommended X · human chose Y · reason Z" (Justt,
   Unit21). Critical evidence for a "human signs the action" product.

### Tier 2 — strong differentiators
6. **Evidence-linked explainability** — clickable citation from each AI claim → the source field/doc
   (Anterior, Abridge, Verifiable, Triomics). We have a step trace but no provenance link.
7. **AI-drafted narrative/report on the signed record** — SAR / determination note / coverage letter
   auto-drafted from the case, human-editable (Hummingbird, Sardine, Shift, Anterior).
8. **Regulatory-deadline SLAs** — countdown to a statutory clock (30-day SAR, CMS turnaround,
   adverse-action waiting period), at-risk escalation — not just an elapsed timer.
9. **Auto-assignment + risk-based prioritization** — route by licensure/jurisdiction/workload and
   rank the worklist risk-first, not flat oldest-first (Sardine, Unit21, Triomics).
10. **In-console configurability** — an adjustable **confidence floor / auto-approve threshold** per
    case type + tenant, editable guardrails/routing without code (Decagon AOPs, Sierra Studio).
11. **QA / review sampling** — score a sample of *closed* cases against rubrics, separate from the
    pre-action gate (Unit21 QA, Decagon Watchtower).

### Tier 3 — polish / depth
12. In-case source/document viewer · 13. Bulk actions · 14. Agent-run observability (per-step
cost/latency, reasoning, replay — Sierra/Langfuse) · 15. Regulator-format export (filed form, not
JSON) · 16. Entity/network graph for investigation verticals · 17. Connector-health manager in-console
· 18. Closed-loop feedback (rejection → agent) · 19. Continuous-monitoring posture.

## Build order (proposed)

- **Wave A (this PR): the queue→platform jump** — (1) Analytics dashboard, (2) structured
  dispositions + reason codes, (3) escalation/send-back states.
- **Wave B**: (4) AI recommendation + confidence in the queue, (5) override logging, (8) regulatory-
  deadline SLAs.
- **Wave C**: (6) evidence-linked explainability, (7) AI-drafted narrative, (10) configurable
  confidence floor.
- **Wave D**: (11) QA sampling, (13) bulk actions, (14) agent-run observability.

## Acceptance (Wave A)
- Admin Analytics view: automation/approval/escalation rates + throughput + SLA-breaches by
  vertical/tenant, from real run data.
- Decisions carry a structured `disposition` + `reason`; escalate/send-back are real states; the
  audit trail records them. RBAC + the safety invariant unchanged.
