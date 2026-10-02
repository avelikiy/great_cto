# Bounded historical import comparative corpus recipe

Date: 2026-10-03. Scope: `great_cto-p4o9.4.1.4`, with runtime-risk regression `great_cto-p4o9.1.1`. Related: [benchmark contract](2026-10-02-adaptive-benchmark-contract.md), [billing executable recipe](2026-10-03-billing-webhook-benchmark.md), [bound collector](2026-10-02-benchmark-bound-collector.md).

## Actual executable repair surface

The fourth preregistered task is a defective JavaScript historical importer. Workers repair only `src/import/history.mjs`, not a filesystem path-validation stand-in. The API consumes operator-owned in-memory rows/import IDs/revision, a bounded batch with named sources and their coverage, and explicit dry-run or rollback requests. No production data or external source is used.

Valid imports replace only the inclusive interval from the batch start to the **minimum** `coveredTo` across sources. Local rows older than the interval and newer than common source coverage survive. Input rows past that minimum do not enter the merged result even if their own source has more complete coverage. Exact row IDs, sources, timestamps and values must survive; numeric zero stays zero. Missing coverage, null values and numeric strings are invalid, not zero. Apply increments revision once and records batch ID; repeated application is unchanged. Rollback restores rows, import ledger and revision, then reapplication must work.

Five hidden groups contain21 calls:13 distinct invalid batches, two dry-run calls (valid and invalid), bounded replacement, apply/repeat, and apply/rollback/reapply. The seed contains rows before, inside and after the interval, including source-specific tail history. Input has both inclusive boundary rows, zero value and an out-of-common-coverage row. Random IDs are fixed in the private external pinned oracle before scoring; expected states and answers are withheld from worker execution. Only fixture files enter the worker root.

The standalone scorer independently validates oracle coverage and transitions. It rejects missing groups/steps, relabeled valid input, incorrect maximum-bound expectations, missing rollback, forged expected state and duplicate invalid-case substitution. It derives each expected state from the declared input and prior state, rather than trusting an empty sequence or supplied aggregate counter. Exact protected inventory/PROJECT hashes and pre/post receipts bind the candidate.

## Runtime policy regression discovered by the fixture

Initial behavioral tests passed for the reference repair, but shared `assessChange` classified `src/import/history.mjs` as T1. This would permit an architecture stand-down despite history-replacement risk. Explicit import/importer/data-import/backfill/ETL path components now conservatively force T2. No worker tier label is trusted, defaults do not change, and sensitive floors are never relaxed.

Git-derived tests retain security/compliance/import/ship floors under auto and gates-only; gates-only retains its architecture stop. Native policy cannot record a low-risk stand-down for these paths. Codex risk escalation after a low-risk stand-down blocks when an importer appears. An unrelated `import-map-helper` filename remains T1. This is conservative path-based coverage, not proof that all destructive data behavior can be inferred from filenames; matched independently attested domain floors remain necessary.

## Test plan and trust boundary

| Area | Test type | Required observations |
| --- | --- | --- |
| Import validation | Hidden behavior and mutation | Invalid input refused before any state change, including dry-run |
| Dry-run | Hidden state transition | Preview and invalid preview do not change rows/ledger/revision |
| Common coverage | Exact state comparison | Minimum source bound, inclusive edges, retained prefix/suffix and exact values |
| Idempotency | Repeated call | Same batch does not change state or increment revision twice |
| Rollback | Three-step lifecycle | Snapshot restored exactly; reapply succeeds |
| Oracle integrity | Negative integration | Missing/mislabeled/corrupt coverage refuses measurement |
| Candidate inventory | Negative integration | PROJECT drift, extra source, links and oversized code refused |
| Resource admission | Actual process probes | Operator file read, writes, network and subprocess denied; deadline, broad scope and oversize refused |
| Shared/native/Codex risk | Git-bound policy integration | T2 floors preserved, risk escalation blocks continuation |

As with the billing recipe, arbitrary repaired code runs in a restricted separate macOS process with default-deny resource admission, no credentials/preloads/addons, bounded input/output and deadline. Failed launch or unsupported host has no unprotected fallback. Scorer code and oracle are independently pinned operator inputs. The candidate sees initial state and requests, not expected responses or criterion metadata.

The observation wrapper still shares a JS runtime with candidate code. Local denial probes are not tamper-proof behavioral attestation, formal sandbox certification or same-user/key isolation. System metadata/sysctl reads are admitted; adversarial inspector/runtime tampering and non-macOS admission require independent review `great_cto-p4o9.5.8`. `benchmarkEligible=false` remains unchanged.

This bounded sequential importer does not establish database transactions, crash recovery, concurrent writers, conflicting payload reuse of a batch ID, cross-tenant access, duplicate IDs against retained history, durable rollback tokens or real provider source completeness. Rollback tokens are operator-owned snapshots, not authenticated public network capabilities. Those production properties must not be inferred from corpus self-tests.

## Remaining full-goal requirements

Final focused importer/policy checks pass37/37; the expanded importer/billing/scorer/specialist/policy regression passes102/102, without skips. The separate cross-host transport/controller regression passes44/44. Initial full CI failed on two new shell-pattern findings and an actual controller stdin EPIPE crash; neither was waived. Structured sandbox-policy construction plus the quoted-path denial probe cleared the scanner findings, and explicit transport-error handling repaired the controller crash.

Repeated full `ci-local.sh` exited0: root1255, libraries2790 passed with6 skips, eval238, docs76, browser9, CLI356 and CLI pack passed. L1–L5 completed with one absent Python board-suite skip, for7 explicitly NOT CHECKED overall. Three Docker and three live model tests in libraries remain unexecuted. HOL score83, zero Critical and unchanged35 previously reviewed High; no baseline edits or exceptions. Current read-only Claude auth probe returned `loggedIn=false`, `authMethod=none`. The pack is a local build artifact, not a released or installed plugin and not approval to merge.

The full regression also exposed and led to a [cross-host stdin lifecycle repair](2026-10-03-exec-stdin-lifecycle.md). Its process tests are not substituted for actual model trials.

Four of eight representative corpus recipes are implemented at this checkpoint. Prompt injection, API compatibility, migration safety and board accessibility remain. No actual paired model trials or quality-uplift percentage follows from self-tests. Matched domain floors, native/scoped live evidence, provider/package execution provenance, independent security sign-off and delivered installed artifact proof remain open. No model calls, approvals, merge, release, install or default changes occur in this increment.
