# Verdict line format (canonical)

Every great_cto agent that completes a step MUST emit a verdict line so the
board (`/api/cost`, `/api/metrics`, `/api/pipeline`) can track activity and
cost. **The line MUST include a `cost=$<usd>` tag** or the LLM-cost dashboard
shows zeros (BUG QA-006/007).

## Format

```
<ISO-ts> | <agent> | <verdict> | [meta_kv...] | cost=$<usd>
```

- `ts`         — UTC ISO-8601, e.g. `2026-05-09T14:30:00Z`
- `agent`      — agent slug (matches `agents/<name>.md`)
- `verdict`    — `APPROVED` / `REJECTED` / `PASS` / `FAIL` / `TASK_DONE` / `PLAN_READY` / etc.
- `meta_kv`    — `key=value` pairs separated by ` | `, freeform
- `cost=$<usd>` — required, dollars (decimal). Use `0` if cost truly is zero.

## Preferred: use the helper

```bash
bash scripts/log-verdict.sh <agent> <verdict> <cost_usd> [meta_kv...]
```

The helper:
1. Validates `cost_usd` is a non-negative number.
2. Appends to `.great_cto/verdicts/<agent>.log` in canonical format.
3. Tees `<ts> <agent> <cost_usd>` to `.great_cto/cost-history.log` (fallback
   source consumed by board if the verdict line ever lacks the tag).

### Example

```bash
bash scripts/log-verdict.sh architect APPROVED 0.50 \
  feature=tenant-onboarding \
  arch=docs/architecture/ARCH-tenant-onboarding.md
```

Produces `.great_cto/verdicts/architect.log`:
```
2026-05-09T14:30:00Z | architect | APPROVED | feature=tenant-onboarding arch=docs/architecture/ARCH-tenant-onboarding.md | cost=$0.50
```

And `.great_cto/cost-history.log`:
```
2026-05-09T14:30:00Z architect 0.50
```

## Manual writes (discouraged)

If you must emit the verdict yourself, include `cost=$<usd>` somewhere on the
line. The parser regex (server.mjs:727) is `\bcost=\$?(\d+\.?\d*)\b` —
case-insensitive, accepts `cost=0.50`, `cost=$0.50`, `Cost=$0.5`. Prefer the
helper.

## Why both files?

- `verdicts/<agent>.log` — primary source of truth, human-readable, git-tracked.
- `cost-history.log` — append-only fallback the board reads when a verdict
  line lacks the cost tag (e.g. legacy lines from before this format was
  formalized). Letting both exist means we never silently lose cost data.
