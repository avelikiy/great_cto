# Board API

[← back to README](../README.md)

The board (`great-cto board` → `http://localhost:3141`) exposes a JSON API for external integrations and smoke tests. Routes are dispatched by `packages/board/lib/routes.mjs` from `packages/board/server.mjs` — read the source if a behaviour surprises you.

## Endpoints

> All list endpoints return **raw arrays** or top-level fields, not wrapped objects. Smoke scripts that test `data.projects` will see `undefined` and falsely report empty data.

| Endpoint | Method | Returns |
|---|---|---|
| `/api/projects` | GET | `Project[]` — array of `{slug, archetype, path, ...}` |
| `/api/work?project=<slug>` | GET | `{schemaVersion:1, projectId, projectName, revision, observedAt, health, sources, entries, sessions, decisions, execution}`; read-only run/issue projection. Unknown project: 404; non-GET: 405. `taskId=null` until durable links exist; `execution.enabled=false`. No prompts, approval tokens or artifact bytes. |
| `/api/tasks?project=<slug>` | GET | `Task[]` — array of `{id, title, status, ...}` |
| `/api/tasks` | POST | Create task (body: `{title, priority, agent?}`); returns 409 without `.beads/` |
| `/api/tasks/<id>/history` | GET | `{events: [...]}`; 404 for unknown id |
| `/api/agents-installed?project=<slug>` | GET | `{agents: [...], total: N, coreRoles: [...], summary: {...}}`; shared eight core contract IDs, not eight mandatory model calls. Unknown project: 404. |
| `/api/focus-registry?project=<slug>` | GET | `{projectId, registry}`; schema/registry version 1, four directions, five existing candidate/explicit-only packs and eight core IDs. Read-only, no-store; unknown project: 404, non-GET: 405. |
| `/api/focus-proposal?project=<slug>&focus=<id>&host=<codex-or-claude-code>` | GET | `{projectId, host, changeIdentity:null, proposal}`; advisory-only, no-store. This legacy adapter returns an unavailable current assessment; explicit stored snapshot inspection uses the additive routes below. Unknown project: 404, non-GET: 405. |
| `/api/focus-run-binding?project=<registered-selector>&run=<uuid>&phase=<preparation-or-review>` | GET | Version 1 `controlled-run-proposal-binding` descriptor for one stored snapshot, including project/run/phase identity and the complete binding. Explicit registered project required; no enumeration or latest-run fallback. |
| `/api/focus-run-proposal?project=<registered-selector>&run=<uuid>&phase=<preparation-or-review>&focus=<id>&snapshot=<sha256>&epoch=<sha256>&plan=<sha256>&base=<commit>&policy=<sha256>` | GET | Version 1 `controlled-run-proposal-inspection` envelope with the exact binding and unchanged nested v1 proposal. Review snapshots only; preparation returns `planning-only-evidence`. |

Focus endpoints resolve registered identities without reading PROJECT metadata
aliases: registry slug/name/path, an unambiguous basename, or the server's own
root. An arbitrary unregistered path is not admitted. Registry reads do not open
project declarations; proposal reads use only the selected root's bounded,
regular, single-link PROJECT file. A refused focus request clears previous
project inspection content and invalidates pending responses before rendering.
| `/api/metrics?project=<slug>` | GET | `{tasks, velocity, cost, qa, security, agents, agents_cost}` |
| `/api/cost?project=<slug>&days=30` | GET | `{series, total_llm, total_human, ...}` |
| `/api/memory?project=<slug>` | GET | `{layers: [...11], patterns: [...]}` |
| `/api/inbox?project=<slug>` | GET | `{pending_gates, p0_open, blocked, approval_tokens, ...}` — each pending gate carries the `token` a decision on it must present (ADR-024); `approval_tokens.state` is `unreadable` when tokens could not be issued |
| `/api/logs?project=<slug>` | GET | `{logs: [...]}` |
| `/api/decisions?limit=20` | GET | `Decision[]` |
| `/api/pipeline?project=<slug>` | GET | `Stage[]` — 8 SDLC stages with status |
| `/api/gates/<id>/brief` | GET | One read-only projection of what the gate approves (ADR-036): `moved` plus seven `sections` — `tree` (compared with the receipt the gate's token was issued for), `change` (files, tier), `risk` (reversibility), `reviews` (latest verdict per agent, `onThisTree` only for a verdict whose receipt matches these bytes), `second` (second opinion), `map` (the Change map flowchart from the document the latest code-reviewer or architect verdict points at, marked `onThisTree`), `touches` (files by part of the system, mapped tests). Each section is `recorded`, `empty` or `unknown` with `why`; an unreadable source is never an empty list. Writes nothing. 404 for an id that is not a pending gate |
| `/api/gates/<id>` | POST | Approve/reject gate (body: `{action, reason?, token, confirm?}`). `token` comes from that gate's `/api/inbox` entry and is single-use; `confirm` is the typed gate name, required to approve an expensive or unclassified gate. 403 `refused-token` / `refused-expired` / `refused-confirm`; 409 `refused-stale` with `changed` paths when the project changed since the gate was listed; 409 without `.beads/` and without `tasks.md` |
| `/api/turns?project=<slug>&limit=10` | GET | `{state, sessions, why?}` — agent turn snapshots (ADR-023), newest session first: `{session, turns, newestTurn, newestAt}`. `state` is `none` outside git, `unreadable` if git refused, `live` otherwise |
| `/api/turns/diff?project=<slug>&session=<id>&turn=<n>` | GET | `{state:'ok', paths, patch, truncated}` — one turn's unified diff and every changed path; the patch is cut at 200 KB. 400 for a bad session or turn, 404 for a turn that does not exist |
| `/api/router-key` | GET | `{state, from, fingerprint, model, problems, verification}` — whether a judge key is stored, never the key. `verification` is the last live check for this fingerprint, or `null`; GET makes no network request |
| `/api/router-key/verify` | POST | `{state, fingerprint, checkedAt, http?, limit?, usage?, reason?}` — asks OpenRouter (`GET /api/v1/key`, free) whether the stored key is live. `state` is `verified` (200), `rejected` (401/403), `unreachable` (no answer, timeout, any other status) or `absent`. 403 from another origin |
| `/api/healthz` | GET | `{ok: true}` |

## Focus proposals are not execution evidence

Focus IDs are `fintech-crypto`, `telemedicine`, `venture-pipeline`, and
`mental-care`. Selection does not activate a private overlay, change permissions,
dispatch a role or approve a gate. Registry invariants are descriptions, not
executed checks or proof of domain expertise.

The pure shared projector can represent a known caller-supplied plan, but the
legacy HTTP adapter deliberately does not scan source or infer freshness from a base
query, project name, recent run or successful process exit. Its unavailable
response preserves mandatory/declared review requirements and prohibits
selective omission. Missing host identity remains unavailable; it is not
silently inferred to be Codex. Neither endpoint returns private source, prompts,
raw assessment reasons, absolute project paths or overlay bindings.

### Explicit stored-run inspection

The two `focus-run-*` routes inspect saved controlled Codex evidence. They do
not assess the current tree, attest native worker enforcement, approve a gate
or change scheduling. The observed Execution graph remains a separate view.
The original `/api/focus-proposal` response keeps `changeIdentity:null` and its
unavailable assessment; the additive routes do not change that contract.

Require exactly one occurrence of every documented query key and no other
keys. The request URL is limited to 2 KiB; registered project selectors are
limited to 256 characters. Run IDs are lowercase canonical hexadecimal UUIDs,
without a version restriction. Phase is `preparation` or `review`, focus is one
of the four IDs above, digests are 64 lowercase hex characters, and base is a
40- or 64-character lowercase pinned commit. The server owns the store location
(`GREAT_CTO_CODEX_RUNS_DIR` or the existing controlled-run store default); no
query can override it. Resolution uses registered slug/name/path or a unique
registered basename, without PROJECT metadata alias scans or an unregistered
server-root fallback.

First request a binding descriptor. Its `binding` contains `snapshotDigest`,
`epochDigest`, `planFingerprint`, `base` and `policyDigest`. Map these to
`snapshot`, `epoch`, `plan`, `base` and `policy` in the proposal query. An exact
review selection returns `state:available`, `controller:codex`, `focusId`,
`registryVersion:1`, the binding and `proposal`. A valid preparation selection
can return a descriptor, but requesting its graph returns unavailable with
`reason:planning-only-evidence`, `binding:null` and `proposal:null`.

All envelopes declare `provenance:stored-snapshot`, `advisory:true`,
`changesExecution:false`, `currentTreeAssessment:false` and
`reusablePass:false`. Proposal envelopes include
`stored-snapshot-not-revalidated`, `content-identity-not-historical-epoch` and
`proposal-not-execution-evidence` limitations. Digests describe content, not a
unique historical occurrence or protection against same-UID ABA replacement.
No source assessment, subprocess, model call, directory listing or state write
is performed by inspection. The reader requires trusted canonical private
storage and refuses writable ancestors, including sticky temporary directories.

Both bootstrap and direct dispatch enforce Host plus exact transport-derived
Origin before resolving projects or reading registry/metadata/state. A present
Origin must exactly equal the request scheme, approved Host and port; foreign,
`null`, malformed and duplicate values fail. A present Referer must have that
same origin; cross-site Fetch-Site fails. Requests without Origin and Referer
are allowed for CLI callers. Forwarded headers cannot redefine the origin.
This browser isolation does not provide CLI authentication.

| Status | Fixed reason / result |
|---|---|
| 400 | `invalid-selection`; no registry or evidence read |
| 403 | `access-denied`; no registry or evidence read |
| 404 | `unavailable`; unknown project, missing run and other-project run share a fixed unavailable envelope |
| 405 | `method-not-allowed`, `Allow: GET`; no registry or evidence read |
| 200 | `unsupported-evidence`, `unsafe-evidence`, `invalid-evidence` or `planning-only-evidence`; no partial binding or graph |
| 409 | `snapshot-changed`; discard descriptor and graph, then explicitly obtain a fresh descriptor |

Every response is JSON with `Cache-Control: no-store`, without wildcard CORS,
ETag or conditional cache reuse. Unavailable envelopes contain `binding:null`
and `proposal:null`; raw private values and exception messages are excluded.
The response budget is 96 KiB, including at most 64 KiB of nested proposal.
Clients must clear prior inspection state on refusal, malformed/unknown schema,
changed selection or offline failure; retry is explicit.

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
