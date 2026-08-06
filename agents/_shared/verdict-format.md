# Verdict line format (canonical)

Every great_cto agent that completes a step MUST emit a verdict line so the
board (`/api/cost`, `/api/metrics`, `/api/pipeline`) can track activity and
cost. **The line MUST include a `cost=$<usd>` tag** or the LLM-cost dashboard
shows zeros (BUG QA-006/007).

## Format — versioned JSON, one record per line

```json
{"v":1,"ts":"2026-05-09T14:30:00Z","agent":"architect","verdict":"APPROVED","project":"<slug>","cost_usd":0.42,"meta":{"feature":"x"}}
```

- `v`        — format version. A reader that meets a version it does not know
               says so rather than reading the fields it recognises.
- `ts`       — UTC ISO-8601
- `agent`    — agent slug (matches `agents/<name>.md`)
- `verdict`  — `APPROVED` / `REJECTED` / `PASS` / `FAIL` / `TASK_DONE` / `PLAN_READY` / …
- `cost_usd` — required. `0` if the cost truly is zero; omitting it makes
               `/api/cost` report zero spend for the stage.
- `meta`     — freeform object.

Named fields exist because the previous text dialects were guessed apart by
looking for ` | `, and agents write prose in the details field. `BLOCKED 3
findings | all in the auth path` was read as the piped dialect and the verdict
came back as `all in the auth path`, which the board then showed as the agent's
verdict. No punctuation a human types can move one field into another now.

### Legacy dialects — read, never written

```
<ISO-ts> | <agent> | <verdict> | [meta_kv...] | cost=$<usd>
<ISO-ts> <verdict> <details> cost=$<usd>
```

Every verdict log written before the schema landed is in one of these, and
`scripts/lib/verdict-record.mjs` still parses both — a reader that drops history
to enforce a schema has destroyed the thing the schema protects. Do not write
them.

**This document described the piped form as canonical for one day after it
stopped being so, and that cost a stalled pipeline run**: `pipeline-dispatcher`
kept a second copy of the parser, the schema change updated only the first, and
an agent that used the helper correctly was reported as having recorded no
verdict. The parser now lives in one place.

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
