# Scoped review reuse validation

Date: 2026-10-02. Scope: adaptive pipeline worktree, PR167, not installed plugin.

## Executed checks

The new scoped evidence unit suite passed 21 tests, zero failures/skips. It
checks input/task/project/contract/phase/graph/check-policy mutation, prior run
pins, exact report bytes, missing attestation, failed checks, mandatory review
exclusion, symlinks, ignored/untracked/deleted inputs and recursive reuse refusal.

Three actual controller integration tests passed: a pinned candidate skips only
the specialist worker and still executes fresh verification; plain verified
without complete scope attestation triggers bounded implementation rework; an
edited prior run pin falls back to a full fresh specialist worker. Required code
review/QA/security were freshly executed and an unrun domain quorum member still
blocked ship. No human approval was synthesized. These use test runners, not live
model responses.

Expanded scoped/controlled/mixed-host/budget regression passed 76 tests, zero
failures/skips. An additional final unit run included the new checks-policy
mutation case and passed all 21. Documentation/temporary-file/skip-count test
group passed 32 tests, zero failures/skips.

The broad quick gate passed with its honest GREEN / 11 SKIPPED / NOT CHECKED
banner: root 1255 passed; libraries 2559 passed, six skipped; eval238, docs76,
browser9 and rendered-layout8 passed. It exercised L1-L2, not all L1-L5.
Library skips are three opt-in live Docker tests and three opt-in live model
tests. This run added tests incrementally; the final focused unit run covers the
last checks-policy case. The preceding full gate for phased workflow cannot be
used to claim full L1-L5 execution on this new reuse increment.

## Actual live attempt and blocker

Command: `GREAT_CTO_LIVE_REUSE=1 node --test tests/lib/mixed-host-live.test.mjs`.
Run: `6a25fd97-0027-4318-a377-cd0901bbabdc`.
Evidence root: `/Users/Shared/great-cto-acceptance-501/mixed-release-pqR6gI`.

The first Claude worker failed before producing a report: OAuth session expired
and could not be refreshed. The separate `claude auth status --json` read returned
loggedIn:false. No reuse or fresh Codex completeness verification occurred. This
is an authentication/launch failure, not a model quality or feature verdict. The
actual-host reuse path remains unverified until operator reauthentication and a
successful repeat. Failed launch is not counted as a skip or a successful run.

Beads parent great_cto-p4o9.3.2.2.2 remains in progress; live follow-up is
great_cto-p4o9.3.2.2.2.1. Defaults, installed plugin, security baseline, release
and merge authority are unchanged. No quality uplift or complete native parity
is inferred from these tests.
