# Product Brief — README craft: what five well-read READMEs do, and which of their moves we must refuse

**Slug:** `readme-craft-2026-09` · requirement prefix `RDME-R<n>`
**Date:** 2026-09-09 · **Author:** product-owner · **Status:** awaiting gate:product

> **Gate disclosure.** This brief was produced by direct invocation, not by the pipeline
> dispatcher. `gate:product` has **not** been raised and no human has approved it. Nothing
> downstream may treat this document as gated.

> **Panel disclosure.** Four personas, **three distinct models**. The Kimi K2 router
> (`mcp__great_cto_llm_router__ask_kimi`) was **not available** in this environment; the
> Pragmatist ran as a substitute on `claude-sonnet-4-6`, duplicating the Skeptic's model.
> Roster and status table in [Debate digest](#debate-digest). Three `ok` voices on distinct
> models is the floor for a certified recommendation, and it is met.

> Companion to [`BRIEF-story-rewrite-2026-09.md`](BRIEF-story-rewrite-2026-09.md), which
> decided *what the README should say*. This brief is about **how a README is built** — the
> mechanics five widely-read projects use, tested line-by-line against our own file, and
> filtered through the rule that overrides good marketing:
> **a thing that did not happen must never look like a thing that did.**

---

## Dials

| Dial | Setting | Why |
|---|---|---|
| **Surface** | `README.md` + the nine mirrors under `docs/*/README.md`. **Not** the landing page | The landing is `greatcto.systems`, a separate 607-line hand-maintained artifact with a live hero A/B test. It was scoped in the story-rewrite brief and is explicitly OUT here (`RDME-X8`) |
| **Reader** | R1 — a developer who already runs Claude Code, arriving from a link, ~30 seconds | Same R1 as the story-rewrite brief. R2 (the stranger who runs no agent) lands on the site, not here |
| **Altitude** | Document mechanics: structure, ordering, evidence format, sync | Not messaging. What the README *says* was settled two days ago and is not reopened |
| **Honesty constraint** | Binding, and it overrides conversion | Any move that reads well and asserts something unearned is REJECTED, however well it performs elsewhere |
| **Maintainer** | One person | Every recommendation carries a recurring cost, not just a one-time cost. A move that costs 1 day once and 0.2 days forever is worse than one that costs 2 days once and 0 forever |
| **Blast radius** | Ten files, no runtime code | Reversible by `git revert`. This is the cheapest place in the repo to be wrong |

---

## Problem

**Who.** One reader and one maintainer, and the brief is really about the gap between them.

- **The reader (R1)** — a solo developer already running Claude Code, arriving at
  `github.com/avelikiy/great_cto` from a link, with roughly thirty seconds. They are
  pre-skeptical: most AI-tooling repos are a prompt bundle with a landing page.
- **The maintainer** — one person `[source: README.md:319-321]` who owns ten README files
  and has now rewritten the positioning twice in six weeks.

**What the pain costs today.** Three costs, all verified against the files during this brief.

### 1. The rewrite stopped at the first screen — verified, not assumed

The task named this as a "known gap to check". It is real, and it is narrower and worse than
"the body is stale".

Commit `122a34c6` (2026-09-07, *"the five claims the product could not prove, removed from
its own surfaces"*) touched `README.md` in exactly **three hunks**
`[source: git show 122a34c6 -- README.md | grep '^@@']`:

| Hunk | What it is |
|---|---|
| `@@ -7,7 +7,7 @@` | the badge row |
| `@@ -22,22 +22,36 @@` | the opening prose — the new thesis, "it tells you what the agent did not do" |
| `@@ -222,7 +236,7 @@` | one line: `69` → `70` agents |

`+34 −11` lines on a 329-line file `[source: git show --stat 122a34c6]`. Everything between
line ~56 and line ~235 is pre-rewrite prose, and it was never asked whether it still agrees
with the new opening.

### 2. The nine mirrors are not stale — they are a different document

This is the finding that changes the recommendation.

| | English | The nine mirrors |
|---|---|---|
| Lines | **329** | **160–177** `[source: wc -l docs/{ru,zh-CN,zh-TW,ja,ko,es,pt-BR,de,fr}/README.md]` |
| Agent count | **70** at `:239` | **69** — `docs/ru:26,113` · `docs/ja:26,113` · `docs/de:26,115`, and the same in the rest `[source: grep]` |
| The `approval-level` table (`ship-only` / `product-only` / `gates-only` / `strict` / `auto`) | `:171-215` | **absent from all nine** `[source: grep -c 'ship-only' docs/*/README.md → 0 in every file]` |
| The two-harness / Codex second opinion | `:36-41`, `:147-169` | **absent from all nine** `[source: grep -ci 'harness\|second_opinion\|cross-review' → 0 in ru, ja, fr]` |
| Last full generation | — | `eeabbb86`, **2026-07-31** `[source: git log -- docs/ru/README.md]` |
| Last touch | 2026-09-07 | `370b1a0e` / `07a76fcc`, **2026-08-28** |

The actual count is **70** `[source: ls agents/*.md \| wc -l]`. So the mirrors are not a lagging
translation of the current README. They are a complete translation of a README that no longer
exists — roughly **half its length** — and one of the things they state is simply false.

**That is the brief's centre of gravity.** A project whose thesis is *"a stage that was
skipped renders as itself and is never counted as a pass"* `[source: README.md:29-34]` ships
five languages asserting a roster it does not have. The honesty constraint is not something
this document applies to *proposed* moves only; it convicts the artifact we already ship.

### 3. Craft debt in the English body — the reader's own report

The User-Advocate persona read the file as R1 and reported attention dying at
**`:237-280`, "What makes it different"** — ten bullets, several 4–6 lines, the longest
(`:253-265`) thirteen lines. *"By bullet 6, I'm skimming. By bullet 8–10, I'm gone… fatigue,
not skepticism."* And the one number they disbelieved was `:46-47`, the `$171` median `[source: README.md:107]` —
the number that **does** carry a source link, to `docs/benchmarks/BENCH-2026-07-batch1.md`.

**Why now.** Three things landed within nine days and pull in different directions: the story
rewrite fixed the first screen (2026-09-07); the board redesign added surfaces the mirrors have
never heard of; and the actual agent count moved 69 → 70 in English only. The mirrors have now
been wrong for **40 days** and each further English edit widens the gap by hand.

**Success — one measurable outcome.** `RDME-R2`'s check runs green: **no README under the
repo states an agent count that disagrees with `ls agents/*.md`, and no mirror claims to be a
current translation while lacking the English document's H2 sections.** Binary, greppable,
enforced by the existing pre-push hook. It is deliberately *not* a conversion metric — see
Open question 1 for why, and what it would cost to have one.

---

## Economics

**The standard unit economics do not apply and it would be dishonest to render them.**
great_cto is MIT and free `[source: README.md:47, LICENSE]`; there is no price, so there is no
contribution margin and no reachable-buyer count. The currency here is **maintainer-days**,
and the number that matters is not the one-time cost but the **recurring** one.

| Work | One-time | Recurring | Notes |
|---|---|---|---|
| Correct the false statements in the nine mirrors (69 → 70 and nothing else) | ~0.25 d `[assumption]` | unchanged | Fixes one lie; leaves nine half-length documents claiming to be current |
| Re-translate all nine to the current 329-line English | **4.5–9 d** `[assumption]` | **+9 file touches per English edit** | At ~2 English edits/month that is ~18 sync events/month a solo maintainer will skip. He already has, twice |
| Replace the nine with a dated snapshot stub linking to English | **~1 d** `[assumption]` | **0** | The only option whose recurring cost round-trips to zero: a document that does not claim to be current cannot go stale |
| Delete the nine outright | ~1 h `[assumption]` | 0 | Cheapest; throws away nine languages of discovery surface |
| Drift-detection script + pre-push wiring | **~0.5 d** `[assumption]` | ~0 | The repo already has `scripts/agent-shield-check.mjs`, `scripts/agent-prompt-lint.mjs` and a pre-push hook to extend `[source: ls scripts/]` |
| Full body restructure of the English README | **1–2 d** `[assumption]` | multiplies the mirror cost | Every structural change to English is nine more translation deltas under the re-translate option |

**Provenance warning, applied to ourselves.** Every figure in that table except the script
inventory is `[assumption]` — the Pragmatist persona's estimate, not a measurement. Two
`[assumption]` figures multiplied would produce a total that reads like a budget. So the
total is stated as a range and named as an estimate: **~2 maintainer-days** for the
recommended package `[assumption]`.

**The one economic fact that is not an assumption:** the recurring cost of nine
hand-maintained mirrors has already been *observed*, not projected. It was paid zero times in
40 days, across two English rewrites. That is the measurement.

---

## Recommendation

**PIVOT.** Not a craft rewrite — a **correctness fix, a check that makes it stick, and two
cheap moves that are already on-thesis.** **~2–4 maintainer-days** `[assumption]` — 2 for the
core (`RDME-R1`, `RDME-R2`), rising to ~4 if `RDME-R5` and the conditional tape are included.
The Pragmatist's Round-2 estimate widened from his own Round-1 figure once he costed the
drift-check machinery a tape would require; the widening is recorded rather than averaged
away.

The decisive reason: **the most valuable thing the five references have in common is not a
technique we lack, it is a property we have and are violating.** Every one of those READMEs
is *true about its own project on the day you read it* — cli/cli's verification block prints
real `gh at verify` output you can reproduce; uv's "10-100x faster" links a `BENCHMARKS.md`;
gum's hero GIF is captioned *"running from a single shell script (source)"* with the script in
the repo; mco states four flat refusals. We already do this better than any of them — and
then ship nine files claiming a roster we do not have.

Fixing that is worth more than any structural technique on the list, and it is also the
cheapest item.

**What the panel converged on.** All four voices moved. The Visionary opened at BUILD and
withdrew his own four-tape proposal (*"my four was a standing invoice"*). The Skeptic opened
at DON'T and said plainly that calling a correctness fix plus a CI gate "DON'T" *"would be
dishonest"*. The Pragmatist held PIVOT throughout. That is convergence from three directions
onto the same ~2-day package, which is the strongest signal this brief contains — and it is
still **agreement, not evidence**: no reader-behaviour data exists on either side. See
`K3`.

**What we are NOT doing, and it is the expensive-sounding half:** no GIF wall, no benchmark
hero chart, no `/start → live URL` demo reel, no full re-translation, no install-first cut.
Each is rejected below with the reason, and four of the five are rejected by the honesty
constraint rather than by cost.

---

## The bet

**That a README's credibility is a property of the repository, not of the document** — and
that for a project whose entire pitch is "we render absences honestly", the highest-leverage
README work is making the README pass its own audit, then getting out of the way.

**The smallest version that tests it:** `RDME-R1` + `RDME-R2` alone — stub the nine mirrors,
add the drift check. One day and a half `[assumption]`. If the check goes green and stays
green through the next two English edits without the maintainer thinking about it, the bet is
paying. If the check has to be bypassed or is deleted, the bet was wrong and the real problem
is that we ship ten READMEs at all.

---

## Differentiated wedge

**Our README can make claims the category cannot, because ours are the kind that can be
checked — and we should spend the page on those and only those.**

| | The category | great_cto |
|---|---|---|
| A demo | an edited screen recording of a good run `[vs: hosted app builders — Devin, Lovable, Bolt]` | a VHS tape from a checked-in `.tape` file, whose terminal text is greppable source `[source: docs/tapes/ci.tape, 757 bytes]` |
| A benchmark | an adjective — "10x faster", "ships in minutes" | a median with a range including the low end, linking a batch file `[source: README.md:107 → docs/benchmarks/BENCH-2026-07-batch1.md]` |
| A limits section | absent, or three soft caveats | `:286-300`, which volunteers that per-agent cost attribution can be *"inflated by orders of magnitude"* |
| A capability list | what it can do | what it **refuses** to do — `:161` (never shows *declared but unavailable* as *off*), `:224` (`unverifiable` is not a pass), `:230` (`unmeasured`, never a confident `$0.00`), `:300` (budgets do not fire on an unmeasured number) |

The nearest peer is **`[vs: mco-org/mco]`**, and it is the only one of the five that competes
on this axis. Its README states *"MCO keeps answer text opaque. It does not turn
natural-language output into findings, severity, confidence, consensus, or an automatic
decision"* — a refusal presented as the feature. It does this **once, in one place, as a
declarative sentence.** We have four such refusals of at least equal weight and we have them
**scattered as the last clause of four different paragraphs**, 140 lines apart. mco beats us
on presentation of a thing we are better at. That is `RDME-R3`.

Two honest notes against ourselves, since the wedge section is where briefs flatter:

- mco also writes *"MCO is actively maintained."* — a claim about the future, unfalsifiable,
  free. We do not copy it, and it costs mco nothing that we don't.
- Our npm downloads badge `[source: README.md:8]` is mechanically true and still misleading:
  `npx` re-fetches on every run, so downloads are not installs. Flagged in
  `REVIEW-readme-landing.md` on 2026-07-29 and still present. Not in scope here — it is a
  *badge*, not a claim in prose — but it is the same species, and `RDME-X6` keeps us from
  adding more of them.

---

## The five, read

Fetched 2026-09-09 via `gh api repos/<owner>/<repo>/readme --jq '.content' | base64 -d`.

| Project | Size | Organising principle | The one move worth naming |
|---|---|---|---|
| **cli/cli** | **122 lines** | Install-first; everything else is a link to `docs/` | `## Verification of binaries` — a claim rendered as a **command with its real output pasted in**. You can run `gh at verify` yourself and get that text. Also `## Comparison with hub`: names its own predecessor and links a detailed comparison |
| **astral-sh/uv** | 326 lines | Highlights → install → per-feature `console` transcripts | The hero is a **benchmark bar chart**, captioned with the exact scenario — *"Installing Trio's dependencies with a warm cache"* — and "10-100x faster than pip" links `BENCHMARKS.md`. The FAQ answers the doubt out loud: `#### Is uv ready for production?` |
| **charmbracelet/gum** | 487 lines | Demo-first; ~20 GIFs, roughly one per command | The hero GIF is captioned *"The above example is running from a single shell script ([source](./examples/demo.sh))"* — **the demo's source is in the repo**. The tutorial builds one real script incrementally. Long install tail is folded into `<details>` |
| **sharkdp/bat** | 941 lines | Feature-first: 5 screenshots before a single install instruction | A centred **nav bar of 5 anchors** with the 4 translations in the same block. `## Integration with other tools` — ten subsections showing `bat` composed with `fzf`, `fd`, `ripgrep`, `tail -f`, `git`, `man`. And `## Project goals and alternatives`: four stated goals, then a link to a doc comparing it against its competitors |
| **mco-org/mco** | 198 lines | Peer. Tables: providers, permissions, workflows, contracts | Refusals stated flatly as features (four of them), a **permissions table** whose third row is `yolo` — *"Explicit opt-in only"* — and a `## Documentation` table linking **machine-readable contracts** (`errors-v0.1.x.md`, `invocation-runtime-v1.md`) |

**What all five share, and we don't:**

1. **A way in.** bat has a nav bar; cli/cli and uv put install within the first screen;
   gum's tutorial is a ladder. Our README is 329 lines with eight H2 sections and **no table
   of contents and no anchor list**.
2. **Short list items.** uv's twelve Highlights bullets are 1–2 lines each, most of the detail
   behind a link. Ours at `:237-280` run to thirteen. This is the fatigue the reader reported.
3. **Numbers that open.** uv's chart links `BENCHMARKS.md`; cli/cli pastes the actual verify
   output. Our `$171` row at `:107` links a batch file but — unlike the prose at `:46-47` —
   **does not carry its date**, and the batch is from 2026-07-10, two months and ~twenty
   releases old.

**What we already do better than all five:** the Limitations section, the refusal vocabulary
(`unverifiable` / `unmeasured` / *declared but unavailable*), and the approval-level table at
`:171-215`, which is mco's permissions table plus a **"Stops" count column** and a line
saying which guard fires even at `auto`. Do not touch it.

---

## Moves we REJECT, and why

The task asked which of the five projects' moves fall in the "reads well, asserts something
unearned" bucket. Four do. One is rejected on cost, not honesty, and that distinction is kept
explicit.

| Move | Whose | Verdict | Why |
|---|---|---|---|
| **The GIF wall** — ~20 demo GIFs, one per command | gum | **REJECT the wall, ADOPT the discipline** | gum's GIFs are honest for a reason that does not transfer: each records **one short command** end-to-end, so the recording *is* the run. Our unit is a **1h 26m pipeline** `[source: README.md:106]`. Any GIF of it is necessarily a **cut**, and a cut is an edit — the edit is where a path that is not wired starts to look wired. The discipline to keep: gum's caption pattern, *the demo's source is in the repo*. Our `docs/tapes/ci.tape` already does exactly this |
| **The benchmark hero chart** | uv | **REJECT as a hero** | uv earns it: `BENCHMARKS.md` exists and the caption names the exact scenario. Our nearest equivalent is a **7-product batch from 2026-07-10** with a quality range of 58–86. Promoting a two-month-old median to the hero position, above the range and without its date, would be the same species of claim v3.27.0/v3.27.1 **deleted from this product's own dashboard** `[source: README.md:32-34]`. The *sub*-move — link the reproduction — we already do at `:107`; `RDME-R4` only makes it carry its date |
| **A `/start` → live-URL demo reel** | (the reader's request, not one of the five) | **REJECT** | The most-wanted item from the User-Advocate, and the clearest violation. A 60-second version of a run that takes 1h 26m and a whole product that costs a median $171 is a **compression**, and compression of a process whose selling point is *"it stops three times"* removes the stopping. This is the single hardest rejection in the brief because it is the thing most likely to convert |
| **"Actively maintained" / social proof / stars badge** | mco (the phrase); the category generally | **REJECT** | A claim about the future, or about other people's opinions, that costs nothing to make and cannot be checked. None of bat, cli/cli or uv use social-proof badges — theirs are all mechanical (version, license, CI). Ours should stay mechanical too |
| **A 200-line install section covering ~15 package managers** | bat | **REJECT — on cost, not honesty** | Nothing dishonest about it. It is simply breadth we do not have (we ship one command, `npx great-cto init`) and would be a standing maintenance obligation for one person. Named separately so the rejection is not miscredited to the honesty constraint |
| **Install-first, ruthless brevity** | cli/cli | **REJECT for the hero, ADOPT for the tail** | cli/cli documents **one verb**. `gh` needs no explanation; great_cto does — a reader who installs before understanding the gate model has installed the wrong thing. But cli/cli's *tail* discipline — push detail to `docs/` — is exactly the fix for `:237-280` (`RDME-R5`) |

**The one adopted without reservation:** mco's **refusal table** (`RDME-R3`). Zero new
engineering, zero new claims — it is four sentences we already ship, moved into one place.

**A caution the Skeptic raised and it is correct:** the tape-versus-lie argument has a hole.
A tape's frames are all real, but *"real" describes the pixels, not the selection* — record
five times, publish the clean one, and you have survivorship bias with better production
values. This repo has the precedent: `docs/screenshots/` is captured from a **seeded fixture**
`[source: commit a72c839b, "screenshots taken from a seeded fixture, carrying the version they
were taken at"]`.

**And the precedent is more demanding than "we used a fixture."** The Pragmatist read the
commit and the tape: `a72c839b`'s honesty was not the fixture, it was the **version stamp in
the image, a CI check that reads it, and a verification step that forges a stamp and confirms
it gets caught.** A tape inherits that whole apparatus or it becomes the next stale
screenshot — worse, because *you cannot grep a video frame*. He also costed the difference:
`docs/tapes/ci.tape` is cheap (~0.5–1 d) because it is a straight-line replay of a flow
nothing is supposed to fail. A tape of a budget **refusing**, or a verdict returning
`unverifiable`, only occurs if the fixture is rigged into that state — legitimate if it is the
real code path under seeded conditions, and a doctored transcript if it is not. A `REWORK`
bounce (~1.5–2 d) runs multiple stages and is either flaky or hard-coded, and hard-coded is
precisely the trap. That is why `RDME-R6` is limited to **one** tape, of the **gate pause**,
and sits behind an open question rather than in funded scope.

**One factual caveat on `RDME-X5`, raised in Round 2 and left unresolved:** the Pragmatist
could not confirm that a `/start → live URL` recording has a "live URL" step to record — the
board is a local zero-dep server at `localhost:3141` `[source: README.md:92; CLAUDE.md]`, not
a hosted endpoint. The rejection of `RDME-X5` does not depend on this, but the reader's
request may be for a demo of something the repo cannot produce on its own machine.

---

## The known gap: the rewrite stopped at the first screen

Verified above (Problem §1 and §2), and restated here because it is the actionable half.

**In English**, the untouched region `:56-235` was not found to *contradict* the new opening —
the rewrite's replacements were additive and the body's claims still hold. What it does is
**bury the thesis**. The new opening at `:29-34` says the product's one job is telling you
what the agent did not do; the four sentences that prove it sit at `:161`, `:224`, `:230` and
`:300`, each as a trailing clause. The body was not made to disagree with the first screen; it
was left not knowing about it.

**In the nine mirrors** the gap is categorical, not editorial. They predate the approval-level
table, the two-harness review, the board's four screens, and the current agent count. Patching
`69 → 70` in nine files would remove one false statement and leave nine documents that present
themselves as the current README and are not. `RDME-R1` therefore changes what they *claim to
be*, not what they say.

---

## Scope

### IN — v1

- **RDME-R1** — the nine mirrors stop presenting themselves as the current README. **The
  mechanism is Open question 1 and the panel split on it** — dated snapshot stub (Pragmatist)
  or outright deletion plus one honest line, "English only for now" (User-Advocate). Either
  satisfies the requirement; neither may be chosen silently. What is NOT in question: a
  document may not claim to be a current translation while lacking the English document's
  sections and stating a roster we do not have. `[~1 d for the stub, ~1 h for deletion,
  assumption]`
- **RDME-R2** — a check that fails **before** the drift returns, wired to the existing
  pre-push hook alongside `scripts/agent-prompt-lint.mjs`. Two assertions, both cheap:
  (a) no README in the repo states an agent count disagreeing with `ls agents/*.md`;
  (b) every file under `docs/*/README.md` carries the snapshot banner. The 2026-07-29 review's
  findings survived six weeks because a finding is a wish and a check is a gate. `[~0.5 d]`
- **RDME-R3** — the four refusals at `:161`, `:224`, `:230`, `:300` are gathered into one
  table, **"What great_cto refuses to do"**, near the thesis at `:29-34`. Their existing
  in-context sentences stay where they are; the table indexes, it does not relocate. `[~0.2 d]`
- **RDME-R4** — the `$171` row at `:107` carries its measurement date (`2026-07-10`) the way
  the prose at `:46-47` already does, shows the **range including the 58**, and says **what
  the number covers**. In Round 2 the reader sharpened the objection: *"I don't understand
  what that number is measuring. One build? An average? Just the compute? Does it include my
  labour?… I'll believe a range with caveats faster than a precision point."* A sourced median
  with an unstated denominator invites exactly the interrogation it received. `[~0.1 d]`
- **RDME-R5** — `:237-280` stops being ten bullets of 4–13 lines. Each bullet becomes 1–2
  lines with the detail behind an existing link, per uv's Highlights. **No claim is deleted or
  softened** — this is a length change, and every claim must land somewhere reachable.
  `[~0.5 d]`

### OUT — v1

**Out (v1) — explicit anti-scope.** Each was considered and left out on purpose; the reason is
the point, not the omission.

- **RDME-X1** — gum's per-command GIF wall. Our unit of work is 1h 26m; every GIF of it is a
  cut, and a cut is where an unwired path starts to look wired.
- **RDME-X2** — uv's benchmark hero chart. The batch is two months old and the honest form of
  the number is a range, which does not make a hero.
- **RDME-X3** — bat's multi-package-manager install section. Breadth we do not have; rejected
  on cost, not honesty.
- **RDME-X4** — cli/cli's install-first cut. A reader who installs before understanding the
  gate model installs the wrong product.
- **RDME-X5** — the 60-second `/start → build → board → live URL` demo. The most-requested
  item on the panel and the clearest violation of the constraint. See Open question 2 for the
  version that would be legitimate.
- **RDME-X6** — any social-proof badge, "trusted by" row, or claim about future maintenance.
- **RDME-X7** — full re-translation of the nine mirrors to the current English. 4.5–9 days
  `[assumption]` and dead again in six weeks; the pattern has already repeated twice. Revisit
  only under `K4`.
- **RDME-X8** — `greatcto.systems`. A different surface, already scoped by the story-rewrite
  brief; touching it here would fork that work.
- **RDME-X9** — the npm downloads badge. Mechanically true, still misleading (`npx` re-fetches),
  flagged 2026-07-29, out of scope because this brief does not reopen badges. Named so it is
  not mistaken for an oversight.

### CONDITIONAL — behind Open question 2

- **RDME-R6** — **exactly one** new VHS tape: the **gate pause** — the pipeline stopping and
  asking a human, the `ABOUT TO BUILD` screen at `:193-202`. Not the build, not the deploy,
  not a success. Rationale: it is the only motion whose truth does not decay with pricing,
  model choice or agent count, and the `.tape` file is greppable source, so `RDME-R2` can
  assert the terminal text still matches current output. **Not funded in v1** — the panel
  split on whether a demo of the tool *refusing* converts anyone but its author.

---

## Debate digest

| Persona | Model | R1 | R2 | Status |
|---|---|---|---|---|
| Visionary | `claude-opus-4-8` | ✓ | ✓ | **ok** |
| Skeptic | `claude-sonnet-4-6` | ✓ | ✓ | **ok** |
| User-Advocate | `claude-haiku-4-5` | ✓ | ✓ | **ok** |
| Pragmatist | ~~Kimi K2~~ | — | — | **unavailable** — router tool absent in this environment |
| Pragmatist (substitute) | `claude-sonnet-4-6` | ✓ | ✓ | **ok (substitute — duplicate model)** |

Three `ok` voices on three distinct models. Four models were specified so that one model's
blind spots would not be invisible to the panel; with the Pragmatist duplicating the Skeptic's
model, **cost-and-maintenance reasoning and adversarial reasoning share a blind spot here**,
and the reader should discount their agreement accordingly. It is worth noting that they
nevertheless opened at opposite verdicts (PIVOT vs DON'T) and converged.

**Strongest argument FOR.** *(Visionary, R1)* The thesis at `:29-34` — "the proof is
subtraction" — is asserted in prose and violated by the artifact carrying it. Nine mirrors
render a stale roster as current. That is not documentation debt; it is **a correctness bug in
the product's only proof surface**, and fixing it is the one README change that makes the
document survive its own audit.

**Strongest argument AGAINST.** *(Skeptic, R1)* This is the **third** positioning document in
six weeks — `REVIEW-readme-landing.md` (2026-07-29), `BRIEF-story-rewrite-2026-09.md`
(2026-09-07), this one — and **no metric anywhere in the repo** shows that either prior pass
moved anything. Iterating on a document with no feedback loop attached is a hobby, not craft.
The reference class is also wrong: cli/cli documents one verb, bat is `cat` with highlighting,
gum is a widget kit. Subtract the moves the honesty constraint forbids and what remains is
"add a nav bar, front-load install" — not worth a brief.

**What flipped it.** Two concessions, in opposite directions, in Round 2.

1. **The Visionary withdrew his own headline proposal.** On tapes: *"One tape is correct… my
   four was a standing invoice."* On the feedback loop: *"My R1 case implied a design payoff I
   can't measure, and I withdraw it."* The case FOR survived only in its cheapest form.
2. **The Skeptic withdrew his verdict as stated.** *"My R1 target was the document — a third
   positioning artifact with no feedback loop. Stub-plus-check is not a positioning artifact;
   it's a correctness fix plus a CI gate… Calling that DON'T would be dishonest."*

Both landed on the Pragmatist's package, from opposite sides, without being asked to agree.
That is why the recommendation is PIVOT and not a split decision.

**Two things moved the other way in Round 2, and the brief was changed to match.**

3. **The reader rejected the stub outright** — the option the Pragmatist picked and this brief
   had provisionally adopted. *"'Click here for the real version' × 9 screams we abandoned this
   project in nine languages. An English-only README reads as: we're focused. A stub-farm reads
   as: we're half-maintained… that's a reason to cut them, not stub them."* This is the panel's
   only unresolved substantive disagreement, and `RDME-R1` was rewritten to name it as
   **Open question 1** rather than assert the stub.
4. **The Pragmatist raised his own estimate from ~2 to ~4 days** after reading `docs/tapes/ci.tape`
   and re-reading the `a72c839b` precedent — see the tape note under
   [Moves we REJECT](#moves-we-reject-and-why). His Round-1 figure is not the recommendation's
   figure, and the range is carried rather than collapsed to a point.

**The sharpest single exchange** was on whether a VHS tape can lie. The Visionary's R1 claim:
a tape is generated by *running* the path and physically cannot show something unwired. The
Skeptic's R2 answer, which stands: *"every frame is real, but 'real' describes the pixels, not
the selection"* — record five times, publish the clean one — and this repo already has the
precedent in `docs/screenshots/`, captured from a seeded fixture. That exchange is what moved
the tape from funded scope (`RDME-R6`) to conditional.

**Dissent, recorded and unresolved.**

- **The Skeptic does not concede the craft case, only the correctness case.** He accepts the
  ~2 days *"bounded"* and explicitly refuses to extend it: *"I do not extend that acceptance
  to tapes, the goals/alternatives page, or GIF expansion — those are unfunded by any evidence
  presented."* `RDME-R5` (the bullet trim) sits at the edge of that boundary — it is funded here
  on the reader's fatigue report, which is n=1 and simulated. **If the CTO wants a package the
  Skeptic fully endorses, cut `RDME-R5`.**
- **He also correctly caught the Visionary attributing gum's VHS move to mco** — *"which is
  itself evidence the reference-class citation wasn't checked carefully."* The attribution is
  corrected in this brief; the caution about panel citations stands.
- **On n=1.** The Skeptic's R2 position on the reader evidence is adopted verbatim as this
  brief's own stance: it refutes *"no feedback exists at all"* and does **not** refute *"no
  feedback loop exists"*. Use it as a bug list, not as underwriting.
- **The reader also rejected the conditional tape (`RDME-R6`)**, and for the opposite reason
  to the Skeptic's: *"a tape of the tool saying 'no, I refuse' is like demoing a smoke detector
  by pointing out where it won't go off… If anything, a refusal tape makes me wonder: wait, so
  it can't always do the thing?"* The Visionary, the Pragmatist and the Skeptic all converged
  on the gate-pause tape as the one honest visual; **the only persona who is the audience for
  it says it would not work on them.** `RDME-R6` stays out of v1 partly on that.
- **The reader wants a far deeper cut than `RDME-R5`.** Asked which three of eight H2 sections
  to keep: *Numbers measured · Quick start · The three doubts worth having*. Everything else,
  including **Limitations** — which they called the best thing in the README in Round 1 — moves
  to a linked page: *"Limitations moved me Round 1, but that's after you show it works. Demo
  first, honesty second."* Not adopted. It is one simulated reader against a document whose
  differentiation lives in the sections they would cut, and the Skeptic's n=1 caution applies
  to it exactly as it applies to the fatigue report. Recorded because if a second reader says
  the same thing, `RDME-R5` is too timid.
- **On provenance.** The Visionary's R2 reading of why the `$171` was disbelieved —
  *"provenance works when the number is small or the artifact is one click away; a citation
  gesture invites exactly the interrogation the Advocate performed"* — is the reasoning behind
  `RDME-R4`, and it is an interpretation of one reader, not a finding.

---

## Risks & kill-criteria

| # | Risk | Threshold that triggers the stop | Owner · source |
|---|---|---|---|
| **K1** | We demote or delete nine languages that are actually driving discovery | **Read BEFORE `RDME-R1` ships, not after:** GitHub Insights → Traffic shows **≥ 10% of README pageviews on `docs/*/README.md` paths** → Open question 1 resolves to A (stub), not B (delete), and `RDME-X7` returns to the table. Post-ship, the same threshold over 30 days reverses the call | owner: CTO · source: GitHub repo Insights → Traffic (free, no tracking added). **Note the 14-day retention window** — see Open question 2 option B |
| **K7** | The stub reads as abandonment — the reader's Round-2 objection is right, and nine "see English" banners cost us more credibility than nine stale mirrors did | Under option A only: **any** reader-originated comment (issue, discussion, DM) reading the stubs as the project being unmaintained, within 60 days → delete them, which was option B all along | owner: CTO · source: `gh issue list` / discussions, searched for translation mentions |
| **K2** | The check does not stick — it is bypassed or deleted rather than obeyed | `RDME-R2`'s check is skipped via `--no-verify` or removed **within 60 days** of landing → the check is wrong, not the maintainer; rewrite it to assert less | owner: CTO · source: `git log scripts/` + pre-push hook contents |
| **K3** | This was the maintainer marketing to himself for the third time — the Skeptic's charge, conceded as unrefuted | **90 days** after `RDME-R1..R5` land, no reader-originated signal (issue, discussion, DM) references the README's structure or the mirrors → stop funding README work entirely until a real reader complains | owner: CTO · source: `gh issue list` + `gh api .../discussions`, searched for README mentions |
| **K4** | The drift returns anyway, as it did after 2026-07-29 | **any** README in the repo states an agent count disagreeing with `ls agents/*.md` **30 days** after `RDME-R2` lands → the check does not cover what drifts; widen it or delete the mirrors under `RDME-X7`'s alternative | owner: CTO · source: the `RDME-R2` script itself, run manually |
| **K5** | `RDME-R5` (the bullet trim) loses a claim rather than shortening it — the failure mode the honesty constraint exists to prevent | **any** claim present at `README.md:237-280` before the change is not reachable from the README within one link after it → revert `RDME-R5` | owner: CTO · source: diff of `:237-280` against the pre-change text, item by item |
| **K6** | A conditional tape (`RDME-R6`) ships and becomes the thing `docs/screenshots/` was before `a72c839b` — genuine pixels, stale claim | the tape's `.tape` source no longer reproduces matching terminal output at **any** release → pull the GIF, do not re-record from memory | owner: CTO · source: `docs/tapes/*.tape` re-run vs. committed GIF |

---

## Open questions for architect

**1. The nine mirrors: dated snapshot stub, or delete? (This one blocks `RDME-R1`.)**
The panel's only unresolved disagreement, and the two who disagree are the two who should
know: the maintainer's proxy and the reader's.

| Option | Cost | What it buys | What it costs |
|---|---|---|---|
| **A. Dated snapshot stub** — banner naming the English commit/date, link to English, stale count removed | ~1 d `[assumption]` | Keeps nine languages of discovery surface; recurring cost round-trips to zero | The reader's verdict: *"a stub-farm reads as: we're half-maintained… 'click here for the real version' × 9 screams we abandoned this project in nine languages"* |
| **B. Delete all nine**, one line in the English README — "English only for now", plus a translation-welcome issue | ~1 h `[assumption]` | The reader's pick: *"An English-only README reads as: we're focused."* Honest, zero recurring cost, nothing left to drift | Throws away nine languages of search-and-discovery surface for a public OSS tool. Irreversible in effect if not in git |
| **C. Full re-translation** | 4.5–9 d `[assumption]` | Everything works | `RDME-X7`. Dead again in six weeks; the pattern has repeated twice |

**My pick: B, delete.** Three reasons, in order. (1) The reader is the one whose reaction to a
stub actually matters, and he reports it reading as abandonment — a stub does not remove the
signal it was meant to remove, it renames it. (2) Deletion is the only option that leaves
nothing which *could* drift, which is what this whole brief is about. (3) It is nine times
cheaper than the stub and the difference buys `RDME-R5`.

**What would make my pick wrong — and it is a real number, not a hedge:** `K1`. If GitHub
traffic shows meaningful readership on `docs/*/README.md` paths, deletion destroys a working
discovery channel to fix a cosmetic problem, and A becomes correct. **The data to decide this
already exists and nobody has looked** — GitHub Insights → Traffic, free, no tracking. That
should happen before `RDME-R1` ships, and it is a five-minute task, not a project.

**2. What, if anything, do we measure — and do we measure at all?**
This is the Skeptic's unrefuted charge and the CTO's call, not the architect's, but the
architect inherits the consequence.

| Option | Cost | What it buys | What it costs beyond time |
|---|---|---|---|
| **A. Measure nothing; rely on `K3`'s 90-day silence test** | 0 | Nothing new. `K3` still kills the work if no reader ever reacts | Accepts that we will never know if this helped |
| **B. GitHub Insights → Traffic, read manually each month** | ~0.1 d setup `[assumption]` | Per-path pageviews and referrers — enough for `K1` | Free, no code, **no tracking added**. 14-day retention window, so it must actually be read |
| **C. A "questions the README must pre-answer" log — collect every issue/DM asking something the README should have answered** | ~0.1 d + ongoing `[assumption]` | The only signal that names a *defect*, not a number | Requires the maintainer to write things down. Zero if he doesn't |
| **D. Funnel instrumentation** | — | — | **Refused.** Telemetry here is opt-in and off by default `[source: CLAUDE.md, docs/PRIVACY.md]`. Anything on-by-default requires an ADR and would trade the product's own privacy stance for a marketing number |

**My pick: B + C.** B costs nothing and is the only source `K1` can read; C is the only one
that produces a defect list rather than a trend line. **What would make this wrong:** if
GitHub's 14-day traffic retention means `K1`'s 30-day threshold cannot actually be evaluated —
in which case B is decorative and the honest answer is A.

**3. Does `RDME-R6` (the single gate-pause tape) ship, and what makes it honest?**
The panel split three ways. The Pragmatist calls every tape a re-record obligation; the
Skeptic showed that a tape's honesty is about *selection*, not frames; and in Round 2 **the
reader — the only persona who is the audience — rejected the gate-pause tape specifically**,
while still wanting motion of some kind. Three voices designed the honest tape and the fourth
said it would not work on him.

| Option | Cost | Trade |
|---|---|---|
| **A. No tape. Keep `ci.gif` as the only motion** | 0 | The reader's top request goes unmet. Zero new obligation |
| **B. One tape of the gate pause, `.tape` committed, and `RDME-R2` extended to assert the tape's terminal text still matches current output** | ~0.3 d + ~0.1 d of check `[assumption]` | Meets the request in the one form that does not decay. The tape shows the product *refusing*, which may excite only its author |
| **C. A tape of a real run, compressed** | ~0.5 d `[assumption]` | **Rejected** — `RDME-X5`. Compressing a 1h 26m process whose selling point is that it stops removes the stopping |

**My pick: B, but not in v1** — after `RDME-R2` exists, because B's honesty depends entirely
on the check that B would extend. Shipping the tape first inverts that dependency. **What
would make this wrong:** two things, and one is now on the record. If the terminal text of the
gate screen is not stable enough to assert against, B is unmaintainable and the answer is A.
And if a second real reader agrees with our reader that a refusal demo reads as *"so it can't
always do the thing?"*, then B is honest and counterproductive, which is a combination this
brief has no other example of.

**4. If Open question 1 resolves to A (stub), where does the banner get its commit reference?**
Moot under B. Under A, each mirror must name the English commit it mirrors, and the architect
decides whether that is hand-written at generation time or derived by `RDME-R2`.

| Option | Cost | Trade |
|---|---|---|
| **A. Hand-written banner naming a commit sha and date** | ~0 extra | Becomes wrong the moment someone edits a mirror without updating the banner |
| **B. `RDME-R2` derives "English has moved N commits since this snapshot" and fails only past a threshold** | ~0.2 d extra `[assumption]` | Self-maintaining; the banner cannot lie because the check computes it |

**My pick: B.** A banner that can go stale reproduces the exact bug this brief is fixing, one
level up. **What would make this wrong:** if the check's threshold has to be tuned per
language, B is over-engineered for nine files and A plus `K4` is enough.

---

### Handoff note for architect

`archetype: devtools` · `mode: n/a` — **this brief does not hand off to architect.** It
proposes ten file edits and one ~50-line check script, with no data model, no service
boundary, and no cost surface. Under the triage gate in `CLAUDE.md` this is **SIMPLE CODE /
Medium** (2–5 files, low behaviour risk) once Open question 1 is answered, and the honest
route is `senior-dev` → `gate:ship`, not `architect` → `pm`. Running the full pipeline on a
documentation fix would be the pipeline spending a day on the wrong thing — the failure mode
`gate:product` exists to prevent.

**What the CTO must decide before anything starts:** Open question 1 (stub or delete). It is
the only decision here that is expensive to undo, because deletion of nine files is
recoverable in git and irrecoverable in search indexes.

---

### Numbers used in this brief, with provenance

| Figure | Provenance |
|---|---|
| README.md = 329 lines; mirrors = 160–177 lines | `[source: wc -l README.md docs/*/README.md, 2026-09-09]` |
| 70 agents | `[source: ls agents/*.md \| wc -l]` — English `:239` agrees; nine mirrors say 69 |
| Mirrors say 69 | `[source: grep, docs/ru/README.md:26,113 · docs/ja:26,113 · docs/de:26,115]` |
| 0 of 9 mirrors mention `ship-only` | `[source: grep -c 'ship-only' docs/*/README.md]` |
| 0 mentions of harness / cross-review in ru, ja, fr | `[source: grep -ci]` |
| Story rewrite touched 3 hunks, +34 −11 | `[source: git show --stat 122a34c6 -- README.md]` |
| Mirrors last generated 2026-07-31 (`eeabbb86`), last touched 2026-08-28 | `[source: git log -- docs/ru/README.md]` |
| 40 days stale (2026-07-31 → 2026-09-09) | derived from the two dates above |
| `docs/tapes/` holds exactly `ci.gif` (86,812 B) + `ci.tape` (757 B) | `[source: ls -la docs/tapes/]` |
| Reference README sizes: bat 941 · gum 487 · uv 326 · mco 198 · cli/cli 122 lines | `[source: gh api repos/<owner>/<repo>/readme, fetched 2026-09-09]` |
| 1h 26m · $3.40 one feature; median $171 per product; 58–86 quality range | `[source: README.md:106-107 → docs/benchmarks/BENCH-2026-07-batch1.md, dated 2026-07-10]` |
| Screenshots come from a seeded fixture and carry their version | `[source: commit a72c839b]` |
| All maintainer-day figures | `[assumption]` — the Pragmatist persona's estimates, not measurements |
| Reader attention dies at `:237-280`; `$171` disbelieved at `:46-47` | `[source: User-Advocate persona, n=1, simulated — not a user study]` |
