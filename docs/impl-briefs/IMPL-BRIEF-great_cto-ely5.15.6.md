# IMPL-BRIEF-great_cto-ely5.15.6.md

[archetype:devtools] [compliance:openssf,api-stability,soc2-type-2] [feature:bound-run-proposal] [phase:implementation] | Why: see docs/plans/PLAN-bound-run-proposal.md

## Task

- **bd task:** `great_cto-ely5.15.6` — reader bound-run proposal
- Accepted ARCH: docs/architecture/ARCH-bound-run-proposal.md; frozen acceptance: docs/gates/bound-run-proposal.md.
- Not alone in this checkout. Preserve others' changes. One exclusive writer per owned file; report scope extension to root first. No builder commits/pushes unless root separately authorizes.

## Files to modify

- `scripts/lib/bound-run-proposal.mjs`
- `tests/lib/bound-run-proposal.test.mjs`

## Files NOT to modify

- `packages/board/lib/routes.mjs`
- `packages/board/server.mjs`
- `packages/board/bound-run-proposal.test.mjs`
- `docs/BOARD-API.md`
- `packages/board/public/index.html`
- `tests/e2e/focus-proposal.e2e.test.mjs`
- `packages/board/bound-run-proposal-ui.test.mjs`
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

Public functions return a status and a fresh allowlisted body. Exact signatures and adapter fields follow.

Export async readBoundRunBinding({projectRoot,projectId,runId,phase,storeDir}) and async readBoundRunProposal({projectRoot,projectId,runId,phase,storeDir,focusId,binding}). Both return {status,body}, no headers/private messages. binding uses snapshotDigest,epochDigest,planFingerprint,base,policyDigest. All values are server-validated selection; reader independently validates identity/trust. storeDir is server-owned resolved store location, never query input. Route owner owns HTTP parsing/origin/access/registry/no-store; reader owns all filesystem work. Missing/different-root=>404 unavailable; unsafe=>200 unsafe-evidence; changed=>409 snapshot-changed. Read accepted ARCH envelope and phase contracts exactly. A private optional dependency-injection seam for deterministic FS tests may not disable production checks. Catalog roles must be shipped roles from pure static map/constants, not arbitrary CODEX_ROLE_PROFILES embedding aliases. No per-request agent-directory reads.

## TEST-SPEC

Frozen B2,B4–B10,B13. All trusted read, malformed/hostile/membership/canonical/hash/policy/role/gate/race cases and privacy/invocation spies. node --test tests/lib/bound-run-proposal.test.mjs. Tests use synthetic trusted private roots/injected metadata, no real state.

## ACCEPTANCE

- [ ] Relevant frozen B controls have passing tests with exact commands and no hidden skips.
- [ ] Only allowlisted files changed; concurrent owners' files untouched.
- [ ] API-CONTRACT matches accepted ARCH and no raw private values escape.
- [ ] Preparation descriptor succeeds but graph unavailable; no saved evidence upgraded to attestation.
- [ ] No controller/projector/gate-policy writes, enumeration, source scans, subprocess/network/paid calls or operator-run access.
- [ ] Root receives changed-file list, command outputs/rc, skips/limitations; no premature full-delivery claim.

## Out of scope

Current-tree assessment, attestation, historical occurrence identity, native evidence synthesis, execution activation, paid/live runs, merge/release/install.

