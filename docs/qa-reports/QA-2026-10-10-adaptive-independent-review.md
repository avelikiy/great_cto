# Adaptive candidate: independent review and Git execution boundary

Date: 2026-10-10. Tracking: great_cto-932g.3.3.
Scope: PR #167. This report does not authorize merge or release.

## Independent verdict on c33ae765

An explicitly authorized separate read-only reviewer inspected
c33ae7658cf6d420a3e1b72b846cc56680ec742b and returned REQUEST_CHANGES.
The reviewer did not edit files, Beads, host configuration or plugins, and did
not execute paid models, deployment or a separate canonical test suite.
Author-run c33 CI exit0 with 15 disclosed skips remains separate evidence.

One blocking P1: new adaptive risk/dependency observers invoke Git with the
project configuration before worker sandbox admission. core.fsmonitor can run
an executable even for ls-files; diff also permits configured clean/process
filters despite --no-ext-diff. A later unknown/failure result does not undo
the executable side effect.

Affected c33 code: runtime-gate-policy.mjs wrapper line11 and diff line24,
specialist-plan.mjs inventory line15, scoped-review-reuse.mjs wrapper line11
and tracked dependency validation line68. Reachable from newRun specialist
policy validation (codex-pipeline.mjs:268), advance gate policy (431), scoped
input before runStage worker dispatch (679), and native adaptive hooks.

The reviewer used GIT_TRACE with an ephemeral command-line setting
core.fsmonitor=/usr/bin/false. Both diff --no-ext-diff --name-only HEAD and
ls-files --cached actually launched that harmless executable; persistent Git
configuration was not changed. This is Git helper execution, not shell
injection via an unescaped filename.

The reviewer found no further confirmed P0/P1/P2 in the inspected deltas and
confirmed mandatory quorum/gate floors, current dependency/epoch invalidation,
fresh scoped attestation, budget fencing, namespace separation and honest
guardian cleanup/admission limitations. Skipped live paths remain unverified.
The installed-board synchronous Beads P1 is a separate baseline defect, not
proved fixed or caused by adaptive scheduling.

## Proposed fix and author-run regression

Adaptive readers now share the existing bounded receipt evidence Git helper,
exported as readOnlyGit, rather than copying a third independent policy.
Every call disables fsmonitor; diff disables external drivers/textconv and
enumerates filter names within 64KiB/128-driver/5s bounds, disabling clean,
process and required drivers only for that child. Existing 8MiB/4MiB caller
buffers, NUL inventory, literal pathspec and unknown semantics are preserved.
No release/commit/push command uses these diagnostic overrides.

New real fixture regressions cover risk, specialist and scoped-reuse observers
under configured fsmonitor, clean, process, external and textconv helpers.
An unprotected harmless witness writes an owned temporary marker, proving the
helper is live; protected observers return actual evidence without that marker.
Invalid repository configuration and excessive filter inventory fail closed.
All fixtures are isolated; no operator Git configuration is changed.

Combined executable-boundary/runtime-policy/specialist/reuse regression:
84 pass, zero failures, zero skips. This is focused author evidence only.
Fresh complete canonical CI and independent delta review are still required
for the changed application; the c33 pass is not inherited by this fix.
