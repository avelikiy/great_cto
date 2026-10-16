# Registered board version comparison

Date: 2026-10-16
Scope: great_cto-sla6; screenshot follow-up great_cto-j3ds
Branch: codex/board-registered-version
Implementation: 6a42ed2f; screenshot capture: c67e43a7

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
this candidate. The existing operator board remained on released 3.64.0. No
paid/native benchmark or default domain-pack activation was performed.
