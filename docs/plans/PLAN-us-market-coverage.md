# PLAN: US-market regulatory coverage

**Goal:** close the highest-impact US regulatory gaps. great_cto's flagship "regulated"
reviewers are EU-centric (DORA/NIS2/ISO27001, Solvency II); the US market needs dedicated
overlay reviewers + a defense archetype + US-localized lending/insurance pipelines.

**Mechanism:** new overlay reviewers register as **domain packs** in
`packages/cli/src/packs.ts` (trigger keywords → reviewers + gates + compliance). New
verticals that need detection register as **archetypes** in `archetypes.ts` + `TYPE_MAP.md`.
Each reviewer ships with an `agents/{name}-reviewer.md`, a `skills/great_cto/packs/{name}-pack.md`,
and `tests/eval/EVAL-{name}-*.md`.

## Top-5 (max US-impact)

| # | Deliverable | Frameworks | Mechanism | Effort |
|---|---|---|---|---|
| 1 | **`sec-cyber-disclosure-reviewer`** + incident-disclosure gate | SEC 2023 Cyber Rule (8-K Item 1.05, 10-K Item 1C), materiality, CIRCIA | pack `sec-cyber-pack` | S |
| 2 | **`adtech-privacy-reviewer`** | VPPA, CIPA (wiretap/session-replay), MHMDA, state-privacy pixels, GPC | pack `adtech-privacy-pack` | S |
| 3 | **`cmmc-reviewer`** + **`defense-govcon` archetype** | CMMC 2.0, NIST 800-171, DFARS 252.204-7012, ITAR, Section 889 | archetype + pack | L |
| 4 | **`us-ai-reviewer`** (NIST AI RMF + state AI) | NIST AI RMF, Colorado AI Act SB 205, Utah AI, TX TRAIGA, CA AB 2013/SB 942 | pack `us-ai-pack` | M |
| 5 | **US-localize `lending` + `insurance`** | HMDA, SR 11-7, ECOA/Reg B, FCRA adverse-action / NAIC, state DOI filings | extend existing reviewers | M |

## Phases

- **Phase 1 (this PR):** #1 + #2 — pure overlay packs, no archetype/detection change. Agents + packs.ts + EVALs + tests.
- **Phase 2:** #3 — `defense-govcon` archetype (archetypes.ts + TYPE_MAP.md + detect) + `cmmc-reviewer`.
- **Phase 3:** #4 — `us-ai-reviewer` pack (US analogue of the EU AI Act coverage).
- **Phase 4:** #5 — US-localization of lending-credit-reviewer (HMDA/SR 11-7) and insurance-reviewer (NAIC/state DOI).

## Acceptance per reviewer

- `agents/{name}-reviewer.md` passes structural validation (name/description/model/tools/maxTurns/timeout).
- Registered in `packs.ts` (PackName + reviewers + gates + signals) **or** archetype.
- `skills/great_cto/packs/{name}-pack.md` exists.
- ≥1 `tests/eval/EVAL-{name}-*.md` with tuning + holdout cases.
- `packages/cli` build + tests green; `tests/structural/validate.py` green.

## Out of scope (backlog, see US gap analysis)

P1/P2 frameworks: NACHA/EFTA, FINRA/CFTC, Stark/AKS, DSCSA, ONC HTI-1, NERC CIP, FDCPA,
CAN-SPAM, E-SIGN/UETA, additional state-privacy laws (MD MODPA, OR, MT, …), GENIUS Act.
