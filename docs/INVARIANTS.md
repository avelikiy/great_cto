# Invariants

The rules great_cto is built against that must not quietly stop being true. Each
has a stable id and a `verify:` line naming what proves it still holds. An
invariant nobody can check is a wish, so where there is no check yet this file
says so, with the reason, instead of pointing at nothing.

How this file works:

- **Ids are never renumbered or reused.** A retired invariant keeps its id, marked
  `RETIRED`, with a pointer to what replaced it.
- **A commit that changes this file names what it changed:**
  `INVARIANT-CHANGE(INV-NNN)` in the commit message, one id per invariant added,
  edited or retired. The pre-push hook refuses a push that edits this file without
  one. Rewording is allowed; weakening a rule is a change and must say so.
- **`verify:` names files that exist.** `tests/lib/invariants.test.mjs` fails when a
  named file is missing, so a renamed test cannot leave an invariant pointing at
  nothing.
- **When code and an invariant disagree,** fix the code or change the invariant
  here, in the open. Never paper over it.

The narrative behind most of these lives in [CLAUDE.md](../CLAUDE.md) and the
ADRs; this file is the checkable list. (Format borrowed from claudexor's
`CLAUDEXOR_BIBLE.md`, MIT.)

---

## Privacy

- **INV-001** Private project names never reach the public repository — not in a
  commit message, a diff, a document or a string literal.
  verify: `tests/hooks/pre-push.test.mjs`
- **INV-002** Committed files carry no hardcoded `/Users/<name>/` paths; they use
  `~/.great_cto/` notation or an environment variable.
  verify: none yet — review question. The pre-push hook scans for private names,
  not for home-directory paths.
- **INV-003** Telemetry, and any new tracking, is off unless the user opts in.
  verify: `tests/telemetry.test.mjs`
- **INV-004** Turn snapshots stay on the machine: a push that includes
  `refs/great-cto/` is refused.
  verify: `tests/hooks/pre-push.test.mjs`, `tests/lib/turn-snapshot.test.mjs`

## Secrets

- **INV-005** `~/.great_cto/secrets.env` is never truncated. A write backs the file
  up first and preserves every other line.
  verify: `tests/lib/router-key.test.mjs`
- **INV-006** No board endpoint returns a secret — only its presence, where it came
  from, and a fingerprint.
  verify: `packages/board/router-key-verify.test.mjs`, `tests/lib/router-key-verify.test.mjs`

## Honest states

- **INV-007** Unknown is not zero. A cost, score or rate that was not measured is
  reported as unmeasured, never as `0`.
  verify: `tests/lib/agent-budget.test.mjs`, `tests/lib/board-third-state.test.mjs`
- **INV-008** A check that could not run says "not checked" — a separate state and a
  separate exit code — and is never read as a pass.
  verify: `tests/lib/lane-diff.test.mjs`, `tests/lib/cross-model-review-provider.test.mjs`
- **INV-009** A registry or config file that cannot be parsed is refused and left as
  it was, never rewritten from scratch.
  verify: `tests/lib/project-registry.test.mjs`

## Decisions and gates

- **INV-010** Work that is expensive to undo — escapes the machine, crosses a project
  boundary, costs money, destroys evidence — needs a human decision wherever it sits
  in the pipeline (ADR-009). Agents doing such work declare it and cannot relax it
  in their own frontmatter.
  verify: `tests/lib/agent-prompt-lint-authority.test.mjs`
- **INV-011** The board answers only hosts it knows, and state changes need a token
  issued for that exact gate.
  verify: `packages/board/host-allowlist.test.mjs`, `packages/board/gate-tokens.test.mjs`

## Parallel work

- **INV-012** Parallel builders write disjoint files — in the plan before dispatch,
  and in each builder's actual diff before it is committed.
  verify: `tests/lib/wpl.test.mjs`, `tests/lib/lane-diff.test.mjs`

## This file

- **INV-013** This file changes only with an `INVARIANT-CHANGE(INV-NNN)` marker in
  the commit message, and every `verify:` names a file that exists.
  verify: `tests/hooks/pre-push.test.mjs`, `tests/lib/invariants.test.mjs`
