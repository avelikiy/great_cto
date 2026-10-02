# Candidate runtime package closure

Date: 2026-10-02. Scope: `great_cto-p4o9.4.3.1.8`. Related: [pinned package smoke](2026-10-02-pinned-package-smoke.md), [benchmark contract](2026-10-02-adaptive-benchmark-contract.md).

## Actual packaging defect

The initial local candidate built after source commit `be4e1869b2880da70b525be30bdd7d6f71b4019b` started `--version` but failed `codex-host list` with `ERR_MODULE_NOT_FOUND`: `board/scripts/hooks/auto-attach-reviewers.mjs` was absent. `controlled-specialists.mjs` imports that module using `../hooks/`; the bundler followed only sibling `./` imports under `scripts/lib`. Thus source controller tests and successful version output were insufficient delivered-layout evidence.

The bundler now computes the transitive literal relative-import closure across repository directories, seeded from both controllers and all shipped board modules. This also covers the board routes' literal dynamic import of `scripts/hooks/pipeline-dispatcher.mjs`, which the old scripts/lib-only scan did not copy. It preserves the repository layout and follows static imports, reexports, side-effect imports and literal dynamic imports, with cycle deduplication. Missing modules, escaping paths, symbolic links and unsupported relative module extensions fail packing. This is a source scanner for trusted repository modules, not a JavaScript parser, hostile-source sandbox or runtime loaded-module attestation. Computed imports, filesystem assets and arbitrary child executable dependencies require separate checks.

## Test plan and observed checks

| Area | Test type | Required result |
| --- | --- | --- |
| Cross-directory dependencies and cycles | Unit fixture | Exact closure includes hook and its library dependencies |
| Missing/escaped/linked/unsupported imports | Negative unit fixture | Packing refuses, never silently omits |
| Real controller closure | Repository integration | Specialist hook and specialist plan present |
| Archive extraction and private CLI execution | Integration smoke | Pin admitted; version and codex-host list exit0; package unchanged |
| Delivered bytes | Independent filesystem comparison | Controller/shared modules and local compiled CLI match extracted package |

The focused closure, board-bundling and pinned-package suites passed13/13 without skips. The corrected local archive retained the unreleased package version3.48.0; this is not the public npm3.48.0 baseline or the installed plugin. Archive SHA256 `0a8c1f3c44508bdf4e60b10e9afe781379d5a19383e6151400b49b2fe1473ab9`; extracted inventory digest `8e0a481dd0d3ce47cd300234ca6fcac97f05b360b4668238a91e48ecdd0c291b`. It contained161 regular files. Actual published-layout `--version` and `codex-host list` both exited0, listing state `ok`, empty runs and unreadable0. Post-execution inventory and archive pin were unchanged. A separate comparison matched104 files: all bundled scripts, compiled `dist` files, the shared pipeline, entry and nested archetypes module. This is byte parity with the local source/build, not reproducible compiler proof or executing-benchmark provenance.

The failed probe's private diagnostic directory was retained. Its first archive was overwritten by the corrected local packing command; no claim is made that the failed archive bytes remain available. The corrected archive is SHA-pinned independently. No operator plugin installation, npm publish, merge, lifecycle installation script, model call command or gate approval was requested.

The final expanded board/controller build copied105 runtime modules and produced171 package files. Archive SHA256 `d217fc112920f9f871848261ff58b5e802c6c171fc164df477a0728c99afa069`; inventory digest `dc7db2c59025a6e7c24ce1f1721a7fbf8376d6cef95fd6c7dcc3110404ca0803`. Repeat isolated CLI smoke passed both processes and post-execution integrity checks. A new comparison matched114 runtime/compiled/config/entry files without differences. Repeat focused suite passed25/25 without skips. These new results do not replace the preceding archive's distinct identity.

## Remaining boundary

The expanded focused run, including documentation reference generation and recall fixtures, passed25/25. Separate compiled CLI unit tests passed356/356 without skips. Local quick CI passed with11 explicit NOT CHECKED skips: root1255 pass, library2718 pass/6 skip, eval238 pass, docs76 pass and browser9 pass; the quick pipeline omits5 tests. These are not all release gates. The subsequent expanded board-root closure is covered by repeat focused tests and a newly pinned archive; the preceding archive results above belong to the initial corrected controller-only build.

`executionArtifactProvenanceVerified=false` and `benchmarkEligible=false` remain mandatory. An empty listing exercises startup, not specialist assessment, provider dispatch, approvals, release or the full product lifecycle. Runtime graph loading and dynamic data assets still need isolated workflow probes. Claude authentication and actual paired corpus executions remain separate prerequisites; unknown provider calls/cost remain null. Neither a percent quality uplift nor complete Codex/Claude parity follows from these results.
