# PLAN — What leaves Claude Code, and what it costs to move it

**Status:** planning · **Date:** 2026-09-09 · **Owner:** architect
**Feature:** `openrouter-routing-2026-09` · **Mode:** mvp (archetype `devtools`)
**Extends:** [ADR-002 — model-tier policy](../adr/ADR-002-model-tier-policy.md), which decided
*which Claude tier* each role gets. This asks the next question: *which work leaves Claude at all.*
**Gate:** `gate:arch` — §1 changes what the project spends money on, which is expensive to undo
per [ADR-009](../adr/ADR-009-gates-follow-reversibility.md).

---

## 0. The correction that has to come first

The request was "cheaper development — spend fewer tokens on Claude Code." That is a real goal,
but it names one currency and the move spends another.

**All 70 agents in `agents/*.md` run as Claude Code subagents.** Every one of them declares
`Write`, `Edit` or `Bash` in `tools:` — checked, 70 of 70. They are billed to the Claude Code
plan, at **zero marginal cash cost** and a real cost in plan quota.

**Everything already on OpenRouter is billed in cash**, per token, at seven call sites:
`cross-model-review`, `second-opinion`, `independent-verify`, `judge-calibrate`, `memory-filter`,
`generate-summary`, `stack-capabilities`, `grant-audit`.

So moving an agent from Claude Code to OpenRouter does not make development cheaper in dollars.
It **converts plan quota into cash**. That is often the right trade — quota is what stops work at
4pm, and cash is not — but it must be chosen deliberately, not discovered on a bill.

| You are trying to | The move that helps |
|---|---|
| Stop hitting Claude Code limits mid-day | Move work to OpenRouter — **this plan** |
| Reduce cash spend | Fewer/cheaper OpenRouter calls, and ADR-002's tiers — **not this plan** |
| Reduce both | Cut the number of agent invocations, not their venue |

**Recommendation:** treat this as a quota plan. Say so in the ADR, and put a cash budget on it up
front, because the current cash floor is the seven call sites above and nobody has measured them.

## 1. What we cannot answer yet, and the first task because of it

**There is no per-agent cost data.** `.great_cto/verdicts/*.log` holds 40 lines; the ones that
carry a cost field all read `cost_usd: 0`, and the newer ones carry no cost field at all. That is
`unmeasured`, not free — `cost-meter.mjs` says so itself when no token usage is supplied.

So today **we cannot rank agents by spend**, and any list of "the expensive ones" would be a guess
wearing a table's clothing.

> **T0 — measure before moving.** Record per-invocation token usage for agent runs, so the first
> move is aimed at something. Until this lands, every ranking below is ordered by *shape*, not by
> observed cost, and it says so.

## 2. The hard constraint on what can move at all

OpenRouter is a chat-completions API. It has no tool loop, no file access, no hooks, no receipts.
Our agents read the repository and write documents. That gives three tiers, and the tier is
decided by the agent's *shape*, not by its price.

### T1 — single-shot, fixed-shape output, no tools *(move; small work)*

Assemble the context deterministically in a script, make one call, write the result. This is
exactly the shape of the seven call sites that already work, so the pattern is proven and the risk
is known.

| Candidate | Why it fits | Volume |
|---|---|---|
| `continuous-learner` | ADR-002 already calls it "fixed-shape summary" and pins it to `haiku`. Runs at **every session end** — ADR-002 estimated 50–100/day on an active project. Its inputs are session logs and `lessons.md`; its output is a fixed entry that `lessons-write.mjs` then merges mechanically. | highest |
| `decision-scorer` | Scores 2+ alternatives against criteria. Inputs are a document and a rubric; output is a table. | low |
| `knowledge-extractor` | Clusters patterns from logs into a draft skill. Inputs are files a script can gather. | low |

`continuous-learner` is the whole first slice. It is the highest-volume agent we have, its output
is already validated mechanically downstream, and its model tier is already the cheapest — which
means the saving here is quota, exactly the currency in question.

### T2 — read a fixed context, return a document *(possible; medium work)*

The agent needs repository context, but a script can assemble it: a diff, an ARCH doc, a file set.
`cross-model-review` already does this end to end and is the reference implementation.

Candidates: the archetype reviewers that produce `TM-*.md` (there are ~30 of them, all
`model: sonnet` per ADR-002's `*-reviewer` default), and a second-pass `code-reviewer`.

**Do not move all thirty.** Move one, run its eval, compare. The reviewers are the largest
population and therefore the largest temptation to move in bulk; bulk is how a quality regression
arrives without a name attached.

### T3 — writes code or runs commands *(do not move)*

`senior-dev`, `app-scaffolder`, `mobile-app-builder`, `devops`, `infra-provisioner`,
`e2e-test-engineer`, `l3-support`, `project-auditor`. These need a real tool loop with approval,
sandboxing and receipts. Building one is not a routing change — it is building Puppetmaster or
MCO, both of which exist and neither of which we should reimplement to save quota.

If T3 ever becomes worth it, adopt a harness rather than write one, and read
`docs/adr/ADR-006-harness-router.md` first — it deferred exactly this.

## 3. Nothing moves without an eval

A venue change is a model change. `tests/eval/` plus `judge-validate.mjs` already exist for this,
and ADR-015 governs the learning loop the moved agent feeds.

**The gate for each move:** the agent's eval must be green on the new venue *before* the old path
is removed, and both paths stay runnable for one release so a regression has somewhere to fall
back to. A moved agent that is worse is not a saving.

## 4. Risks that are already handled, and one that is not

**Handled.** `provider-exhaustion.mjs` classifies a provider failure as terminal or transient and
stops a run at the first terminal one — it exists because a 75-file eval run spent \$13.99, ran out
of credits, and then made 147 more calls that could not succeed. Any T1/T2 move inherits that.
`router-key.mjs` reports whether a key is present without ever reading it back.

**Not handled.** A moved agent leaves the Claude Code hook surface: no auto-attached reviewers, no
`PostToolUse` receipts, no verdict log unless the calling script writes one. **Each move must
carry its own `log-verdict` call**, or the board will show an agent that stopped running rather
than an agent that moved.

## 5. First slice

1. **T0 — measure.** Record token usage per agent invocation so the second move can be aimed.
2. **Move `continuous-learner` to OpenRouter** behind an env flag, both paths live.
3. **Run its eval on both venues** and compare; keep the flag until one release has passed.
4. **Write the ADR** recording the quota-for-cash trade, with a monthly cash ceiling.
5. Only then consider one T2 reviewer, by the same steps.

**Not in this slice:** the other 29 reviewers, anything in T3, and any change to ADR-002's tiers.

## 6. What this plan does not claim

- No agent has been measured. The ordering above is by shape and volume, and §1 is the fix.
- The cash cost of the current seven OpenRouter call sites is unknown; §0 says to bound it before
  adding an eighth.
- Whether OpenRouter's cheaper models hold quality on our prompts is untested. §3 is how we find
  out, and it is a gate, not a hope.
