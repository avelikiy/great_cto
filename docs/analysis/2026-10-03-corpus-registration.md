# Frozen eight-task corpus registration

Scope: `great_cto-p4o9.4.1.9`. Related: [protocol](2026-10-02-adaptive-benchmark-contract.md), [complete recipe corpus](2026-10-03-board-accessibility-benchmark.md), [bound scorer](2026-10-02-benchmark-bound-collector.md).

The registrar constructs exactly the eight preregistered recipes once and freezes their actual worker input bytes, private oracle bytes, standalone scorer bytes and generator source bytes. Randomized oracles are persisted, never regenerated during verification. Each task binds original specification/criteria digests, source inventory, protected names, worker digest, evidence size/hash, scorer-bound admission digest and explicit runtime requirement. It neither changes task taxonomy nor substitutes smaller tasks.

An actual first snapshot is retained privately at `/Users/Shared/great-cto-corpus-registration-VYv5lZ/corpus-RZqCrs`. Its registration SHA256 is `015a66ba25b718b5713912a87cf0a2bb1a54db33c234352a8138b646fa1bd29a`. It contains71 files:46 worker inputs,8 private oracles,8 scorers,8 generators and registration.json. This is operator-owned preparation, not a provider trial or approved matched experiment. The directory must not be passed to a worker as its workspace; a trial copies only its own worker blueprint into a separate writable Git root.

## Integrity boundary

Files are0400, directories0500, operator parent private/canonical. Writes use exclusive create and a fresh unique directory, never overwrite an existing snapshot. Verification requires an externally held manifest SHA256, rejects symlinks/hardlinks, bounds files/count/total bytes, compares exact inventory including unexpected empty directories and refuses writable/public snapshot state. Private oracle parse errors are generic and do not echo hidden values. Public summaries expose only fixed task metadata, counts and hashes; malformed private strings in IDs/pins refuse summary.

External pin is essential: self-rehashing a changed corpus is not proof that it is the originally preregistered corpus. Re-pinned malformed manifests additionally refuse task loss/duplication, wrong tier/criteria, admission downgrade, unsafe evidence paths and eligibility/provenance flag promotion. Semantic private testcase admission remains the responsibility of the frozen scorer; this metadata layer does not replace its behavioral checks.

Runtime snapshots hash declared local Node/sandbox/PostgreSQL tool bytes and capture host/node version. Browser entry is bound to the private oracle's exact Playwright entry pin. Current runtime recheck compares these declarations and bytes; an explicit metadata-only check returns runtimeBytesChecked:false. Tool bytes can be available, unavailable or unsupported-host. These states are not execution proof: the loader may reject an incompatible PostgreSQL version or resolve dependencies/binaries not covered by these pins. Running Chromium/dependency closure, selected runtime binary, signed OS admission and provider identity remain unassessed.

Owner chmod is not hardware immutability, and private permissions do not exclude hostile same-OS-user processes. Source generator hash is an archived byte snapshot, not attestation of which imported module executed. Missing tools do not silently become successful measurements. Every summary retains frozen-not-run-ready, benchmarkEligible:false and false graph-floor, artifact, provider and independent-admission flags. This snapshot has no signing authority approval, does not bind both controller artifacts/model policies and cannot retrobind previous runs. Existing independent review `.5.8` remains open.

## Test plan

| Area | Required evidence |
| --- | --- |
| Complete coverage | Exact ordered8 tasks and unchanged protocol specifications/criteria |
| Transport pin | A previous snapshot pin refuses a freshly randomized corpus |
| Evidence integrity | Worker/scorer/oracle/generator byte drift refused |
| Semantic admission | Lost/duplicate tasks, wrong tier/criteria/runtime/path/eligibility refused even after re-pin |
| Filesystem boundary | Missing/extra/empty-directory/links/writable/public files refused |
| Privacy | Public summary excludes private signing/decision values; malformed oracle errors do not echo data |
| Tool metadata | Current declared tool pins checked; skipped check explicitly false, never silently complete |
| Actual consumer | Frozen external docs scorer/oracle executes in separate writable Git trial: defective fails, repaired passes, snapshot remains unchanged |

Consumer test is local separate process execution, not a model/provider workflow or quality-uplift measurement. No live models, actual approvals, defaults, install, merge or release occur. Full objective still requires independent matched graph floors, current executing package/provider/native/scoped proof, paired trials and delivered installed artifact validation.

## Observed validation and unrelated CI repair

The final expanded registration/scorer/protocol/collector regression passed101/101, with28 new registration tests and no skips. The shared eligibility boundary is frozen so a caller cannot promote subsequent registrations by mutating a returned manifest. The frozen docs consumer rejected the defective input, accepted the repaired input and left the original private snapshot byte-identical. These are local observer checks, not paired model trials.

The first stock quick CI failed two existing auto-learn tests during temporary HOME cleanup (ENOTEMPTY), not on learning behavior assertions. A direct isolated `bd list` diagnostic confirmed that the installed CLI creates `.beads` and `.config` even without a project database. The learning test helper now supplies a deterministic local Beads executable, preserving all learning assertions and production hook behavior. A new regression checks that neither real Beads state directory is initialized. Focused learning tests passed10/10, no skips. This removes an unrelated external CLI/telemetry side effect from the test, not a cleanup retry or weakened assertion.

The scanner flagged the initial PATH template adjacent to spawnSync as shell injection. PATH is now constructed as an environment entry list, with subprocess arguments still passed separately and no shell execution. HOL returned83, zero Critical,35 previously reviewed High and no new High/Critical; its baseline and exceptions were not changed. Current Claude authentication remains absent (`loggedIn:false`, `authMethod:none`), so no live provider trial is claimed.
