# ADR-049: The board may start work

**Date:** 2026-11-10
**Status:** Accepted (2026-11-11, owner)
**Related:** [ADR-009 gates follow reversibility](ADR-009-gates-follow-reversibility.md) · [ADR-047 one task, one worktree](ADR-047-worktree-per-task.md) · ADR-048 managed plugin activation (not on the main branch yet) · [RFC: cockpit for non-developers](../rfc/RFC-cockpit-for-non-developers.md) · [phase 1 plan](../rfc/PLAN-phase1-cockpit.md)

Acceptance covers the rules below. It does not approve any screen: the Start form and every
visible change follow the approved Claude Design mockups named in the plan.

## Context

- The board cannot launch a coding agent. `packages/board/lib/routes.mjs:740` records that
  board-triggered launch was removed (commit `d3a001c8`).
- Work starts in two places today: `great-cto run`, which opens an interactive `claude` with
  the terminal attached (`packages/cli/src/run.ts:171`), and the task worker, which runs
  `claude -p … --permission-mode acceptEdits` in an isolated git worktree
  (`packages/cli/src/worker.ts:151`).
- A non-developer has no terminal. A cockpit that cannot start work is a status display.
- Starting an agent costs the user money and changes their repository. Under ADR-009 that is
  expensive to undo and needs a human decision at the point of action.

## Decision

The board gets one way to start work, `POST /api/work/start`, with these rules:

1. **Explicit confirmation.** The request comes from a person pressing Start on a form that
   shows the goal, the project folder and the budget. Origin-checked like every other
   state-changing route. No start from a URL, a notification, or another agent.
2. **A budget is required.** No budget, no start. The run stops and asks at the budget; it
   does not warn and continue.
3. **Isolation.** The agent cannot write: controlled Claude stages run read-only (safe
   mode, restricted, inspection tools only) and return file proposals; the controller
   validates and writes them. Whether a controlled run also gets its own git worktree
   (ADR-047) was not checked and is decided in the plan's first slice.
4. **One task per project at a time** in the first version. A second Start is refused with
   the reason, not queued silently.
5. **The user's own agent.** The board runs the Claude Code or Codex the user installed and
   signed in to. It does not hold or request credentials. If the host is missing or signed
   out, Start is disabled and the readiness check says why.
6. **Stop is always available** and ends the process group; the task is marked stopped by
   the user, not failed.
7. **Every start, stop and refusal is an event** in the project's agent event log, with who
   confirmed and the budget.
8. **Gates are unchanged.** Start does not approve anything. Product, design and ship
   decisions keep their current protocol and tokens.
9. **Two stops by default for projects created from the cockpit** (owner's decision,
   2026-11-10): what gets built, and whether it ships — `approval-level: product-only`.
   Existing projects keep the level in their `PROJECT.md`. Regulated archetypes keep their
   security, compliance and ship gates at every level.

10. **Sign-in is probed, not assumed.** Start is enabled only after a real, free probe of the
    host CLI succeeded in this session. An installed binary or a signed-in desktop app is not
    evidence (headless check of 2026-11-10: the CLI's session was expired while the desktop
    app worked).
11. **A start that fails before the first model call is a failed start.** It is recorded
    with its reason, shown as failed, and leaves no task in a waiting state. Success is read
    from the exit code and `is_error`, not from `subtype`.

## Decided by the headless check (2026-11-10)

`claude -p '/start …'` is not the start route. In the check a pipeline-sized task under
`approval-level: product-only` was built in one headless run: the product decision was
written into the brief as "auto-recorded as proposed; no human was available", no gate task
was created and no specialist agent ran (details in the [RFC](../rfc/RFC-cockpit-for-non-developers.md), "Step 2").

12. **The controller owns the stops.** Start runs a controller that executes one stage per
    headless call and exits at each decision. The next stage is started only by the gate
    approval route. A stage call has no way to continue into the next stage, so the stop does
    not depend on the model deciding to stop.
13. **A decision is a record the board can read** before the stage that needs it may run:
    a gate task with its one-time token, not a sentence in a document.
14. **A stage that reports "no human was available" or approves on the user's behalf is a
    failed stage.**

15. **The verifier may be a fresh session of the same host** (owner's decision, 2026-11-11).
    On a machine with only Claude Code the verifier is a new Claude session with no shared
    context. It is not a second model family and must not be presented as one: the decision
    screen's "Checked by" line names the host that verified. A second host stays available
    through routes for users who have one.

## Open at acceptance

- Answered on 2026-11-11: the existing controller already routes roles to Claude Code and
  owns the gates. Gaps (verifier is always Codex, controlled tasks must have host `codex`,
  no per-call model or money cap, the board does not call the controller) and the slices
  that close them are in [PLAN-phase1-cockpit.md](../rfc/PLAN-phase1-cockpit.md).
- Whether the session-end learner hook runs for cockpit starts; if it does, its cost belongs
  in the task's budget.
- Wording and layout of the Start form: Claude Design mockup, approval first.

## Consequences

Each line restates a rule from the Decision above; none adds one.

- The board gains its first route that starts paid work. It is origin-checked and needs a
  person's confirmation and a budget (rules 1, 2), so a page, a notification or another agent
  cannot start a run.
- A run costs at most its budget: it stops and asks at the budget instead of continuing
  (rule 2).
- A project runs one task at a time in the first version; a second Start is refused with a
  reason (rule 4).
- The board holds no credentials. Start depends on the user's own Claude Code or Codex being
  installed and signed in, proven by a probe in the session (rules 5, 10).
- Gates keep their protocol. Projects created from the cockpit default to two stops,
  `approval-level: product-only`; regulated archetypes keep every gate (rules 8, 9).
- Stops are owned by the controller, not by the model, so a stage cannot continue past a
  decision (rules 12–14).
- On a Claude-only machine the verifier is a fresh Claude session, and the decision screen
  says so (rule 15).
- Turning the route off restores the copy-command card with no data migration (Rollback).

## Alternatives

- Keep "prepare launch command" (copy a command into a terminal): rejected for this audience.
- Open the Claude desktop app with a prefilled prompt: no supported way known; two windows.

## Verification

- Unit: each refusal (no budget, second task, host missing, wrong origin).
- E2E: Start with a fake agent command (`GREAT_CTO_AGENT_CMD` already exists for the worker),
  observe the task move, Stop it, check the event log.
- One paid run on a fixture project before release, recorded with its cost.

## Rollback

A setting turns the route off and the Start form back into the copy-command card. No data
migration.
