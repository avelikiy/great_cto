# PLAN — Operator console: declutter + the missing sections

Status: proposed · Created 2026-06-07

The admin board has two surfaces: **Build** (the dev-tool board — kanban · agents · dashboard ·
memory · logs · share · notifications) and **Operate** (the autopilot console). A licensed *operator*
(coder · BSA officer · broker · CPA · QPPV …) lives only in Operate. This plan removes what they
don't need and adds what they're missing.

## Analysis

### Not needed for an operator (remove / hard-gate)
1. **The entire Build board** — engineering surface (issues, agents, cost). Operators already lose the
   Build switch under an invite session, but the board's pages/APIs should be **explicitly
   unreachable** for an invite role, not just hidden.
2. **Console admin sections** — Start-a-run · Settings (routing dial) · Team (invites) · QA — already
   gated to admin / compliance-lead. Keep gated.
3. **Org-wide "All runs" + Analytics** — an operator should see **their own** work, not the whole
   stream. Re-scope and relabel to "My cases" / "My work".

### Missing for an operator (add)
1. **SOP / decision-criteria reference** (per vertical) — the policy the human applies (medical-
   necessity criteria, FDCPA limits, ECOA basis, ALTA rules…). The highest gap; every benchmarked
   console (Cohere, Anterior, Verifiable) leads with criteria-in-context.
2. **"My work" personal stats** — my decisions today, my avg time-to-decision, my SLA adherence
   (distinct from the org Analytics tiles).
3. **"Escalated to me" worklist** — a senior reviewer's pickup queue (we flag `escalated` but offer
   no dedicated list).
4. **"Sent-back / needs-info" list** — the cases this operator returned, to follow up.
5. **Search + in-console notifications list** — find a case by id/subject; a history of pushed alerts
   (today only the push toggle exists).
6. **Operator help** — a short "how this works" for a non-technical licensed signer.

## Plan (waves)

### Wave E1 — declutter (small, ship first)
- Invite sessions: hard-gate the Build board (`/`) — redirect an invite role to `/autopilot.html`;
  Build APIs reject an operator token. Operate becomes the only reachable surface for operators.
- Re-scope the console for operators: rename **All runs → My cases**; the Analytics row shows the
  operator's **own** numbers (my decisions · my avg time · my SLA) instead of org totals.

### Wave E2 — operator essentials
- **Criteria/SOP panel** per vertical: a short, in-console reference of the decision rules for the
  case's vertical (sourced from the vertical's pack / reviewer surface), shown in the case drawer.
- **Personal stats** endpoint (`/api/autopilot/stats?by=<me>`) → "my work" tiles.
- **Escalated-to-me** + **sent-back** filters/worklists (status + escalated flag already exist).

### Wave E3 — findability + onboarding
- **Search** box (by run id / subject) over the operator's cases.
- **In-console notifications list** (the alerts already fired) + the existing push toggle.
- **Help drawer** — "how this works" for the licensed human.

## Acceptance
- An operator (invite session) can reach only Operate; Build is unreachable (UI + API).
- The console shows "My cases" + "My work" stats; Settings/Team/QA/Start stay admin-only.
- The case drawer shows the decision criteria for that vertical; escalated-to-me + sent-back are one
  click away; search + notifications + help exist. No regression to admin/compliance-lead views.
