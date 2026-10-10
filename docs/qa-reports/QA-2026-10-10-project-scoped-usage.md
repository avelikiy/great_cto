# QA: selected-project Usage isolation

Date: 2026-10-10
Scope: PR #173, `codex/project-scoped-usage`, review corrections after `82ce397a`.
Review: self-review, not an independent reviewer approval.
Release readiness: blocked by the separately tracked installed-CLI smoke failure.

## Findings reproduced and corrected

### P1: sibling monorepo projects were counted together

`projectUsageIndex` compared only Git common-directory identities. Selecting
`apps/alpha` therefore admitted sessions from `apps/beta`, `apps/alpha-other`
and the repository root. The regression fixture reproduced all six entries
being admitted instead of only the two alpha entries.

The filter now preserves the selected project's relative directory inside
each linked worktree. Matching requires both repository identity and directory
containment. Whole-repository selection still includes its linked worktrees;
symlink normalization and same-host child-session inheritance are preserved.

Evidence: `tests/lib/session-usage.test.mjs`, monorepo and linked-worktree tests;
`packages/board/usage-project-api.test.mjs`, real workers reading both hosts in
two registered applications sharing one Git database.

### P1: foreign verdict tags bypassed isolation in local logs

The outcomes filter checked explicit project tags only in global logs. A
foreign-tagged verdict copied into a selected project's local log was counted.
The new fixture reproduced four runs instead of three.

Explicit tags now take precedence over file placement. Local untagged verdicts
remain attributable to their directory; untagged global verdicts and explicit
foreign tags are excluded. Legacy machine-wide aggregation is unchanged.

Evidence: `tests/lib/outcomes.test.mjs`, explicit foreign-tag regression;
`packages/board/usage-project-api.test.mjs`, foreign tags in both local logs.

## Verification

| Check | Result |
| --- | --- |
| Session accounting and outcomes | 32 passed, no skips |
| Usage API/UI/cache and project scope | 16 passed, no skips |
| Browser board E2E | 11 passed, no skips; also passed inside the broad gate |
| Broad root/hooks/board suite | 1,309 passed, no skips |
| Library rerun | 2,579 passed, 4 opt-in live checks skipped, zero failures |
| Eval and docs suites | 238 and 76 passed respectively, no skips |
| CLI unit tests and package build | 362 passed; package build passed |
| HOL scanner | Passed using the existing reviewed false-positive baseline |
| Installed pipeline L1-L5 | 40 passed, 15 L2 failures, 1 explicitly absent suite |

The initial broad library run was interrupted by the operator while the last
all-screen/all-theme test remained within its actual 600-second budget. It is
not evidence of a product defect. The entire library suite was rerun to
completion with the results above; the erroneous issue `great_cto-985k` was
closed with the correction.

## Boundaries

`great_cto-5n9t` remains open: the installed marketplace plugin has a CLI entry
but no compiled `dist/main.js`. Its 15 smoke failures are not waived; the
separately installed npm CLI reports version 3.59.1 and works. The overall
release gate remains red until installed runtime selection is corrected.

PR #174 separately prepares the clean Evals Runner checkout by installing and
building the CLI before parity/library tests. Its complete unit command passed
2,789 tests with 7 explicit skips and no failures.

No merge, release, npm publication, installed-plugin replacement or board
restart is part of this review. No live model-quality improvement is inferred
from deterministic tests. Sessions without reliable attribution are excluded;
deleted worktrees without surviving repository identity remain unattributable.
