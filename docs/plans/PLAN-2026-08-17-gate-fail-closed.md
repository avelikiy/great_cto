# PLAN — A gate that stands down must still leave a record

Source: `deepseek-ai/deepseek-harness` (143k★, MIT, and a one-shot dump of an
internal repo — four days without a commit, issues and PRs disabled). Its
approval model is not a competitor to ours: it grants permission for a single
tool call and has no pipeline, no roles, no tiering. But one property of it is
better than ours, and it lands on the feature I enabled two days ago.

## Their invariant

Their gate is fail-closed **by construction**:

- `allowed-once` is the only grant.
- A responder that is absent, crashed, or belongs to someone else yields
  `unavailable`, which **is** a refusal.
- Policy `never` applies *before* dispatch — a responder registered later cannot
  widen it.
- **A decision that could not be logged is refused.** The `approval/asked` +
  `approval/decided` pair is atomic with the outcome.

That last line is the one worth taking.

## Where we differ, and why it matters now

Our gate is positional and, on silence, **open**. That was tolerable while every
gate waited for a human — silence meant nobody had answered yet, and the
pipeline simply stopped.

Two days ago I changed that. `gate-tiering: evidence` drops a gate to
notify-only for fifteen agents on this project, and `pipelinePosition` returns
`ready-to-dispatch` with the gate named in `notified`. The pipeline proceeds.

**Nothing guarantees the notification was recorded.** The board's inbox is read
from beads and verdicts; if that write fails, the stage still proceeds and the
entry never appears. A gate that stood down and a gate that stood down *and told
nobody* are indistinguishable — which is precisely the defect the tiering
feature was built to avoid reintroducing, and I did not check it when I shipped
the feature.

## Requirements

- **GATE-R1** — a gate that stands down to notify-only must record that fact
  durably before the pipeline is told it may proceed. The record names the gate,
  the agent, the evidence that tiered it, and the time.
- **GATE-R2** — if that record cannot be written, the gate does **not** stand
  down. It reverts to waiting, and says why. Fail-closed: an unrecordable
  stand-down is a stand-down nobody can audit.
- **GATE-R3** — `pipelinePosition` reports which of the two happened. `notified`
  today lists gates that stood down; it must distinguish *recorded* from
  *could not record, so still waiting*. Three states, as everywhere else here.

## Scope

`scripts/lib/gate-tier.mjs` and the notify-only branch of
`scripts/lib/pipeline-position.mjs`. The record goes beside the verdicts, in the
project's own `.great_cto/`, in the same append-only shape they use — a
notification is an event, not state to be overwritten.

## Not doing

- Not adopting their approval model. `allowed-once` per tool call is a different
  question from "which stage may proceed", and we already have both a gate and
  ADR-009's Class A list.
- Not touching Class A. It never stands down at any score; there is nothing here
  to record for it.
- No new UI. The board reads the inbox it already reads; this makes sure there
  is something in it.

## Status

**Implemented.** `scripts/lib/stand-down.mjs` holds the record;
`pipelinePosition` takes an injected `recordStandDown` and returns a three-state
`standDown` field; `session-pipeline-resume.mjs` — the only production caller
that tiers — supplies the recorder and the tier that stood the gate down.

Two things the implementation found that the plan did not anticipate:

- **The record must name the tier, not merely that a gate stood down.** `notify`
  and `notify-thin` shipped the same day as this fix, and the difference between
  plural evidence and one eval is exactly the thing worth auditing later.
- **`pipelinePosition` is forbidden to write** (ARCH-pipeline-position S2, with a
  test asserting no fs-write), so the recorder is injected rather than called.
  That turned out to be the better shape anyway: the default is *no recorder*,
  and no recorder means no stand-down. The feature's own shipped state is now a
  refusal.
