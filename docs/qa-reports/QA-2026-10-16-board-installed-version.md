# Registered board version comparison

Date: 2026-10-16
Scope: great_cto-sla6; screenshot follow-up great_cto-j3ds
Branch: codex/board-registered-version
Implementation: 6a42ed2f; screenshot capture: c67e43a7

Lifecycle context: [ADR-007: always-on board and idempotent board ensure](../adr/ADR-007-board-always-on.md).
Installation comparison is not supervisor activation or proof of always-on
availability; runtime observations below remain a separate evidence layer.

## Contract

The version endpoint no longer treats the highest local cache directory as an
installed plugin. It reads the Claude v2 installation registry and user settings,
selects one explicitly enabled user registration, and validates its manifest
name/version and board entrypoint. Both plugin name spellings and arbitrary
marketplace names are supported. Disabled or unregistered cache snapshots do not
participate. There is deliberately no cache fallback.

Conflicting registrations, multiple entries, scope-specific registrations,
missing/malformed state and incomplete installations return `installed: null`
and `stale: unknown`. `installedSource` and `installedReason` explain the result
without exposing filesystem paths. The existing four directional states remain.
Reads are not cached, so a registration change is visible on the next request.

This compares a **user installation**, not project-level activation, model
execution, Codex plugin state or npm-only installation state. It does not predict
which copy an arbitrary launcher will choose. Banner wording explicitly refers
to restarting from the compared installation rather than promising the outcome
of any restart command. Scope-specific resolution remains unimplemented and is
reported unknown, never inferred from a newer directory.

## Verification

| Check | Result |
| --- | --- |
| New behavioral and actual API-dispatcher tests | 6 passed, 0 skipped |
| Final complete board suite | 558 passed, 0 failed, 0 skipped |
| Focused version/banner/English UI tests | 20 passed, 0 skipped |
| Screenshot freshness after actual re-capture | 3 passed, 0 skipped |
| Generated reference check and diff whitespace check | Passed |
| New module imported from generated npm board bundle | Passed |
| Read-only operator registry probe | User-installed 3.64.0, registry source |

The new regression fixtures cover an enabled marketplace installation alongside
an older disabled local registration and an unregistered 99.0.0 cache, both name
spellings, local registration, conflicting equal/different versions, duplicate
registrations, malformed settings/registry, incomplete installations, unknown
scope, unrelated disabled broken entries, all four API comparison directions,
live registration changes, no-store responses and absence of private paths.

The first canonical `bash scripts/ci-local.sh --e2e --serial` run **failed**:

| Canonical stage | Observed result |
| --- | --- |
| Root, hooks and board | 1450 passed, 0 skipped |
| Libraries | 3397 passed, 16 failed, 19 skipped |
| Eval | 242 passed, 0 skipped |
| Docs | 76 passed, 0 skipped |
| Browser E2E | 16 skipped, not checked |
| Pipeline L1-L5 | 36 passed, 9 not checked |
| CLI build and unit tests | Build passed; 375 passed, 0 skipped |
| npm pack | Passed |
| Archetype E2E | 34 passed, 0 skipped |
| HOL scanner | Score 82; 0 critical; 35 high matched the reviewed baseline |

One library failure was screenshot freshness: the released 3.64 package still
carried five images stamped 3.63.0. All five were actually re-captured using the
unchanged capture script, its synthetic project, an ephemeral port and its
standard installed Chrome channel. All five images were visually read back.
Freshness tests then passed. No metadata-only restamping was performed.
The reference check also initially failed after adding the two source/test
files. The standard generator updated the architecture map and its check passed.

The other 15 library failures occurred in browser lifecycle/guardian tests while
Playwright's required revision-1223 headless runtime was absent. A direct launch
confirmed `Executable doesn't exist`. Standard browser installation attempts
could not finish at practical network speed. A bounded direct request to the
official archive transferred 5503 bytes in 20 seconds (approximately 274 bytes/s)
before timeout. Only this task's download process groups were stopped.
Those failures are **not cleared**: a rerun with the required runtime is still
necessary to distinguish missing-dependency effects from any further defects.
Assertions, browser pins, test deadlines and gate scripts were not weakened.

The canonical run is not a final-source approval: banner copy and screenshot
corrections were made during that run. The final board suite and focused checks
above were executed afterwards. Full canonical verification must be repeated
after restoring the browser dependency. Skipped checks remain not checked.

## Delivery boundary

This is implementation/self-verification, not independent approval. Merge,
release, plugin installation and operator-board restart are not performed by
this candidate. An early read-only operator check returned released 3.64.0 with
`stale: no`. At 17:50:54 UTC a fresh check refused connection: no listener on
3141 and the prior PID was absent. The existing incident great_cto-gep6 remains
open; the retained startup log does not establish an exit cause. This task did
not install the candidate or stop/restart the operator board. Restoration from
the released artifact was requested separately. No paid/native benchmark or
default domain-pack activation was performed.

## Follow-up verification on 2026-10-17

The required Chromium 148.0.7778.96 headless revision 1223 was installed with
the unchanged Playwright installer (`chromium --only-shell`). An actual launch
confirmed that version. The focused lifecycle, guardian, accessibility,
rendered-contrast and screenshot suite then passed 69 tests with no skips.
No browser pin, assertion, deadline or gate was changed.

Canonical R2 started on c03fd53d with an explicit candidate artifact, not the
operator installation. Root/hooks/board passed 1450 tests; libraries passed
3425, failed 1 and skipped 6; eval passed 242; docs passed 76; browser E2E
passed 16 without skips; CLI passed 375; archetype E2E passed 34. Pipeline
passed 36 with 9 checks explicitly not checked. Build, pack and the HOL scan
passed. The external companion-upgrade fixture also emitted a missing-upstream-
tag warning; it is retained in the raw log, not represented as delivery proof.

R2 **failed** its documentation graph ratchet: this QA report had no connection
to another document, increasing the orphan count from 48 to 49. The lifecycle
context link above corrects that defect. Focused doc-link tests passed 5/5 after
the correction; the frozen count remains 48. R2 is not relabeled green, and
its later stages saw this documentation correction. A complete fresh run on
the corrected frozen tree is required. Production code is unchanged from
c03fd53d; only this report was edited.

The concurrent read-only operator probe also observed a separate failure:
released 3.64.0 answered through 07:07:40 UTC and refused connection by
07:08:40 UTC. Its process was absent, and the shared PID file had changed to
another PID that was also absent. This establishes a lifecycle-state change,
not the actor or exit cause. great_cto-gep6 remains open. No candidate
installation or automatic operator restart was performed by the probe.

Subsequent frozen-run results and the current review status are recorded in
[PR #193](https://github.com/avelikiy/great_cto/pull/193), separately from these
historical snapshots. A later successful run does not erase the failures
above or certify unexecuted live integrations.
