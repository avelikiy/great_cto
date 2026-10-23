# Bound-run proposal: frozen acceptance

Frozen: 2026-10-23. Owner: root verification/PM. Builders must not edit this file. Accepted ADR-042 and ARCH-bound-run-proposal govern this additive stored-snapshot inspection slice. No implementation PASS is asserted here.

Architecture gate great_cto-ely5.15.2 is CLOSED by explicit operator approval. Canonical approval helper gates-only/devtools returns product, arch, import, ship, with no human plan pause. Existing review/QA/security floor and separate ship authority remain. Parent great_cto-ely5.15 stays in progress until verification completes.

## Exact commands

Run in the candidate worktree. Only synthetic state fixtures; never read operator private runs.

Reader:
```sh
node --test tests/lib/bound-run-proposal.test.mjs
```

API:
```sh
node --test packages/board/bound-run-proposal.test.mjs packages/board/focus-proposal.test.mjs packages/board/fleet-focus.test.mjs packages/board/fleet-read.test.mjs packages/board/fleet-classify.test.mjs
```

UI (VM plus actual Chromium path; browser skip is NOT CHECKED):
```sh
node --test packages/board/bound-run-proposal-ui.test.mjs
node --test tests/e2e/focus-proposal.e2e.test.mjs tests/e2e/execution-graph.e2e.test.mjs
```

Compatibility, authority floor and distribution:
```sh
node --test tests/lib/conditional-graph-proposal.test.mjs tests/lib/domain-evidence.test.mjs tests/lib/codex-host-state.test.mjs tests/lib/execution-trace.test.mjs
node --test tests/lib/review-graph-floor.test.mjs tests/lib/specialist-plan.test.mjs tests/lib/controlled-specialists.test.mjs tests/lib/runtime-gate-policy.test.mjs tests/lib/domain-admission.test.mjs tests/lib/domain-benchmark.test.mjs tests/lib/domain-pilot-plan.test.mjs
node --test tests/install-as-a-stranger.test.mjs
node --test tests/docs/*.test.mjs
```

Final canonical candidate, after targeted checks:
```sh
GREAT_CTO_TEST_PLUGIN_DIR="$PWD" bash scripts/ci-local.sh --e2e
```

Root records candidate HEAD plus dirty feature diff identity, stdout, rc, elapsed, skips and NOT CHECKED. Run canonical gate once on final candidate; later fixes require relevant checks plus final gate for changed identity. Never weaken tests, thresholds, stage selection or timeouts to obtain green. Independent code-reviewer, qa-engineer and security-officer each bind verdict to that candidate after the canonical gate. Missing browser/dependency is BLOCKED/NOT CHECKED.

## Required deciding controls

| ID | Required observation |
|---|---|
| B1 | Exact review descriptor and proposal bind registered canonical project, explicit lowercase UUID, phase, snapshotDigest, epochDigest, stored plan fingerprint, pinned base and policyDigest. Unknown/missing/duplicate/overlong query values fail before source read; total URL <=2 KiB; exactly one of every allowed key. GET only; other methods 405 and Allow GET. |
| B2 | Preparation planningOnly:true supports a descriptor. Graph request returns planning-only-evidence, binding:null, proposal:null, no projector call, no flag rewrite and no review fallback. Review requires planningOnly:false. |
| B3 | Exact-Origin guard precedes project registry, resolver, metadata and state reads BOTH in HTTP server bootstrap and direct dispatcher. Real HTTP and dispatch spies prove zero reads for foreign/null/malformed/duplicate Origin, wrong scheme/port, another allowed-host Origin. Trusted transport/server external origin only, never caller forwarded headers. Absent Origin rejects cross-site Sec-Fetch-Site and foreign Referer; absent Origin/Referer CLI allowed. No wildcard ACAO on either new route. |
| B4 | Absolute canonical store, no symlink component, store0700/file0600, effective UID owner; ancestors are non-symlink directories owned by UID/root and not group/other writable, including sticky tmp rejection. Check before and after. Regular file, nlink1, no-follow/non-blocking and descriptor/path dev/ino/uid/mode/size/nlink/mtime/ctime checks. No chmod/repair/mkdir. Trusted fixture root or injected metadata, no production trust bypass. |
| B5 | One exact UUID state read <=1 MiB+sentinel and one selected PROJECT read <=64 KiB+sentinel, <=1,114,114 bytes total. Strict UTF-8/JSON, v1, state.id exact, canonical state.root equals selected registered root. Other-project and missing UUID share 404 shape/message without private detail. |
| B6 | Recheck root/state/policy identity; policy digest equals stored specialistPolicy.projectDigest; phase fingerprint equals plan.fingerprint, assessment base equals pinned policy base. Catalog roles, unique roles, preparation mappings and closed hard-gate enum validated; unknown/missing native/legacy evidence unavailable without inference. Mutation or expected tuple mismatch gives409 snapshot-changed, no reread/retry. |
| B7 | epochDigest hashes canonical phase, planFingerprint, assessmentFingerprint, base, policyDigest, roles, selected(null if absent), hardGates. Sorted object keys, array order retained. Snapshot hashes exact bytes. Same plan/different phase differs; unrelated mutation invalidates snapshot; identical-content replacement has no unique historical epoch or ABA protection claim. |
| B8 | Only pure projector invoked for review. Union phase/current PROJECT/baseline import+ship gates; every required selected reviewer/contract survives. Preserve eight contracts, full catalog, mandatory code-reviewer/qa-engineer/security-officer and candidate/explicit-only pack admission. Overflow fails closed, no selective truncation. |
| B9 | Fresh allowlisted JSON only; raw state/plan spreading forbidden. Canary prompts/tokens/file names/project names/root paths/status/reasons/errors absent in JSON/DOM/headers/logs. No URLs/query/binding values in logs; textContent/fixed templates for stored labels. Response <=96 KiB; nested unchanged v1 proposal <=64 KiB. |
| B10 | Envelopes schemaVersion1, stored-snapshot provenance, advisory:true, changesExecution:false, currentTreeAssessment:false, reusablePass:false and all ARCH limitations. Legacy changeIdentity unchanged. Unavailable has binding:null/proposal:null, fixed reason and no partial graph. no-store JSON, no ETag/304/shared cache/browser persistence. |
| B11 | UI explicit UUID and phase; separate Stored proposal and observed Execution graph. Adjacent provenance/current-tree warning; preparation explanation. Preserve prepareFleetScope, synchronous switchProject clear, four existing generations/accessGeneration; key includes project/run/phase/full binding/focus/registryVersion. A-B-A, late success/error/finally, access denial, run/phase/focus switch, offline, malformed/unknown version clear graph and descriptor; denied state never resurrected. Retry explicit, no auto-select/refresh. |
| B12 | Keyboard labels, aria-busy/live, focus-preserving retry and existing density/tokens; browser exercises states and races. Native unavailable distinct from offline/denied/snapshot-changed. Mixed worker hostRoutes cannot attest native enforcement or observed execution. |
| B13 | Spies show zero enumeration/readdir/listCodexRuns/source assessment/planFor/assertSpecialistEpoch/Git/subprocess/network/paid calls/timer retry/writes. Controller state, scheduler/gates/approval/admission/observed trace unchanged. |
| B14 | Packed archive includes reader and its import closure; import runs outside checkout against synthetic fixture. Stranger-install test plus root archive evidence required, repository import alone insufficient. No manifest change expected (bundle-board closure is derived); if needed root assigns one owner before edit. Backout removes adapter/UI only, retains all stored records. |

## Status contract

400 invalid-selection;403 access-denied;404 unavailable (missing/other-root identical);200 unsupported-evidence/unsafe-evidence/invalid-evidence/planning-only-evidence;409 snapshot-changed. Errors never include raw paths/messages or stored fields. Known structural assessment is saved evidence only, never current attestation, approval or reusable PASS.

## Authority and rollback

No controller/projector/schema/catalog/pack/gate-policy change. No paid models, operator-run inspection, live execution, merge/release/deploy/install. Old frozen gates are read-only. Root owns integration, commits and review aggregation. Rollback additive reader/routes/UI and discard transient descriptors only. No historical records or policy writes.

