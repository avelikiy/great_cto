# Board English UI verification

Date: 2026-10-10
Branch: `codex/board-english-ui`
Base: `codex/project-scoped-usage` at `5af3f7a6d9e4a5cfdfe85679544dfbaccc3aad7b`
Issue: `great_cto-354w`

## Scope and findings

Board-owned navigation, controls, hints and generated messages are already English.
The remaining language dependency was ten browser-default date, time and number
formatting calls in the admin page and public report. They now use `en-US`, like
the existing Usage formatters. The operator's timezone is unchanged.

Task titles, descriptions, notes, acceptance criteria and document content are
not translated or rewritten. There is no language model, translation request,
new package dependency, backend change or stored-data migration in this patch.

## Evidence

| Check | Result |
| --- | --- |
| New locale regression tests before the fix | 3 failed, reproducing ambient-locale formatting |
| `node --test packages/board/english-ui.test.mjs` after the fix | 3 passed, 0 failed, 0 skipped |
| `node --test packages/board/*.test.mjs` | 471 passed, 0 failed, 0 skipped |
| `node --test tests/e2e/board.e2e.test.mjs` | 12 passed, 0 failed, 0 skipped |
| CLI TypeScript build (`npm run build` in `packages/cli`) | Passed |
| `git diff --check` | Passed |

The new Chromium scenario uses a real `ru-RU` browser context and
`Europe/Vienna` timezone, an isolated project registry and synthetic fixture
files read by the board server. It opens a Russian task from Decisions, verifies
English actions and property labels, opens its Russian document and returns to
the task. Titles and prose match the original fixture strings exactly. Task
timestamp helpers match English formatting rather than the browser's Russian
default; the timezone offset remains Vienna's offset for the fixture date.

The source guard covers every `toLocaleString`, `toLocaleDateString` and
`toLocaleTimeString` call in both owned HTML pages. It rejects omitted, undefined
or browser-default locale arguments.

## Review and boundaries

Self-review: ten explicit locale arguments plus a policy comment; no task or
document renderer changes. Existing 24-hour formatting options remain intact.
Public-report changes affect formatting, not costs or accounting.

This is focused board verification, not a claim that every repository release
gate passed. It does not include an independent reviewer or a live model run.
No merge, npm release, installed-plugin replacement or local admin restart was
performed as part of these checks. The branch is stacked on the project-scoped
Usage changes in PR #173.
