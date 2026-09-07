# Product Brief — what the README and the landing should say now

**Slug:** `story-rewrite-2026-09` · **Date:** 2026-09-07 · **Author:** product-owner
**Question this brief answers:** given what great_cto became in releases 3.26.x–3.27.3,
what should the two surfaces where it is sold — `README.md` and the landing at
greatcto.systems — say now?

Plan altitude. Nothing is rewritten until the CTO approves at `gate:product`.

> **Surface naming.** The landing lives in a **private** repository. It is referred to
> here as "the landing" with line numbers into its `index.html`. No other page in that
> repository was read, and no client name from it appears in this brief.

---

## Problem

**Who.** Two readers, and they are not the same person. Today one page tries to be both.

| | Reader | Where they land | Decision window |
|---|---|---|---|
| **R1** | a developer who already runs Claude Code daily | `README.md`, usually from a link | ~30 seconds |
| **R2** | someone who has never heard of great_cto and may not run a coding agent at all | greatcto.systems | ~15 seconds |

**What the pain costs today.** The landing carries five statements that are false, unprovable,
or contradicted on the same page. Every one is verifiable from this repository in under a
minute:

| # | The statement | Where | Why it is wrong |
|---|---|---|---|
| 1 | "100% OpenAI Codex" | landing `index.html:174`; repeated in four meta/schema blocks at `:11`, `:13`, `:35`, `:43` [source: the landing page as committed] | `README.md:150-158` says the opposite in the product's own voice: on Codex you get skills and the MCP server, **not** the pipeline — no `/start`, no `/inbox`, no gate chain, no `secret-scan`, because a plugin manifest's `hooks` is never read there |
| 2 | "one CTO gate" / "One gate — the spec" | landing `:184`, `:217`, `:256`, `:297` | contradicted at `:290` on the same page ("Building a product is now three approvals") and by `README.md:41-63`, which documents three default stops |
| 3 | the board shows "30-day LLM spend **vs a human-team baseline**" | landing `:323` | that panel was **deleted** in v3.27.1. `CHANGELOG.md` v3.27.1 → *Ledger*: "loses the old cost panel: four tiles (`vs human team`, a projected month, a daily burn, an empty chart)". The landing describes a feature the product removed on purpose |
| 4 | "against a human baseline of weeks and tens of thousands of dollars per product" | landing `:336` | no derivation exists anywhere in the repository. `docs/product/REVIEW-readme-landing.md` §1 row 4 flagged the same class of claim on 2026-07-29 and it survived |
| 5 | "69 specialist agents" | `README.md:38` and `:225` | `ls agents/*.md` = **70**; `docs/reference/agents.md:6`, which is generated from the frontmatter, already says 70. The README is now the wrong one |

**Why now.** Six releases in eight days changed what the product *is*, and the change has a
single theme that neither surface names. From `CHANGELOG.md`:

- **v3.27.0** — the board rebuilt: eight tabs → four screens (Decisions · Ledger · Fleet ·
  Harness) + Settings + `⌘K`. Governing rule: nothing renders an absence as a pass. Deleted
  on purpose: "Cost savings vs FTE", a projected month, "vs human team", "Rework rounds",
  "Open security blocks", "Retire candidates", "Installed agents" — described in the entry as
  "fleet-wide aggregates over unmeasured inputs, one of them a green zero for a scan that
  never ran."
- **v3.27.0** — every cross-review log line carries `sha` and `dirty`
  (`scripts/lib/cross-model-review.mjs:67`, `:146`), approved at `gate:evidence-schema`.
- **v3.27.2** — a task carries its decision on the board, and the board is driven in a real
  browser before every release (`tests/e2e/board.e2e.test.mjs`, wired at
  `scripts/ci-local.sh:332`).
- **v3.27.3** — an opt-in Stop hook (`scripts/hooks/cross-review-gate.mjs`) that will not end
  a turn on a diff no second model has read.

The theme: **the product stopped being only a thing that builds, and became a thing that
reports what it did and did not check.** The README half-noticed — commit `6c3a7712` already
describes the four screens — but still leads on output and buries the doctrine in the last
sentence of a paragraph at `README.md:88-97`. The landing has not noticed at all.

**The contradiction that makes this urgent.** great_cto's entire thesis is that an unproven
thing must not look proven. Its own landing page currently makes five statements it cannot
prove. That is not a marketing backlog item; it is the product violating its own rule on the
page where it states the rule.

**Success metric.** Not set — see **Open question 1**. No figure is invented here to fill
the slot.

### Numbers used in this brief, with provenance

| Figure | Provenance |
|---|---|
| 70 agents | `[source: ls agents/*.md; docs/reference/agents.md:6]` |
| 4 cross-review log lines, 1 carrying a `sha` | `[source: .great_cto/cross-review.log, read 2026-09-07]` |
| 74 board view-counter entries | `[source: .great_cto/view-counter.log]` — all from the maintainer's own machine; **not** a user metric |
| median $171 per product · 70/100 quality (58–86), 7 of 10 completed | `[source: docs/benchmarks/BENCH-2026-07-batch1.md]` — dated **2026-07-10**, two months and roughly twenty minor releases old |
| 1h 26m · $3.40 for one traced feature | `[source: README.md:100; greatcto.systems/proof]` — one *feature*, not a product |
| ~46,819 npm downloads | `[source: landing index.html:151, live-fetched from npm]` — not verified against npm in this session; **downloads, not installs** (`npx` re-fetches every run) |
| 9 translated README mirrors | `[source: README.md:19 language links]` |
| landing is 607 lines, hand-maintained, with a hero A/B test | `[source: the landing index.html, lines 1-6]` |
| 1 maintainer-day for the correctness fixes; 3–5 days for a full repositioning | `[assumption]` — the panel's estimate, not a measurement |

---

## Economics

great_cto has **no price and no revenue**: MIT, self-hosted, users pay their own LLM
provider (`README.md:33-34`). Contribution margin per unit is therefore **not defined** —
there is no unit sold. Saying otherwise would be the exact failure this brief is about.

What *is* scarce is **maintainer-days**, and the surfaces have a real cost structure:

| Work | Cost | Notes |
|---|---|---|
| Correct the five false statements (English) | ~1 day `[assumption]` | Not billable to any story choice — false today under every option |
| Rewrite the first screen of each surface | ~1 day `[assumption]` | Hero copy only; leaves body sections intact |
| Full repositioning of both surfaces | 3–5 days `[assumption]` | Cascades into 9 translated mirrors, a 607-line hand-maintained landing, and a live hero A/B test that must be paused or forked |

**Reachable buyers: not applicable, and deliberately left blank.** There is nothing to buy.
The return on this work is a non-revenue signal — stars, downloads, issues, contributors —
and *which one* is Open question 1. A number nobody has chosen does not become an
`[assumption]`; it becomes a kill criterion with a threshold, which is where it sits below.

**The one asymmetry that decides the scope.** Fixing a false statement is downside protection
with a known cost and no story risk. Repositioning is speculative, costs 3–5× more, and — on
the paired-review claim specifically — would replace a *stale* claim with a *new* one that a
technical visitor disproves with one `grep` of a four-line log. Stale is recoverable. New and
wrong is not.

---

## Recommendation

**PIVOT.** Rewrite both surfaces — but not into the "evidence platform" repositioning the
framing implied. Correct the five false statements first, then change **only the first screen**
of each surface, and lead with the two claims that can be proven today rather than the one
that needs a track record.

**The decisive reason:** the panel's four voices split on strategy and converged on evidence.
All four independently refused to headline the paired cross-model review, because the log that
would back it has four lines. The Visionary — who opened arguing hardest for the evidence
repositioning — withdrew it against his own Round-1 condition: *"Four lines and a sha do not
meet it. Nobody outside the machine can re-derive anything from that log. B fails my gate, not
just the skeptic's."* When the strongest advocate for a direction disqualifies it on his own
test, that is the finding.

---

## The bet

**Lead with what the product can prove about itself by pointing at a deletion and a passing
test — not with the capability that needs a track record it does not yet have.**

The smallest version that tests it: correct the five statements, replace the first screen of
each surface, change nothing else. No new pages, no translation cascade, no A/B test
disruption. If the first screens are right, the body sections can follow a release later; if
they are wrong, the revert is one commit.

**What is deliberately NOT bet on:** that "provable agent work" is a category anyone searches
for. Nothing in this repository supports that, and the Skeptic's objection stands unrebutted:
47k downloads happened *with* the current story, and no user has said the story is wrong. The
maintainer noticed. That is a real observation and a weaker one than a complaint.

---

## What the product is now, in one sentence

> **great_cto drives the coding agent you already run through a whole build — architecture to
> deploy — and puts what it did, and what it never checked, on one local board where you
> approve the things that are expensive to undo.**

A stranger gets three things from that: it uses the agent you have, it goes all the way to
deploy, and it tells you about gaps rather than only successes.

**What the current surfaces get wrong or undersell:**

| Surface | Gets wrong | Undersells |
|---|---|---|
| **README** | the agent count (69 → 70). Leads with output — "Ship products with the coding agent you already have" — which is the story every model vendor ships by default and better funded | the doctrine. "Nothing on it renders an absence as a pass" is the last clause of a paragraph at `:88-97`. It is the thesis, and it is a footnote |
| **Landing** | all five statements in the table above | everything from the last six releases. There is no mention of the four screens, of deciding a gate from the board, of the cost-of-undo ritual, or of the paired review as a *mechanism* |
| **Both** | leading with the agent count as a capability. Two panel voices independently read "69/70 specialist agents" as **overhead, not capability** — "I want one agent that works, not a committee" | — |

---

## Who it is for, and the one job

**For R1 — a developer who already runs Claude Code and has been burned by orchestration
frameworks that promise a pipeline and deliver a prompt bundle.** `README.md:307` already
scopes this correctly and should not change: one builder, a solo founder or technical CTO.

**The one job the alternatives do not do:**

> **It tells you what the agent did not do.**

Every alternative reports completion. None reports absence.

| `[vs: …]` | What it reports | What it does not |
|---|---|---|
| `[vs: Claude Code alone]` — the host itself | the turn ended | whether anything read the diff. That is precisely the gap `scripts/hooks/cross-review-gate.mjs` closes |
| `[vs: hosted app builders — Devin, Lovable, Bolt]` | a preview URL and a green run | which checks never ran; and the repo is theirs, not yours |
| `[vs: OpenAI's own Codex plugin]` | ships the same cross-review idea — the v3.27.3 entry credits it and cites its warning about cost loops | it is a reviewer, not a ledger. There is no surface where a skipped review is counted apart from a passed one |

A vendor whose product is the agent has a structural reason never to tell you what the agent
did not check. A local, MIT, own-keys tool has no such conflict. That is the wedge, and it is
an argument about incentives, not about features — which is why it survives a well-funded
competitor shipping the same feature next quarter.

**"Do the simpler thing first" is not the wedge, and neither is the agent count.**

---

## Differentiated wedge

Every tool in this category orchestrates an agent. What none of them does is
**report what did not happen.**

**[vs: agent orchestrators that report only what ran — Maestro Orchestrate, Claw-Kanban,
and every CI dashboard whose green means "no failures recorded"]**

| | The category | great_cto |
|---|---|---|
| A stage that was skipped | absent from the report, which reads as clean | rendered as itself; never counted as a pass |
| A review that never ran | shown as no findings | shown as *not run*, distinct from *ran and found nothing* |
| A cost nothing measured | `$0` | *unmeasured*, distinct from a measured zero |
| A second opinion | the same model family, or none | another family, joined to the diff by `sha` |

The wedge is not "more agents" and not "cheaper builds" — both are claims a
competitor can make next week, and one of them is a number this product refuses
to publish. It is that **the report is trustworthy in the negative direction**,
which is the direction every dashboard in this category is biased against,
because a clean-looking report is what the vendor wants to show.

The proof is unusual and it is the reason this wedge is defensible: **the vendor
deleted its own favourable numbers to keep it true.** v3.27.0 and v3.27.1 removed
"cost savings vs FTE", a spend comparison against a human team, and a projected
month from this product's own dashboard, because none could be shown to be true.
A competitor can copy the feature list. Copying that costs them the numbers their
own marketing runs on.

**Where the wedge is weak:** it is a claim about *reporting*, and a reader who has
never been burned by a confident agent report does not feel the problem yet. That
reader is not this brief's audience, and pretending otherwise is how the current
landing ended up assuming everyone already owns a coding agent.

---

## The three claims worth leading with

Each carries the evidence in this repository. A claim without evidence is not on this list.

### Claim 1 — An absence never renders as a pass. We deleted our own favourable numbers to keep it true.

*Evidence:* `CHANGELOG.md` v3.27.0 → **"Gone, on purpose"**: the tiles "Cost savings vs FTE",
"Rework rounds", "Open security blocks", "Retire candidates", "Installed agents" were removed
as "fleet-wide aggregates over unmeasured inputs, one of them a green zero for a scan that
never ran." v3.27.1 removed the cost panel's `vs human team` tile and its projected month.
Enforced, not asserted: seven guard checks that no cell renders an absence as a pass
(v3.27.0 → *Under it*), plus the three-way vocabulary throughout — `unmeasured`, `never
observed`, `not run`, `unreadable`, `no cap` (never `$0`), and `unverifiable`, which is not a
pass (`README.md:196-201`).

*Why it leads:* it is the only claim on either surface provable by **subtraction**. Anyone can
diff the release and see a vendor deleting numbers that flattered it. That is a costly signal,
and costly signals are the only ones a skeptical reader credits.

### Claim 2 — You decide from the board, and the ritual scales with cost of undo.

*Evidence:* `packages/board/public/index.html:4577` (the Approve button changes label and
tooltip on a gate's reversibility class), `:7405-7447` (the consequence text names the
cost-of-undo category; an **unclassified** gate gets the expensive ritual "because nobody
judged it cheap"). The rule is `docs/adr/ADR-009-gates-follow-reversibility.md`, accepted
2026-07-23 — note the rule is from July; what is new in v3.27.0 is the board *obeying* it in
the approve interaction. Proven by an executing test:
`tests/e2e/board.e2e.test.mjs:222` — *"a gate is approved through its ritual, and a wrong name
approves nothing"* — one of seven cases run in a real browser before every release
(`scripts/ci-local.sh:332`), which **skip loudly** when the browser is absent, because "not
checked" is not "checked and fine."

*Why it leads:* it is the only claim backed by a test that must pass for a release to ship.
And it answers R2's objection directly — the typing ritual is not theatre once the page says
what it prevents: approving something expensive to undo by reflex, on a button pressed several
times a day.

### Claim 3 — Two harnesses read the same diff, and the `sha` says which tree. Mechanism, n=4, no rate claimed.

*Evidence:* `scripts/lib/cross-model-review.mjs:67` and `:146` write `sha` and `dirty` on every
review line; `scripts/hooks/cross-review-gate.mjs` joins a line to the current `HEAD` by that
`sha` and has four outcomes where an absence is never one of the passes — a joined `PASS` ends
the turn, a joined `BLOCK` holds it, **no** line holds it once and says nothing has read this
diff, and unjoinable lines hold it once and say they predate the join key
(`docs/DETAILS.md:66-99`). Off unless `GREAT_CTO_CROSS_REVIEW_GATE=1`.

*The disclosure that must ship with it:* `.great_cto/cross-review.log` holds **four lines, one
of which carries a `sha`.** Say that number on the page.

*Why it is third and not first:* the mechanism is real; the efficacy is unmeasured. A technical
reader greps a four-line log in one command. The `README.md:167-171` framing is already correct
and should be preserved — *"Two runs is evidence of the mechanism, not a rate."* It is now four.

---

## What to STOP saying

Ruthless, because a tool whose thesis is that unproven things must not look proven cannot
market itself with an unproven claim.

| # | Stop saying | Where | Replace with |
|---|---|---|---|
| **S1** | "100% OpenAI Codex" / "both supported 100%" | landing `:174`, `:11`, `:13`, `:35`, `:43` | the README's own honest split: full pipeline on Claude Code; skills + MCP on Codex; **and** Codex as the second reviewer from inside Claude Code. "100%" of an unnamed denominator is not a measurement |
| **S2** | "One gate — the spec" / "one CTO gate" | landing `:184`, `:217`, `:256`, `:297` | three default stops, one line in `PROJECT.md` takes it to one. Say the same thing the same way in all four places |
| **S3** | "30-day LLM spend **vs a human-team baseline**" | landing `:323` | spend with its provenance — `measured`, `estimated`, or unmeasured. The comparison tile does not exist |
| **S4** | "against a human baseline of weeks and tens of thousands of dollars per product" | landing `:336` | delete. No derivation exists. This is the same species of claim the product deleted from its own dashboard |
| **S5** | "69 specialist agents" | `README.md:38`, `:225` | 70 — and **not in the hero**. See S6 |
| **S6** | the agent count as the lead capability, on either surface | `README.md:38`; landing `:158` | what the pipeline *refuses to do* on your behalf. A count reads as moving parts. Keep the roster in `docs/reference/agents.md`, where a reader who wants it goes looking |
| **S7** | "100% Claude Fable 5.1 · 100% OpenAI Astra 6" | landing `:174` | name the models supported. A percentage with no denominator is decoration |
| **S8** | any rate, catch-rate or efficacy claim for the paired review | not yet present — **keep it that way** | the mechanism, plus the n |
| **S9** | "savings" as a digest column | `docs/DETAILS.md:124` | the vocabulary the board now uses. The word outlived the tile it described |
| **S10** | `softwareVersion: 3.27.2` | landing `:55` | 3.27.3 `[source: packages/cli/package.json]`. Small, but it is a claim |

**Two things to keep saying, with a date attached rather than deleted:**

- **median $171 · 70/100 across 7 products.** Real, reproducible, and the most honest number
  either surface carries. But it is dated **2026-07-10** and describes a two-month-old build.
  Stamp it with its date. An undated benchmark ages into a false claim without anyone editing it.
- **1h 26m · $3.40** for one traced feature — keep the words "one feature". The prior review
  (`docs/product/REVIEW-readme-landing.md` §1 row 5) found this number read as the price of a
  *product*, a ~50× gap. Both surfaces have since fixed the framing. Do not un-fix it.

---

## The shape of each surface

The two readers want different first screens. This is **not** two stories — one product, one
set of facts, two entry points that differ in what they lead with.

### README — first screen (R1, a developer, 30 seconds)

Its job: **let a skeptical developer decide, without scrolling, whether this is a prompt bundle
or a real pipeline.**

Must do, in order:

1. The one sentence above. What it is, in words a stranger parses once.
2. The one job — *it tells you what the agent did not do* — with the deletion as proof.
3. The board screenshot showing a **real gate with both reviewers' verdicts** and the
   cost-of-undo chip. `docs/screenshots/board.png` is current (re-shot at v3.27.1).
4. `npx great-cto init`, and the honest Codex split within the first screen, not below it.
5. A link to the limits. `README.md:301-315` is one of the strongest sections on either
   surface and is currently below the fold.

Must NOT: lead with the agent count (S6); lead with a cost figure; open with an
industry catalogue.

**Belongs on the README and NOT the landing:** the four screens by name; the n=4 disclosure;
`unverifiable is not a pass`; the approval-level table; the limitations section. All of it is
load-bearing for R1 and noise for R2.

### Landing — first screen (R2, a stranger, 15 seconds)

Its job: **say what this is and show one outcome.** R2's verdict was blunt: *"I came here to
understand what the product is, and I left knowing it has a board."*

Must do, in order:

1. What it is, in one sentence that does not assume the reader owns a coding agent. "You
   already have the agent" (landing `:155`) addresses a reader R2 is not. Fix the assumption
   or state the prerequisite plainly — do not leave it implied.
2. The job-to-be-done in plain words. R2 wrote the copy themselves: *"I write a spec, the agent
   codes, two brains review it, if they disagree I see the disagreement and I decide, I own
   the code."*
3. One outcome you can look at — the `/proof` run, labelled as one feature.
4. The install command.

Must NOT: the doctrine essay; the four screens by name; the n=4 disclosure; five industry
cards of anything.

**Belongs on the landing and NOT the README:** the 15-industry grid — and it is on probation.
Both readers flagged it independently: R2 read it as selling consulting, and
`docs/product/REVIEW-readme-landing.md` §3 called the same grid an audience leak in July. It
survived that review. If it survives this one it needs a reason, which is Open question 3.

---

## Scope

### IN — v1

- **STORY-R1** — correct the five false statements (S1–S5) on the landing and in the README.
  English surfaces only.
- **STORY-R2** — make the gate count say the same thing in all four places it appears on the
  landing (S2). The fix for a contradiction is removing the contradiction, not authoring a
  third version of it.
- **STORY-R3** — rewrite the README's first screen to the shape above: one sentence, the one
  job, the board screenshot, the install, the Codex split.
- **STORY-R4** — rewrite the landing's first screen to the shape above: what it is, the
  job-to-be-done, one outcome, the install.
- **STORY-R5** — remove the agent count from both heroes (S6); keep 70 in
  `docs/reference/agents.md` and the body.
- **STORY-R6** — publish the paired-review claim as mechanism only, with the log's real n
  stated on the page (Claim 3). No rate.
- **STORY-R7** — date the benchmark figures in place: `median $171 · 70/100 (7 products,
  2026-07)`.
- **STORY-R8** — sweep the residual vanity vocabulary: `docs/DETAILS.md:124` "savings" (S9),
  landing `softwareVersion` (S10).

### OUT — v1

**Out (v1) — explicit anti-scope.** Each of these was considered and left out on
purpose; the reason is the point, not the omission.

- **STORY-X1** — the nine translated README mirrors. They lag one cycle by design; a factual patch does not
  make them lie further than they already do, and a re-narration would.
- **STORY-X2** — the hero A/B test. Not paused, not forked, not touched.
- **STORY-X3** — any new page, including the public cross-review ledger the Visionary proposed. It is the
  right instrument and it is a build, not a rewrite. See Open question 2.
- **STORY-X4** — the 15-industry grid. Not deleted in v1; see Open question 3.
- **STORY-X5** — body sections of either surface below the first screen.
- **STORY-X6** — repositioning great_cto as an evidence or provenance platform. Explicitly deferred, with a
  named trigger — see K1.

---

## Debate digest

| Persona | Model | R1 | R2 | Status |
|---|---|---|---|---|
| Visionary | claude-opus-4-8 | ✓ | ✓ | **ok** |
| Skeptic | claude-sonnet-4-6 | ✓ | ✓ | **ok** |
| User-Advocate | claude-haiku-4-5 | ✓ | ✓ | **ok** |
| Pragmatist | ~~Kimi K2~~ | — | — | **unavailable** |
| Pragmatist (substitute) | claude-sonnet-4-6 | ✓ | ✓ | **ok (substitute — duplicate model)** |

**On the unavailable slot, stated plainly:** the `great_cto_llm_router` MCP server is connected
to the host but its `ask_kimi` tool was not exposed in this session's toolset. The Pragmatist
stance was run on Sonnet instead — the same model as the Skeptic. Three distinct models
carried four stances, not four. The rule requiring three `ok` voices before a certified
recommendation is met; the diversity the four-model roster exists to buy is **partially not
met**, and the Pragmatist's conclusions should be read as correlated with the Skeptic's, which
in this debate they were.

**Strongest argument FOR the repositioning (Visionary, R1).** Model vendors will absorb the
"describe a product and it ships" story by default, better funded. The thing they structurally
cannot ship is the accounting: a vendor whose product is the agent has a reason never to tell
you what its agent did not check. A local MIT own-keys tool has no such conflict, and that
incentive — not any feature — is the moat.

**Strongest argument AGAINST (Skeptic, R1).** A four-line log cannot carry a repositioning.
Headlining it is *worse* than the stale claims, because a technical visitor greps it and the
claim collapses on contact — and being new, it reads as dishonest rather than merely outdated.
"A live URL" converts because it is a photograph of an outcome; "evidence" is a photograph of a
process claim, and it needs the visitor to already believe process integrity is their bottleneck.

**What flipped it.** The Visionary conceded in Round 2, against his own Round-1 condition —
that the receipt be verifiable by someone who did not run the pipeline: *"Four lines and a sha
do not meet it… B fails my gate, not just the skeptic's."* He separated two things the word
"evidence" was hiding: **capability** (every diff leaves an artifact) needs n=1 and a spec;
**efficacy** (this catches what others miss) needs a track record. The surfaces would have sold
the second while owning only the first. The Skeptic moved the other way and conceded the board,
not the review log, is the defensible spine. Both landed on: correct now, sequence the story.

**Dissent, recorded because it was not resolved.** The User-Advocate did not converge, and gave
the sharpest line in the debate: *"Admitting n=4 is necessary honesty. It's not sufficient
proof."* Both readers held out for something this brief does not deliver:

- **R1 wants one worked example** — the second model saying "no, the first one is wrong here",
  with the `sha` and the diff. The README currently gestures at exactly this (`:167-171`: the
  first real Codex review found a P1 the author and the test suite both missed) but does not
  show it. R1's position is that this single artifact outperforms every claim in this brief.
- **R2 wants the industry grid replaced by one live demo**, or the landing removed and cold
  traffic sent to the README.

Both are cheap to satisfy and neither is in v1 scope. That is a judgment call by the chair, not
a consensus, and it is the most likely thing in this brief to be wrong.

**On the panel's agreement:** four voices converging is agreement, not evidence. Three of them
converged on *not* making a claim, which is the direction where agreement is cheapest to trust
— they agreed to assert less.

---

## Risks & kill-criteria

| # | Risk | Threshold that triggers the stop | Owner · source |
|---|---|---|---|
| **K1** | Deferring the evidence story is wrong, and the window closes while great_cto sells output | `.great_cto/cross-review.log` reaches **≥ 50 sha-carrying lines** with **≥ 1 documented case** of the second model catching what the first missed → reopen the repositioning; it is no longer premature | owner: CTO · source: `.great_cto/cross-review.log` |
| **K2** | The paired-review mechanism is not actually running, so Claim 3 describes a system that is not there | the log gains **< 10 lines in 30 days** from 2026-09-07 (base: 4) → cut Claim 3 from both surfaces and fix the harness, not the copy | owner: CTO · source: `.great_cto/cross-review.log` line count |
| **K3** | The first-screen rewrite moves nothing, and this was the maintainer marketing to himself — the Skeptic's charge, unrefuted | the metric chosen in Open question 1 shows **no change beyond its own 60-day variance, at 60 days** → revert to the prior heroes and stop spending days on positioning | owner: CTO · source: whichever metric Open question 1 names |
| **K4** | A corrected surface drifts back. Two of the five false statements were already flagged on **2026-07-29** in `docs/product/REVIEW-readme-landing.md` and survived six weeks | **any** of S1–S10 present on either surface **30 days** after STORY-R1 ships → the fix needs a check, not another review; add it to `artifact-lint` | owner: CTO · source: `grep` of the two files against the S-list |
| **K5** | The benchmark ages into a false claim. It is already two months and ~20 releases old | `BENCH-2026-07-batch1.md` reaches **6 months** (2027-01-10) without a re-run → remove the figures from both heroes rather than restate them | owner: CTO · source: the file's own date header |
| **K6** | The dissent was right and v1 shipped the wrong thing | R1's worked example or R2's live demo is requested by **any** external reader (issue, discussion, or direct) within **30 days** → pull it forward; both are hours, not days | owner: CTO · source: GitHub issues + discussions |

**Expensive to undo:** nothing here. Both surfaces are text under version control; every item
is a `git revert`. The one item that escapes the machine is the **landing deploy**, which
reaches strangers and is cached — it gets the ordinary ship gate, not a special one. Worth
saying explicitly so the architect does not invent a ceremony this work does not need.

---

## Open questions for the CTO

Each carries options, a pick, and what would make the pick wrong.

### 1. What is the return metric for this work? *(blocks K3, and the success metric slot above)*

| Option | Cost to measure | What it tells you |
|---|---|---|
| **a. npm weekly downloads** | free, already on the landing | noisiest of the three — `npx` re-fetches every run, CI and mirrors inflate it |
| **b. GitHub stars, 60-day slope** | free | a proxy for "a stranger read the page and was convinced" — closest to what the first screen is for |
| **c. issues + discussions opened by non-maintainers** | free | lowest volume, highest signal: someone read enough to have a question |

**My pick: (b) stars, with (c) as the tiebreak.** The first screen's job is to convince a
stranger in seconds, and a star is the cheapest action that stranger can take. **What would
make this wrong:** if the CTO's actual goal is contributors rather than reach, (c) is the only
one that measures it and (b) is vanity — which would be an uncomfortable metric for this
particular brief to choose.

### 2. Should the public cross-review ledger be built now?

The Visionary's Round-2 proposal: an auto-appended public page — run count, disagreement count,
`sha`, link to diff — so the track record accumulates in the open and the headline later writes
itself from data already on the page. **Options:** build it now (~1 day, and it makes K1
self-measuring); defer to the next release; never.

**My pick: defer, but decide now.** It is the right instrument and it is a *build*, not a
rewrite — it does not belong in this brief's scope. But it is the only proposal on the table
that turns K1 from a thing someone must remember to check into a thing the product reports.
**What would make this wrong:** if the log stays at four lines, a public ledger is a public
admission that the feature is unused — which is honest, and might be the most on-thesis page
on the site.

### 3. Does the 15-industry grid stay?

It was flagged as an audience leak in July and survived. **Options:** keep it and reframe as
"products you can build *for* these industries, not industries we sell to"; move it to
`/pipelines` and link it; delete it.

**My pick: reframe in place.** Deleting it removes the only concrete answer to R2's "what can
I build with this", and the grid is internally consistent (15 × 4 = 60 → 6 pipelines).
**What would make this wrong:** if R2's read is the common one — that it looks like consulting
— the grid is repelling the exact reader it was built to attract, and reframing a repellent is
cheaper than removing it but does not fix it.

### 4. Do the nine translated mirrors get the factual patch, or the full rewrite?

**Options:** patch only the sentences containing S1–S10; full re-translation of the new first
screen; leave entirely until the English settles.

**My pick: patch only.** A mirror that is stale is a known state; a mirror that is stale *and*
contradicts the English on a factual claim is a new one. **What would make this wrong:** if any
mirror gets meaningful traffic, a half-updated first screen reads worse than an old consistent
one — and nothing in this repository measures per-locale traffic, so this pick rests on an
`[assumption]` that they are low-traffic.

---

## Architect handoff

To be written into `.great_cto/PROJECT.md` on approval — the architect hard-blocks without it.

```yaml
discovery: completed
discovery-summary: |
  PIVOT, not a repositioning. Correct five false statements on the landing and one in
  the README (they contradict the code, the CHANGELOG, or themselves), then rewrite ONLY
  the first screen of each surface. Lead with the two claims provable today — an absence
  never renders as a pass (provable by the tiles v3.27.0/v3.27.1 deleted) and the
  cost-of-undo approve ritual (provable by tests/e2e/board.e2e.test.mjs:222). The paired
  cross-model review ships as a MECHANISM with its real n stated (4 lines, 1 with a sha)
  and no rate claimed. Hard boundaries: English surfaces only; the nine translated mirrors
  get a factual patch at most; the hero A/B test is not touched; no new pages. OUT: any
  repositioning of great_cto as an evidence or provenance platform — deferred behind K1
  (>=50 sha-carrying log lines plus one documented catch). Prose work only: no code, no
  API, no data shape changes.
archetype: devtools
mode: production
```

`archetype: devtools` is not on the high-compliance list, so `team-size`,
`cost-cap-usd-month` and `geo` are not required by the architect contract. They are already
declared in `PROJECT.md` (`team-size: 2`, `approval-level: gates-only`) and are unchanged by
this brief.

---

## gate:product

```
PRODUCT BRIEF: what the README and the landing should say now
  Recommendation: PIVOT — rewrite both surfaces, but correct before repositioning
  The bet:        lead with what is provable by a deletion and a passing test;
                  ship the paired review as a mechanism with its real n, not a rate
  Panel:          FOR repositioning 1 · AGAINST 3 · 1 unresolved dissent
                  decisive: the strongest advocate FOR withdrew it against his own
                  Round-1 condition — 4 log lines cannot be verified by an outsider
  Scope v1:       STORY-R1  correct the five false statements
                  STORY-R2  one gate count, said the same way in four places
                  STORY-R3  README first screen — one sentence, the one job, the board
                  STORY-R4  landing first screen — what it is, the job, one outcome
                  STORY-R5  agent count out of both heroes
                  STORY-R6  paired review as mechanism, n stated, no rate
                  STORY-R7  date the benchmark figures in place
                  STORY-R8  sweep residual vanity vocabulary
  Out of scope:   the nine mirrors (patch only) · the hero A/B test · any new page ·
                  the industry grid · repositioning as an evidence platform
  Needs you:      4 open questions — the return metric (Q1) blocks kill-criterion K3

→ approve  ·  comment (I revise, max 3 rounds)  ·  reject
```

---

## Related

- `docs/product/REVIEW-readme-landing.md` — the 2026-07-29 review. Two of its findings are
  still live on the landing six weeks later; K4 exists because of that.
- `docs/product/BRIEF-board-redesign-2026-09.md` — the brief that produced what this brief
  now has to describe. Its refusals ("Cost savings vs FTE", a projected month, "vs human
  team") are the S3/S4 entries above; the landing still sells two of them.
- `docs/adr/ADR-009-gates-follow-reversibility.md` — the rule behind Claim 2.
- `CHANGELOG.md` v3.26.4 → v3.27.3 — the six releases this brief is a response to.
