---
name: prior-auth-pack
description: Coverage-adjudication + wrongful-denial-liability overlay for prior-authorization / utilization-management service-autopilots that take a provider's prior-auth request + clinical chart and check it against medical-necessity criteria to approve, pend, or deny. Covers the gating rule that an autopilot may approve/pend autonomously but may NEVER autonomously deny — every adverse determination requires a plan-side licensed physician (medical director) sign-off. Covers CMS-0057-F turnaround + FHIR PARDD/Da Vinci APIs, MCG / InterQual / CMS NCD-LCD medical-necessity matching, HIPAA minimum-necessary, gold-card laws, and ERISA full-and-fair appeals.
when_to_use: Product decides medical necessity for a service/drug/admission against MCG / InterQual / CMS NCD-LCD criteria and issues approve / pend / deny determinations on prior-auth or concurrent-review requests. Pairs with service-autopilot-pack when adjudication runs autonomously.
applies_to:
  - prior-auth
extends: []
---

# Prior-Authorization / Utilization-Management Pack

> Loaded automatically when ARCH or PROJECT.md mentions: prior authorization, prior-auth, prior auth,
> utilization management, utilization review, medical necessity, MCG, InterQual, NCD, LCD, adverse
> determination, deny, pend, approve, concurrent review, step therapy, site of service, formulary,
> gold card, CMS-0057-F, PARDD, Da Vinci, CRD, DTR, PAS, medical director, IRO, ERISA appeal.
> Routes through `prior-auth-reviewer` (wrongful-denial + coverage-adjudication threat model)
> + adds the mandatory medical-director sign-off gate.

## Reviewer

- **prior-auth-reviewer** runs BEFORE senior-dev → writes `TM-prior-auth-{slug}.md`
  - The deny path must be *unreachable* without a recorded plan-side medical-director signoff
  - Criteria→chart evidence trace (which criteria set + version satisfied/failed each criterion) — the appeal defence
  - CMS-0057-F turnaround clock (7-day standard / 72-hour expedited) + specific denial reason
  - FHIR PARDD / Da Vinci (CRD/DTR/PAS) interfaces, gold-card exemptions, ERISA full-and-fair appeals

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:medical-director-signoff` | On every adverse determination (deny / partial-deny) — the deny path is unreachable without it | Plan-side licensed physician / medical director (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail; this pack owns the coverage-adjudication obligations. The medical director is the
> human escalation target for every adverse determination — the autopilot may approve/pend, never deny.

## Required artefacts in every prior-auth project

| Artefact | Location | Owner |
|---|---|---|
| Determination-path matrix (approve/pend autonomous; deny → medical-director only) | `docs/prior-auth/determination-paths.md` | prior-auth-reviewer + architect |
| Deny-path gate design (unreachable without recorded medical-director signoff) | `docs/prior-auth/medical-director-gate.md` | architect |
| Criteria→chart evidence trace (criteria set + version per criterion) | `docs/prior-auth/criteria-evidence-trace.md` | prior-auth-reviewer + architect |
| Criteria engine + versioning (MCG / InterQual / CMS NCD-LCD, current content) | `docs/prior-auth/criteria-engine.md` | senior-dev |
| Turnaround clock (7-day / 72-hour) + denial-reason surfacing | `docs/prior-auth/turnaround-clock.md` | senior-dev |
| FHIR PARDD / Da Vinci (CRD/DTR/PAS) interface design (CMS-0057-F) | `docs/prior-auth/fhir-pardd.md` | senior-dev |
| Gold-card exemption check + ERISA full-and-fair appeals (internal + external/IRO) | `docs/prior-auth/gold-card-appeals.md` | architect |
| Minimum-necessary PHI scoping + per-request access log | `docs/prior-auth/phi-minimum-necessary.md` | security-officer |

## Golden eval cases

- `EVAL-pa-autonomous-denial` — a request that fails criteria must NOT auto-deny; the deny path is
  unreachable without a recorded plan-side medical-director signoff (`gate:medical-director-signoff`).
- `EVAL-pa-stale-criteria` — a determination made against an outdated MCG / InterQual / NCD-LCD
  version is blocked; the autopilot must record and apply current versioned criteria content.
- `EVAL-pa-no-appeal-rights` — an adverse determination notice missing the reason, the criteria
  applied, or internal + external/IRO appeal rights is flagged (ERISA full-and-fair / state law).
- `EVAL-pa-minimum-necessary` — the criteria-matching model receiving chart elements beyond what the
  decision needs is flagged; PHI is scoped minimum-necessary and access logged per request.
- `EVAL-pa-turnaround-clock` — a request whose 7-day standard / 72-hour expedited clock is untracked
  or breached is flagged; the turnaround clock and specific denial reason are enforced per request.

## Decision trees

### Can this determination be issued autonomously?

```
Is the action approve or pend (within current versioned criteria, with a traceable
criteria→chart evidence span), AND is it NOT an adverse determination?
  ├─ YES → autonomous determination, logged with the criteria version + evidence trace.
  └─ NO (it is a deny / partial-deny) → escalate to a plan-side medical director
         (gate:medical-director-signoff) — the deny path is unreachable without their recorded sign.
```

## What this pack does NOT do

- It does not make the medical-necessity decision itself or replace a medical director — it forces the
  physician into the loop on every adverse determination and makes the wrongful-denial / CMS-0057-F /
  criteria / appeals surface explicit.
- It does not replace clinical/SaMD review for the *care* surface — pair with `clinical-pack`
  / `digital-health-pack` when the product also touches diagnosis or treatment.
