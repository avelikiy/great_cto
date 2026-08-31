# TEST-STRATEGY-end-to-end

> Written 2026-08-31 · applies `skills/test-strategy` · scope: great_cto itself,
> not the products it builds.

Related: [ADR-009 — gates follow reversibility](../adr/ADR-009-gates-follow-reversibility.md)
for why a check that cannot fail the build is not a gate, and
[the documentation index](../README.md).

## The finding this starts from

An end-to-end layer already exists and has never run.

`scripts/test-pipeline.sh` holds 56 checks across five levels (static+unit, CLI
smoke, hooks, board API, phase-task lifecycle, plugin sync). It is referenced by
`.claude/settings.local.json` — a permission allowlist, not an invocation — and by
copies of itself inside worktrees. **Nothing executes it.** Not `ci-local.sh`, not
a hook, not the release script.

Run for the first time in this session: **51 passed, 5 failed, 131 s, exit 5.**

So the question is not "how do we get end-to-end coverage". It is "why does the
end-to-end coverage we have never gate anything", and the answer is the pattern
this repository has now hit five times in one week: `ask_kimi` declared by
nineteen agents and invoked by none · `acceptance-verify` whose only caller was
its own test · `decision-scorer` with zero verdicts since May · ten knowledge
packs no signal could select · and now the end-to-end suite itself.

## Current shape, measured

| Layer | Files | Runs in CI | What it proves |
|---|---:|---|---|
| unit / lib | 116 | yes | a function does what its name says |
| board | 35 | yes | a screen renders what the reader is owed |
| hooks | 22 | yes | a hook fires and blocks when it should |
| cli | 19 | yes | a command parses and exits correctly |
| eval (agents) | 78 | partly | an agent refuses what it should refuse |
| **end-to-end** | **1 file, 56 checks** | **no** | **the parts work together** |

Roughly 2 950 assertions run on every commit; the layer that exercises the whole
against a real board, a real CLI and a real plugin cache runs on none.

## The five failures, and what they say about staleness

Not "the pipeline is broken". Four of five are assertions pinned to a number or a
name that was current when written:

- `34 agents synced into ~/.claude/agents` — there are **70** agents and 69 synced.
- `agents-installed includes new agents (continuous-learner, edtech, gov, insurance)` —
  those stopped being new months ago; the check names four of seventy.
- `adapt --platform aider writes .aider.conf.yml` — a platform target that may or
  may not still be supported.
- `agent-prompt-lint: 0 errors` and the board API regression set — real signal,
  and unreadable at this distance because nobody has looked in months.

**A suite that never runs does not stay correct; it rots into a snapshot of the
day it was written.** That is the second reason to run it, after the first one:
it also stops being a test of today's system.

## Strategy

### 1. Run it before you improve it

Wire `test-pipeline.sh` into `ci-local.sh` as its own step, non-blocking for one
week, then blocking. Non-blocking first is not caution about the suite — it is
caution about the FIVE known failures: a step that fails on day one gets switched
off on day two, and a check that is switched off is the state we are leaving.

Fix the five inside that week. Three are stale constants and take minutes; two
need reading.

**Cost**: 131 s per run. `ci-local.sh` currently takes minutes already, so this is
a real but affordable addition — and it is the only layer that would have caught
the plugin-cache divergence found earlier today by hand.

### 2. Pin nothing that a healthy change moves

The four stale failures share one shape: an assertion on a COUNT or a NAMED
INSTANCE. `34 agents`, `these four new reviewers`. Both break on growth, which is
the one thing a healthy project does.

Replace with properties:
- not "34 agents synced" but "every agent in `agents/` has a synced counterpart,
  and nothing is synced that is not an agent" — the same shape as the pack- and
  skill-reachability ratchets added this week.
- not "these four reviewers are installed" but "the installed set equals the
  declared set".

This is the same lesson three unit tests taught this week: a test that fails on a
rename and passes on a regression points the wrong way.

### 3. Name the gap end-to-end does NOT close

Honesty about scope matters more than adding checks.

`test-pipeline.sh` proves the MECHANISM: the CLI runs, hooks fire, the board
answers, the plugin syncs. It does not prove the PRODUCT: that `/start` on a
brief produces a working application. That gap is structural, not neglected —
agents dispatch in the session's own directory, so a full `/start` cannot be
driven from inside a session working on this repository. Attempting it today
would have begun building a cleaning-company app inside great_cto.

What is achievable instead, and what this strategy proposes:

- **Stage-boundary tests, not whole-pipeline tests.** Each transition — a verdict
  arrives, the dispatcher decides, the gate holds or releases — driven with a real
  hook against a real project directory. That is how `ship-only` was verified this
  session: a fixture project, a real verdict, the real dispatcher, and the real
  briefing on the real brief. It found a contract that lied about its own gate.
- **A fixture project as a first-class artefact.** `scripts/lib/screenshot-fixture.mjs`
  already builds a seeded project for screenshots. The same fixture should back
  end-to-end runs: one definition of "a project that looks real", used by capture,
  by the loop's demos, and by these tests.

### 4. Keep evals out of the e2e layer

78 EVAL files measure agent behaviour with an LLM judge and confidence intervals.
They are not end-to-end tests and must not be run as gates on every commit: they
cost money, they are inconclusive at small N (three runs this session, all
INCONCLUSIVE at 14 and 17 cases), and their verdicts are probabilistic.

Their place is the weekly loop that already exists, with the gate-tiering
mechanism reading their history — which is live and currently drops 15 agents'
gates to notify-only on evidence.

### 5. What "covered" will mean

Not a percentage. Three counted states, the shape used everywhere else here:

- **gated** — the check runs in CI and can fail the build.
- **run, not gated** — it executes and reports; nobody is stopped.
- **written, not run** — it exists. Today the entire end-to-end layer is here,
  and the point of this document is that the number should be zero.

Report those three counts. A percentage hides which of the three a check is in,
and the difference between them is the entire subject.

## Sequence

| # | Step | Size | Blocks on |
|---|---|---|---|
| 1 | `test-pipeline.sh` into `ci-local.sh`, non-blocking | small | — |
| 2 | Fix the three stale-constant failures | small | 1 |
| 3 | Read the two real failures (prompt-lint, board API) | medium | 1 |
| 4 | Make it blocking | small | 2, 3 |
| 5 | Replace count assertions with property assertions | medium | 4 |
| 6 | Share the seeded fixture between capture and e2e | medium | — |

Steps 1–4 are the whole of the near-term value: they take a suite that exists and
make it a gate. Step 5 stops it rotting again. Step 6 is what makes adding the
next end-to-end test cheap rather than a project.

## What this strategy refuses

- **A coverage percentage as a target.** It would be satisfied by tests that run
  and prove nothing, and this repository has spent the week finding exactly that.
- **A full `/start`-to-deployed-product test.** Structurally impossible from
  inside a session on this repository, and pretending otherwise would produce a
  test that is skipped and reported as passing.
- **Evals as commit gates.** Probabilistic, paid, and inconclusive at the sizes
  we can afford per commit.
