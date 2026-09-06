# Product Brief — Board redesign: from eight tabs to four decisions

**Slug:** `board-redesign-2026-09` · requirement prefix `BRD-R<n>`
**Date:** 2026-09-06 · **Author:** product-owner · **Status:** awaiting gate:product

> **Gate disclosure.** This brief was produced by direct invocation, not by the pipeline
> dispatcher. `gate:product` has **not** been raised and no human has approved it. Nothing
> downstream may treat this document as gated.

---

## Problem

**Who.** One operator — a solo CTO running great_cto across many private projects, daily,
from a terminal, with a browser tab open beside it.

**What the pain costs today.** The board answers questions about *runs* and cannot answer
questions about *the organisation doing the running*. Two concrete gaps, both named by the
owner and both confirmed against the code during this brief:

- The system has **70 specialist agents** `[source: ls agents/*.md, 2026-09-06]`,
  **44 commands**, **40 skills** `[source: ls commands/**/*.md, skills/*/SKILL.md]`. No
  surface shows which of them ran, what each cost, what tool grants each holds, or which have
  never run at all.
- Two harnesses now review the same diff. `/api/harnesses` already reads the tail of
  `.great_cto/cross-review.log` into the inbox
  `[source: packages/board/lib/routes.mjs:1621,1636]` — but the log line contains
  `ts, provider, model, state, verdict, findings, p0, cost, source` and **no diff sha and no
  gate id** `[source: scripts/lib/cross-model-review.mjs:57-64]`. The Claude reviewer's
  verdicts live separately in `.great_cto/verdicts/code-reviewer.log` with their own shape
  `[source: .great_cto/verdicts/code-reviewer.log:1]`. **There is no join key between the two
  reviewers.** Today the file holds **3 lines**
  `[source: wc -l .great_cto/cross-review.log, 2026-09-06]`.

That last fact is the brief. "Did both reviewers look at this diff?" is not a rendering
problem the board is failing at. It is a question the data cannot answer, and any screen
built before the join key exists would answer it by inference from timestamp proximity —
which is exactly a thing-that-did-not-happen looking like a thing that did.

**Why now.** Three changes landed close together: the Codex second opinion became selectable
per project (`capabilities: second_opinion: codex|openrouter|none`), agent count reached 70,
and ADR-009 introduced cost-of-undo as a first-class gate property
(`scripts/lib/gate-reversibility.mjs`, classes *expensive / routine / unclassified*). The
board predates all three. It grew to 8 tabs and 39 endpoints by accretion behind a single
**8,890-line** `index.html` `[source: wc -l packages/board/public/index.html, 2026-09-06]`.

**Success (one measurable outcome).** The operator can answer *"did both reviewers actually
review this diff, and what did each say?"* from the gate row, without leaving the board —
measured as paired-diff coverage ≥ 90% of gate:ship reviews at 30 days after the join key [assumption]
ships `[source: .great_cto/cross-review.log ⋈ .great_cto/verdicts/code-reviewer.log on the
new sha field]`.

---

## Economics

This is an internal tool with one user and no price. Pretending otherwise would produce a
margin that reads like a measurement. The honest unit economics:

- **The unit is an operator-minute, not a subscription.** Contribution "margin" = minutes
  saved per week minus minutes spent maintaining the surface. Panel estimate of the recurring
  friction being removed: the "did that agent actually run?" grep, **3–4× per week**
  `[assumption — User-Advocate persona estimate, not instrumented]`. No measurement of
  operator time exists in this repo; there is no telemetry on board usage
  `[source: docs/PRIVACY.md — telemetry is opt-in and off by default]`.
- **Price basis: none.** Not sold, not priced, no competitor anchor. Recording this rather
  than manufacturing a value-based figure.
- **Reachable buyers: one, enumerated.** The operator. Any claim about future OSS adopters of
  the board would be a top-down slice, not evidence.
- **Marginal serving cost: ~$0 per render** `[assumption]` — the board is a local zero-dep
  Node server with no LLM call in the render path; the LLM cost sits in the pipeline it
  observes, not in the board.

**The one number that is not knowable and therefore is a kill criterion, not an assumption:**
how often the operator would actually open a fleet screen. It has never existed, so no usage
data can exist. It is carried below as **K3** with a threshold and the cheapest test (ship the
screen behind a request counter and count).

Building at a loss of attention is allowed here. Discovering in month four that three of the
four new screens are as dead as `share` and `notifications` is not.

---

## Recommendation

**PIVOT — build it, but not as a ground-up redesign.** The redesign that survives the panel
is *instrument first, then re-cut the IA, and never rewrite the substrate*. The decisive
consideration is the missing join key: the board's headline failure (two harnesses, one diff)
is a **data** defect masquerading as a **layout** defect, and a ground-up redesign would have
spent its first month on layout while the evidence file stayed unjoinable.

Concretely, this means: **add one field to the review log (hours), put both verdicts on the
gate row (≈1 day), delete two dead tabs, then build the fleet table (≈2 days)** — and
explicitly refuse the build step, the component framework, and the "everything is an inbox"
rewrite.

**Rejected outright:** substrate rewrite (4–8 weeks before a single new feature
`[assumption — Pragmatist persona estimate]`, buys agent convenience, not operator value, and
costs the zero-dep/no-build/no-CDN guarantee that makes the ops console openable on any
machine during an incident); and CLI-first read-only, which surrenders the one thing a
terminal cannot render — simultaneity across many projects.

---

## The bet

**The board's job is not to display the system. It is to hold the four decisions the operator
actually makes, and to be honest about the ones it cannot yet inform.**

The smallest version that tests the bet: **the gate row showing both reviewers' verdicts,
joined on a real key, with `not run`, `unmeasured` and `unreadable` visibly distinct from
`BLOCK`.** If that one row does not change the operator's day within two weeks, nothing
further in this brief is worth building, and option E (read-only mirror) becomes correct.

---

## Differentiated wedge

Every agent-ops dashboard on the market renders a **run stream**; this one renders a **fleet
at rest, with its permissions and its evidence, and a first-class "I don't know"**
`[vs: LangSmith]` `[vs: Langfuse]` `[vs: Helicone]` — all three are trace/observability
viewers where an absent trace is indistinguishable from an absent run, and none of them can
show two independent harnesses disagreeing on the same diff because none of them run two.

---

## Operator jobs-to-be-done

What the board is opened FOR, ranked by frequency. All frequencies are
`[assumption — derived from the User-Advocate panel persona, R1/R2; no usage telemetry
exists]`. **This is the single weakest evidence base in the brief** — it is why every screen
below ships behind a request counter (BRD-R9).

| # | Job — the moment | Frequency | The decision it ends |
|---|---|---|---|
| J1 | **A gate is waiting on me** | 2–3× / day | Approve or bounce — and did one reviewer look, or two? |
| J2 | **"What did last night cost, and did anything run away?"** | ~1× / day, morning | Stop something, or go back to work |
| J3 | **Post-deploy: did it land, and is it clean?** | 1–2× / day when shipping | Roll back, or move on |
| J4 | **"Did that agent actually run?"** | 3–4× / week | Re-run, resume, or accept |
| J5 | **A cost or error alert arrived elsewhere** | 2–3× / week | Which project, which agent, is it still burning |
| J6 | **"Which agents can touch dangerous things?"** | rare — panel says 2×/year, and disputed | Retire an agent, or narrow a grant |

**J4 is the sharpest job and the most misread.** The operator is not distinguishing *ran* from
*failed* — a failure arrives with its error. The painful case is the **ghost**: supposed to
run, nothing in the log, and no way to tell "did not run" from "ran and the log write was
lost". That is the governing defect of this whole brief, in the operator's own daily loop.

**J6 is where the panel split.** The Visionary's fleet-as-org-chart bet says a *permission*
fact ("nine agents hold `payments` grants, four have no evals") pulls the operator in where a
*performance* fact never would. The User-Advocate rejected it in both rounds: "still ops work
I'd avoid." It is carried into scope as a **counted, killable experiment** (K3), not as a
conviction.

---

## Information architecture

**Top-level menu, derived from the jobs — four items, not eight:**

```
DECISIONS          LEDGER            FLEET             HARNESS
(J1, J3)           (J2, J5)          (J4, J6)          (J1 support)
what needs me      what it cost      who ran, who can  who is host, who
now, most          and what          do what, who      gave the second
expensive first    changed           never ran         opinion, what it did

              [ ⌘K search — docs · decisions · memory · sessions ]
                     a palette, not a tab
```

Plus one **drill-down surface that is deliberately not a tab**: the **Run receipt** —
reachable only from a row, never browsed cold.

**Verdict on each of the 8 current tabs:**

| Tab | Verdict | Why (one sentence) |
|---|---|---|
| **dashboard** | **SPLIT** → Decisions + Ledger | It currently answers two unrelated questions — "what needs me" and "what did it cost" — and the second one is never urgent while the first always is. |
| **inbox** | **MERGE** → Decisions | The inbox *is* the decision queue; two names for one job means the operator checks two places for the same thing. |
| **kanban** | **DELETE from top level** (deep link retained) | Task state's system of record is Beads and the repo, so this is a second copy that can be wrong, and per the panel it is opened approximately never. |
| **budgets** | **MERGE** → Ledger | A budget is a threshold on a number that already lives in Ledger; splitting the number from its threshold is what lets an overspend look normal on one screen and alarming on another. |
| **docs** | **MERGE** → ⌘K palette | Docs, decisions, memory and sessions are all one job — *find the artifact* — and a job you do by recalling a name belongs in a palette, not a tab you scan. |
| **logs** | **MERGE** → Run receipt | Logs are forensics: valuable attached to a run you are already suspicious of, noise when browsed cold. |
| **notifications** | **DELETE** | A notifications tab is a mailbox you must open to learn you were notified, which is the definition of a failed notification; delivery belongs to the channel (Telegram / desktop). |
| **share** | **DELETE** | Zero use for a single-operator tool, and a URL does the job. |

**Deleting a tab is cheap to undo** (git revert, ~1 hour each `[assumption — Pragmatist]`).
Adding a field to an evidence log is **not**, and is treated accordingly below.

---

## The 5 screens that matter most

Ranked. Each supports exactly one decision. If a screen cannot name its decision, it is a
report, and reports belong in files.

### 1. Decisions — the gate row with both verdicts
**Decision: approve or bounce this gate, knowing how many reviewers actually looked.**
One row per waiting gate, sorted by **cost-of-undo, always** — `expensive` above `routine`,
and `unclassified` pinned at the top with its own colour, never silently sorted as routine
`[source: scripts/lib/gate-reversibility.mjs]`. Each row carries two reviewer cells:

```
gate:ship · <private-project> · payments path        EXPENSIVE
  Claude   APPROVED  1×P1                 [receipt]
  Codex    BLOCK     2×P0                 [receipt]
  ── verdicts disagree ──
```

and the three states that are not a verdict, rendered as visibly different from `BLOCK`:
`not run` (capability is `none` — a real negative), `unmeasured` (capability declared, no
line written), `unreadable` (a pre-join-key log line — the sha field is absent, so this diff
*cannot* be paired). Legacy lines are the common case today, so `unreadable` is not an edge
case; it is most of the file until the field ships.

### 2. Ledger — what last night cost and what changed
**Decision: is something running that I should stop.** Per project, per agent, summed from
`cost_usd` in `.great_cto/verdicts/*.log` `[source: .great_cto/verdicts/code-reviewer.log:1 —
the field exists and is sometimes `0`, sometimes `null`]`. `null` renders `unmeasured`; `0`
renders `$0`. They are never the same cell. No trend chart without a threshold line on it — a
line going up is not a decision.

### 3. Fleet — 70 rows, five durable columns
**Decision: which agent do I stop trusting, retire, or re-pin.** One row per file in
`agents/*.md`. Columns: last verdict + when (from `.great_cto/verdicts/*.log`, keyed on the
`agent` field), cost to date, model pinned (frontmatter), **tool posture**
(`code.destructive` / `credential.read` / `communication.external.send` / `payments`
`[source: scripts/lib/agent-posture.mjs]`), and harness reachability (Claude-only vs both).
An agent with no verdict line renders **`never observed`**, not `0 runs` — absence of a log is
not evidence of absence of a run.

### 4. Harness — who is host, who gives the second opinion, what it DID
**Decision: is the second opinion actually on for the projects where I think it is.** Per
project: host harness; `capabilities: second_opinion` value; Codex **detected** vs
**authenticated** vs **unknown** (three states, and "not detected" ≠ "not checked"); and the
count of paired diffs in the last 30 days. Where the count cannot be computed — which is
today, for every project — the cell reads **`unmeasured — 0 paired diffs, join key absent`**
and never `0%` and never "they agree".

### 5. Run receipt — one run, in full
**Decision: re-run, resume, or roll back.** Reached from a row in screens 1–4, never from the
menu. What the run touched, its verdict, its cost, its logs, and — where a receipt exists —
the git head and dirty state it ran against.

---

## What must NOT be on the board

A surface that shows everything is a surface nobody reads. These are refusals, not backlog.

| Not on the board | Why |
|---|---|
| **Any two-state cell** | The whole point. `pass/fail`, `on/off`, `✓/✗` with no third state turns "we never measured" into "it failed" or, worse, "it passed". |
| **Fleet-wide aggregates over unknowns** | "Fleet pass rate 82%" averages measured and unmeasured agents into one number that is true of nothing. Show counts of each state instead. |
| **Eval coverage (v1)** | No eval→agent mapping exists in the repo. A coverage column would render `0%` for "no mapping", which is precisely the governing defect. Ships only after the mapping does. |
| **Idle / retired status (v1)** | There is no retire event and no retention policy, so "idle" would be inferred from log absence. `never observed` is honest; `retired` is a claim. |
| **Task kanban** | Beads and the repo are the system of record; a second copy that can silently disagree is worse than no copy. |
| **Notification delivery** | The channel delivers. A tab cannot notify. |
| **Any forecast or projection** | Nothing in this system has enough history; a projected burn line is a made-up number with a chart's authority. |
| **Cold log browsing** | Logs attach to a suspicion. Browsing them is how an hour disappears without a decision. |
| **Vanity counts** | "70 agents installed" is not a decision. "9 hold `payments`, 2 never observed" is. |
| **A build step, a bundler, a CDN** | Enforced today by `packages/board/no-cdn.test.mjs`; an ops console that needs `npm install` to open during an incident is not an ops console. |

---

## Debate digest

| Persona | Model | R1 | R2 | Status |
|---|---|---|---|---|
| Visionary | claude-opus-4-8 | ✓ | ✓ | ok |
| Skeptic | claude-sonnet-4-6 | ✓ | ✓ | ok |
| User-Advocate | claude-haiku-4-5 | ✓ | ✓ | ok |
| Pragmatist | **fable** (substituted) | ✓ | ✓ | ok — **model substitution disclosed** |

**Disclosure:** the roster specifies Kimi K2 via `mcp__great_cto_llm_router__ask_kimi` for the
Pragmatist. That tool was **not present in this agent's tool grant** in this run. The
Pragmatist ran on a fourth distinct model (`fable`) rather than being dropped; four voices on
four models, one of them not the specified one. Four `ok`, so the ≥3 threshold is met.

**R2 verdicts: BUILD 2 (Visionary, Pragmatist) · PIVOT 2 (Skeptic, User-Advocate) · DON'T
BUILD 0.** A 2–2 split on the *label* that converged completely on the *sequence* — which is
why the recommendation is PIVOT rather than BUILD: all four ended up describing the same first
three moves, and none of them was "ground-up redesign".

**Strongest FOR** (Visionary): the fleet is an organisation with permissions and no org chart;
"nine agents hold `payments` grants, four have no evals, two have not run in 40 days" is a
firing decision, not a report — and no other tool can compute it because no other tool runs
two harnesses over one diff.

**Strongest AGAINST** (Skeptic): there is **usage** evidence, not **incident** evidence. Dead
tabs and a grep habit prove workflow cost and non-adoption; they do not prove that a hidden
number caused a wrong call. And a registry built on non-durable columns renders placeholders
as zeros — the exact trap the house rule exists to prevent. The Skeptic's R2 block stands
verbatim: **do not ship sort-by-risk until the grants taxonomy is a queried field rather than
a render-time inference**, or an agent with a live `payments` grant and a stale verdict log
will rank as "quiet/safe".

**What flipped it:** the Visionary went looking for its own headline metric and found it
absent. Codex-vs-Claude disagreement rate is **not computable today** — `reviewLogLine` writes
no diff sha `[source: scripts/lib/cross-model-review.mjs:57-64]`, the Claude verdict log has
its own shape, there is no join key, and n=3 lines is not a rate under any join. The
Pragmatist independently found the same field and priced the fix at ~2 hours. The Visionary
then conceded its metric and kept its bet; the User-Advocate's top ask (both verdicts on the
gate row) turned out to *require* the Pragmatist's join key; the Skeptic's demand (verify
every column's durability first) turned out to *be* the join-key fix. Four positions, one
first move.

**Dissent, recorded and unresolved:** the User-Advocate maintained PIVOT through R2 and does
not believe the Fleet screen will be opened more than twice — "regular audits don't pull me
in; that's a team lead's quarterly sweep." The Visionary believes a **permission** column
changes that where a **performance** column would not. This is not settled by argument. It is
settled by K3 below.

---

## Scope

### IN — v1

- **BRD-R1** — `reviewLogLine` in `scripts/lib/cross-model-review.mjs` gains a diff identity
  field (git head + dirty flag, matching the receipt already written by the Claude reviewer)
  so the two reviewers' verdicts can be joined. **Additive and append-only**; existing lines
  keep their shape.
- **BRD-R2** — Lines lacking that field render **`unreadable`**, never `not reviewed` and
  never `0`. This is the majority of the file at ship time and must be visibly distinct from
  a real negative.
- **BRD-R3** — Decisions screen: one row per waiting gate, both reviewer cells, sorted by
  cost-of-undo from `scripts/lib/gate-reversibility.mjs`, with `unclassified` pinned top and
  never rendered as `routine`.
- **BRD-R4** — Harness screen: per project — host, `second_opinion` capability value, Codex
  detected / authenticated / unknown as three distinct states, paired-diff count or
  `unmeasured`.
- **BRD-R5** — Ledger: Decisions and cost split apart; budgets merged in as thresholds drawn
  on the numbers they govern; `null` cost renders `unmeasured`, `0` renders `$0`.
- **BRD-R6** — Fleet: 70 rows from `agents/*.md`; columns limited to last-verdict, cost,
  model pinned, tool posture, harness reachability. **No eval coverage, no idle/retired.**
  Agents with no verdict line render `never observed`.
- **BRD-R7** — Tool posture shown from `scripts/lib/agent-posture.mjs`, with an explicit
  `unclassified` state; **sort-by-risk is NOT shipped in v1** — the Skeptic's block, honoured.
- **BRD-R8** — Delete `share` and `notifications`; drop `kanban` from the top-level menu,
  retaining a deep link; merge `docs` into a ⌘K palette; merge `logs` into the Run receipt.
- **BRD-R9** — A per-view request counter in the board server, so every claim in the JTBD
  table above becomes measured rather than assumed, and so the kill criteria below have a
  source. Local-only, no network, consistent with the opt-in-telemetry-off-by-default rule in
  `docs/PRIVACY.md`.
- **BRD-R10** — The zero-dep / no-build / no-CDN constraint is preserved and its test kept
  green. Navigation inside the 8,890-line file is addressed by sectioning convention, not by
  tooling.

### OUT — v1

Component framework or build step · any bundler or CDN · eval-coverage column · idle/retired
status · sort-by-risk · disagreement-rate metric (the join key accrues the data; the metric
waits for n) · trend charts without thresholds · anything that renders an aggregate across
measured and unmeasured rows · mobile layout · multi-user or sharing features.

---

## Risks & kill-criteria

| # | Risk | Threshold to kill the screen | Owner / source |
|---|---|---|---|
| **K1** | The second opinion is not actually running where it is declared, so the whole Harness screen shows a system that isn't there | paired-diff coverage **< 50%** of gate:ship reviews at **30 days after BRD-R1 ships** → stop building harness UI, fix the harness | owner: operator · source: `.great_cto/cross-review.log` ⋈ `.great_cto/verdicts/code-reviewer.log` |
| **K2** | The board is not the operator's decision surface at all; the terminal is | Decisions view opened **< 5 days in a 14-day window**, measured at **30 days** → pivot to option E, board becomes a read-only mirror | owner: operator · source: BRD-R9 request counter |
| **K3** | Fleet management is aspirational (the User-Advocate's dissent) | Fleet view opened **< 4 times in 60 days** → delete it; the dissent was right | owner: operator · source: BRD-R9 request counter |
| **K4** | The Fleet table is a grid of placeholders wearing a table's authority | **> 40% of rendered Fleet cells are `unmeasured` at ship** → do not ship the screen; fix the sources first | owner: operator · source: the fleet endpoint's own output |
| **K5** | The log-format change is the only expensive-to-undo item here and could corrupt evidence | any non-additive change to an existing log line, or any loss of a pre-existing line, → revert immediately; the file is evidence, not state | owner: operator · source: `git diff` on `scripts/lib/cross-model-review.mjs` + line count of `.great_cto/cross-review.log` before/after |
| **K6** | A deleted tab turns out to matter | operator asks for `share` or `notifications` back within **30 days** → revert (~1h, cheap by construction) | owner: operator · source: n/a — direct request |

**Expensive-to-undo, called out so it does not look cheap:** exactly one item in this brief is
expensive to reverse — **BRD-R1**, the review-log field. It writes to an evidence file that
downstream reasoning depends on. Everything else (four screens, four deletions) is a
`git revert`. The architect should treat BRD-R1 as the one item needing a plan-and-stop, and
the eight IA changes as routine.

---

## Success criteria

Every metric names the endpoint or file it comes from. Nothing here is collectable-in-principle;
all of it is collectable from a named source, and the ones that are not yet collectable say so.

| Metric | Target | Source | Collectable today? |
|---|---|---|---|
| **Paired-diff coverage** — share of gate:ship reviews where both reviewers' verdicts join on one key | ≥ **90%** at 30 days post-BRD-R1 | `.great_cto/cross-review.log` ⋈ `.great_cto/verdicts/code-reviewer.log` on the new field | **No — requires BRD-R1.** Until then the value is `unmeasured`, never 0% |
| **Legible fleet** — agents in `agents/*.md` with a resolvable last verdict | ≥ **40 of 70**, and the remainder explicitly `never observed` | `agents/*.md` × `.great_cto/verdicts/*.log` (`agent` field) | **Yes** |
| **Placeholder density** — `unmeasured` cells as a share of rendered Fleet cells | ≤ **40%** at ship (K4) | the fleet endpoint's response | Yes, once the endpoint exists |
| **Unclassified gates never shown as routine** | **0** occurrences | `scripts/lib/gate-reversibility.mjs` output vs rendered class | **Yes** |
| **Unclassified postures never shown as safe** | **0** occurrences | `scripts/lib/agent-posture.mjs` output vs rendered class | **Yes** |
| **Cost attribution** — runs with a non-null `cost_usd` | trend up; `null` and `0` never conflated | `cost_usd` in `.great_cto/verdicts/*.log` | **Yes** — field exists and carries both `0` and `null` |
| **Dead-view count** — top-level views with zero opens in 14 days | **0** (four views, all used) | BRD-R9 request counter | **No — requires BRD-R9** |
| **Decision-surface adoption** — days/week the Decisions view is opened | ≥ **5** (K2) | BRD-R9 request counter | **No — requires BRD-R9** |

**Deliberately absent:** any metric of operator time saved. Nothing measures it, and a
plausible multiplier times a plausible multiplier would produce a number with visible working
and no provenance.

---

## Open questions for architect

**Q1. Where does the join key come from?**
Options: (a) git head + dirty flag, matching the receipt the Claude reviewer already writes —
free, already proven in that code path, but two reviewers on the same head with different
staged states could collide; (b) a gate id minted by the dispatcher and passed to both
reviewers — cleanest join, but touches the dispatcher and the Codex harness contract; (c)
content hash of the diff itself — exact, but the two harnesses must receive byte-identical
diffs, which is unverified.
**I would take (a).** It reuses a field that already exists on one side, costs hours, and
begins accruing data immediately. **What would make me wrong:** if the two reviewers can run
against different working-tree states for one logical review, (a) silently mis-joins — and a
wrong join is worse than no join, because it manufactures agreement. Architect should check
that before accepting (a); if it fails, (b).

**Q2. Is tool posture a queried field or a render-time inference?**
Options: (a) `agent-posture.mjs` is already a real classifier over frontmatter — then Fleet
just reads it and the Skeptic's block dissolves; (b) it infers from prompt text or file
location — then the column ships as advisory-only with an explicit `inferred` marker, and
sort-by-risk stays out permanently, not just in v1.
**I would take whichever the code actually is** — this is a five-minute read of
`scripts/lib/agent-posture.mjs`, and it is the architect's first task. **What would make my
scope wrong:** if it is (b) and BRD-R7 ships without the `inferred` marker, the board turns an
inference into a verdict.

**Q3. Four top-level views or three?**
Options: (a) four (Decisions / Ledger / Fleet / Harness); (b) three, folding Harness into
Decisions as a per-gate detail — the harness facts are mostly consumed *at* a gate; (c) two,
Decisions + everything-else.
**I would take (a) for v1 and expect (b) to win.** Harness deserves its own surface only while
the second opinion is new and its configuration is being verified; once paired-diff coverage
is stable, per-project harness state is a column, not a screen. **What would make me wrong:**
if K1 shows coverage is fine from day one, Harness was never worth a tab and (b) was right
immediately.

**Q4. What is the render contract for the third state?**
Left deliberately open — this is a HOW question. The requirement is only that `unknown`,
`unmeasured` and `unreadable` are distinguishable from each other *and* from a real negative,
by shape and not by colour alone.

---

## Architect handoff

Not yet written to `.great_cto/PROJECT.md` — this run was direct-invocation and stopped at the
brief, as instructed. The fields the architect's Step-0 gate requires, derived and ready to
paste:

```yaml
discovery: completed
discovery-summary: |
  PIVOT, not a ground-up redesign. The board's headline failure — "did both harnesses review
  this diff?" — is a DATA defect, not a layout one: cross-review.log carries no diff identity,
  so the two reviewers' verdicts cannot be joined. Fix that field first (expensive-to-undo:
  it writes to an evidence file), then put both verdicts on the gate row, then re-cut 8 tabs
  into 4 views (Decisions / Ledger / Fleet / Harness) plus a Run-receipt drill-down.
  HARD BOUNDARIES: zero runtime dependencies, no build step, no CDN — preserved, test kept
  green; the 8,890-line single file stays, sectioned by convention not tooling. Every cell is
  three-state — unknown/unmeasured/unreadable must never render as a real negative.
  OUT: component framework, eval-coverage column, idle/retired status, sort-by-risk,
  disagreement-rate metric, trend charts without thresholds, mobile, multi-user.
archetype: devtools
mode: mvp
```

`team-size` / `cost-cap-usd-month` / `geo` are not required — `devtools` is not a
high-compliance archetype and no compliance boundary was flagged.

---

## gate:product

```
PRODUCT BRIEF: Board redesign — from eight tabs to four decisions
  Recommendation: PIVOT (build it, but not as a ground-up redesign)
  The bet: the gate row showing BOTH reviewers' verdicts, joined on a real key,
           with "not run" / "unmeasured" / "unreadable" visibly distinct from BLOCK
  Panel: BUILD 2 · PIVOT 2 · DON'T 0 — split on the label, unanimous on the sequence;
         decisive point: the disagreement metric is not computable today (no join key)
  Scope v1: join key in the review log · both verdicts on the gate row · 4 views
            (Decisions/Ledger/Fleet/Harness) + Run receipt · delete share+notifications ·
            demote kanban · request counter · zero-dep constraint preserved
  Expensive-to-undo: exactly one item — BRD-R1, the review-log field (evidence file)
→ approve  ·  comment (I revise, max 3 rounds)  ·  reject
```

**Decision — 2026-09-06: APPROVED** by the owner, with two additions from the coverage
review of the design canvas (`DESIGN-board-redesign-2026-09`, 10 artboards): a
**Settings** screen (every write to `PROJECT.md` / `~/.great_cto`, each row naming its
file — push, email, share, judge key, project register) and the **⌘K palette** drawn as
a screen (docs · sessions · memory · decisions · agents · gates). `kanban` is demoted to
the `#/kanban` deep link, not deleted; the BRD-R9 view counter decides on **2026-09-20**:
under one open a day → the route goes, more → a `Work` screen (contract §2) is drawn.
The "opened approximately never" claim above stays labelled an assumption until then.

---

## Related

- [DESIGN-board-redesign-2026-09](../design/DESIGN-board-redesign-2026-09.md) — the
  design contract derived from this brief: screen inventory, wireframes, component
  states, navigation and the a11y contract.
- [project-capabilities](../reference/project-capabilities.md) — `second_opinion`,
  the declaration behind the Harness surface described here.
