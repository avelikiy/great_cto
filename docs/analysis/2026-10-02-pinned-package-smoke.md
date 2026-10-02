# Pinned baseline package execution smoke

Date: 2026-10-02. Scope: `great_cto-p4o9.4.3.1.7`. Related: [matched benchmark contract](2026-10-02-adaptive-benchmark-contract.md) and [bound collector](2026-10-02-benchmark-bound-collector.md).

## What this verifies

The baseline's public npm tarball had been matched to source bytes, but not executed from its delivered layout. `runPinnedPackageSmoke()` now extracts an exact SHA256-pinned archive into a new private temporary directory and invokes the actual published `index.mjs` twice: `--version` and `codex-host list`. The latter exercises the compiled CLI bridge and its bundled controller with a separate empty run-store. No package manager install, postinstall, model invocation command, gate approval or release command is requested.

The child environment contains only fixed PATH/LANG/TZ, Python bytecode suppression and the diagnostic run-store location. It does not inherit NODE_OPTIONS, model credentials, custom configuration or operator run-store overrides. This is environment separation, not OS isolation: a trusted package running under the same user could still access that user's filesystem. The probe is not designed for executing arbitrary hostile packages.

Archive admission is separate from execution. A trusted Python 3.12 stdlib helper checks the compressed-file pin, bounds expansion to128MiB before parsing tar metadata, limits4000 members and8MiB per file, and rejects traversal, duplicate entries, links, devices, special modes and file/directory overlap before extraction. Python is used here for binary archive semantics and its data extraction filter, not for editing source files. Extraction only targets a new canonical private empty directory. Package files are inspected with bounded no-follow reads, then their full inventory/modes/digests and the original tarball pin are rechecked after both processes.

Diagnostics are mode0600 under a mode0700 evidence directory. Raw subprocess output remains there rather than being printed by the probe. Failed probes preserve that directory and attach its path to the error. The exported report contains process metadata and hashes, not credentials or candidate source. Fixture tests clean only their own exact temporary directories.

## Actual public baseline result

The public3.48.0 archive with SHA256
`380d99c7b72a0769c191a9e077bfa1b0003e0effe02339998c2f193791f428a9`
executed successfully from its extracted published layout:

| Check | Observed result |
| --- | --- |
| Published CLI `--version` |3.48.0, exit0 |
| Published CLI `codex-host list` |`state: ok`, runs empty, unreadable0, exit0 |
| Extracted regular files |147 |
| Entry SHA256 |`e90b93e5a01ce84ac430c905e093fee493da385e793f11e6a0f244e4c200d9df` |
| Package inventory digest |`30ee98d3c78b5477815f3ce6d8462db9acbe1122b901ac6c3dfd46aeba78d1a1` |
| After execution |Package inventory and archive pin unchanged |

The initial probe incorrectly expected listing state `read`; inspection of the actual controller contract established `ok`. That was a harness assertion error, not a baseline startup failure. The corrected probe verifies the exact returned contract and does not relabel degraded/absent stores as successful.

## Test plan and remaining gaps

Six integration tests cover real separate CLI processes, environment suppression, private evidence, no lifecycle script execution, mismatched/symlink archive rejection, malicious tar inventories, gzip expansion limits, incorrect version/listing/JSON, failed process, modified package and malformed metadata without echoing input. Negative inventories exercise absolute/traversal paths, duplicate files, symbolic/hard links, devices, parent file overlap and oversized/negative member sizes. The six-test suite passed without skips. Initial scanner findings on a constant environment-test marker were removed by using a generated per-run sentinel; no scanner rules or baseline exceptions were changed. Repeat scanner score83, zero Critical and the unchanged35 reviewed High.

This is delivered-CLI smoke proof, not full workflow execution or a tamper-resistant loaded-module closure attestation. It does not bind a benchmark run to the executing package, prove all dynamically read assets, establish provider requests/cost or certify both arms' mandatory domain floors. `executionArtifactProvenanceVerified` and `benchmarkEligible` remain false; provider-call count is null rather than an inferred zero. Candidate package/workflow proofs and the comparative corpus remain required. No installed plugin, default policy, merge or release is changed.
