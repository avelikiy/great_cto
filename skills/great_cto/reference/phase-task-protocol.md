# Phase task protocol (every pipeline agent)

> Read when wiring phase tracking. Every pipeline agent already carries its own
phase-task section; this is the shared contract behind them.

Each pipeline agent (product-owner / architect / pm / senior-dev / code-reviewer
/ qa-engineer / security-officer / performance-engineer / db-migration-reviewer /
devops / l3-support) **must** create a Beads task at the start of its phase and close
it at the end. Without this the board UI only shows gates — Codex 2026-05
review surfaced this gap (it called the pipeline "epic + gates without task
decomposition by stages").

Use the helper `scripts/phase-task.sh` (synced into every project's
`.great_cto/cache/`):

```bash
PT="$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ | sort -V | tail -1 | sed 's|/$||')/scripts/phase-task.sh"
[ -x "$PT" ] || PT="$(pwd)/scripts/phase-task.sh"

# At phase start (idempotent — re-running returns the same id)
TASK_ID=$(bash "$PT" open <agent-name> <feature-slug> [--parent <epic-or-gate-id>])
bash "$PT" start "$TASK_ID"

# At phase end
bash "$PT" close "$TASK_ID" --verdict ok      # successful
bash "$PT" close "$TASK_ID" --verdict fail --notes "<reason>"   # blocked
```

Conventions:
- **agent-name**: matches the agent prompt file (architect, senior-dev, etc.)
- **feature-slug**: kebab-case, derived from the user's `/start` request
  (e.g. `stripe-subscriptions`, `2fa-totp`, `api-rate-limit`)
- **parent**: the gate task id this phase rolls up to (product-owner → gate:product,
  architect → gate:arch, qa-engineer → gate:ship, etc.). **gate:product is the
  first human gate** — the CTO approves the product brief (WHAT before HOW) before
  architecture begins.
- **verdict**: `ok` (closes) / `fail` / `blocked` (sets status=blocked +
  notes); `pass`, `done`, `approved`, `rejected` are aliases

Falls back to `.great_cto/tasks.md` when Beads is unavailable. Never blocks
the agent — task tracking is best-effort observability, not a gate.
