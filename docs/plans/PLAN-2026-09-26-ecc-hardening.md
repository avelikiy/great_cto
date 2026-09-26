# Plan — two dead hooks, and what the ECC comparison says is missing

Status: in progress · 2026-09-26 · target release 3.38.0

## Why

A component-by-component comparison with affaan-m/ECC (MIT; ~250 components: 68 agents,
94 commands, 292 skills, 24 hooks, ~300 scripts, 122 rules) found that great_cto leads on
the pipeline, gates, agent evals, cost and the board, and trails on packaging and on
measuring skills. It also found two defects in great_cto's own hooks, verified by hand:

| Defect | Evidence |
|---|---|
| The inline PreToolUse "Dangerous command" guard never blocked anything | It reads a top-level `command`; Claude Code sends `tool_input.command`. With the real payload `rm -rf` exits 0. |
| The inline PostToolUse write log never wrote | It reads a top-level `file_path`; no `.great_cto/agent-writes.log` exists in any project. |

The guard cannot be revived as written: its regex blocks every `rm -rf` (including
`node_modules`, `dist`) and every `--force-with-lease`, and matches text inside a commit
message. It is rebuilt on `scripts/lib/shell-commands.mjs`.

## Items

| # | Item | Kind | Effort |
|---|---|---|---|
| 1 | Destructive-command guard, parsed, with sane targets | bug | S–M |
| 2 | Write log reads `tool_input.file_path` | bug | S |
| 3 | `_shared/untrusted-content.md` for every agent with WebFetch/WebSearch + lint rule | security | S |
| 4 | Injection / invisible-Unicode scan of memory and shipped prompts | security | S |
| 5 | gate-weakening-guard: lint/type suppressions and weakened configs | enforcement | S |
| 6 | `ci-resolver` agent: red CI → cause → minimal fix | agent | S |
| 7 | Findings dedupe before triage/verification | cost | M |
| 8 | Skill usage counter (from transcripts) + skill lint | measurement | S |
| 9 | Typecheck once per turn at Stop (opt-in, time-boxed) | quality | M |
| 10 | Loop detector: same tool + same input N times | speed | S–M |
| 11 | Deterministic GitHub Actions workflow security check | security | S |

Later, not in 3.38: install profiles, `great-cto uninstall`, Windows, staging dist-tag
release, TROUBLESHOOTING page.

Not taken: 28 per-language reviewers, prose rules, dashboards, `ecc2`, framework guides.

## Decomposition matrix

Every stream works in its own worktree off `origin/main` and runs only targeted tests —
never `scripts/ci-local.sh` (two gates at once flake). Shared files are integrated once,
by the coordinator, after the streams land.

| Stream | Items | Write zone | Depends on | Why parallel-safe |
|---|---|---|---|---|
| S1 | 1 | `scripts/hooks/destructive-guard.mjs`, `tests/hooks/destructive-guard.test.mjs` | — | new files |
| S3 | 3 | `agents/_shared/untrusted-content.md`, one pointer line in each agent with WebFetch/WebSearch, `scripts/agent-prompt-lint.mjs`, its tests, `tests/lib/frontmatter-parses.test.mjs` fragment list | — | only S3 edits agent files in wave 1 |
| S4 | 4 | `scripts/lib/injection-scan.mjs`, `scripts/hooks/read-global-memory.mjs`, `scripts/lib/agent-shield.mjs`, tests | — | disjoint files |
| S5 | 5 | `scripts/hooks/gate-weakening-guard.mjs`, its test | — | one hook |
| S6 | 7 | `scripts/lib/findings-dedupe.mjs`, test, `commands/review.md` | — | disjoint |
| S7 | 6 | `agents/ci-resolver.md`, `skills/great_cto/SKILL.md` routing row, counts in README/docs/tests, `tests/eval/EVAL-ci-resolver-*.md` | wave 2 (after S3 lands, so the new agent carries the pointer) | one new agent |
| S8 | 8 | `scripts/lib/skill-usage.mjs`, `scripts/skill-lint.mjs`, tests | — | new files |
| S9 | 11 | `scripts/lib/workflow-security.mjs`, test | — | new files |
| S10 | 10 | `scripts/hooks/loop-detector.mjs`, test | — | new files |
| S11 | 9 | `scripts/hooks/stop-typecheck.mjs`, test | — | new files |
| Coordinator | 2 + integration | `.claude-plugin/plugin.json`, `CHANGELOG.md`, `docs/HOOKS.md`, `scripts/ci-local.sh`, `agents-full/`, one line in `agents/security-officer.md` (S9) | all streams | sole owner of shared files |

Waves: W1 = S1, S3, S4, S5, S6 · W2 = S7, S8, S9, S10, S11 · then integration, full gate,
live probes, release.

## Done when

- Each new hook is registered, and a test runs its plugin.json command with the payload
  shape Claude Code sends (the defect in items 1 and 2 was exactly a test that never did).
- In a fresh session: `rm -rf /` style commands are refused and `rm -rf node_modules` is not;
  a write lands in `.great_cto/agent-writes.log`.
- Full gate green; 3.38.0 published and verified on the installed plugin.
