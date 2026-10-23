# IMPL-BRIEF-great_cto-ely5.15.8.md

[archetype:devtools] [compliance:openssf,api-stability,soc2-type-2] [feature:bound-run-proposal] [phase:implementation] | Why: see docs/plans/PLAN-bound-run-proposal.md

## Task

- **bd task:** `great_cto-ely5.15.8` — UI bound-run proposal
- Accepted ARCH: docs/architecture/ARCH-bound-run-proposal.md; frozen acceptance: docs/gates/bound-run-proposal.md.
- Not alone in this checkout. Preserve others' changes. One exclusive writer per owned file; report scope extension to root first. No builder commits/pushes unless root separately authorizes.

## Files to modify

- `packages/board/public/index.html`
- `tests/e2e/focus-proposal.e2e.test.mjs`
- `packages/board/bound-run-proposal-ui.test.mjs`

## Files NOT to modify

- `scripts/lib/bound-run-proposal.mjs`
- `tests/lib/bound-run-proposal.test.mjs`
- `packages/board/lib/routes.mjs`
- `packages/board/server.mjs`
- `packages/board/bound-run-proposal.test.mjs`
- `docs/BOARD-API.md`
- `scripts/lib/conditional-graph-proposal.mjs`
- `scripts/lib/controlled-specialists.mjs`
- `scripts/lib/codex-host.mjs`
- `docs/gates/**`
- `docs/architecture/**`
- `docs/adr/**`
- `agents/**`
- `shared/**`
- `tests/lib/bound-run-package.test.mjs`

All controller execution, observed projector, policy/gates/catalog/pack admission, prior frozen gates and unlisted files are out of scope. Root owns integration and packaging probe.

## Step-by-step

1. Read accepted ARCH relevant contract and frozen acceptance; inspect own files.
2. Add synthetic negative controls, implement the scoped behavior.
3. Run own targeted command, check changed-file ownership and report evidence to root. Root runs final canonical gate.

## API-CONTRACT

Consume only frozen ARCH binding/inspection schemaVersion1 GET envelopes. Explicit UUID+phase descriptor request then proposal with full tuple; support preparation descriptor but planning-only-evidence/no graph. Fixture-driven UI may proceed before API completion; actual cross-layer test root-owned. Existing prepareFleetScope, synchronous switchProject clearing, four generations/accessGeneration and full project/run/phase/binding/focus/registry identity remain mandatory. Saved proposal separate observed Execution graph; false assurance flags adjacent. Scope from independent DESIGN-bound-run-proposal applies without board-wide redesign.

## TEST-SPEC

Frozen B2,B9–B12. Unique VM test owns deterministic A-B-A/delayed success,error,finally/denial fences, unknown versions/offline/malformed, no stale graph. Real Chromium e2e tests explicit controls/preparation/review/races/privacy/accessibility; zero browser skips to claim pass. Run exact UI commands in frozen acceptance.

## ACCEPTANCE

- [ ] Relevant frozen B controls have passing tests with exact commands and no hidden skips.
- [ ] Only allowlisted files changed; concurrent owners' files untouched.
- [ ] API-CONTRACT matches accepted ARCH and no raw private values escape.
- [ ] Preparation descriptor succeeds but graph unavailable; no saved evidence upgraded to attestation.
- [ ] No controller/projector/gate-policy writes, enumeration, source scans, subprocess/network/paid calls or operator-run access.
- [ ] Root receives changed-file list, command outputs/rc, skips/limitations; no premature full-delivery claim.

## Out of scope

Current-tree assessment, attestation, historical occurrence identity, native evidence synthesis, execution activation, paid/live runs, merge/release/install.

