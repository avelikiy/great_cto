---
name: service-autopilot-pack
description: Cross-cutting overlay for AI "service autopilots" — products that sell the OUTCOME of a service (not a tool to a specialist). Adds the four invariants every autopilot shares: a confidence→human judgment boundary, accuracy-as-SLA, a per-decision audit trail, and per-outcome unit economics. Machine-checkable via scripts/lib/autopilot-gate.mjs.
when_to_use: Product delivers a completed work outcome to a business (claims adjudicated, NDAs redlined, invoices coded, candidates screened) rather than assisting a human professional who stays accountable. Loaded on agent-product + the vertical archetypes, or opt-in via `packs: [service-autopilot]`.
applies_to:
  - agent-product
  - ai-system
  - insurance
  - lending
  - hr-ai
  - legaltech
  - rcm
extends: [agent-pack]
---

# Service-Autopilot Pack

> Source thesis: *"Services are the new software"* — autopilots capture the labour budget, not
> the software budget; "every model improvement makes your service faster and cheaper."
> Loaded when ARCH / PROJECT.md describes an **outcome-delivery** product, or mentions:
> autopilot, outcome-based, services-as-software, straight-through processing, human-in-the-loop,
> escalation, agent-of-record, "we do the work" / "done-for-you".
> Overlay only — reuses `ai-security-reviewer` + the vertical reviewer; adds no new reviewer.

## The autopilot vs assistant boundary (why this pack exists)

An **assistant** sells a tool to a specialist who stays accountable; the specialist reviews every
output. An **autopilot** sells the result to the business, so the *product* is accountable. That
shift creates four invariants a normal `agent-product` doesn't carry — and this pack enforces each
mechanically through `scripts/lib/autopilot-gate.mjs`, not as prose:

1. **Judgment boundary** — a confidence threshold below which a case is escalated to a named human
   role. Acting autonomously under the threshold is a release-blocking violation.
2. **Accuracy-as-SLA** — the eval suite IS the service contract. A measured metric below its
   declared floor blocks release (not "looks good").
3. **Per-decision audit trail** — who/what/inputs/confidence/timestamp for every autonomous action
   (liability: when the autopilot is wrong, you must reconstruct why).
4. **Per-outcome unit economics** — price per outcome vs the human baseline it replaces (the moat).

## The manifest

Every autopilot project carries `docs/autopilot/autopilot.json` (validated by the gate):

```json
{
  "name": "<product>", "vertical": "<legaltech|rcm|insurance|…>",
  "judgment":      { "confidenceThreshold": 0.92, "escalateTo": "<human role>" },
  "accuracySLA":   [ { "metric": "field_accuracy", "min": 0.98 }, { "metric": "recall", "min": 0.95 } ],
  "auditTrail":    { "enabled": true, "fields": ["who","what","inputs","confidence","timestamp"] },
  "unitEconomics": { "costPerOutcomeUsd": 4, "humanBaselineUsd": 400 },
  "reversible":    { "gatedActions": ["<every irreversible action requires a gate>"] }
}
```

```bash
node scripts/lib/autopilot-gate.mjs validate docs/autopilot/autopilot.json   # manifest well-formed
node scripts/lib/autopilot-gate.mjs sla      docs/autopilot/autopilot.json tests/eval/metrics.json
node scripts/lib/autopilot-gate.mjs log      docs/autopilot/autopilot.json docs/autopilot/decisions.json
```

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:judgment-boundary` | After the decision-log replay (`autopilot-gate.mjs log`), before launch | Product + domain lead (human) |
| `gate:accuracy-sla` | After the golden-set eval run (`autopilot-gate.mjs sla`), before launch + on every model/prompt change | ai-eval-engineer + domain lead |
| `gate:ship` | Standard | security-officer |

> The vertical pack adds its own professional sign-off on top (e.g. `gate:attorney-signoff`,
> `gate:coding-signoff`). This overlay never *replaces* a licensure gate — it sits beneath it.

## Required artefacts in every autopilot project

| Artefact | Location | Owner |
|---|---|---|
| Autopilot manifest (judgment / SLA / audit / economics) | `docs/autopilot/autopilot.json` | architect |
| Escalation / human-in-the-loop policy (who, SLA to respond, fallback) | `docs/autopilot/escalation.md` | architect |
| Decision audit-trail spec (schema + retention + access) | `docs/autopilot/audit-trail.md` | architect |
| Liability / error-budget doc (what happens when wrong; remediation path) | `docs/autopilot/error-budget.md` | architect + legal |
| Golden-set eval suite, accuracy-SLA enforced | `tests/eval/EVAL-accuracy-sla.md` | ai-eval-engineer |
| Per-outcome unit-economics model (extends the ARCH Cost Model) | ARCH `## Cost Model` row | architect |

## EVAL suite (mandatory)

- `EVAL-accuracy-sla` — every metric in `accuracySLA` is measured on the holdout set and clears its
  floor; regression below the floor fails the run (`autopilot-gate.mjs sla`).
- `EVAL-escalation-fires` — synthetic low-confidence cases (confidence < threshold) are escalated,
  not auto-completed.
- `EVAL-audit-trail-complete` — every autonomous action in a replayed batch has who/what/confidence
  logged (`autopilot-gate.mjs log`).
- `EVAL-no-silent-autonomy` — every irreversible action is either gated or impossible without a
  human; no unrecoverable action runs straight-through.

## Decision trees

### Is this an autopilot (load this pack) or an assistant?

```
Does the product deliver a finished outcome the BUSINESS relies on (not a draft a
professional must review and sign)?
  └─ YES → autopilot → load this pack; set the judgment threshold + escalation role
     └─ Is any action irreversible (money moved, filing submitted, message sent externally)?
        ├─ YES → that action MUST be in reversible.gatedActions (human gate) or made reversible
        └─ NO  → straight-through allowed above the confidence threshold
  └─ NO → assistant → plain agent-product; this overlay is optional
```

### Where to set the confidence threshold

| Outcome blast radius | Threshold | Below-threshold behaviour |
|---|---|---|
| Reversible, low-cost (draft, suggestion) | 0.80–0.90 | auto-complete, flag for sampling QA |
| Reversible, money/PII touched | 0.92–0.97 | escalate to human reviewer |
| Irreversible (filing, payment, external send) | gate always | human approves regardless of confidence |

## What this pack does NOT do

- It does not replace the vertical compliance pack (legaltech / rcm / insurance) — it composes
  beneath it. The vertical pack owns licensure + domain law; this overlay owns the autopilot shape.
- It does not introduce a parallel cost or eval system — `unitEconomics` extends the ARCH Cost
  Model and `accuracySLA` runs through `ai-eval-engineer`.
