# Plan — agents that finish sooner, and work that runs side by side

Status: shipped — S3 measured and not taken, S7 for senior-dev · Started 2026-09-23

## Where the time goes (measured)

1,987 subagent transcripts on the measuring machine, 29.06–23.09. Duration is first to
last timestamp of a run; tool time is tool_use → tool_result; the rest is the model.

| Agent | Runs | Median | p90 | Tool calls (median) |
|---|---|---|---|---|
| senior-dev | 457 | **17.4 min** | 37.1 min | 90 |
| pm | 36 | 9.2 | 17.4 | 34 |
| architect | 20 | 10.0 | 14.0 | 30 |
| design-advisor | 116 | 9.0 | 14.3 | 26 |
| project-auditor | 13 | 9.9 | 13.5 | 49 |
| qa-engineer | 31 | 5.7 | 9.4 | 35 |
| security-officer | 21 | 4.3 | 9.7 | 25 |
| code-reviewer | 61 | 2.6 | 3.7 | 31 |

Three findings carry the plan:

1. **The model, not the tools, is the time.** senior-dev: 255 h between a tool result and
   the next call, 33 h inside tools — 88% model. It runs `sonnet` at effort `XHIGH`
   (extended thinking on every turn) with a 51 KB prompt; architect and design-advisor run
   Opus at `XHIGH`, architect with a 70 KB prompt, qa-engineer with 66 KB.
2. **One call per turn is the norm.** senior-dev put two or more tool calls in one message
   15% of the time; the main session dispatched two or more agents in one message 20% of the
   time. Each extra turn is another full model pass over the context.
3. **The tool time that exists is mostly waiting and re-running.** senior-dev's largest
   tool buckets: `until` polling loops 5.4 h (160 s each), `flutter test` 1,029 runs /
   4.4 h, `timeout …` 2.7 h, `cargo test` 454 runs — the whole suite, again, after each edit.

The pipeline itself is sequential where it need not be: qa-engineer → security-officer →
code-reviewer → domain reviewers run one after another, though all of them read the same
finished diff and none reads another's output.

## Items, by expected gain

| # | Change | Where | Gain (expected) | Effort |
|---|---|---|---|---|
| S1 | **Review stage fans out.** After senior-dev's verdict, dispatch qa-engineer, security-officer, code-reviewer and every required domain reviewer **in one message**; gate:ship waits for all (ship-evidence already reads them). | `shared/pipeline.toml` (parallel group), pipeline-dispatcher, coordinator | review wall time from the sum (~15–30 min) to the slowest (~6–10 min) | M |
| S2 | **Batch independent calls in one turn.** A rule in the shared contracts and senior-dev/qa/pm: reads, greps, `ls`, `git` queries and independent checks go in one message. Measured target: ≥50% of messages with 2+ calls (from 15%). | `agents/_shared/` new fragment, preloaded | fewer turns → 20–40% of model time | S |
| S3 | **Effort by phase, not XHIGH everywhere.** senior-dev: high effort for Phase 0 (spec argument) and diagnosis of a failing test; medium for the edit-test loop. architect/design-advisor stay high. Decided by A/B on each agent's eval: speed (minutes, turns) and pass rate side by side — a change that costs pass rate is not taken. | frontmatter `effort`, eval runner reports duration | 30–50% of senior-dev model time, if the eval holds | S + eval spend |
| S4 | **Targeted tests in the loop, full suite once.** Run the test file(s) the edit touches during TDD; the full suite once before the verdict. A rule plus a helper that maps changed files to their tests (`git diff --name-only` → test paths, per stack). | senior-dev, `scripts/lib/affected-tests.mjs` | most of the 1,029 `flutter test` / 454 `cargo test` reruns | M |
| S5 | **No polling loops.** `until …; sleep` and `timeout …` waits become `board-watch` (3.33) or a background run with a completion notice. | senior-dev, devops, coordinator prompts; lesson-rules check that flags `until .*sleep` in agent Bash | the 5.4 h of `until` + part of 2.7 h `timeout` | S |
| S6 | **Parallel implementers by default when the plan allows.** pm already writes a WPL with disjoint write zones; coordinator dispatches the disjoint packets in one message, each in its own worktree, and merges through `merge-preflight`. Today the main session fans out 20% of the time. | pm, coordinator, SKILL routing | a 3-packet feature from ~3× to ~1.2× one packet | M |
| S7 | **Shorter prompts where they are longest.** qa-engineer 66 KB, architect 70 KB, senior-dev 51 KB are re-read every turn. Move reference material the agent needs rarely into on-demand skills (the Skill tool now works — measured 22.09). | `scripts/lib/prompt-size.mjs` targets, agent files | lower per-turn latency; smaller cache writes | M |
| S8 | **Measure speed where quality is measured.** Fleet screen: median minutes, turns and tool calls per agent (the data above, from the same session logs as agent-usage); eval runner records duration per case. A speed change is accepted only with both numbers. | agent-usage.mjs, board Fleet, runner | makes S1–S7 provable and regressions visible | S |

## Order

S8 first (without it no item can be shown to have helped), then S2 + S5 (prompt rules, cheap),
S1 (largest wall-time win for every feature), S3 (needs eval spend), S4, S6, S7.

## Not in this plan

A faster model for senior-dev by default: its pass rate is what the evals protect, and S3
tests the cheaper lever — effort — first. Running more agents than the machine and the
provider's rate limits carry: parallel evals on 23.09 ran six at once without errors; that is
the measured ceiling so far, not a target.

## What shipped, and what the benchmark said (2026-09-25)

Shipped: S1 (review fans out; code-reviewer's edge carries gate:ship), S2+S5
(`agents/_shared/work-fast.md` in 14 agents), S4 (`scripts/lib/affected-tests.mjs`), S6
(coordinator dispatches disjoint packets in one message, pm plans in waves), S8
(`scripts/lib/agent-speed.mjs`). Not done: S3 (effort A/B — next), S7.

Controlled benchmark: one TDD task (`applyDiscount`, IMPL-BRIEF given), senior-dev with the
3.34 prompt vs this one, three runs each, pipeline hooks disabled.

| | 3.34 prompt | with work-fast |
|---|---|---|
| Runs that finished | 1 of 3 (two streams ended mid-task) | 3 of 3 |
| Minutes | 2.8 | 3.4 / 3.8 / 4.9 |
| Messages with 2+ tool calls | 6–8% | 0–8% |
| Full-suite test runs | 3–6 | 5–6 |
| Result | tests green, inside the brief | tests green, inside the brief |

**The prompt rules did not change behaviour.** Batching and targeted testing stayed where
they were; the text is in the prompt and the model did not follow it on this task. S2 and S4
are shipped as harmless but **unproven**; enforcing them would take a hook, not a sentence.
S1 and S6 are structural: the review stage's wall time falls from the sum of the reviewers
(8.3 min by median) to the slowest (5.7, −31%), which needs no model cooperation.

The benchmark found something larger: `great_cto@local` had never loaded — an invalid
marketplace `source` made Claude Code stub it — so every session ran 3.29.1's hook list.
Fixed on this machine by moving to the GitHub marketplace registration (see the release flow).

## S3: effort A/B (2026-09-25)

Same task and harness, senior-dev with the work-fast prompt, `effort: XHIGH` vs `MEDIUM`,
three runs each.

| | XHIGH | MEDIUM |
|---|---|---|
| Runs that finished | 3 of 3 | 2 of 3 (one stream ended mid-task, work already green) |
| Minutes (median) | 2.7 | 2.7 |
| Turns (median) | 22 | 17.5 |
| Cost (median) | $0.53 | $0.49 |
| Tests green, inside the brief | 3 of 3 | 3 of 3 |
| Ran `git stash` to check the baseline | 0 of 3 | **2 of 3** |

**Not taken.** Wall time did not move; turns and cost fell a little. The one behavioural
difference is the wrong way: at medium effort the agent reached for `git stash` / `git stash
-u` to see whether tests passed before its change. In a sandbox that is harmless; in a
working tree another session shares, it removes that session's uncommitted work. senior-dev
stays at XHIGH. Separately, no agent prompt forbids `git stash` today — that belongs in a
hook, not a sentence (the S2 lesson), and is filed as its own item.

## S7: what the prompt carries, not how long the file is (2026-09-25)

The file was never the heavy part. A senior-dev transcript showed six skill messages
injected before the task — 96 KB — because the agent's `skills:` list preloads each one in
full into every run. Two were for work senior-dev does not do: `ui-ux-pro-max` (46 KB; the
design choices are already in the DESIGN doc design-advisor writes with it) and
`subagent-driven-development` (29 KB; senior-dev has no Agent tool).

Measured on the path the pipeline uses — senior-dev dispatched as a subagent; `claude -p
--agent` does not preload skills and shows nothing:

| senior-dev | first-turn prompt | minutes (median) | cost (median) | correct |
|---|---|---|---|---|
| 3.35 | 83.4k tokens | 5.4 | $1.87 | 3 of 3 |
| without the two preloads, **with** the Skill tool to load on demand | 68.6k | — | — | — |
| without the two preloads (shipped) | **55.5k (−33%)** | **4.6 (−15%)** | **$1.63 (−13%)** | 3 of 3 |

The middle row is the finding: giving an agent the Skill tool puts the list of every
installed skill into its prompt — +13k tokens a turn on the measuring machine, more than
the skill it would load. architect, pm and product-owner carried it since 3.32; it came off in 3.36.1 — architect's
first-turn prompt 78.4k → 65.5k tokens as a subagent — and their on-demand skills are read as
files.

Guards: `prompt-size` now counts preloaded skills (it stopped at the file and its
contracts); a test refuses a subagent-dispatch guide on an agent without the Agent tool,
and a skill over 20 KB preloaded by any agent not named as its owner.
