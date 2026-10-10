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

## 2026-10-03 evidence-reader hardening, version 2

Code review found two verified refusal gaps: Git interpreted declared paths as
pathspecs (untracked wildcard-looking literal filenames could borrow a tracked
sibling match), and lstat followed by unbounded readFileSync did not retain a
stable bounded file observation. Ten new real filesystem/Git cases failed
before remediation: three untracked literal patterns, hardlinked dependency /
report / prior state, and symlink replacement, growth, chmod and post-read
mutation. No private payload is used as an accepted reuse candidate.

Evidence version 2 now requires literal tracked paths and one-link regular
files. Bounded O_NOFOLLOW/O_NONBLOCK reads compare device/inode/owner/mode/link /
size/nanosecond timestamps before and after reading and revalidate the current
canonical path. Total closure size is checked incrementally. A native isolated
FIFO-swap fixture verifies actual nonblocking refusal, not a mocked file type;
its subprocess watchdog cannot convert a hang into a pass. Legitimately tracked
wildcard-looking filenames still work. Version-1 receipts refuse rather than
being silently upgraded; the controller's existing refusal path runs a fresh
worker. This change adds no gate or approval authority.

Initial post-fix scope suite passed 31/31; the extended unit suite with native
FIFO coverage passed 36/36. The affected controller/scoped/specialist/live-test
group passed 97 cases, zero failures, three live cases skipped out of 100 before
the last two unit cases were added. Those three opt-in live checks are NOT
CHECKED; scripted controller verifiers are not model-generated independent
reports. The final-byte affected regression finished with 102 total, 99 passed,
zero failures and three opt-in live cases skipped (52452.771583 ms). This covers
the additional native FIFO and incremental aggregate-budget cases. Documentation
checks passed 94/94 with zero skips. The local HOL scanner passed at 83 against
the threshold of 80: zero Critical, 35 High reviewed as false positives, nine
Medium, two Low and eight Info. This local scanner result is not an independent
security approval or a required remote CI receipt.

These descriptor observations are not atomic ancestor handles, a same-UID
sandbox or independent security admission. Actual-host reuse still needs Claude
reauthentication, tracked in `.3.2.2.2.1`. Reader bug/follow-up scope is
`.3.2.2.2.2`; the parent remains in progress. Installed plugin, gates, defaults,
frozen benchmark corpus, release and merge authority are unchanged.

## 2026-10-03 authenticated live repeat: explicit closure correction

After operator reauthentication, actual Claude worker run
`f77a234d-142a-4ccf-a1d2-051ea5e60954` produced a PRE-BUILD boundary report.
Actual Codex verification returned rework with an incomplete dependency
attestation: the report used `.great_cto/PROJECT.md`, but the fixture's explicit
operator closure named only README.md and src/add.mjs. The declaration was
separately bound by projectDigest, but the verifier contract asks for all relevant
files in the explicit closure. No accepted result, reused run, implementation or
gate approval was produced. This was a genuine failed live test, not an auth
failure or a successful refusal counted as a positive reuse test.

Evidence root: `/Users/Shared/great-cto-acceptance-501/mixed-release-bC3gTx`.
Log: `/Users/Shared/great-cto-live-reuse-v2-TCM8tH`. TAP: zero passed, one failed,
two other opt-in live tests NOT CHECKED; duration 78582.886167 ms.

The fixture now includes the tracked declaration in the explicit closure and
uses its exact path in the task. No verifier prompt, production admission rule,
required completeness check, approval policy or security baseline was weakened.
Follow-up: great_cto-p4o9.3.2.2.2.3; actual-host verification remains tracked in
great_cto-p4o9.3.2.2.2.1 until the corrected live run terminates successfully.

The corrected-scope run `ad7d6900-b3e6-43ae-91ef-cba9978319c8` produced an
accepted Claude report and actual Codex verified/complete attestation with the
exact 64-character input digest. Evidence minting nevertheless refused: the
verifier populated findings with positive observations; completeScopeAttestation
intentionally requires zero unresolved findings. Scope and digest were not the
cause of this second failure. Evidence root:
`/Users/Shared/great-cto-acceptance-501/mixed-release-cYYbm9`; log:
`/Users/Shared/great-cto-live-reuse-v2-fixed-KK3QTM`. TAP: zero passed, one failed,
two other live tests NOT CHECKED; duration 71658.232583 ms. No reused run or
approval was produced.

The scoped verifier prompt now explicitly separates defects/unresolved blockers
in findings from successful observations in checks. A verified scoped receipt
requires findings:[]; blockers must remain and return rework/unverifiable.
Returned findings are not stripped or reinterpreted, and admission is unchanged.
Prompt-contract regression was RED before the clarification and GREEN afterward.
Follow-up: great_cto-p4o9.3.2.2.2.4. The first affected scoped/controller/docs
regression passed 146/146 without skips (68514.480041 ms), before this prompt
clarification; a separate final-byte controller regression and live run follow.

The final live run passed: actual Claude original
`5be08c3d-db32-4344-868f-4dc1101114b2`, reused run
`0f82532d-5905-423d-97e2-2d7ef7552097`. Original evidence is version 2;
the recipient ran a fresh actual Codex verifier with verified state, empty
findings and complete current-task dependency attestation. The domain worker was
skipped only in the recipient. Reused results do not mint recursive evidence.
Both runs retain zero approvals, no pending approval and no senior-dev result.
The recipient remains ready with regulated-reviewer-prebuild in its queue; this
is not a finished preparation quorum or release. src/add.mjs remains unchanged.

Evidence root: `/Users/Shared/great-cto-acceptance-501/mixed-release-FzyYzF`.
Log: `/Users/Shared/great-cto-live-reuse-v2-contract-pXKOE1`. TAP: one passed,
zero failed, two other opt-in live cases NOT CHECKED; duration 118619.374875 ms.
These are three distinct retained attempts, not failed results rewritten into a
pass. No comparative model-quality uplift is inferred from this single fixture.

Final-byte controller/scoped/controlled-specialist regressions passed 100/100,
zero skips (68447.118292 ms). Documentation checks passed 76/76, zero skips.
Syntax and git diff checks passed. Local HOL scanner passed 83/80 with zero
Critical and 35 High reviewed as false positives; this is not independent
security approval. Installed plugin, defaults, main integration, CI workflows,
shared Chromium cache, frozen corpus, release and merge authority remain
unchanged. Narrow live task and the two contract fixes can close; parent/global
acceptance remain incomplete.
