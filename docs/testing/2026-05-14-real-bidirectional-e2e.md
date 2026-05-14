# Real bidirectional E2E session — 2026-05-14

This is a one-shot verification that complements the 5 automated E2E tests
in `docs/testing/E2E-PLAN.md`. Those tests use seeded artifacts to validate
the board state machine. **This session validates the real integration
with live LLM agents** — something the automated tests can't do without
an LLM provider in CI.

## Setup

```bash
TESTDIR=/var/folders/.../gctorealXXXXdPZYBIqb7b
cd $TESTDIR
bd init
npx great-cto init     # → archetype: greenfield, PROJECT.md created
great-cto board --port 33777 --no-open &
```

## Phase 1 — Forward (Claude Code → Board)

Agent invoked via Task tool:
- `subagent_type: architect`
- Task: produce ARCH + ADR for `e2e-real-test-billing-webhook`, append verdict

**Result:**
| Surface | Observed | Expected | Match |
|---|---|---|---|
| `docs/architecture/ARCH-*.md` | 2766 bytes | exists | ✅ |
| `docs/adr/ADR-001-*.md` | 1426 bytes | exists | ✅ |
| `~/.great_cto/verdicts/architect.log` | `+1 line APPROVED feature=e2e-real-test... cost=$0.35` | new line | ✅ |
| `/api/pipeline` architect stage | `status=done verdict=APPROVED age_min=1` | `done/APPROVED` | ✅ |
| `/api/cost?days=1` total_llm | `$0.35` | `$0.35` | ✅ |
| `/api/cost` today bucket runs | `1` | `1` | ✅ |

## Phase 2 — Reverse (Board → Claude Code)

```bash
# Create task via board admin API
curl -X POST http://127.0.0.1:33777/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "wire HMAC verification for billing webhook",
    "priority": 1, "agent": "senior-dev",
    "labels": ["e2e-real-test"]
  }'
# → { "ok": true, "id": "gctorealXXXXdPZYBIqb7b-b0j" }
```

Then invoked `subagent_type: senior-dev` with instructions to find the task
via `bd list`, claim it, write code, close it.

**Result:**
| Surface | Observed | Expected | Match |
|---|---|---|---|
| `bd list` after POST | 1 task `priority=P1 assignee=senior-dev` | task visible | ✅ |
| Agent found task via bd | id correctly extracted in agent reply | yes | ✅ |
| `src/billing/hmac-verify.js` | 219 bytes (stub) | file written | ✅ |
| `bd show <id>` after agent | `status=closed closed_at=...` | closed | ✅ |
| `~/.great_cto/verdicts/senior-dev.log` | `+1 line DONE feature=... cost=$0.45` | new line | ✅ |
| `/api/pipeline` senior-dev | `status=done verdict=DONE age_min=2` | `done/DONE` | ✅ |
| `/api/cost` total cumulative | `$0.80` = $0.35 + $0.45 | exact | ✅ |
| `/api/tasks` task status | `done` (was `backlog`) | moved | ✅ |

## Cost of this test session

Two real agent runs:
- architect (sonnet) — $0.35
- senior-dev (sonnet) — $0.45
- **Total: $0.80**

## What this proves that automated tests don't

The 5 automated tests in E2E-PLAN.md use seeded artifacts on disk and
validate the board's state machine. They can't prove:

1. That agents actually receive prompts and produce correct outputs
2. That the verdict-log append format agents use is the one the board
   parses
3. That `bd list` output is the shape agents expect when reading tasks
4. That the POST /api/tasks → bd update → agent-readable flow chain
   actually links up

This session validates all 4. The automated tests catch regressions
between the seeded artifacts and board responses. This session catches
regressions between real agents and the seeded-artifact contract.

Repeat this manually after any of: agent prompt changes, verdict-log
format changes, bd CLI version upgrades, board API breaking changes.
