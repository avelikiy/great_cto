# IMPL-BRIEF-great_cto-ely5.15.7.md

[archetype:devtools] [compliance:openssf,api-stability,soc2-type-2] [feature:bound-run-proposal] [phase:implementation] | Why: see docs/plans/PLAN-bound-run-proposal.md

## Task

- **bd task:** `great_cto-ely5.15.7` — API bound-run proposal
- Accepted ARCH: docs/architecture/ARCH-bound-run-proposal.md; frozen acceptance: docs/gates/bound-run-proposal.md.
- Not alone in this checkout. Preserve others' changes. One exclusive writer per owned file; report scope extension to root first. No builder commits/pushes unless root separately authorizes.

## Files to modify

- `packages/board/lib/routes.mjs`
- `packages/board/server.mjs`
- `packages/board/bound-run-proposal.test.mjs`
- `docs/BOARD-API.md`

## Files NOT to modify

- `scripts/lib/bound-run-proposal.mjs`
- `tests/lib/bound-run-proposal.test.mjs`
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

Consume the two reader functions and honor the frozen GET selection and status schema. Exact adapter fields follow.

Consume async readBoundRunBinding/readBoundRunProposal from reader module, returning {status,body}. Server resolves storeDir (not request), projectRoot/projectId via registry only after guard. GET /api/focus-run-binding keys project,run,phase; GET /api/focus-run-proposal keys project,run,phase,focus,snapshot,epoch,plan,base,policy. Convert latter to focusId and binding snapshotDigest,epochDigest,planFingerprint,base,policyDigest. Exactly one of each allowed key; explicit project, strict lowercase UUID, phase/focus enums, digests and URL<=2048. Export naming agreed here; if adapter mismatch root coordinates both owners before change. Preserve existing v1 endpoints. JSON/no-store; GET only405 Allow GET; no wildcard CORS. Exact-origin pre-read guard required in BOTH bootstrap and direct dispatcher.

## TEST-SPEC

Frozen B1,B3,B5,B6,B9,B10,B13. Real HTTP plus direct dispatch zero-read spies for invalid query and all foreign/null/malformed/duplicate/wrong scheme/port/other allowed-host origins; absent Origin/Referer CLI valid; cross-site Fetch-Site rejected and foreign Referer rejected. Run exact API command in frozen acceptance; existing v1 behavior preserved.

## ACCEPTANCE

- [ ] Relevant frozen B controls have passing tests with exact commands and no hidden skips.
- [ ] Only allowlisted files changed; concurrent owners' files untouched.
- [ ] API-CONTRACT matches accepted ARCH and no raw private values escape.
- [ ] Preparation descriptor succeeds but graph unavailable; no saved evidence upgraded to attestation.
- [ ] No controller/projector/gate-policy writes, enumeration, source scans, subprocess/network/paid calls or operator-run access.
- [ ] Root receives changed-file list, command outputs/rc, skips/limitations; no premature full-delivery claim.

## Out of scope

Current-tree assessment, attestation, historical occurrence identity, native evidence synthesis, execution activation, paid/live runs, merge/release/install.

