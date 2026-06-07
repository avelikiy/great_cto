# PLAN: Service-Autopilot archetype family

**Thesis source:** *"Services are the new software"* ([habr.com/ru/articles/1043202](https://habr.com/ru/articles/1043202/)).
AI **autopilots sell the outcome of a service** (not a tool to a specialist) in verticals with
low *judgment* and a strong compliance surface — exactly where great_cto's gate + signed-exception
+ audit-trail model is the differentiator. This epic equips great_cto to serve teams building
those autopilots.

## Coverage gap (article verticals × great_cto today)

| Vertical | great_cto today | Action |
|---|---|---|
| Insurance / claims | `insurance-pack` + `insurance-reviewer` | ✅ have (claims-adjudication slant later) |
| Recruitment | `hr-ai-pack` + `hr-ai-reviewer` (AEDT/EEOC) | ✅ have |
| Lending | `lending-pack` + `lending-credit-reviewer` | ✅ have |
| **Transactional legal (contracts/NDA/filings)** | — | ❌ Phase 2 |
| **Healthcare billing / ICD-10 / RCM** | clinical/digital-health (care, not billing) | ❌ Phase 3 |
| Procurement / supply chain | — | Phase 4 (future) |
| Accounting / close / audit | `SOX-ITGC` template only | Phase 5 (future) |
| Managed-IT / MSP | `l3-support` + `infra` (internal, not as a service) | Phase 6 (future) |
| Tax | — | Phase 7 (future) |
| Management consulting | — | ⏭ skip (high-judgment; article says hardest) |

## Cross-cutting insight

Every "service autopilot" shares concerns a normal `agent-product` doesn't: a **confidence →
human-escalation** boundary (the assistant↔autopilot line from the article), **accuracy-as-SLA**
(the eval IS the contract), a **per-decision audit trail** (who/what decided, for liability),
and **per-outcome unit economics** ("every model improvement makes the service cheaper"). These
compose from infra we already shipped — `ai-eval-engineer`, governance exceptions (Phase 1),
traceability (Phase 4), cost-model. So the highest-leverage move is one overlay, not per-vertical
re-implementation.

## Anatomy of a pack (the build checklist, per existing convention)

A vertical pack = `packs/{x}-pack.md` + `agents/{x}-reviewer.md` + `templates/TM-{slug}.md` +
`commands/{cmd}.md` + `plugin.json` SessionStart copy-loop entry + `packages/cli/src/packs.ts`
(`PackName` + `SIGNALS` + `PACK_REVIEWERS`) + `ARCHETYPES.md`/`TYPE_MAP.md` rows +
`tests/structural/test_new_reviewers.py` registry row. An *overlay* pack (no dedicated reviewer)
skips the reviewer/TM/command and reuses existing reviewers — like `agent-pack`.

## Phases

**Phase 1 — `service-autopilot` overlay (P0, this wave).** Overlay on `agent-product` + the
vertical archetypes. No new reviewer. Adds:
- gates: `gate:judgment-boundary` (confidence threshold + escalation policy reviewed before
  launch), `gate:accuracy-sla` (golden-set accuracy/recall is a release contract, not "works");
- artefacts: decision audit-trail spec, escalation/human-in-the-loop policy, per-outcome
  unit-economics model (extends cost-model), liability/error-budget doc;
- EVAL suite: accuracy-SLA, escalation-fires-below-threshold, audit-trail-completeness,
  no-silent-autonomy (every autonomous action is logged + reversible or gated).
- Loads like `agent-pack`/`insurance-pack` — an archetype-tied overlay (`applies_to: agent-product`
  + the vertical archetypes; opt-in via `packs: [service-autopilot]`), **not** the `packs.ts`
  keyword-signal registry (that subsystem is reserved for the v2.8 auto-detect packs and is
  count-coupled to a brittle test). Wires into `ARCHETYPES.md` overlays only.
- Machine-checkable core `scripts/lib/autopilot-gate.mjs` (+ tests) so the overlay is enforceable,
  not just prose — mirrors the governance Phase-2/3/5 lib pattern.

**Phase 2 — `legaltech` pack + `legal-reviewer` (P0).** Transactional-legal autopilots.
- Compliance surface: UPL (unauthorized practice of law) boundary, attorney-client privilege +
  confidentiality, jurisdiction/choice-of-law, e-signature (ESIGN / UETA / eIDAS), conflict-of-
  interest checks, matter retention + legal hold.
- Mandatory `gate:attorney-signoff` (licensed attorney) before any output is client-facing.
- Deliverables: full pack anatomy (reviewer, `TM-legal.md`, `/upl-check` command, wiring, tests).

**Phase 3 — `rcm` pack + `rcm-reviewer` (P0).** Revenue-cycle / medical-coding autopilots
(clinical note → ICD-10-CM / CPT / HCPCS → claim).
- Compliance surface: HIPAA (reuse), **False Claims Act** + upcoding/unbundling fraud, NCCI
  edits + MUEs, medical-necessity + LCD/NCD, payer-specific rules, coder-of-record audit trail.
- Mandatory `gate:coding-signoff` (CPC/CCS certified coder) above an autonomy-confidence floor.
- Deliverables: full pack anatomy (reviewer, `TM-rcm.md`, `/coding-audit` command, wiring, tests).

**Phases 4–7 (future, scoped not built):** procurement (OFAC/FCPA/PO-fraud/SoD), accounting-close
(GAAP/IFRS, ASC 606, SOX ITGC, SoD), managed-IT/MSP (change-mgmt, JIT least-privilege, SOC2,
blast-radius), tax (IRS Circular 230, e-file, preparer penalties).

## Acceptance

- `service-autopilot` overlay loads on `agent-product` + vertical archetypes; its gates +
  EVAL suite are enforced; unit-economics extends the existing cost-model (no parallel system).
- `legaltech` + `rcm` packs follow the exact existing pack anatomy; `test_new_reviewers.py`,
  `validate.py`, and prompt-lint pass for the new reviewers.
- Zero new runtime deps. Each phase ships its own PR + green test suite, mirroring epic
  `great_cto-h4p` (governance) cadence.

## Do NOT

- ❌ A parallel cost/eval/audit system — compose from `ai-eval-engineer`, governance exceptions,
  trace, cost-model. ❌ Management-consulting pack (high-judgment). ❌ Per-vertical duplication of
  the cross-cutting autopilot concerns — those live once, in the Phase 1 overlay.
