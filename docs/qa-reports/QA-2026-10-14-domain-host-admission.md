# QA: explicit private domain host admission

**Date:** 2026-10-14
**Status:** Historical GREEN/APPROVE at a1b363b6; current follow-up candidate under verification, not approved for release yet.
**Source candidate:** a1b363b692584ba5c25e85c9491727ef2956b1fb
**Base:** c2b399633aa25bcf1632ff649640186208833d80
**Tracking:** great_cto-0b3o.6, great_cto-lwz2, great_cto-kxgv
**PR:** https://github.com/avelikiy/great_cto/pull/185
**Scope:** [ADR-033](../adr/ADR-033-explicit-domain-host-admission.md).

## Current evidence

Third complete `bash scripts/ci-local.sh --e2e` exited 0 on the clean source
candidate above. Receipt: great-cto-domain-admission-full-gate-r3.log.

| Stage | Passed | Failed | Not checked |
| --- | ---: | ---: | ---: |
| Root/hooks/board | 1432 | 0 | 0 |
| Libraries | 3416 | 0 | 6 |
| Eval | 242 | 0 | 0 |
| Documentation | 76 | 0 | 0 |
| Board browser scenarios | 16 | 0 | 0 |
| Pipeline suite L1-L5 | 36 | 0 | 9 |
| CLI | 369 | 0 | 0 |
| Archetype E2E | 34 | 0 | 0 |

The gate reports `GREEN, 15 TEST(S) SKIPPED — NOT CHECKED`. HOL scanner score
82, with no new blocking findings; 35 high findings remain individually reviewed
baseline false positives, not zero raw high findings. No scanner baseline or
threshold changed here. Pipeline suite uses the operator-installed 3.63.2
plugin, not an installation of this candidate. Native workers, paid learner,
deployment, delivery and some real capture paths remain unverified.

Focused final domain contracts: 71 passed, zero failures/skips. An earlier
expanded context regression had 98 passed, zero failures/skips; documentation
tests had 76 passed. Receipts: great-cto-domain-admission-focused-r5.log,
great-cto-domain-admission-context-r4.log, great-cto-domain-admission-docs.log.
The expanded run preceded the last negative CLI admission test; the final full
gate above includes the complete committed candidate.

Actual injected runner seams are exercised with synthetic repositories and
stub host responses for both routed worker hosts, mixed waves and the Codex
verifier. Checks cover policy/root binding, drift, expiry, tampering, bounded
context, private external policy files, refusal before worker dispatch, and
preservation of gates and permissions. Supplied benchmark observations reject
context tokens greater than known total tokens and separate raw acceptance
from measured-cap-qualified acceptance. These are not native outcome proofs.

The explicitly authorized fresh independent read-only reviewer started only
after the successful full gate, on the exact source candidate above. Its verdict
was APPROVE for that exact candidate. It independently ran domain admission and
benchmark suites: 37/37 passed, zero skips. Approval excludes native trials,
merge, release and installation. The reviewer reported one Low test precision
issue: an inbox-race unreadable response could come from a receipt deadline
rather than a changed gate snapshot. A follow-up assertion now requires the
exact snapshot-change reason; its focused/full verification and follow-up
review are pending. No later source approval is inferred from the earlier verdict.

## Earlier red attempts

Attempt 1 at 0b876586 exited 1: ADR-033 lacked the required Consequences section;
root suite had 1431 passes and one held inbox-race Git handshake failure.
Libraries had 3416 passes and six skips. Receipt:
great-cto-domain-admission-full-gate.log. It is not relabelled green.

Attempt 2 at f611a3dd exited 1: the ADR structure error remained, and the
PostgreSQL repaired scorer result was not accepted. Root suite passed 1432/1432;
libraries had 3415 passes, one failure and six skips. Eval, docs, browser, CLI
and archetype counts matched the green run. Pipeline had 36 passes and nine
NOT CHECKED checks. Receipt: great-cto-domain-admission-full-gate-r2.log.

The PostgreSQL instance initialized, observed the migration and shut down; the
original failure log did not identify the rejected criterion. High host load
was observed, but the exact failure cause remains Unknown. An isolated
baseline/repair rerun passed 1/1, as did the unchanged strict receipt deadline.
Receipts: great-cto-domain-migration-isolated.log and
great-cto-domain-receipt-deadline-isolated.log. Isolated success does not replace
canonical evidence. Both probes passed again inside the third full gate.

## Corrections and unchanged checks

The held-read HTTP fixture's original 10 s client budget included staged waits
whose aggregate allowed duration was 11 s before release. This candidate gives
only that fixture additional process-startup/transport headroom: startup 15 s,
held-marker wait 12 s, client 25 s, enclosing case 65 s. The production receipt
deadline remains 20 s. Cheap HTTP caps remain 1.5 s, gate-request cap 3 s;
token invalidation and evidence assertions are unchanged. The separate 1 s
receipt-deadline probe is unchanged. A focused diagnostic run had 18/19 passes,
with a strict child startup handshake failure; that historical failure remains.

Failure diagnostics expose only fixture request/port/handshake state, not
approval tokens. The migration test adds only the four criterion state values
when repair fails, not oracle rows. The scorer's 1200 ms lock-response bound,
SQL deadlines and acceptance assertions are unchanged. ADR now records the
required consequences. No product performance threshold was relaxed.

## Later verification attempts and runner contention

After tightening the race-reason assertion, attempt 4 at 248664a4 exited 1:
root 1432 passed; libraries 3413 passed, three failed, six skipped. Failures:
guardian tainted-continue registration process inventory exceeded its 1000 ms
cap (1292 ms), the hostile-SIGTERM scorer did not publish ready after another
1000 ms process-probe timeout, and the packaged controller matrix exceeded
30 s while progress was still at synthetic Git initialization. No process
quiescence or readiness was inferred. Tracking: great_cto-f33n.10,
great_cto-d273 and great_cto-c83c. All other canonical stages passed; the same
15 checks remained NOT CHECKED. Receipt: great-cto-domain-admission-full-gate-r4.log.

All three failed probes then passed sequentially in isolation, 3/3, without
changing their deadlines. Receipt: great-cto-domain-gate4-failures-isolated.log.
The packaged matrix took 24.7 s with its 30 s cap. This does not convert the
failed full attempt into success.

Attempt 5 on unchanged 248664a4 also exited 1: libraries 3415 passed, one failed,
six skipped. The hostile-SIGTERM test exceeded its outer launcher watchdog;
ready was not observed. Root 1432, eval 242, docs 76, browser 16, CLI 369 and
archetype 34 passed; pipeline had 36 passes and nine NOT CHECKED. Receipt:
great-cto-domain-admission-full-gate-r5.log. High host load was observed, not a
waiver of the result or proof of the complete failure mechanism.

The next candidate adds explicit `ci-local.sh --serial`: root/lib file workers
decrease from two to one. Default remains two. Test selection, per-test internal
concurrency, deadlines, assertions, failure aggregation and skip reporting remain
unchanged; this is not quick mode. Parser and step-selection contracts cover the
option. Full serial gate and updated independent review are pending.

## Runtime and experiment boundaries

Claude authentication was rechecked after operator login: CLI 2.1.292 available.
No completion was requested. Codex availability and configured model information
are not proof of the model used by this controlled worker. Worker/verifier model
pinning and actual budget telemetry must precede a comparative native launch.

No native trials, default activation, merge, release or candidate installation
occurred. Released 3.63.3 does not contain this host admission code. Private
project overlays, source names/paths and task inputs are excluded from this report.

Source observation and digests are not verified execution lineage, immutable
OS snapshots or protection against a same-UID adversary. Data-only context may
influence model output; it cannot grant tools or approve a gate. Quality uplift
is Unknown. The proposed 36-trial experiment still requires frozen executable
holdouts, independent scorer, verified isolation, explicit launch authority and
shared budgets. Missing spend metrics remain null, not zero or API list price.

Raw local receipts are retained outside the public repository; this document
records their outcomes and limitations without distributing operator logs.
