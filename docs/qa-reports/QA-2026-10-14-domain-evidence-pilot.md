# QA: domain evidence pilot foundation

**Date:** 2026-10-14
**Status:** Executed canonical checks GREEN; 15 NOT CHECKED; independent review APPROVE for opt-in foundation.
**Source candidate:** 7d44246eda500d9c37d09597fbd57ac7ceed4317
**Tracking:** great_cto-0b3o
**Scope:** [ADR-032](../adr/ADR-032-domain-evidence-pilot.md), opt-in developer
contracts. No installed-plugin, native-host outcome or production evidence.

## Current evidence

Canonical attempt 3 ran `bash scripts/ci-local.sh --e2e` on the clean source
candidate above and exited 0. Local receipt: great-cto-domain-full-gate-r3.log.
No test deadlines, assertions, scanner thresholds or baselines changed for this
run. The earlier failures below remain historical evidence, not this run's result.

| Stage | Passed | Failed | Not checked |
| --- | ---: | ---: | ---: |
| Root/hooks/board | 1432 | 0 | 0 |
| Libraries | 3402 | 0 | 6 |
| Eval | 242 | 0 | 0 |
| Documentation | 76 | 0 | 0 |
| Board browser scenarios | 16 | 0 | 0 |
| Pipeline suite L1-L5 | 36 | 0 | 9 |
| CLI | 369 | 0 | 0 |
| Archetype E2E | 34 | 0 | 0 |

The gate explicitly reports `GREEN, 15 TEST(S) SKIPPED — NOT CHECKED`.
Pipeline suite uses the operator-installed plugin, not a newly installed
candidate. Its skips include native role/model execution, delivery, release
discovery, paid learner and real capture paths. Fixture success is not full live
pipeline readiness. Sidebar hover passed in this run; the earlier intermittent
failure's root cause remains Unknown.

After exit 0, the operator-authorized separate read-only reviewer started on
the frozen source candidate and returned APPROVE for the opt-in developer
foundation, with no blocking findings. The reviewer independently ran the two
domain test files: 57 passed, zero failures/skips, in 13.7 s. Approval excludes
runtime dispatch, quality claims, merge, release and installation.

Before live benchmark admission, follow-up work must distinguish raw outcome
acceptance from measured budget compliance and reject inconsistent supplied
context/total token measurements. Operator-supplied receipt hashes, source
lineages and workspace IDs are declarations, not signed execution attestations.
The documented same-UID/ABA snapshot limitation also remains.

57 domain contract tests passed, zero failures/skips, on the working bytes
committed as 8932ecd36192f0291318cedbc4fc9f4bf777c734, before two comment/prose
wording changes in the current source candidate. They cover pack pins, private project/
root binding, expiry, source kinds and dirty bytes, complete envelope byte caps,
Git filter refusal, assume-unchanged, link escapes, no authority fields,
matched experiment bindings, failed arms, unknown costs and lineage grouping.
The four added eligibility checks use actual tracked synthetic SSH/PEM/credential
and CSV files, not nonexistent paths. They remain unreadable as engineering input.

The earlier combined focused run at c7df9a85 executed 99 checks: 96 passed, 3 failed, zero
skipped. All 53 domain checks passed. The corrected backpressure and stage
retention cases passed. Remaining failures were existing native lifecycle
fixtures, NOT waived:

- packages/board/beads-async-read.test.mjs: owner SIGKILL hang-read fixture
  did not publish its observation within the fixed window.
- Same file: queued-read fixture did not publish its observation within the
  fixed window; subsequent asynchronous rejection assertions were reported.
- tests/lib/pinned-benchmark-scorer.test.mjs: hostile-signal scorer launcher
  exceeded its fixed watchdog; ready was not observed. No cleanup proof inferred.

Local receipts: great-cto-domain-contract-final-r3.log and
great-cto-domain-final-focused-r2.log. Raw logs remain operator-local and are
not included in the public source tree.

## Earlier full attempts, not acceptance of this source candidate

Complete attempt 1 at 5b7776c02976312611c3673d2cd76110f781a0ec exited 1:

| Stage | Passed | Failed | Skipped / not checked |
| --- | ---: | ---: | ---: |
| Root/hooks/board | 1432 | 0 | 0 |
| Libraries | 3366 | 16 | 18 |
| Eval | 242 | 0 | 0 |
| Documentation | 76 | 0 | 0 |
| Board browser scenarios | 15 | 1 | 0 |
| CLI | 369 | 0 | 0 |
| Archetype E2E | 34 | 0 | 0 |

Pipeline suite also explicitly reported nine NOT CHECKED operations; full
pipeline readiness remained unproven. Twelve library skips and fifteen failures
were related to the absent browser executable. Other library failure was stage
diagnostic retention under a 250 ms fixture deadline. Board E2E reproduced the
existing sidebar-hover mismatch (great_cto-k10g), root cause still Unknown.

Playwright 1.60.0 expected Chromium 1223, which was absent in the cache. After
installing the pinned test browser, affected lifecycle/guardian files passed
32/32 with zero skips. An isolated pinned-scorer file passed 33/33 before further
refinement. Neither rerun converts the first full gate to green.

Attempt 2, unchanged source 5b7776c0, was interrupted after a new root failure.
The consumer was paused while waiting for a marker written only after producer
drain, making a circular wait under real backpressure. The exact task-owned CI
group was verified by PID/PGID/command/cwd and terminated. This was an incomplete
attempt, never a successful canonical run or proof of global process quiescence.

## Corrections in current candidate

The test-only backpressure fixture now reports queued output and explicitly
asserts write backpressure with a 2 MiB payload; it still verifies complete JSON
and IPC result. Its bounded success-probe budget is 10 s instead of 2 s; product
deadlines are unchanged. Separate deadline tests remain strict.

The stage-retention fixture uses a fixed 1 s launch/timeout window; the separate
250 ms floor test remains. This does not change production scorer timeouts.
Tracking: great_cto-fp1k and great_cto-d273.

Packets retain source type, dirty provenance and expiry, with their digest inside
the byte cap. Audit uses Git plumbing without clean/process filters; repository
status flags cannot hide changed bytes. No regulatory routing or authority changed.

## Earlier environment observations and current limits

Read-only host diagnostics found 10 logical CPUs, 24 GiB physical memory and
load averages reaching 590, subsequently 357 and 231, with substantial compression/
swap activity. These observations establish a verification-environment risk;
they do NOT prove every failure was environmental. No other project processes,
operator applications or simulators were stopped. Operator coordination to
reduce competing work has been requested; another full run has not been launched.
Later load briefly declined to 34 and rose again to 94. Three no-op Node startup
probes measured 169/93/71 ms; they are not a full readiness proof. The environment
remains unstable for deadline-sensitive verification; no blanket timeout changes.

The operator subsequently requested continuation. Attempt 3 began at load 37
with 21 GiB free disk and completed successfully; load later declined to 16.
The full run's executed checks passed, with the explicit limitations above.
Independent read-only review completed with the limited APPROVE verdict above.
Three private overlays and six host packets are outside the public repository;
source observation is explicitly NOT project runtime verification. Human wellbeing
candidate guidance is not clinical efficacy or diagnosis evidence.

No native models, representative hidden task fixture set, signed independent
scorer admission, promotion, default activation, merge, release, plugin update
or local admin restart occurred. Quality uplift remains Unknown, not 0 percent.
