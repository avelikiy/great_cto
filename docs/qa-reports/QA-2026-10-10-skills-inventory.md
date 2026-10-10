# Skills inventory verification

Date: 2026-10-10
Scope: Beads great_cto-f33n.1, ADR-029
Branch: codex/skills-inventory, based on codex/board-english-ui

Dependency verification: [selected-project Usage](QA-2026-10-10-project-scoped-usage.md)
and [English UI formatting](QA-2026-10-10-board-english-ui.md).

Release-stage review and corrections are recorded separately in the
[independent review report](REVIEW-2026-10-10-skills-release.md). The results
below describe the original implementation run, not a later release approval.

## Results

| Check | Result |
| --- | --- |
| Board unit/API/UI-source suite | 490 passed, 0 failed, 0 skipped |
| Board Chromium E2E suite | 13 passed, 0 failed, 0 skipped |
| CLI package-files validation | 4 passed, 0 failed, 0 skipped |
| CLI TypeScript build | Passed |
| Generated npm bundle Skills import from isolated fixture cwd/home | Passed, included in board suite |
| git diff --check | Passed |

Reproduction:

```sh
CI=1 npm ci --no-audit --no-fund
npm --prefix packages/cli ci --no-audit --no-fund --ignore-scripts
npm --prefix packages/cli run build
node --test packages/board/*.test.mjs
node --test tests/e2e/board.e2e.test.mjs
node --test packages/cli/tests/package-files.test.mjs
git diff --check
```

The actual CLI dependency installation used CI=1 as well; this suppresses the
postinstall local-board/plugin side effects. The explicit ignore-scripts form
above also isolates dependency preparation.

## Red-first evidence and regressions

The initial inventory test failed with a missing module before implementation.
The three route tests failed before adding GET /api/skills. The browser Skills
scenario failed before the new panel existed. Adding a late-DOM-order panel
also exposed an existing fixture helper's comma selector waiting on hidden
Inbox; it now waits only for the active panel. Both locale preservation and
the complete navigation/mobile suite pass with that correction.

The generated npm-bundle regression initially failed with a missing
scripts/skill-lint.mjs dependency even though repository-based tests passed.
The bundler now derives top-level script imports and follows their same-level
and lib dependencies rather than adding a hand-maintained filename exception.
The isolated bundle import then passed.

Tests cover host/project isolation, document-only hashes, stable identities,
local edits, cached registry declarations, rejected arbitrary paths, read-only
HTTP methods, concurrent read reuse, corrupt/unreadable/oversized sources,
symlink refusal, bounds, migrated Codex commands and genuine empty inventories.
UI checks cover late previous-project/reload replies, clearing stale data,
loading/failure states, scope/search filters, HTML injection escaping and the
absence of install/update controls.

## Read-only local probe

A local scan, without executing skill contents or performing remote requests,
revealed cache starvation: a historical Claude cache could exhaust the global
scan before Codex/project roots were read. Project/host directories and registry
now come first. Each cache has a separate quota, and dependency/git trees are
excluded. A regression checks both host caches remain represented when quotas
are reached.

One post-fix probe listed 501 documents in approximately 542 ms. A repeated
in-process cached read rounded to 0 ms. This is one observation on one machine,
not a latency benchmark or a completeness count. State remained partial:
both historical caches had source-limit/symlink warnings. The current registry
and direct host/project roots were inspected; absent project roots were
reported absent rather than unreadable. Raw skill bodies, private absolute
paths and skill names from this machine are not committed in the report.

## Boundaries

Only document integrity and partial structural lint are observed. Full skill
trees, license provenance, upstream revisions, enabled/loaded host state and
task-quality effects are not verified. Filesystem time limits are cooperative;
same-UID ancestor mutation is not contained by an atomic sandbox.

This is implementation verification and self-review, not an independent
reviewer approval/security-gate receipt. Full repository CI, remote scanners,
live-model benchmarks and installed/published-package delivery are not certified.
The generated bundle is tested locally; no npm publication or installed-plugin
update was performed. localhost:3141 was not replaced or restarted.

The epic remains open for architecture visualization, evidence ledger, focused
SEO checks and a read-only discovery feed. Merge/release decisions remain separate.
