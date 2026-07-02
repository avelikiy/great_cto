# ARCH — Split packages/board/server.mjs into modules

Reader: next dev doing the mechanical extraction (Beads great_cto-xz5).
Decision: split 3,414-line `server.mjs` into a `packages/board/lib/` subtree, keeping `server.mjs` as the entry point that wires config → data → routes → http.

## Non-goals
- No behavior change. No new HTTP routes, no schema change, no response shape change.
- No new runtime deps. All modules stay `node:`-only, ESM `.mjs`.
- No changes to CLI flags (`--port`, `--no-open`), env vars, file paths in `~/.great_cto/`.
- No move of `mcp-server.mjs` or `push-adapter.mjs`. Both stay put; new modules may import `push-adapter.mjs`.
- CI test glob (`packages/board/*.test.mjs`) unchanged — new modules live under `lib/` so they are not auto-discovered as top-level tests.

## Target layout (under `packages/board/`)

```
server.mjs            entry: args, http.createServer, route table, startup, watcher init
lib/
  config.mjs          constants: PORT, HOST, PUBLIC, GREAT_CTO_DIR, all file paths, BUILD_VERSION, VAPID_SUBJECT
  state.mjs           in-process singletons: sseClients Set, bdCache Map, notifHistory ring, _reportRepublishDedupeSet
  util.mjs            csvCell, readFileSafe, eventSurface, originAllowed
  projects.mjs        readProjectsRegistry, writeProjectsRegistry, normalizeArchetype, extractArchetype,
                      readProjectMd, getChangeTier, autoRegisterProject, discoverProjects, listProjects,
                      resolveProjectCwd, resolveProjectInfo, ARCHETYPE_ALIASES
  sse.mjs             broadcast, broadcastTasks (consumes state.sseClients)
  notifications.mjs   loadNotifHistory, saveNotifHistory, addNotification, MAX_NOTIF_HISTORY
  data-readers.mjs    getMemory, getPipeline (stages const lives HERE now), getCostHistory, getInbox
  beads.mjs           BD_BIN resolution, bdEnv, bd, bdErr, checkBeadsAvailable, bdWriteSerialised, bdList,
                      parseTasksMd, getTasks, mapStatus, detectAgent, bdCacheInvalidate
  metrics.mjs         getMetrics, getCanonicalAgents
  alerts.mjs          readAlertsFired, writeAlertsFired, fireEmailAlert, firePushAlert, startAlertCron
  verdicts.mjs        readVerdicts, readPlanCosts, readQAStats, readSecStats
  fleet.mjs           deriveDomain, clusterFailureModes, isRetired, isSuccess, isFailure,
                      getAgentsFleet, getAgentProfile, retireAgent, restoreAgent,
                      decisionsLogPath, appendDecisionLog, readDecisionsLog
  share.mjs           getResume, shareStatePath, getShareState, saveShareState, publishReport,
                      toggleShare, generateShareHTML
  watchers.mjs        watchBeads, watchVerdicts (both call sse.broadcast + notifications.addNotification)
  routes.mjs          named exports per route family (or one dispatch(req,res,pathname) that returns bool);
                      the route body code moves here; server.mjs only owns the outer request handler and static serving
```

Total ~15 modules. Entry `server.mjs` shrinks to ~150 lines: imports, arg parsing, `http.createServer`, route dispatch, static fallback, `server.listen`, watcher startup.

## Import graph (acyclic)

```
config  ← (leaf, no deps)
util    ← config
state   ← (leaf; module-level Sets/Maps only)
projects       ← config, util
sse            ← state
notifications  ← config, state, util (eventSurface)
data-readers   ← config, util, projects
beads          ← config, state (bdCache), util
metrics        ← config, util, beads
verdicts       ← config, util, projects
fleet          ← config, util, projects, verdicts
alerts         ← config, state, projects, notifications, verdicts, push-adapter (existing)
share          ← config, util, projects, metrics
watchers       ← config, state, sse, notifications, beads
routes         ← every reader/writer above + sse + notifications + beads (write ops)
server.mjs     ← config, routes, watchers, alerts (startAlertCron), sse (for /api/sse handler if left inline)
```

Rule: only `state.mjs` holds mutable singletons. Every module that needs `sseClients`, `bdCache`, or notification history imports from `state.mjs` — no top-level shared state in any other file.

## What stays in `server.mjs`

- `BUILD_VERSION` computation (calls `execSync` at startup — keep alongside entry so shape of process is obvious).
- Arg parsing (`--port`, `--no-open`), `HOST` resolution moves to `config.mjs`.
- `http.createServer` callback: read body → check `originAllowed` → call `routes.dispatch(req, res, url)` → if no route matched, fall through to static file serve → else 404 JSON.
- `server.listen`, "listening on" log, optional `open` behavior.
- Startup hooks: `watchBeads()`, `watchVerdicts()`, `startAlertCron()`.

The SSE endpoint (`/api/sse`) may stay inline in `server.mjs` (it holds the response object in `state.sseClients`) or move into `routes.mjs`; either works. Recommendation: move it — keeps `server.mjs` uniform.

## Extraction order (each step must keep `node --check packages/board/server.mjs` green and `node --test packages/board/*.test.mjs` passing)

1. **config.mjs** — pure constants, no logic. Import into `server.mjs`, delete originals. Smallest possible first change to prove the module resolution works.
2. **util.mjs** — `csvCell`, `readFileSafe`, `eventSurface`, `originAllowed`. Leaf.
3. **state.mjs** — move `sseClients`, `bdCache`, `_reportRepublishDedupeSet`, `notifHistory` array (module-level `let`). Everything that touches them still lives in `server.mjs` at this point; they just import the singleton.
4. **projects.mjs** — largest self-contained cluster; touches only fs + config + util.
5. **sse.mjs** — `broadcast`, `broadcastTasks`. Depends on state.
6. **notifications.mjs** — history load/save/add.
7. **data-readers.mjs** — memory, pipeline (⚠ move `const stages = […]` — update the grep test in the same commit), cost, inbox.
8. **beads.mjs** — the bd cache + bd() + parseTasksMd + getTasks cluster.
9. **metrics.mjs**.
10. **verdicts.mjs**.
11. **fleet.mjs**.
12. **alerts.mjs** (imports `push-adapter.mjs`, notifications, verdicts).
13. **share.mjs**.
14. **watchers.mjs**.
15. **routes.mjs** — last and largest. Extract in two sub-steps: (a) read-only GET routes, (b) POST/DELETE mutating routes. After each sub-step, run smoke test (`curl :3141/api/version`).

Commit per step. Each commit is `refactor: extract <module> from board/server.mjs`.

## Required test edits

- `tests/product-owner-wiring.test.mjs` (lines 23-25) greps `packages/board/server.mjs` for `const stages = [`. When `getPipeline` moves to `lib/data-readers.mjs` in **step 7**, change the grep target to `packages/board/lib/data-readers.mjs` in the same commit.
- No other test edits expected. `packages/board/push-adapter.test.mjs` is untouched (that module doesn't move).
- After the extraction, add one new smoke test optional: `packages/board/lib.smoke.test.mjs` importing every `lib/*.mjs` to catch missing exports at CI time (deferred — not required by this refactor).

## Verification per step

```
node --check packages/board/server.mjs
node --test packages/board/*.test.mjs
BOARD_PORT=3199 node packages/board/server.mjs --no-open &  PID=$!
sleep 1 && curl -sf http://127.0.0.1:3199/api/version && kill $PID
```

## Risks

- Circular imports if `routes.mjs` imports from a module that imports `state.mjs` differently — mitigated by keeping `state.mjs` a strict leaf.
- Hidden closure capture (e.g., a helper defined inside a route handler that reaches for an outer const): audit each route body during step 15 before moving.
- `BD_BIN` resolution runs at module load — if `beads.mjs` is imported by test runner in an env with no `bd` binary, `BD_BIN` becomes null (already handled). No new failure mode.

## Requirements Checklist

- [ ] REQ-1: `server.mjs` still starts on `--port N --no-open` with same log line.
- [ ] REQ-2: All existing HTTP routes return identical responses (compare with pre-refactor `curl -s` captures on 5 representative endpoints).
- [ ] REQ-3: `node --test packages/board/*.test.mjs` passes at every commit.
- [ ] REQ-4: `product-owner-wiring.test.mjs` updated in the same commit that moves `getPipeline`.
- [ ] REQ-5: Zero new runtime deps (grep `packages/board/lib/` for non-`node:` imports besides `../push-adapter.mjs` and `../../../scripts/lib/gate-plan.mjs`).
- [ ] REQ-6: `packages/board/mcp-server.mjs` still runs unchanged.
