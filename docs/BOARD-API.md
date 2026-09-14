# Board API

[← back to README](../README.md)

The board (`great-cto board` → `http://localhost:3141`) exposes a JSON API for external integrations and smoke tests. API routes live in `packages/board/lib/routes.mjs` — read the source if a behaviour surprises you.

## Endpoints

> All list endpoints return **raw arrays** or top-level fields, not wrapped objects. Smoke scripts that test `data.projects` will see `undefined` and falsely report empty data.

| Endpoint | Method | Returns |
|---|---|---|
| `/api/projects` | GET | `Project[]` — array of `{slug, archetype, path, ...}` |
| `/api/tasks?project=<slug>` | GET | `Task[]` — array of `{id, title, status, ...}` |
| `/api/tasks` | POST | Create task (body: `{title, priority, agent?}`); returns 409 without `.beads/` |
| `/api/tasks/<id>/history` | GET | `{events: [...]}`; 404 for unknown id |
| `/api/agents-installed` | GET | `{agents: [...], total: N}` |
| `/api/metrics?project=<slug>` | GET | `{tasks, velocity, cost, qa, security, agents, agents_cost}` |
| `/api/cost?project=<slug>&days=30` | GET | `{series, total_llm, total_human, ...}` |
| `/api/memory?project=<slug>` | GET | `{layers: [...11], patterns: [...]}` |
| `/api/inbox?project=<slug>` | GET | `{open_gates, p0_open, blocked, recent_activity, ...}` |
| `/api/logs?project=<slug>` | GET | `{logs: [...]}` |
| `/api/decisions?limit=20` | GET | `Decision[]` |
| `/api/pipeline?project=<slug>` | GET | `Stage[]` — 8 SDLC stages with status |
| `/api/evidence?project=<slug>&limit=100` | GET | Canonical evidence projection: `{state, revision, provenance, summary, runs, decisions, harnesses, fleet, receipts, events, migration}` |
| `/api/gates/<id>` | POST | Approve/reject gate (body: `{action, reason?}`); returns 409 without `.beads/` |
| `/api/healthz` | GET | `{ok: true}` |

`/api/evidence` has four explicit top-level states: `none`, `some`,
`degraded`, and `unreadable`. A malformed ledger returns empty `runs` and
`events`; the API never presents a projection built from only the rows that
happened to parse. `limit` caps returned recent events to 1–500 and does not
change aggregate counters. `revision` is the SHA-256 of the deterministically
ordered canonical event set. `migration.sources` reports canonical, legacy,
legacy-only and canonical-only counts; `count-match` explicitly does not claim
semantic parity.
Legacy-only facts make the top-level state `degraded`; they are never hidden
behind an otherwise readable canonical subset.

## Common gotcha — array vs object

Smoke scripts often assume `{projects: [...]}`. The actual shape is just `[...]`. Use:

```python
import urllib.request, json
data = json.load(urllib.request.urlopen("http://127.0.0.1:3141/api/projects"))
assert isinstance(data, list), "endpoint returns array directly"
print(f"projects: {len(data)}")
```

```bash
curl -sf "http://127.0.0.1:3141/api/tasks?project=Test" | jq 'length'
```

## Error responses

POST endpoints return structured errors when state is missing:

```json
{ "error": "beads_not_initialized",
  "message": "No .beads/ directory found in <cwd>. Initialize with 'bd init' or set BEADS_DIR.",
  "cwd": "/path/to/proj",
  "hint": "Run 'bd init' in the project root, then retry." }
```

HTTP `409 Conflict` is returned in this case (not `500`). The UI can render an "Initialize project" button instead of an opaque error.

## SSE stream

```bash
curl -N "http://127.0.0.1:3141/api/sse"
# event: task:created
# data: {...}
# event: task:closed
# data: {...}
```

Events fire within ~1s of underlying state changes (Beads writes + verdict appends).

## Regression tests

`tests/board/` covers all closed bugs from `docs/qa/` as pytest regression cases. Run as part of L1 in `scripts/test-pipeline.sh --quick`.
