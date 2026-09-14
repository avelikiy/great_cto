# ADR-024 — An approval from the board is bound to one request and one state

**Status:** Proposed
**Date:** 2026-09-14
**Deciders:** great_cto core
**Supersedes:** —
**Superseded by:** —
**Related:** [ADR-009 — gates follow reversibility](ADR-009-gates-follow-reversibility.md) ·
[ADR-021 — a live stream of agent events](ADR-021-live-agent-events.md) (which set these conditions) ·
[ADR-023 — per-turn diffs](ADR-023-per-turn-diffs.md) ·
[The board plan](../plans/PLAN-2026-09-14-board-live-and-safe.md) (item 5)

## Context

ADR-021 left approvals from the board to their own decision, with three conditions:
an origin check on every request, a one-time token per pending request, and a
timeout that denies rather than approves. The plan put this last, after the board
stopped trusting any Host (great_cto-xq9h) and could resume its stream without
losing events (great_cto-c0hb). Both shipped on 2026-09-14.

### Measured before deciding

**The board already approves pipeline gates.** `POST /api/gates/:id` in
`packages/board/lib/routes.mjs` takes `{action: approve|reject, reason}` and:

1. closes (or blocks) the gate in beads, or rewrites its row in `tasks.md`;
2. appends the decision log;
3. records a pipeline wake, so the next session resumes the pipeline — still
   subject to every refusal the dispatcher applies, including never running devops
   or infra-provisioner unattended;
4. pushes a task update to every open board;
5. **if sharing is enabled, republishes the share report to `greatcto.systems`.**

What guards it: the Host allowlist and the Origin check. What it lacks:

| Condition | Board gate approval today | Controlled Codex host `approve()` |
|---|---|---|
| One-time token per pending request | no — any same-origin POST naming the id | yes — random, per pending gate |
| Bound to the state that was reviewed | no | yes — refused if an artifact or the tree receipt changed since the gate was raised |
| Expires | no | no |
| Single use | effectively (the gate closes) | yes |

So the gap is not a future feature: an approval that can close a gate, wake a
pipeline and publish a report off the machine is guarded by headers alone.

Two more things the code shows:

- **The typed-name ritual lives only in the page.** For an `expensive` or
  `unclassified` gate (ADR-009), `gateAction` in `index.html` makes the operator
  type the gate name before posting. The server does not check it: a POST without
  it is accepted. It protects against a misclick, not against a request that did
  not come from that dialog.
- **Approving cannot launch an agent any more.** The page still carries a
  `runAgent` branch that posts `{runAgent, agentPrompt}` and says it will "run an
  agent in the project", but no control calls it, and the server ignores both
  fields: agent launch was removed from the build board in d3a001c8. The branch
  is dead code describing an action that does not happen.

**Live tool permissions do not exist yet.** No `PermissionRequest` hook is
registered. From the Claude Code hooks reference (fetched 2026-09-14 through a
summariser, so only the points both readings agreed on are stated here): the
event fires after `PreToolUse` and before the tool runs; its input carries
`tool_name`, `tool_input`, `tool_use_id` and `permission_mode`; exit code 2 is not
honoured for it — a denial is a JSON decision; and when the hook returns no
decision, the permission flow proceeds unchanged, i.e. the terminal prompt still
appears. **The exact decision fields, the default timeout, and whether an async
hook can decide were not established** and must be verified against a live hook
before any code relies on them.

## Decision

### 1. Gate approvals the board already makes

1. **A one-time token per pending gate.** Each pending gate that `/api/inbox`
   returns carries a token minted for that gate — random, stored beside the
   project's state, never derived from the id. `POST /api/gates/:id` without the
   matching token is refused with 403. A token is consumed by its first use,
   approve or reject.
2. **The ritual is enforced where it can be.** For an `expensive` or
   `unclassified` gate the server requires the typed gate name in the request and
   refuses without it; the page keeps asking for it, and now the server agrees.
   The dead `runAgent` branch is removed in the same change.
3. **Bound to what was reviewed.** The token records the receipt hash
   (`receiptHash` in `scripts/lib/receipt.mjs`) of **the project tree outside
   `.great_cto/`, as it was when the board first showed the gate**. An approval is
   refused if that tree now differs, with the changed paths — the same rule
   `approve()` in the controlled Codex host already enforces. A rejection is always
   accepted: refusing to stop is never the safe side.

   Two corrections found while writing the tests, before any code. The board does
   not observe the moment a gate is raised, so "when it was first shown" is the
   binding it can actually make. And `.great_cto/` is excluded because an approval
   writes the pipeline's own files there — the gate row, the decision log, the wake
   record, the token store. `init` does not gitignore that directory, so a binding
   over the whole tree would let the first approval invalidate every other open
   gate's token though no reviewed code moved.
4. **It expires.** A token older than 24 hours is refused; the board fetches a
   fresh one, which re-reads the state. An approval given on yesterday's view of
   the tree is not an approval of today's.
5. **Nothing expensive happens on an unbound approval.** The wake and the share
   republish run only after a token-bound approval succeeds. The republish is the
   escapes-the-machine step ADR-009 names; it is not made unconditional here.
6. **Every approval and refusal is an agent event** (`kind: pipeline`, the gate id
   as `agent`, `outcome` `approved` / `rejected` / `refused-stale` /
   `refused-token`), so the feed shows who moved the pipeline and when.

### 2. Live tool permissions from the board — opt-in, fail closed

1. **Off unless a project turns it on** (`board_permissions: true` in
   `.great_cto/PROJECT.md`). With it off, nothing changes: Claude Code shows its own
   prompt.
2. **A `PermissionRequest` hook writes a pending request** to
   `.great_cto/permissions/<token>.json`: a random token, `tool_name`,
   `tool_use_id`, the session, and a creation time. The tool's input is shown on
   the board only as the events log would record it — tool name and paths, never
   command text — with a link to open the full request in the terminal session.
3. **The board decides by token.** A human's allow or deny is written to that
   request, once, over the same token-checked endpoint shape as section 1.
4. **The hook waits, then denies.** It polls for the decision up to a timeout
   (default 120 s, per project), and on timeout returns a denial with a message
   saying the board did not answer — never an allow, and never silence, because
   silence would hand the decision back to a terminal nobody is watching while the
   agent waits.
5. **Local only.** Requests and decisions are files in the project; nothing is sent
   anywhere; requests are deleted once decided or expired.

## Not decided here

- **Who** approved, beyond "someone with access to this board": the board has no
  user identity. A multi-user board needs authentication first.
- **Remote approval** (from a phone, through a tunnel): the Host allowlist admits a
  listed tunnel name; approving through it is a separate decision about who can
  reach that name.

## Alternatives considered

- **Keep header checks only for gates.** Rejected: the measured gap above.
- **Hand the decision back on timeout** (return no decision, so the terminal
  prompt appears). Friendlier when someone is at the terminal; rejected as the
  default because the case this exists for is nobody being there.
- **Push permission requests to the board over HTTP from the hook.** Couples the
  hook to a server that is often not running — the same reason ADR-021 has hooks
  append to a file.

## Consequences

- An open board tab can no longer approve a gate by naming its id; it needs the
  token it was given for that gate, for that state.
- An approval made against a stale view is refused with what changed, instead of
  landing.
- Projects that turn on board permissions get agents that stop and wait at the
  board — and a denial after the timeout if nobody answers.

## Verification before calling it done

- A gate POST without a token, with another gate's token, with a used token, and
  with an expired token is refused; with the right token it succeeds once.
- An approval after the tree changed is refused and names the paths; a rejection
  in the same state is accepted.
- No wake and no share republish follow a refused approval.
- **Before section 2 has code:** a live `PermissionRequest` hook in a scratch
  project establishes the decision output fields, the default timeout, and whether
  an async hook can decide — and the design above is corrected to match.
- The hook denies after its timeout, with the message, in a test.
