# API compatibility comparative corpus

Subsequent corpus: [migration safety](2026-10-03-migration-safety-benchmark.md).

Scope: `great_cto-p4o9.4.1.6`. Related: [proposal corpus](2026-10-03-prompt-injection-benchmark.md), [preregistered protocol](2026-10-02-adaptive-benchmark-contract.md).

The sixth representative task repairs executable `src/api/summary.mjs`. Old clients receive exactly `{status:200,body:{id,count}}`. Only boolean `includeSource:true` adds `{source:{asOf}}`. Invalid requests return400 before source validation. Missing, unavailable or malformed source returns503, never successful invented identity or zero. Valid zero remains valid data. Inputs must not be mutated.

## Test plan

The private pinned oracle contains21 behavioral cases:3 legacy shapes,2 opt-in shapes,7 invalid requests and9 unavailable/malformed sources. The external scorer rederives expected responses and requires the fixed category semantics. Empty, mislabeled, forged, lost-zero and lost-missing cases refuse scoring. Expected responses and category names are not sent to candidate execution.

Contract mutation tests cover unconditional metadata, omitted requested metadata, boolean coercion, unknown request fields, missing-source defaults, source count coercion, wrong values and input mutation. Integrity tests protect the legacy contract and PROJECT metadata; extra code, links and oversized files are rejected. Git-bound specialist selection retains API-platform, code, QA and security reviewers at T1.

Execution uses a bounded default-deny macOS subprocess. Actual denial probes cover private operator reads, writes, process spawn and network, including quoted-path policy injection; broad root, oversized source and timeout refuse execution. Unsupported hosts have no unprotected fallback. Reports withhold private fixture values. The JS observer shares a runtime with candidate code; this is not a tamper-proof observer, formal sandbox certification or cross-user key isolation. Independent review remains `great_cto-p4o9.5.8`.

## Evidence boundaries

Expanded regression passed122/122 without skips, including22 API tests. Defective handler fails all3 criteria; reference repair passes all3. Actual runtime denial probes passed. Initial quick CI had one failure: generated architecture-map was stale after addition of the fixture module. Regeneration fixed the reference check; no test or scanner admission was weakened.

Repeated `ci-local.sh --quick` exited0: root1255 passed, libraries2838 passed/6 skipped, eval238, docs76, browser9, pipeline executed22 passed/5 skipped. Eleven skips are explicitly NOT CHECKED. This turn did not execute full CLI tests/pack or L3–L5; quick success is not a full CI claim. Final scanner rerun scored83 with zero Critical and unchanged35 reviewed High, without new exceptions or baseline edits. Read-only Claude auth returned loggedIn=false/authMethod=none; no live provider trial occurred.

This is a handler contract, not a deployed HTTP endpoint, authentication stack, production schema registry or consumer traffic replay. No actual model calls or paired comparative trials are performed. `benchmarkEligible=false` remains. Corpus preparation is6 of8 tasks, not75% product completion and not evidence of quality uplift. Migration safety and board accessibility still need recipes; native/provider provenance, independent security review and delivered installed artifact proof remain separate requirements. Installed plugin, defaults, approvals, merge and release are unchanged.
