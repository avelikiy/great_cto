---
name: tax-pack
description: Practice + penalty overlay for tax preparation / advisory products — autonomous return preparation, position-taking, and filing. Covers IRS Circular 230, preparer penalties (§6694 unreasonable position / §6695 signature / §7216 taxpayer-info disclosure & use), position standards (substantial authority / reasonable basis / Form 8275), e-file (PTIN/EFIN/Form 8879), multi-jurisdiction, and a mandatory credentialed-preparer sign-off before filing.
when_to_use: Product prepares tax returns, computes tax, takes/recommends positions, or e-files with a tax authority. Pairs with service-autopilot-pack when preparation runs autonomously.
applies_to:
  - tax
extends: []
---

# Tax (Preparation / Advisory) Pack

> Loaded automatically when ARCH or PROJECT.md mentions: tax return, tax preparation, tax advisory,
> irs, circular 230, ptin, efin, e-file, form 1040, form 1120, form 1065, form 8879, form 8275,
> substantial authority, preparer penalty, §6694, §7216, fbar, fatca, sales tax nexus.
> Routes through `tax-reviewer` (Circular 230 + preparer-penalty threat model) + adds the preparer gate.

## Reviewer

- **tax-reviewer** runs BEFORE senior-dev → writes `TM-tax-{slug}.md`
  - Classifies every autonomous position's authority (substantial authority / reasonable basis)
  - §6694 disclosure (Form 8275) or escalation below the standard
  - §6695 credentialed-preparer signature + PTIN; §7216 consent for non-preparation data use
  - E-file (PTIN/EFIN/Form 8879) + multi-jurisdiction scope

## Human gates added

| Gate | When | Owner |
|---|---|---|
| `gate:preparer-signoff` | Before any return is filed + on every below-standard position | Credentialed preparer — PTIN / EA / CPA / attorney (human) |
| `gate:ship` | Standard | security-officer |

> Stacks beneath `service-autopilot-pack`: that overlay owns the confidence→escalation boundary
> and audit trail (and the math/data accuracy-SLA); this pack owns the Circular 230 + preparer-
> penalty obligations and the *position-authority* judgment. The credentialed preparer is the
> autopilot's escalation target for below-standard positions and the required signature.

## Required artefacts in every tax project

| Artefact | Location | Owner |
|---|---|---|
| Position-authority policy (substantial authority / reasonable basis / Form 8275 disclosure) | `docs/tax/position-authority.md` | tax-reviewer + architect |
| §6695 signature + PTIN + copy-to-taxpayer workflow (no auto-file unsigned) | `docs/tax/preparer-signature.md` | architect |
| §7216 consent design (use of taxpayer data limited to preparation; training/cross-sell consent) | `docs/tax/7216-consent.md` | architect + legal |
| E-file controls (PTIN/EFIN, Form 8879 signed before transmission) | `docs/tax/efile.md` | senior-dev |
| Multi-jurisdiction scope + out-of-scope escalation (state / FBAR / FATCA) | `docs/tax/jurisdiction.md` | architect |
| Circular 230 due-diligence checklist (reliance, known-fact implications, conflicts) | `docs/tax/circular230.md` | tax-reviewer |

## EVAL suite

- `EVAL-position-authority-classified` — every autonomously-taken position carries an authority
  level; a below-reasonable-basis position is not taken; a reasonable-basis position is disclosed
  (Form 8275) or escalated.
- `EVAL-no-auto-file-unsigned` — no return is e-filed without a credentialed-preparer signature +
  PTIN and a signed Form 8879.
- `EVAL-7216-consent-required` — taxpayer return information is not used for any non-preparation
  purpose (analytics, cross-sell, model training) without specific §7216 consent.
- `EVAL-out-of-scope-jurisdiction-escalates` — a return touching an out-of-validated-scope state /
  FBAR / FATCA obligation escalates rather than auto-completing.
- `EVAL-below-standard-escalates` — a tax-shelter / reportable / below-substantial-authority
  position routes to a credentialed preparer.

## Decision trees

### Can this return be filed autonomously?

```
Does every position meet substantial authority (or reasonable basis WITH Form 8275), is the return
signed by a credentialed preparer with a PTIN + signed Form 8879, is §7216 data-use limited to
preparation, and are all jurisdictions in validated scope?
  ├─ YES → file, logged with the position-authority + signature evidence.
  └─ NO  → escalate to a credentialed preparer (gate:preparer-signoff). An unsigned return is
            never auto-filed; below-standard positions are never taken silently.
```

## What this pack does NOT do

- It is not tax advice and does not replace a credentialed preparer — it forces the preparer
  signature + position-authority discipline + §7216 consent, and makes the penalty surface explicit.
- For book/close accounting (incl. ASC 740 tax provision) pair with `accounting-reviewer`; this
  pack is return preparation + practice before the IRS.
