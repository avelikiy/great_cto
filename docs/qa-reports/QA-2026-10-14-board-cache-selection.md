# Board cache selection and actual-hover verification

Date: 2026-10-14.
Status: author verification complete; independent APPROVE at `fe6fa381`.
PR: [186](https://github.com/avelikiy/great_cto/pull/186).
Base: published `454c62106c1b373d1a5a2bf9c7b34bdc76f633c5` (3.63.4).
Frozen executable/test candidate: `c8ac3db187ba1a2dab4928ab1cf121cf1d073dc6`.

## Scope and fix

The [CLI resolver](../../packages/cli/src/board-path.ts) gathered candidates by
marketplace enumeration while deciding freshness from the global newest version.
An old marketplace therefore won even when a new local cache existed. Its six
new isolated regressions reproduce five failures on the released implementation.

Candidates with a present board entrypoint are now sorted numerically across
marketplaces and both directory aliases. An incomplete newest cache cannot
advertise freshness for an older board. An unreadable plugin directory does not
abort other cache reads. Dev-layout precedence, the five-version per-alias scan
bound, and stale-plugin versus bundle fallback are preserved. Entry presence is
not package provenance, dependency-closure attestation or hostile-cache isolation.

The [board-path suite](../../packages/cli/tests/board-path.test.mjs) passed17/17,
including an actual bundled HTTP boot. Canonical CLI suite375/375 passed.
Production board CSS, domain activation, permissions and host routing are unchanged.

## Failed attempts remain failed

Both first canonical runs used unchanged `0b13cf0a904567270de2b5cfbcbfab32925145e7`.

| Run | Root/hooks/board | Libraries | Eval / docs | Browser | CLI / archetypes | Result |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | 1435 pass | 3388 pass,16 fail,18 skip | 242 /76 pass | 15 pass,1 fail | 375 /34 pass | exit1 |
| R2 | 1435 pass | 3416 pass,0 fail,6 skip | 242 /76 pass | 15 pass,1 fail | 375 /34 pass | exit1 |

R1 browser prerequisite inspection found project Playwright1.60.0 with its
required Chromium1223 executable absent; the user browser-cache directory was
absent. Helper diagnostics explicitly reported `missing-browser-executable`.
Fifteen lifecycle/probe failures occurred in that environment, and twelve actual
browser checks skipped. Exact Chromium/headless-shell binaries were installed
through the official dependency installer, without changing source or deadlines.
Because installation happened during R1, R1 remains red and is not a consistent
post-install verification run.

R1 additionally failed tenant `project-drift` before scoring with
`candidate receipt differs before scoring`, and the sidebar shared-hover check.
The unchanged full five-file replay (browser lifecycle, guardian broker/helper,
tenant-auth and board E2E) passed63/63 without skips. Tenant `project-drift` passed
in R2. Its original receipt-refusal cause remains Unknown, tracked separately as
`great_cto-mos1`; replay success is not retrospective scorer completion.

R2's sole failure was sidebar hover. Passive focused diagnostics reproduced Work
with `:hover=false`, transparent background, no animations and the pointer's
hover chain ending at `proj-switch`; Views had `:hover=true` and the expected
light-theme colour. This establishes loss of the intended pointer target across
the responsive sequence, not a production CSS colour mismatch. The exact earlier
layout movement event was not instrumented.

## Stronger hover precondition, not a weaker colour assertion

The [test helper](../../tests/helpers/settled-style.mjs) now requires actual
`:hover` while observing stable style frames. It re-establishes the native
pointer at most three times in one absolute5-second action/result-admission window, never synthesizes
CSS/classes, and fails on persistent pointer loss. Pointer-action refusals and
unsettled styles are not retried or converted into success. The E2E case remains
120 seconds; colour equality, geometry, icons and keyboard/focus assertions remain.
A new nontransparent assertion prevents two unhovered rows from passing together.
The5-second window checks new pointer actions and result acceptance; it does not
cancel an in-flight browser evaluation or pending animation promise. The outer
120-second case timeout is the hard wall-time boundary. Late success is refused.

Helper tests passed8/8, covering stable non-hover refusal, responsive target loss,
bounded retries, shared deadline, unstable style and refused pointer action.
Focused actual-browser diagnostics after the change observed both rows genuinely
hovered with expected light and dark colours. The complete browser suite then
passed16/16 without skips. Default diagnostics publish no task text, paths or
credentials; failure snapshots contain only CSS state, rectangles and element IDs.

## Fresh canonical result

Command: `bash scripts/ci-local.sh --e2e --serial`, R3, exact frozen candidate above.
Exit0: GREEN with15 NOT CHECKED. Serial changes file-worker count only; it does not
disable internal race tests or increase case deadlines.

| Suite | Passed | Failed | NOT CHECKED |
| --- | ---: | ---: | ---: |
| Root/hooks/board | 1435 | 0 | 0 |
| Libraries | 3422 | 0 | 6 |
| Eval | 242 | 0 | 0 |
| Docs | 76 | 0 | 0 |
| Browser | 16 | 0 | 0 |
| CLI | 375 | 0 | 0 |
| Archetypes | 34 | 0 | 0 |
| Pipeline L1–L5 | 36 | 0 | 9 |

Suites overlap; counts are not a sum of unique tests. Pipeline L1–L5 used the
operator-installed3.63.4 artifact, not an installed unreleased candidate. The six
library and nine pipeline omissions remain explicit, including opt-in native
model/runtime scenarios. This is not full host parity or a quality benchmark.

## Retained log identities

| Evidence | SHA-256 |
| --- | --- |
| R1 complete canonical | `21c73d01391b3c5196a008aff0313a6647a256ee388eb70db67ba8f1ba9ef7ca` |
| R2 complete canonical | `879a11e6911ab3a9a079881537743612c8cfe439dff67ddf12eba9d35adc7210` |
| Five-file replay63/63 | `f31b0ca93d70c7dc3c7a4447044b41a98b8e2118fd45f84a0efd88fc0e34fe1f` |
| Actual lost-hover diagnostic | `b8e0d4b9bf8c8c721fc6d41709124686c80704d53f820d28454ef1c2737df215` |
| Complete browser after helper fix | `db09fb25c68ba8f584ce8833e2b8419ba1a3443b39a75cf506ed6ced457ed923` |
| R3 complete canonical | `6fcdc4b7e5898838034de9ff5052fe77309b7f12e1d222c30727ba274de66fb8` |

## Independent review

Read-only reviewer APPROVE at `fe6fa381c843d0f6250a89b3a92219e06f38152e` against
the base above, with no Critical/High/Medium findings. Independently executed
resolver12/12, helper8/8 and actual Chromium sidebar1/1 passed without skips;
three additional owned fixtures covered dev precedence, fallback without bundle
and the newest-five alias bound. Retained canonical/history hashes matched.
The complete canonical gate was inspected, not independently repeated.

One nonblocking Low precision note: a deliberately stalled browser evaluation
remained pending at5202ms, then correctly rejected an expired result when released.
The5-second window is not browser-task cancellation; the source comment and this
report now say so. No executable behavior changed for that clarification.

## Delivery boundary

At this validation snapshot no PR186 merge, release or candidate installation has
occurred. The operator authorized independent read-only review after green gate,
then merge/npm/GitHub release/both local plugins/admin only after APPROVE.
Old installed versions must remain recoverable. Native paid benchmark and domain
default activation are not authorized by that release approval.

VERDICT: DONE — Author gate GREEN with15 NOT CHECKED; independent APPROVE; release and installation remain separate.
