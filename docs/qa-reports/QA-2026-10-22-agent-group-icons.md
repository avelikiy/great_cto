# Shared agent-group icons verification

Date: 2026-10-22
Scope: great_cto-bqxg; plugin PR #199 and site PR #6 (stacked on site PR #5).
Contract: [shared role-group symbols](../design/DESIGN-agent-group-icons.md).

Full-gate and independently reviewed source candidate:
`b6d60f12e4c4cf46722dffd42bd774951a344ee0`,
tree `670ddfe0a31d10ea209d4a796c40fd40f5d9fe6b`.
Final independently reviewed site candidate:
`f8261da68462f3df463e50e0b75cae485b328a53`,
tree `5e91ef569cf8365c5654da09b0a07b6a7b143009`.
The later source change records results in this report only; runtime code and
tests remain those of the pinned source candidate.

## Results

| Check | Result |
| --- | --- |
| Focused plugin contracts and affected consumers | 49 passed, 0 failed/skipped |
| New isolated board Chromium scenario | Passed: 72 roles, profile keyboard opening, 390/1440 widths, light/dark, failed asset fallback |
| Site Node suite | 54 passed, 0 failed/skipped |
| Site full build | Passed |
| Site strict design checks | Green; 24 pre-existing orphan-selector advisories remain |
| Site Chromium runner | Passed: 72 roster roles, 9 groups, 54 role-row checks after changing all three presets at both widths; zero page errors |
| Site JavaScript-disabled check | Initial roster and homepage symbols remain visible |
| Local npm tarball | Both canonical asset and Node bridge included; asset bytes identical; extracted Fleet import passed |
| Extracted npm board HTTP | Canonical asset returned HTTP 200 and text/javascript; served HTML loads it |
| Documentation regressions | Design-dials and doc-links tests passed after correction; enforced artifact lint passed |
| Full candidate gate | Corrected run exit 0, no failures; 15 baseline NOT CHECKED remain explicit |
| Independent read-only review | APPROVE for both pinned candidates after correcting one site P2 |

Final full-gate counts: root/hooks/board 1504 passed; library 3492 passed and
6 skipped; eval 242, documentation 76, browser 19, CLI 375 and archetype E2E 34
passed without failures or skips. Pipeline L1-L5 executed checks passed, with
9 explicit NOT CHECKED. The final banner is GREEN with 15 NOT CHECKED, not ALL
GATES GREEN. Live Docker/controller/model-worker scenarios, real capture and
delivery, paid learning and deployment remain outside this run's proof.

The local, unpublished archive retains the existing package version. Its SHA-256
is `5db7e20207b04e0628069cfe0ea36043d99ecae2a5077007244ad23d9d5493c2`.
This is not a checksum for the published npm release.

## Failures and corrections

The first board browser probe read an immediate element count during roster
refresh and observed a transient absent status dot. The assertion now waits
for that actual element to attach, without changing the expected roster size,
symbol classification or deadline. Subsequent scenario runs passed.

Initial site test fixtures omitted context-picker input, then supplied the site
root instead of the resolved plugin snapshot root. The test now builds real
flow data from `model.meta.root` and exercises the interactive output. Existing
HTML expectations were updated to include authored glyphs while preserving
escaping assertions. The live-root resolution test now creates its own symlink
fixture rather than depending on the operator's adjacent checkout.

The first full gate found missing design dials and an orphaned new design
document. The document now states its three dials and links to the role
reference. Neither frozen test threshold was increased. The pre-push artifact
advisory also exposed missing design-contract sections; those are now declared
and enforced artifact lint is clean. The existing generated reference's prose
advisory was not hidden or used to weaken a check.

## Independent review and correction

The first independent read-only review found no source P0-P2 findings, but
requested changes for site commit `763911a7db71a63e6aa681eb041a0811db55c4b1`:
the new canonical-asset copy checked the destination parent, not its leaf.
A file-level symlink could therefore overwrite an external file. Two new
regressions for existing and dangling leaf links failed before the correction.

The site now rejects leaf symlinks with lstat, retains the parent realpath
guard, and stages the copy inside assets before renaming the directory entry.
An external hardlink's inode is not truncated. A third regression verifies
hardlink preservation and cleanup of staging files. After correction the full
site build, 54 Node tests, strict design checks and browser runner passed again.

The reviewer independently reran 6 site icon regressions on the final site pin
and returned APPROVE for both pinned candidates, with no remaining P0-P2
findings. In the initial review the reviewer independently ran 21 source
contracts, the board icon browser scenario, 33 site contracts and the site
browser runner, and checked the package hash and runtime-file inclusion.
The reviewer read, but did not rerun, the full source gate and final overall
site suites. No reviewer writes, receipts or publication operations were made.
These filesystem guards do not claim a sandbox against hostile same-UID
mutation of ancestor directories.

## Reproduction

```sh
node --test tests/lib/agent-groups.test.mjs packages/board/fleet-classify.test.mjs packages/board/fleet-read.test.mjs packages/board/decisions-scope.test.mjs tests/lib/board-third-state.test.mjs tests/lib/session-prefix-stability.test.mjs
node --test tests/e2e/agent-group-icons.e2e.test.mjs
GREAT_CTO_TEST_PLUGIN_DIR="$PWD" bash scripts/ci-local.sh --e2e
```

The full gate uses Node 22.19.0 and the native Claude executable on PATH. The
explicit candidate-root variable prevents installed-plugin fallback in host
integration checks. In the companion site checkout:

```sh
npm run build
node --test team/*.test.mjs commands/*.test.mjs tests/*.test.mjs
bash check-design.sh --strict
GCTO_PLAYWRIGHT_MODULE=/absolute/node_modules/playwright/index.mjs node tests/browser/agent-group-icons.mjs
```

The site build entry point and its new generator were exercised through the
actual npm build command, not only by importing a helper. Retired generators,
shared styles and the existing sitemap were left unchanged.

## Boundaries

Role-group symbols are not individual portraits, execution state or evidence
of better model outcomes. No pipeline routing, permissions, mandatory gates or
budgets changed. No merge, npm/GitHub release, live-model benchmark, public-site
deployment, installed-plugin update or local-admin replacement was performed.
Source and site changes are isolated from the earlier approved showcase/graph
worktrees and from the original icon worktree.
