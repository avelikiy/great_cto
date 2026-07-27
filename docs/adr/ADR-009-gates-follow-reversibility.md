# ADR-009: Gates follow reversibility, not pipeline position

**Status:** Accepted (v2.87.2)
**Date:** 2026-07-23

## Context

great_cto places human gates by **position in the pipeline**: `gate:arch` after
architecture, `gate:plan` after decomposition, `gate:ship` before deploy. That
covers the main path well — 66 references to `gate:ship`, 31 to `gate:arch`
across the agent set.

But position and cost-of-undo are different axes, and the model only sees the
first one. An operation that is expensive to reverse gets a gate **only if it
happens to sit at a stage boundary**. When it does not, nothing asks.

This is not theoretical. `/crystallize approve` activates a global pattern that
is injected into every future agent run, across every project — one of the most
expensive things in the system to undo — and it had **no gate at all**, because
it is not a pipeline stage. It was fixed today (`08552d99`) by adding an
evidence requirement, but the fix was reactive: nothing in the model would have
predicted the gap.

An audit of the irreversible operations in the repo found the rest already
covered, which is worth recording so the remaining risk is not overstated:

| Operation | Guard today |
|---|---|
| Real infrastructure provisioning | `infra-provisioner` is plan-first: prints the plan with cost and **stops for CTO approval** before creating anything, idempotent, records teardown |
| `npm publish` | `cd-local.sh --publish` refuses on a failed CI gate, a dirty tree, or a version mismatch |
| Production deploy | behind `gate:ship`; `devops` refuses prod/real-domain by design |
| Global pattern activation | now gated on eval evidence (`08552d99`); a measured regression cannot be activated at all |

So the finding is narrow: the *coverage* is good, the *rule that produces it* is
implicit. Each of those guards was added because someone noticed that specific
operation was dangerous — not because a rule required asking.

## Decision

State the criterion explicitly, alongside the positional gates rather than
replacing them:

> **An operation needs a human gate when undoing it is expensive — regardless of
> where it sits in the pipeline.** Position is a heuristic for *when* to ask;
> reversibility is the reason *why*.

Expensive-to-undo means at least one of:

1. **Escapes the machine** — published to a registry, pushed to a shared remote,
   deployed where users can reach it.
2. **Crosses a project boundary** — writes to global state that other projects'
   agents read (the crystallize case).
3. **Costs money to create or destroy** — provisioned infrastructure, paid API
   capacity.
4. **Destroys evidence** — force-push, history rewrite, log truncation, deleting
   the artifacts a reviewer would need.

The rule applies at design time: when adding an agent capability or a script that
does any of the above, the gate question is asked *then*, not after an incident.

## Consequences

- **The criterion is written where decomposition happens** (`CLAUDE.md`), so it
  is applied while work is being planned rather than recalled afterwards.
- **Existing gates are unchanged.** No gate is added or moved by this ADR — the
  audit found current coverage adequate. This records the rule that should have
  produced that coverage, so the next irreversible capability is caught by
  design instead of by incident.
- **A gate is not the only valid answer.** A refusal (`devops` will not touch
  prod domains), a plan-and-stop (`infra-provisioner`), or an evidence
  requirement (`crystallize`) all satisfy the criterion. What is not acceptable
  is silence.
- **Known limitation:** this is a rule for humans and agent prompts, not a
  mechanical check. Nothing scans for ungated irreversible operations, and
  writing such a scanner would mean enumerating "irreversible" in code — worth
  revisiting only if a second gap is found this way.
