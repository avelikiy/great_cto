# IMPL-BRIEF-great_cto-ely5.5.md

[archetype:devtools] [compliance:openssf,api-stability,soc2-type-2] [feature:four-domain-conditional-graphs] [phase:implementation] | Why: see docs/plans/PLAN-four-domain-conditional-graphs.md

## Task

**bd task:** `great_cto-ely5.5` — Board projection and evidence validation. Depends on .4 and frozen PM .3. One exclusive board writer, backend before page. Approved ARCH/ADR-041, DESIGN and frozen docs/gates/four-domain-conditional-graphs.md govern REQ-1 through REQ-12 within projection scope.

## Files to modify

| File | Reason |
|---|---|
| `packages/board/lib/fleet.mjs` | Shared registry and safe proposal projector |
| `packages/board/lib/routes.mjs` | Actual HTTP router; additive read endpoints |
| `packages/board/public/index.html` | Four choices and proposed semantic list; full response fences |
| `packages/board/fleet-focus.test.mjs` | Existing catalog/VM regressions |
| `packages/board/focus-proposal.test.mjs` | New API/privacy/race/neutrality fixtures |
| `tests/e2e/focus-proposal.e2e.test.mjs` | Real browser coverage |
| `tests/install-as-a-stranger.test.mjs` | New import closure in installed fixture if needed |

## Files NOT to modify

| File / glob | Reason |
|---|---|
| `scripts/**` | Shared packet .4; controllers/policies unchanged |
| `shared/**` | Catalog/packs/scheduler map unchanged |
| `agents/**` | Core and other role contracts retained |
| `packages/board/server.mjs` | Bootstrap unchanged; endpoints belong in routes.mjs |
| `packages/board/lib/execution-graph.mjs` | Observed graph separate |
| `docs/gates/**` | Frozen acceptance owned by root/PM |
| `.great_cto/**` | No project/policy/runtime mutation |
| `package*.json` | No dependency/packaging-policy changes |

No local CODEBASE.md inventory exists; do not claim complete god-node analysis. Named reason for large routes/page changes: two additive read endpoints and their focus/proposal UI. No unrelated formatting/refactoring. You are not alone; preserve other edits.

## Step-by-step

1. Consume .4 exports and implement safe project-scoped GET adapter tests. Backend finishes before page changes.
2. Extend Fleet helpers preserving existing VM slice testability: fixture context lacks full DOM/bootstrap. Eight core IDs flow via shared registry/API; unknown registry falls back to catalog, never duplicate hardcoded eight.
3. Add DESIGN controls/list/statuses, request-generation fences covering success/error/finally, and browser/packaging fixtures.
4. Run frozen .5 commands, hand candidate to root verifier. Do not modify gate or publish.

## API-CONTRACT

GET-only `/api/focus-registry?project=<registered-id>` and `/api/focus-proposal?project=<registered-id>&focus=<stable-id>&host=<codex|claude-code>&base=<explicit-pinned-base>`. Base is optional and must be explicitly supplied or already present in a valid existing binding; absence yields unavailable. Never guess HEAD~1 or another diff. Existing host/project authorization applies; unknown project 404 rather than cwd fallback, refused access follows existing 403/refusal; non-GET 405. JSON no-store, safe opaque project identity, no absolute root. No write endpoint or caller-submitted plan JSON.

Registry wraps .4 registry; proposal wraps .4 envelope plus selected project/focus/host and opaque change identity only from existing authorized bound metadata. No private source scan, assessChange/subprocess/model invocation from a board click. Missing current bound metadata returns unavailable. A native host selector does not attest host instrumentation. Public field/reason-code allowlist only, no raw plan/files/reasons/prompts/private roots. Unknown reason code displays Reason unavailable and cannot improve assurance.

Four buttons in shared registry order; no inferred initial focus. Candidate/Explicit-only and descriptive-invariant disclosures with separate finance packs. Full catalog and required/out-of-focus/missing/retired reviewers remain accessible; unknown registry/requirements shows unavailable plus full catalog. Inventory count is dynamic, not fixed 72.

Canonical proposed stage list/details, persistent Advisory. Does not change execution. No running/PASS/approved badges, fake timestamps or raw Mermaid/HTML. Recorded link only if existing authorized destination resolves; native partial/unavailable remains explicit. DESIGN loading/failed/empty/filtered/unavailable/offline/refused states stay distinct. Fence project + generation + focus + change + version, including error/finally; abort alone insufficient. Purge denied/mismatched content. Never mutate queues, approvals, admission or recorded traces.

## TEST-SPEC

| Case | Expected |
|---|---|
| Four IDs/five packs/eight shared core IDs | Exact mappings/labels, no selected default, no activation, separate finance packs |
| Unknown registry/policy and required missing/retired/out-of-focus | Full catalog fallback, accurate warnings, no hardcoded inventory |
| Known composable proposal, unsupported/stale identity | Correct advisory list or unavailable; proposed never observed |
| A late success/error/finally after B and focus/change switches | Complete fences; no stale data paint |
| GET/non-GET/unknown project/denied host | Safe scoped read or 405/404/refusal; no cwd fallback |
| HTML/private path/token/prompt/overlay canaries | Allowed text inert, forbidden data absent from JSON/DOM/attributes/storage/URLs |
| API reads/focus clicks/recorded inspection | Queue/map/approval/admission/trace state unchanged |
| Host limits | Native partial/unavailable not replaced by synthetic parity |
| Browser keyboard/themes/widths/reflow/motion/forced colors | DESIGN boundaries checked, unautomated checks explicitly NOT CHECKED |
| Standalone installed fixture | New imports resolve outside development checkout |

Commands: frozen docs/gates/four-domain-conditional-graphs.md packet .5. No invented percentage coverage or efficacy claim.

## ACCEPTANCE

- [ ] TEST-SPEC controls have focused evidence; exact frozen commands pass with skipped/unchecked checks distinguished.
- [ ] Only allowlisted files, zero scope violations and zero allowlist warnings; one board writer.
- [ ] Privacy/project-generation fences and unchanged execution/approval/admission state proven with negative fixtures.
- [ ] Shared core IDs, full catalog and proposed/observed/native-unavailable distinctions retained.
- [ ] Browser and standalone packaging checked or exact blocker/NOT CHECKED reported.
- [ ] Candidate handed to root canonical verifier and independent reviewer + QA + security; no publication.

## Out of scope / deferred

Runtime .7, matched paid benchmarks .8, global redesign, saved focus policy, new dependencies, private project reads, merge/release/deploy/install.

## Revision history

2026-10-23 PM v1: freeze sequential board writer with actual routes.mjs ownership; server.mjs excluded.
