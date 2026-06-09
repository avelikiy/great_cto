# PLAN — Dev board as a launch control (approve gate → spawn agent)

Status: in progress · Created 2026-06-09 · Target: `packages/board/server.mjs` + `public/index.html`

Today the dev board is a **mirror**: approving a gate just flips the Beads task to `closed` + logs the
decision. This makes it a **pult**: approving a gate (or a standalone button) spawns a Claude Code
agent headlessly in the project, streams its output live into the board, and lets you stop it.

## Mechanism (verified against `claude` v2.1.x)
`claude -p "<prompt>" --output-format stream-json --verbose --permission-mode <mode> [--model M] [--dangerously-skip-permissions]`
- `-p/--print` = headless; `--output-format stream-json --verbose` = line-delimited JSON events we parse
  and stream to the board; argv array (no shell) → no injection.

## Endpoints (server.mjs)
- `POST /api/agent/run` `{ project, prompt, model? }` — spawn one agent in the resolved project cwd.
- `POST /api/agent/stop` `{ project }` — kill the active run.
- `GET  /api/agent/status?project=` — `{ running, startedAt, exit, lines[] }` (late subscribers catch up).
- SSE: reuse the stream; emit `event: agent` `{ project, kind: 'text'|'tool'|'system'|'done'|'error', text }`.
- `POST /api/gates/:id` (approve) gains optional `{ runAgent:true, agentPrompt }` — after the gate
  closes, kick the same `startAgentRun(cwd, prompt)`.

## Guardrails (NON-NEGOTIABLE — this runs an autonomous agent that edits files + runs commands)
1. **Origin/Referer gate** — same as `/api/projects/register`: only `http://localhost:PORT` /
   `127.0.0.1:PORT`. A malicious page must not be able to spawn an agent.
2. **cwd inside HOME** — resolve the project; refuse paths outside `$HOME` (no `/tmp`, `/etc`).
3. **One run per project** — reject a second concurrent run (409) with the active run's id.
4. **Hard timeout** — default 30 min (`GREAT_CTO_AGENT_TIMEOUT`), then SIGTERM→SIGKILL.
5. **Permission posture** — default `--permission-mode acceptEdits` (edits flow; non-edit tools just
   don't run in headless). Full autonomy is **opt-in**: `GREAT_CTO_AGENT_DANGEROUS=1` adds
   `--dangerously-skip-permissions`. Never dangerous by default.
6. **Configurable bin** — `GREAT_CTO_AGENT_BIN` (default `claude`) so it's testable with a stub and a
   user can point at a wrapper.
7. **Ring-buffer the output** (cap ~2000 lines) so a runaway agent can't OOM the board.

## Frontend (index.html)
- A collapsible **Agent runner** panel: prompt box · Run · Stop · live streamed log (auto-scroll) ·
  status (running/exited code). Subscribes to `event: agent`.
- Gate **Approve**: a small "▶ also run an agent" affordance with a prompt (prefilled with a sensible
  continuation, e.g. `/execute-plan` or "continue the pipeline").
- A header **▶ Agent** button opens the panel (usable independent of gates).

## Acceptance
- Approving a gate with `runAgent` spawns exactly one agent in the project; output streams live; a
  second concurrent run is refused; Stop kills it; timeout kills it.
- Cross-origin POST is rejected; a path outside HOME is rejected.
- Default posture is `acceptEdits` (not dangerous); the dangerous flag is opt-in via env.
- Tested with a stub bin (no token spend) for streaming + all guardrails.
