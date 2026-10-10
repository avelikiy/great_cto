# Candidate artifact after direct scorer deadline fix

Scope: great_cto-p4o9.4.3.1.12. Related: [previous candidate](2026-10-03-current-candidate-package.md), [deadline/lifecycle evidence](2026-10-03-board-browser-owner-lifecycle.md), [frozen controller probe](2026-10-03-frozen-corpus-controller-contexts.md).

## Artifact identity

A fresh local candidate was built from clean published source3ed9aacf35e700247465ea941124cb28c059d872. TypeScript build and explicit board bundling (95 runtime modules) succeeded, followed by npm pack --ignore-scripts into a fresh retained directory. No install/publish lifecycle, release, default change, model dispatch or actual approval occurred. Local package version3.48.0 does not identify this archive as the public npm baseline or the installed plugin.

| Identity | Measured value |
| --- | --- |
| Archive | /Users/Shared/great-cto-candidate-deadline-20261003.r1DiqH/great-cto-3.48.0.tgz |
| Archive SHA256 | 2454685f9d04ac0df6a84829c118daf08265747ca240c365a822c4e4cf13c48c |
| Extracted byte/mode inventory digest | 629810ef4a9f5a0766a4c16b632b3ad50122a8266b9b7941813059c4c01f5651 |
| Extracted regular files | 161 |
| Delivered scorer launcher SHA256 | b9a3edca43bc9ff97f498bdace118eec2da5fcf3351964392e82544e46987ea4 |
| Delivered controller SHA256 | 43bf6ffb777ec4993ab9c306e07be72c2531e307644e8ff35c18615123ece3ce |
| Delivered graph SHA256 | accb6ac27581ae2fac69f018f67a0ea11af535f800e61c2f91c4501c0af01cf6 |
| Private extraction/diagnostic root | /private/var/folders/xf/8mjkgbt91mgg9b0m_gyrh92w0000gn/T/great-cto-package-smoke-B9QDLt |

## Test plan and observed evidence

| Requirement | Actual check | Result |
| --- | --- | --- |
| Current local build parity | Separate read-only recursive comparison; board paths map to repository-relative files, other paths to packages/cli | 161/161 files match source/build outputs |
| Scorer fix included | Compare all extracted bytes to retained previous ae087112 archive extraction | Only board/scripts/lib/pinned-benchmark-scorer.mjs changed; no removed files |
| Delivered CLI | Separate Node processes, isolated private empty run store | --version and codex-host list exit0; listing ok, empty, unreadable0 |
| Controller representative matrix | Actual delivered module imports in trusted separate harness | 12 constructions,8 expected refusals,0 dispatch/approvals |
| Frozen contexts | Original sealed8-task corpus with24 fresh private Git fixtures | 22 constructions,2 expected existing-change refusals; correct roles/tiers and phased/full-cycle ordering |
| Actual delivered deadline runner | Existing pinned scorer suite imports rebound only to extracted runner module | 24/24, no skips, including handled-SIGTERM direct deadline regression |
| Package integrity | Repeat complete directory/file byte-and-mode inventory after all probes and repeat archive SHA | Unchanged |
| Corpus integrity | Original015a66ba registration and runtime pins reverified after probes | 8 scenarios, runtimeBytesChecked:true; eligibilityfalse |

The actual extracted-runner suite uses the existing tests/lib/pinned-benchmark-scorer.test.mjs bytes (SHA2564da9e2a2534d26eed0c746a3265d222d20bdb601577ff596d6c034d6a4af8e2f). A trusted in-memory adapter checks the exact binding shape, changes only the static runner import and the supervisor's runner-module URL to the extracted module, then executes the adapted suite as stdin in a separate Node process from the original test directory. No assertion, scorer fixture, timeout, refusal or cleanup is changed. Thus both ordinary assessment and the nested timeout supervisor invoke the delivered runner; this is not merely source test success combined with a package hash. Other test fixture scaffolding remains repository-side, and this is not a loaded-dependency closure certificate.

The frozen-context fixture root is /Users/Shared/great-cto-corpus-candidate-deadline.n5G8yS. All tested states have zero dispatch attempts and recorded approvals. Provider calls remain null, not zero. Scorer execution exercises trusted local fixture code, not model-produced product work. CLI suite356/356 and existing package/controller harness suites9/9 passed without skips. The preceding stock source quick CI at3ed9aacf was green with11 explicit NOT CHECKED checks; these focused actual-artifact checks do not stand in for fresh full L3-L5 or live native/provider coverage.

## Remaining boundaries

The old ae087112 archive remains unchanged and historical. This new2454685f candidate proves local delivered-layout inclusion and execution of the direct deadline fix, not reproducible compilation, signed build provenance, installed plugin parity, independent host admission or independent complete module/tool/provider authority. Generated build outputs are included in the161-file comparison; it does not assert that every file is committed source. The controller and graph bytes remain unchanged even though the scorer launcher changed.

SIGKILL temporary profile retention and guardian failure paths remain open as great_cto-p4o9.5.8.3. Independent executable/browser review remains open as .5.8. Benchmark methodology choice, matched-arm evidence and real paired model trials remain incomplete. executionArtifactProvenanceVerified, independentAdmissionVerified, graphFloorCoverageVerified and benchmarkEligible remain false. No quality uplift percentage or100% Codex/Claude readiness follows from these checks.
