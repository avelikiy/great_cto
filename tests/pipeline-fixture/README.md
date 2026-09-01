# The pipeline, run against a written-down answer

```bash
node tests/pipeline-fixture/run.mjs
```

No API key. No network. No money. About a second.

## What this is for

Until now, finding out what the pipeline would **do** — advance a stage, hold at a
gate, refuse to dispatch work nothing has checked — meant running it on a real
project, with real agents, at a real cost per look. The part of this product that
decides whether an irreversible operation gets a human in front of it was
therefore exercised by hand, occasionally, and never in CI.

Each scenario is a state the pipeline can be in, and a key saying what it should
decide. `run.mjs` calls the real `decideNext` and diffs. Change the dispatcher,
re-run, see what moved.

Borrowed from [anthropics/oncall-kit](https://github.com/anthropics/oncall-kit),
whose fixture is a fictional team's 48-incident history with an answer key and a
graded validation — *"change a skill, re-run it, diff against the key."* It is the
same shape this repository already used for archetype detection (an
`expected.json` beside each of 28 fixtures), moved up one level: from *what is
this project* to *what would the pipeline decide next*.

## The scenarios

| | Asserts |
|---|---|
| `01-clean-advance` | an approved stage with no gate dispatches the next one |
| `02-gate-holds` | an active, open gate waits for a human and refuses to self-approve |
| `03-gate-declared-but-not-active` | a gate the approval level does not activate is passed — and **said**, not skipped silently |
| `04-unchecked-stage-does-not-dispatch` | a verdict with no score for this run asks for the check first |
| `05-unverifiable-unblocks` | `unverifiable` is a recorded answer that proceeds; the look is what is required, not a pass |
| `06-no-cwd-names-the-real-reason` | when the check could not run, the directive names *that*, not a setting nobody changed |
| `07-end-of-chain` | a stage with no onward edge reports, rather than returning silence |

## Writing one

A directory under `scenarios/` holding `scenario.json`:

```json
{
  "what": "one sentence — what a reader should conclude if this passes",
  "why":  "why it is worth a scenario at all",
  "givenProject": { "verdicts": ["architect"], "score": null },
  "given":  { "agent": "...", "verdict": {...}, "transitions": {...},
              "activeGates": [], "gateStates": {} },
  "expect": { "kind": "next",
              "textIncludes": ["..."],
              "textExcludes": ["..."] }
}
```

`givenProject` is optional and builds a throwaway project on disk — the verify
gate looks for a score, and with no directory it cannot look. Omit it and the
scenario runs with `cwd: null`.

Only the fields a key names are compared. That is deliberate: a full snapshot of
the return value breaks on every unrelated change, gets regenerated without being
read, and turns the key back into a mirror of the code. A key should be a
statement about **one property**, in a sentence you could argue with.

`textExcludes` is the half a key usually forgets — a directive that grows a
second, wrong explanation still contains the right one.

## Does the key catch anything?

That is not rhetorical, and a green run does not answer it. Three mutations of
`scripts/hooks/pipeline-dispatcher.mjs`, each a regression someone could plausibly
ship:

| Mutation | Scenarios that caught it |
|---|---|
| the "check could not run" note reverts to naming a setting | `06` |
| `activeOf` returns `[]` — gates stop holding | `02` |
| `requireVerify` hardcoded `false` | `04`, `06` |

## What it found

Scenario `06` exists because writing this fixture found the bug. Both ways of
arriving at "no score" rendered the same sentence — *the check is disabled
(`GREAT_CTO_REQUIRE_VERIFY=0`)* — and for one of them that is false: the variable
is unset, the real cause is that no project directory was resolved, and an
operator reading it goes hunting an environment variable that does not exist.

Two states rendered as one, and one of them naming the wrong cause. It was found
in the first hour of the fixture existing, in a code path with passing unit tests.

## What it does not cover

The agents. Every scenario here drives the deterministic spine — the dispatcher,
the gate policy, the verify gate. Whether `architect` writes a good architecture
document is a question for `tests/eval/`, it costs money, and nothing in this
directory pretends to answer it.
