# QA: Task evidence panel

Date: 2026-10-11
Scope: Beads great_cto-qnq6.2
Base: review-contract PR181 at 6073d39c
Design: [task evidence panel](../design/DESIGN-task-evidence.md)
Status: focused, board and browser checks passed; canonical rerun pending

## Implemented

The existing project-scoped Work projection exposes five independent evidence
sections. Linked activity and role verifier reports are recorded observations,
not current-tree approval. Review and runtime remain Unknown without explicit
task-bound receipts/probes. Publication records do not imply merge or deploy.
The renderer uses existing tokens and native keyboard disclosure. No new API,
host execution, external polling or installed-runtime mutation was introduced.

## Verification

- Work read-model and renderer tests: 18 passed, 0 failed, 0 skipped.
- New keyboard/read-only evidence browser scenario: 1 passed, 0 failed,
  0 skipped. This targeted run is not the entire browser suite.
- Full browser suite: 16 passed, 0 failed, 0 skipped.
- Initial full board suite: 540 passed, 4 failed, 0 skipped. Three server
  fixtures missed startup deadlines under concurrent board/browser load;
  the bundler fixture required `dist/archetypes.js`, which was not built yet
  in this new worktree. These failures are not treated as success.
- CLI dependencies and TypeScript build subsequently passed. The complete
  board suite passed 544 tests with concurrency 2, zero failures/skips and no
  concurrent browser fixtures. This is a diagnostic scheduling change, not the canonical gate
  configuration and not a relaxed assertion or timeout.
- Doc-links tests: 5 passed, 0 failed, 0 skipped. Runtime module syntax,
  generated reference synchronization and `git diff --check` passed.
- The first canonical run was cancelled during the scanner after the push's
  advisory artifact lint identified five required DESIGN sections missing.
  Cancellation is not PASS. The missing sections were added without changing
  lint policy; a fresh frozen-source canonical run is required. The parent
  contract's canonical result does not certify these later UI changes.

Test fixtures cover explicit links, foreign-session exclusion, bounded
projection, non-boolean verifier claims, release-without-runtime, escaping,
English system labels and untranslated user task text. The keyboard browser
scenario observes no write requests when opening/closing the panel.

## Remaining boundaries

No independent review, merge, npm/GitHub release, installed-plugin update or
localhost:3141 restart. No native-model quality benchmark or full host parity
claim. Connecting actual task-bound review receipts, PR/CI results and runtime
probes is separate from rendering the available observations.
