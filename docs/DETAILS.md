# The details the README used to carry

Everything here is current; it moved out of the README because a first-time
reader does not need it to decide whether to try the tool. Linked from the
README's Documentation section.

## Critics before the plan

The most expensive bugs are not in the code — they are in decisions made before
coding starts. Three critic agents run before the Plan stage, at the three
positions where a mistake costs the most:

| Critic | Catches |
|---|---|
| **Architecture critic** | coupling that rules out multi-tenancy later · "obvious" O(n²) on real-scale data · circular dependencies between bounded contexts |
| **Spec critic** | "we solved the wrong problem" — the worst class of bug, because no unit test catches it · misaligned acceptance criteria · scope that was never agreed |
| **Schema critic** | `NOT NULL` without a default on a 50M-row table · missing `CONCURRENTLY` on index creation · irreversible migrations with no rollback path |

## Jurisdiction detection

`npx great-cto init` scans three signal sources — README keywords, infra region
strings (Terraform, `.env` `AWS_REGION=`, docker-compose `TZ=`), and
`package.json` homepage TLD — and auto-detects which of **12 jurisdictions**
apply:

| Jurisdiction | Signals (README + infra) | Frameworks | Reviewer |
|---|---|---|---|
| `eu` | gdpr · eu users · nis2 · eu ai act · `eu-west-*` · `.de` TLD | GDPR · EU AI Act · NIS2 · ePrivacy | `gdpr-reviewer` |
| `us-ca` | ccpa · cpra · california residents · do not sell | CCPA / CPRA | `us-privacy-reviewer` |
| `uk` | uk gdpr · information commissioner · dpa 2018 | UK GDPR · DPA 2018 | `gdpr-reviewer` |
| `in` | dpdpa · india users · rbi data localisation | DPDPA 2023 · RBI | `dpdpa-reviewer` |
| `br` | lgpd · anpd · brazil users | LGPD | `gdpr-reviewer` |
| `au` | privacy act 1988 · oaic · notifiable data breach | Privacy Act 1988 · CDR | `us-privacy-reviewer` |
| `sg` | pdpa · pdpc · mas guidelines · singpass | PDPA · MAS TRM | `us-privacy-reviewer` |
| `ca` | pipeda · quebec law 25 · casl · `ca-central-*` | PIPEDA · Quebec Law 25 · CASL · OSFI B-10 | `us-privacy-reviewer` |
| `jp` | appi · japan users · my number · `ap-northeast-1` | APPI 2022 · PPC Guidelines · FISC | `us-privacy-reviewer` |
| `cn` | pipl · mlps · china users · `cn-north-*` | PIPL 2021 · DSL 2021 · MLPS 2.0 · CBDT | `gdpr-reviewer` |
| `kr` | pipa korea · isms-p · kisa · `ap-northeast-2` | PIPA · ISMS-P · FSC | `us-privacy-reviewer` |
| `us` | ftc · us users · virginia cdpa · texas tdpsa | FTC Act · US state privacy laws | `us-privacy-reviewer` |

Word-boundary matching prevents false positives (`india` does not match
`indiana`). The result is written to `PROJECT.md` as `jurisdiction: [eu, us-ca]`
and gates the matching reviewer on every feature. Override it there manually.

Beyond GDPR/PCI/HIPAA, reviews cover SEC cyber-disclosure (8-K Item 1.05),
CMMC 2.0 / NIST 800-171 for defense contractors, US AI governance (NIST AI RMF ·
Colorado SB 205 · Utah/Texas AI), web-tracking litigation (VPPA · CIPA ·
Washington MHMDA), and HMDA / SR 11-7 model risk for lending.

## Cost, itemised

Indicative for a solo-CTO project at ~20 pipeline runs a month:

| Pipeline | Cost/run | Runs/mo | Total |
|---|---|---|---|
| quick (config / typo) | $0.10 | 10 | $1 |
| quick (new endpoint) | $1 | 6 | $6 |
| standard (feature) | $5 | 3 | $15 |
| deep (cross-cutting) | $12 | 1 | $12 |
| | | | **~$34** |

The board's **Usage** screen (Tools → Usage) shows Claude Code and Codex side by
side for the **selected project only**: tokens per day and kind of work, heaviest
conversations, models, tools, skills, agents, cache share and recorded limit
refusals. Attribution uses the transcript's working directory and Git repository
identity, including linked worktrees, never its conversation title. Children
without a working directory inherit their parent's project. Unattributed logs
are excluded rather than guessed; missing observations are not proof of no use.
Account-wide subscription quota percentages are deliberately not shown as
project usage. Switching projects clears old data immediately; background
responses and caches are project-scoped. Unknown project identifiers return an
error, not another project's statistics.

Below the usage totals, the same selected project supplies agent verdicts
(pass, stopped, failed, ended without a verdict), Beads bugs (filed, open now,
time to close), guard refusals and hook failures. Global verdicts enter this
view only when explicitly tagged with the selected project's identifier.
Dollars are the API list-price equivalent, not a subscription bill.

You pay your own LLM provider. No per-seat fee, no SaaS. Routine triage
auto-routes to a cheaper model (~5× lower cost) for a 60–80% reduction on
log clustering.

## The second opinion, made unavoidable

A cross-model review has shipped for a while: `scripts/lib/cross-model-review.mjs`
sends the diff to a model from another family — Codex, or OpenRouter — and writes
one line per review to `.great_cto/cross-review.log`, each carrying the `sha` of
the tree it read. It runs when somebody remembers to run it.

That is the shape this pipeline has already measured. An instruction that depends
on the model remembering held at 18%; removing the remembering took it to 92%.

So there is now a Stop hook, `scripts/hooks/cross-review-gate.mjs`, that will not
let a turn end on a diff no second model has read. It does not run the review
itself — a Stop hook holds the turn open while it works, and a Codex run is
measured in minutes. It reads the log, joins a line to the current `HEAD` by that
`sha`, and blocks with the command that clears it.

Four states, and only one of them ends the turn quietly:

| the log says | the gate does |
|---|---|
| a line joins this tree, verdict `PASS` | nothing — the turn ends |
| a line joins this tree, verdict `BLOCK` | blocks, naming the findings and the P0 count |
| no line joins this tree | blocks once: nothing has read this diff |
| lines exist, none can be joined | blocks once: they predate the join key, and are neither a pass nor a verdict |
| no second opinion is declared | nothing — declaring `none` is a decision, not an omission |

**It is off unless you turn it on:** `GREAT_CTO_CROSS_REVIEW_GATE=1`. A gate that
runs a second model at the end of every turn spends your money without being
asked, and can loop one model against the other until a rate limit stops it.
OpenAI's own Codex plugin ships the same idea and warns about exactly that. It
also blocks a given diff **once** — a hook that can refuse to end the turn
forever is a hang, not a guardrail.

Two documents govern how this product describes itself, both approved at
`gate:product` on 2026-09-07:
[BRIEF-story-rewrite-2026-09](product/BRIEF-story-rewrite-2026-09.md) — what the
landing and the README may claim, and the five claims removed because nothing in
the repository could prove them — and
[DESIGN-story-rewrite-2026-09](design/DESIGN-story-rewrite-2026-09.md), which
governs how those two surfaces look and how a figure is allowed to appear on
them. The cross-provider harness those claims are measured against is described
in [SPRINT-2-CROSS-PROVIDER](testing/SPRINT-2-CROSS-PROVIDER.md).

## CI integration

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci` detects `$GITHUB_ACTIONS` and emits `::error file=...,line=N::`
annotations inline on PR diffs. Exit codes: 0 clean / 1 findings / 2 setup error.

## Email alerts

Five events that need you within two hours get emailed — no Resend account, no
API keys; delivery routes through `greatcto.systems/notify` (free, 100
emails/24h per verified address). Setup: board → Settings → Email alerts → verify your
email → pick triggers.

| Trigger | When |
|---|---|
| P0 incident | a P0 task opens in any project |
| Gate stale > 2h | a `gate:ship` has been waiting on you for hours |
| Security BLOCKED | `security-officer` rejected a merge |
| Budget alert | monthly LLM spend crosses 80% / 100% of budget |
| Weekly digest | Friday 09:00 — shipped, spent with its provenance, QA |

## Test pyramid

Structural + state-machine tier runs in under 2 minutes for $0
(`node --test tests/*.test.mjs`); the real-LLM tier (archetypes × 4–8 stages,
plus pack overlays and domain reviewers) runs on demand via OpenRouter for
~$5–10. Breakdown: [docs/testing/](testing/).

## Example: three products, one pipeline

Same command, different product — the build archetype shapes the stack:

| | Dispatch app | Class-booking app | Profitability dashboard |
|---|---|---|---|
| Archetype | CRUD vertical-SaaS | Booking / scheduling | Dashboard / analytics |
| Stack | Next.js · Postgres · shadcn | Next.js · Postgres · cal | Next.js · warehouse-lite · charts |
| Integrations | Auth · RBAC | Stripe · Twilio | source connectors |

The 6 pipelines: [greatcto.systems/pipelines](https://greatcto.systems/pipelines) ·
all 26 archetypes: [ARCHETYPES.md](ARCHETYPES.md).

## When it asks you

One setting in `.great_cto/PROJECT.md` decides where the pipeline stops:

| `approval-level` | Stops you at | Stops |
|---|---|---|
| **`ship-only`** | **the deploy — and briefs you on what gets built** | **1** |
| `product-only` | what we build · whether it ships | 2 |
| `gates-only` *(default)* | what we build · the design · the deploy | 3 |
| `strict` | the design · code review · the deploy | 3 |
| `auto` | nothing in the pipeline | 0 |

Counts are pipeline stops. Every level also carries one guard that is not a
process choice: importing data over existing records stops you at **every**
level, `auto` included, because that one destroys what was there.

**`ship-only` is the minimum that is still honest.** One stop — the deploy, the
only decision whose consequence leaves your machine. The *what gets built*
decision does not vanish, because a pipeline that spends a day on the wrong thing
is the expensive failure: it arrives as one screen in your console, printed once,
before the build starts.

```
ABOUT TO BUILD — say nothing and this proceeds, say something and it stops.

  What gets built:  the offline-first checkout; ship the queue before the UI
  Why:              reliability wins this segment, not features
  Stop if:          under 20% of orders are created offline after four weeks
  Left open:        which conflict rule for a re-submitted order

  Full brief: docs/product/BRIEF-checkout.md
```

Silence is consent, and the screen says so. If the brief cannot be read, the gate
comes back — "I could not show you" is never delivered as "you were shown and
said nothing".

`gates-only` gained the product gate in v3.0.0. It used to stop on *how* to build
and *whether* to release, and never on *what* to build — the decision that is
wrong for six stages before anyone finds out. It costs one pause per **product**,
not per feature: `product-owner` is an entry point and runs only from `/start`.

A regulated archetype — fintech, healthcare, gov — keeps its security,
compliance and ship gates **at every level, including `auto`**. A lighter level
delegates judgement; it never skips compliance. Full table: [docs/GATES.md](GATES.md).

## Four things it refuses to say

The same rule, in the four places it costs something to keep: **a thing that did
not happen must never look like a thing that did.**

| When | What is easy to show | What it shows instead |
|---|---|---|
| A second opinion is declared but its harness is missing | *off* | **`unavailable`** — declared and unreachable is not a choice you made |
| A check ran and could not decide | *pass* | **`unverifiable`** — and the stage does not proceed on it |
| A run's cost was never measured | **`$0.00`** | **`unmeasured`** — and budgets do not fire on it |
| A stage was assessed by nobody | *0* | **`null`** — a pass rate divides by what was actually assessed |

Each of these is a place where the honest answer is longer, uglier, and harder to
build than the confident one. That is the whole product.

The proof is subtraction. v3.27.0 and v3.27.1 deleted this project's own
favourable numbers — "cost savings vs FTE", a spend comparison against a human
team, a projected month — because none of them could be shown to be true.

## The three doubts worth having

**“I can't trust code I didn't watch being written.”**
Neither do we, so nothing is taken on an agent's word about itself. Each stage is
checked against what it actually produced — do the named files exist, do the
frozen acceptance criteria pass when run, and only then is a separate model asked
whether each requirement is addressed. Where that check cannot tell, it returns
`unverifiable`, which is **not** a pass.

**“It will spend money while I sleep.”**
Per-agent budgets decline to dispatch past their cap and name the number. A run
whose cost could not be measured reads `unmeasured` and holds nothing — a limit
firing on a number nobody measured is worse than no limit, and a confident
`$0.00` for unmeasured work is how a spend goes unnoticed.

**“And then I'm locked in.”**
One command to install, MIT, running on your machine against your own LLM
account. Delete great_cto and the repository it built is still yours — ordinary
Next.js, Postgres and Stripe that any engineer can pick up.

## What makes it different

- **Specialists, not a generalist** — 72 agents with narrow jobs and their own
  review gates, instead of one assistant that types faster than it thinks.
  [The roster →](reference/agents.md)
- **Critics before code** — architecture, spec, and schema critics run before
  planning, where a mistake still costs hours instead of days.
- **Scope enforced at write time** — an agent physically cannot touch files
  outside its brief. Not flagged at review; refused at write.
- **QA that distrusts itself** — critical paths written as Gherkin before test
  code, then mutation testing asks whether the suite would catch anything at all.
- **Memory across sessions** — decisions, lessons, and promoted patterns persist
  per project and globally; an interrupted run resumes knowing which stages ran.
- **Cost you can see** — per-agent spend, estimate-vs-actual drift, and
  cost-per-accepted-change on the board, not in a spreadsheet.
- **Spending caps that refuse** — `agent-budgets:` in PROJECT.md caps what a
  stage may spend; the pipeline declines to dispatch past it and names the
  number. An estimate never refuses — see the table above.
- **A stage is checked before the next builds on it** — files named by the
  verdict must exist, frozen `## ACCEPTANCE` criteria must pass when run, and
  only then is a second model asked whether each requirement is addressed.
  Cheapest question first, and three answers rather than two: `verified`,
  `rework`, or `unverifiable`. An agent that claims nothing and freezes no
  criteria is reported — otherwise the cheapest way to pass is claiming nothing.
- **Work goes back, and the return has a ceiling** — a failed stage returns
  `REWORK` with the findings quoted and the same agent fixes it; `BLOCKED` means
  a human must decide. After three passes it becomes the human's problem, because
  two machines handing work back and forth do not get bored.
- **Quality kept apart from what happened** — the verdict says what a run did, a
  *score* says how well, in its own append-only store by a different actor at a
  different time. Scorers may disagree, and every score names who made it.
- **Silence is recorded** — the dispatcher writes what it decided to
  `.great_cto/pipeline-runs.jsonl`, *including when it decided nothing* and why.
  Every pipeline defect found this year hid in the gap between "nothing should
  happen" and "nothing could happen".

Everything runs locally, MIT-licensed, on your own keys. Your code stays on your
machine; prompts go to your LLM provider and nowhere else. Telemetry is
**off by default** ([docs/PRIVACY.md](PRIVACY.md)).

## Limitations

- **Not a hosted app builder** — it does not replace your coding agent; without
  one there is nothing for it to orchestrate.
- **For one builder** — a solo founder or CTO. Two or more engineers sharing the
  pipeline have outgrown it.
- **Not a CI/CD system** — gates run locally; you still merge through GitHub Actions.
- **Not certification-audited** — PCI/HIPAA/SOC2 scaffolds are starting points,
  not certifications.
- **Not deterministic** — LLM output. Gate verdicts deserve a sanity check.
- **Spend is measured, attribution is not yet per-agent** — cost is read from
  the host's own session transcript rather than from an agent's self-report, so
  the tokens are real. But the transcript the hook is handed covers the session,
  not one subagent, so a run's cost can be attributed to whichever stage finished
  last — inflated by orders of magnitude. Treat per-agent figures as a ceiling
  until this is fixed. A stage with no measurement at all still shows
  `unmeasured` rather than a confident `$0.00`, and budgets do not fire for it.

## Codex: the controlled host and the second reviewer

The supported pipeline path is the separate controller shipped by the npm CLI:

```bash
npx --yes great-cto@3.47.0 codex-host doctor
npx --yes great-cto@3.47.0 codex-host start --dir "$PWD" --prompt "build the feature" --allow src,tests,docs
npx --yes great-cto@3.47.0 codex-host resume <run-uuid>
```

Since 3.47.0 the controller can also assign graph roles to both installed CLIs with
`--routes qa-engineer=claude-code,security-officer=codex` on `start`. Those independent
join roles inspect one snapshot at the same time; the controller applies their
validated, non-overlapping proposals sequentially and keeps the existing
verifier and human gates. Claude Code must be authenticated. See the
[mixed-host contract](HOST-CODEX.md).

It routes the shared graph through controlled Codex role profiles, applies only
validated text proposals, runs an independent verifier, preserves the run cursor
outside the worker repository and enforces human gates. Optional operator-owned
policies add offline Docker checks and approval-bound local or GitHub Release
publication with byte verification and recovery. The boundary is deliberate:
this is a controlled host runtime, not emulation of native Codex hooks, arbitrary
shell deployment, npm publishing or service activation. See the
[Codex host guide](HOST-CODEX.md) and
[support contract](CODEX-SUPPORT-CONTRACT.md).

**Two harnesses, one review.** Independently of the controlled host, Codex can
also be the **second opinion** for a Claude Code run. From inside Claude Code it
reads the same diff, and each
review line carries the `sha` of the tree it read, so "reviewed" can be proven
about *this* diff rather than asserted. The log holds **4 lines so far, 1
carrying a sha**; no catch-rate is claimed from that, and none should be.

Since 3.26.0 Codex takes part in the pipeline as that second reviewer. Declare it once:

```yaml
# .great_cto/PROJECT.md
capabilities:
  second_opinion: codex      # or: openrouter · none
```

and on every high-stakes change the Claude `code-reviewer` and **`codex exec`**
(read-only sandbox, your Codex login, no API key) review the **same diff at the
same time**. Findings merge; a P0 from either side blocks; where they disagree,
both sets reach the human at the gate — the stricter one sets the verdict, and
nobody averages. The board's **Harness** screen detects Codex, holds the choice,
and shows beside it what the second opinion *did*: every run, including skipped
ones, from `.great_cto/cross-review.log`. Four states, and the fourth is the
point — *declared but unavailable* is never shown as *off*.

How much it helps is measured there, not asserted here. What the log holds so
far: the first real Codex review — of the commit that wired Codex in — found a
P1 that the author and the test suite had both missed; the review of the fix
found nothing. Two runs is evidence of the mechanism, not a rate. The rate is
the card's job.
