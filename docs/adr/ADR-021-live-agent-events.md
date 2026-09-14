# ADR-021 — A live stream of agent events on the board

**Status:** Accepted (phase 1 implemented 2026-09-14)
**Date:** 2026-09-14
**Deciders:** great_cto core
**Supersedes:** —
**Superseded by:** —
**Related:** [ADR-009 — gates follow reversibility](ADR-009-gates-follow-reversibility.md) (why approvals are
not in this decision) · [The flow plan](../plans/PLAN-2026-09-14-flow-and-routing.md) (the journal
outcomes this makes visible)

## Context

The board reports outcomes: verdicts, gates, cost, tasks. What an agent is doing
while it runs is visible only afterwards, by reading its session transcript
(`packages/board/lib/transcripts.mjs`), and only if someone goes looking.

That cost something concrete on 2026-09-14. A live pipeline run stalled after its
first stage, and nothing on the board said so: the dispatcher had looked up the
agent under the wrong name and journalled `no-rule`. It was found by reading a
JSONL journal by hand. Three projects' journals held 19 such silent stops since
2026-09-06.

`pingdotgg/t3code` (MIT) is a control surface for coding agents built around the
opposite model: every agent event is recorded as it happens and streamed to the UI,
and per-turn diffs and in-thread approvals are built on that stream. Its ideas are
taken here, not its code, and not its stack — it is Electron, Effect-TS and SQLite,
and the board is a zero-dependency Node server.

### What exists today

| Piece | State |
|---|---|
| Push channel to the browser | `packages/board/lib/sse.mjs`: a 20-line `broadcast(event, data)`, used for task updates |
| Hooks the plugin registers | SessionStart, UserPromptSubmit, SubagentStart, SubagentStop, PreToolUse (2), PostToolUse (3), PermissionDenied, PreCompact, Stop, SessionEnd — in `.claude-plugin/plugin.json` |
| A hook that reports to the board | none |
| Live view of a running agent | none; transcripts are read after the fact |

So the two ends exist and nothing connects them.

## Decision

Phase 1 only: **record agent events as they happen, and stream them to the board.**
Per-turn diffs and approvals are later decisions (see *Not decided here*).

1. **The hooks append; they do not call the board.** A small emitter in the
   existing SubagentStart, SubagentStop, PostToolUse, PermissionDenied and Stop
   hooks appends one line per event to the project's `.great_cto/events.jsonl`.
   A hook must stay fast and must work when the board is not running, so there is
   no HTTP call from a hook.

2. **Each event carries facts, not content.** `ts`, `session`, `agent`, `kind`
   (`agent-start`, `agent-stop`, `tool`, `denied`, `stop`), tool name, the paths
   a tool touched, `ok`/`error`, and duration. Never command text, file contents,
   prompts or tool output — those can hold secrets, and the transcript already
   has them for anyone who needs them.

3. **The board tails the file and broadcasts** each new line through the existing
   SSE channel as `event: agent`, and renders a per-agent activity strip. It reads
   the file it already has access to; nothing new listens on the network.

4. **Three states on the board, not two.** Events arriving → live. The file
   present but unreadable → `not measured`, with the reason. No file → `no events
   recorded`, which is not the same as an idle agent. The dispatcher's
   `no-rule`, `no-verdict` and `verify-wait` journal outcomes are shown as events
   too, so a pipeline that did not chain is visible when it happens.

5. **Bounded and local.** The file rotates at a size cap. It stays in the project
   directory and never leaves the machine; nothing is sent anywhere, so the
   opt-in telemetry rule in `CLAUDE.md` is untouched. `GREAT_CTO_DISABLE_EVENTS=1`
   turns the emitter off.

## Not decided here

- **Per-turn diffs** (t3code keeps a hidden git ref per turn). Useful, and the
  receipt work in `scripts/lib/receipt.mjs` is most of the mechanism. Its own ADR.
- **Approvals from the board** through a `PermissionRequest` hook. This turns the
  board from a read-only view into a remote control for execution, and needs at
  least: an origin check on every request, a one-time token per pending request,
  and a timeout that denies rather than approves. Its own ADR, after phase 1 has
  shown the event model holds.
- **Hosting agents** the way t3code does through the Agent SDK and Codex's
  app-server. That would make great_cto a host rather than a plugin; out of scope.

## Alternatives considered

- **Read session transcripts live.** The data is there, but the format belongs to
  Claude Code and changes without notice, the files are large, and tailing every
  session to find agent boundaries is the expensive way to get five facts the
  hooks already hold.
- **POST from hooks to the board.** Couples every hook to a server that is often
  not running, adds a network path to a hook, and loses events whenever the board
  is down.
- **SQLite for the event log.** Breaks the board's zero-dependency rule for an
  append-only log a JSONL file serves.

## Consequences

- A stalled or silently stopped pipeline is visible on the board while it happens,
  instead of in a journal read by hand.
- Five hooks gain an append. Budget: under 20 ms at p95 per hook, measured, and a
  failure to append never fails the hook.
- A new local file per project, rotated. It holds paths and tool names — no
  content — and is listed in the privacy notes.

## Verification before calling phase 1 done

- An agent run in a scratch project shows start, tool events and stop on the board
  within two seconds of each happening.
- The emitter's p95 cost per hook is measured, not assumed.
- A test fails if an event record carries any field outside the allowed set.
- With the board stopped, events are still recorded; restarting it replays the tail.
