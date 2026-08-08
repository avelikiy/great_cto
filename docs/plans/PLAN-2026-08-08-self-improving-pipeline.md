# PLAN — Fewer confirmations, and a loop that earns them away

> **Feature slug:** `self-improving-pipeline` · **Status:** awaiting `gate:plan`
> **Evidence base:** the live pipeline run of 2026-08-07 (seven agents) and the
> devops eval campaign of the same day (~$43, holdout 25% → 82%).

## Why these two questions are one question

Asking for less human confirmation and asking for self-improvement look like
separate projects. They are the same project seen from two ends, because every
confirmation in this pipeline belongs to exactly one of three classes:

| Class | Why the human is asked | Removable? |
|---|---|---|
| **A — the decision is theirs** | what to build, what to spend, what reaches users | No. ADR-009. Do not try. |
| **B — the machine cannot see** | gate approval was invisible, so approving was one action and "continue" a second | Yes, and it is pure waste |
| **C — nobody has evidence** | `gate:ship` exists because no one trusts a QA verdict enough to skip looking | Only by producing the evidence |

Class B is engineering. Class C is measurement. **Self-improvement is the
mechanism that converts C into evidence, and evidence is what removes the
confirmation.** That is the spine of this plan: *measure → earn → remove*.

Class A is left alone on purpose, and the plan says where.

---

## Part 1 — Stop losing runs (Class B)

These are not improvements. They are leaks, each observed on 2026-08-07.

### 1.1 Recover from budget exhaustion — the largest single failure

**Four of seven agents ended mid-sentence.** senior-dev at 175k tokens,
security-officer at 153k, a re-verification at 118k, an execution-claims review
at 123k. Each had done the work and had not recorded a verdict, and without a
verdict the dispatcher names no next stage, so the pipeline stopped every time.
A human — me — wrote four verdicts by hand.

The signature is mechanical: a subagent returns, its final text is not a report,
no fresh verdict exists for it, and token usage is near the ceiling. The recovery
path already exists — `SendMessage` resumes that agent with its context, so the
correct action is "finish your contract", not "start again".

- **Where:** SubagentStop, beside the completion check that already fires there.
- **Bound:** resume once. An agent that cannot close its contract on a second
  attempt has a different problem, and a loop that resumes forever is a hang.
- **Polarity:** if the resume fails, report it as an incomplete stage rather than
  advancing. An unfinished stage is not a finished one.

### 1.2 Reconcile work left in a worktree

senior-dev worked in a git worktree. Its verdict went there too, so the main tree
saw an empty log and the pipeline read "no verdict". The work was found because a
`cp` said "files are identical" — that is luck, not a mechanism, and the
worktrees are removed afterwards.

On SubagentStop: if the agent ran in a worktree and that worktree has changes,
either land them or say so loudly. Silence is the current behaviour and it is the
one outcome that loses work.

### 1.3 Wake on approval

Gate approval is now read (`gate-state.mjs`), but only while a turn is running.
Approve a gate two hours later and nothing notices: the turn ended, and the Stop
hook — correctly — does not hold a turn open on a gate, because answering one
requires the turn to end.

An external tick reads `pipeline-position` and dispatches when the position is
`ready-to-dispatch`. **This is the step that makes approval the only human
action**, and it is also the first step where the pipeline moves while nobody is
watching. It needs an explicit decision, not just an implementation.

---

## Part 2 — Remove decisions that are derivable (Class B)

### 2.1 Depth-conditional edges

`shared/pipeline.toml` says `architect → pm` unconditionally. `CLAUDE.md` says
skip pm decomposition below three work streams. On 2026-08-07 the architect
itself wrote "depth Small, one implementation task" — the decision was in its
output, and a human still made it.

An edge gains a condition read from the verdict's own meta (`depth=small`). Where
the map and the prose rule disagree today, the map wins and is wrong.

### 2.2 Findings become beads with a reproduction

`finding-closure.mjs` exists, has rules, and does nothing, because findings live
in markdown reports and its inputs — who fixed, who verified, what reproduces —
are nowhere. Yesterday it had to be fed by hand to say anything.

Reviewers file findings as beads carrying `repro=<command>`. That single contract
change turns the top rung of the evidence ladder from a library into a gate. It
is an agent-contract change, not code, and it is the cheapest unlock in this plan.

---

## Part 3 — Earn the remaining confirmations away (Class C)

This is where self-improvement starts, and it starts with a warning.

### 3.1 What the 2026-08-07 campaign actually proved

Four prompt iterations on `devops` moved the holdout 5/20 → 11 → 12 → 11 → 10.
Flat. About $41 of the ~$43 was spent before the measurement told the truth, and
$1.50 after. Four of the six repairs were to the harness, not the agent:

| Harness defect | What it hid |
|---|---|
| The actor's answer was not stored | the instruction under test appeared in 4 of 22 answers — the wording was never the variable |
| `agents/_shared/*` was unreachable | forty of sixty-nine agents were judged without half their contract |
| A truncated run reported a rate | 402s read as a score |
| Power read only the last sample | half the paid observations were discarded, then the result called underpowered |

And when the holdout was doubled, the agent scored **78% on the twenty cases
whose failures had been read while writing the fixes, and 40% on twenty fresh
ones**. That is overfitting by the improver, not by the agent.

**A self-improvement loop that reads failures and edits prompts will reproduce
every one of these.** So the loop is built with them as constraints, not as
lessons to remember.

### 3.2 The loop

```
nightly:
  1. Full eval suite.                       (~$1.20/agent since prompt caching;
                                             this is what makes a loop affordable)
  2. For each CONCLUSIVE failure — interval clear of the bar, not a point estimate:
       a. run-shape: is this the fixture or the agent?
             fixture → file a harness bug and STOP. Do not touch the prompt.
       b. adherence: does the instruction under test even appear in the answers?
             low → the fix is STRUCTURAL (remove the trigger condition),
                   never a rewording.
             high but wrong → the fix is content.
  3. Candidate prompt vs baseline, TUNING split only.
  4. Tuning improves → run HOLDOUT once. The improver never reads holdout
     failures — only the number.
  5. Holdout improves conclusively → raise gate:prompt for a human.
  6. Approved → the prompt lands, and the holdout ROTATES.
```

Four rules carry it, each bought with yesterday's money:

- **Step 2a before anything else.** `run-shape` exists and clusters failures by
  terminal state. Three times a low score was read as an agent gap and was the
  harness.
- **Step 2b before rewording.** Checking whether the instruction fires at all
  would have saved three of four iterations. 18% → 92% came from deleting the
  recognition step, not from the fifth phrasing.
- **Step 4's blindness.** The improver sees the holdout's number and never its
  failures. Reading them is what turned a holdout into tuning data and produced
  the 78/40 split.
- **Step 6's rotation.** A holdout read enough times stops being one, even
  through the number alone.

### 3.3 What the improver may not touch

The improver may propose changes to `agents/*.md` and nothing else. It may not
edit:

- the EVAL files, their cases, or their thresholds
- the judge, its prompt, or its model
- `run-shape`, `eval-power`, or the fixtures

An optimiser with write access to its own ruler optimises the ruler. This is not
hypothetical caution: the natural response to a failing eval is to soften the
criterion until it passes, and `judge-agreement.mjs` was written on 2026-08-03
because that happened three times in one session.

### 3.4 Gate tiering by proof

Once an agent's holdout **conclusively** clears its bar — the interval, not the
point — its gate drops to notify-only: the pipeline proceeds, the entry appears
in the board's inbox, the human may intervene and need not.

`devops` is the only agent with that evidence today: 82%, [72%, 89%], n=77.
Everything else is unmeasured or inconclusive, and stays gated.

Two limits, stated so they are not discovered later:

- **This never applies to Class A.** A production deploy stays human at 99%,
  because the question is not competence.
- **Isolated evals measure an isolated agent.** Yesterday's harness inlines
  `_shared` contracts the agent may never fetch — and on the live run, architect
  did not fetch the one whose command sat verbatim in its own file. Before a gate
  is dropped on eval evidence, that eval must exercise the handoff, not a fixture.

---

## Self-improving agents, specifically

The pipeline improves by the loop above. Agents improve three ways, and only one
of them is prompt editing:

1. **Prompt** — §3.2. Slow, measured, gated, and the least effective per the
   evidence: structure beat prose three times out of three.
2. **Contract** — an agent gains a rule that fires mechanically rather than a
   paragraph asking it to remember. Yesterday's three wins were all this: the
   claims ledger became unconditional; "no rollback path" became a third hard
   precondition with `exit 1`; the verdict format moved from a plea to a check.
3. **Knowledge** — `/crystallize` already turns repeated patterns into skills,
   and already has a gate, because activating a pattern injected into every
   future run of every project is expensive to undo (ADR-009).

**The ordering matters.** When an agent fails, ask in this order: can this be a
mechanical precondition? then, can it be a structural change to the prompt? and
only then, is this a wording problem? Yesterday's four iterations asked the third
question first, four times.

---

## Sequence

| Phase | Work | Unblocks |
|---|---|---|
| 1 | Budget-exhaustion recovery (§1.1) | half of all observed stalls |
| 1 | Worktree reconciliation (§1.2) | silent loss of work |
| 2 | Findings as beads with repro (§2.2) | `finding-closure`, already written |
| 2 | Depth-conditional edges (§2.1) | one human decision per run |
| 3 | Adherence check in the eval report (§3.2b) | the diagnosis that saved $40 |
| 3 | Nightly loop, tuning only (§3.2 steps 1–3) | candidate prompts, unmerged |
| 4 | Holdout rotation + `gate:prompt` (§3.2 steps 4–6) | prompts that land |
| 4 | Wake-on-approval (§1.3) | approval as the only human action |
| 5 | Gate tiering by proof (§3.4) | fewer gates, with evidence |

Phases 1–2 are leak repairs and need no new agreement. Phase 3 produces
candidates a human still merges. Phase 4 is the first point where the pipeline
moves unattended, and Phase 5 the first where a gate disappears — both are
decisions to take deliberately, and both are reversible if taken in this order.

## What this plan will not do

- Remove a gate on anything expensive to undo, at any score.
- Let an agent edit its own prompt unattended. `/crystallize approve` shipped
  ungated for months and activated patterns injected into every future run; that
  is the shape being avoided.
- Treat a point estimate as a result. Every "improves" above means the interval.
