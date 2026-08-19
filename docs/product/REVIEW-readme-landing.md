# Product Review — README + landing page (the two surfaces where great_cto is sold)

Review, not a new brief. Findings and a prioritised list of concrete rewrites. Evidence
paths are relative to the repo root; npm numbers pulled 2026-07-29.

The one-line verdict: **both surfaces are well-written and mostly honest, but the headline
proof number describes a single feature and is positioned as the price of a whole product —
a ~50× gap that a skeptical engineer will find in five minutes, because the repo's own
benchmark contradicts it. Fix that first.**

---

## 1. Claim-vs-evidence audit

| # | Claim (surface) | Rating | Evidence / real number |
|---|---|---|---|
| 1 | "34k installs" — hero (landing) | **OVERSTATED** | npm reports *downloads*, not installs. `npx great-cto` re-fetches on every run (README line 162 confirms this), CI and mirrors inflate it. All-time downloads = **40,902** (package created 2026-04-18, so last-year = all-time); last month = **7,828**. Never say "installs" for an npx tool. |
| 2 | "34k downloads on npm" (landing) | **SUPPORTED but stale** | Was ~accurate weeks ago as cumulative downloads; now **~41k**. Keep the word "downloads." |
| 3 | "1h 26m · $3.40" for the traced feature | **SUPPORTED (for one feature)** | /proof → public PR #22 on `avelikiy/great_cto`: a voice-pack compliance module (65-line pack + 200-line reviewer + 4 fixtures). Caveat on the page itself: times "reconstructed from git commit timestamps," cost "estimated ±30%." Real and public — but it is great_cto building *on itself*, not a customer product. |
| 4 | "vs ~$42K traditional / ~170 hours" | **UNVERIFIABLE** | The derivation is on neither /proof nor anywhere in the repo (grep across `docs/` finds it only in README and its translations). 170h implies a ~$247/hr blended rate, unstated. For a 65-line pack + a reviewer file, "170 hours / $42K of traditional work" is not credible on its face and has no shown math. This is the weakest number on either surface. |
| 5 | Receipt used as the price of shipping a *product* (landing juxtaposes "Describe a product. Ship the software." with "$3.40") | **OVERSTATED / MISLEADING** | The repo's own public benchmark `docs/benchmarks/BENCH-2026-07-batch1.md`: 7 completed products, **median API-equivalent cost $171** (range $102–$319), wall time 1h46m–3h25m for clean runs. great_cto's own `PLAN-2026-07-10-public-benchmark.md:77` states the split plainly: "$3.40 for one *feature*; full product ≈ $6–20; ×10 + retries → $60–200 total." A reader sees $3.40 and thinks a product costs $3.40. It costs ~50× that. |
| 6 | "Generated-product quality (measured) 89/100 across all 6 archetypes" (README:95) | **OVERSTATED** | 89/100 is the structural `product-score` harness — README itself hedges "a floor, not deep correctness." The real end-to-end benchmark scored **median 70 (B), range 58–86** (`BENCH-2026-07-batch1.md`). Leading with 89 when your own real runs say 70 is a 19-point gap a critic will weaponise. |
| 7 | "15 industries · 60 products · 6 reusable pipelines" | **SUPPORTED as a catalog** | Landing shows exactly 15 industry cards × 4 = 60, collapsing to 6 archetypes — internally consistent. But "60 products" reads as *delivered inventory*; only 10 were attempted and 7 completed in the benchmark. Internal drift: `BUILD-PIPELINES.md` says "40 target products," README/landing say 60. Frame as "buildable," reconcile 40 vs 60. |
| 8 | "67 agents" (README:94, 201) / "68 agents" (README:167, 381) | **WRONG (understated + inconsistent)** | `ls agents/*.md` = **69**. Three different numbers across one README. Make it 69 everywhere. |
| 9 | "One approval" / "One human gate — you approve the spec" (landing, repeated) | **FALSE under every configuration** | `scripts/lib/approval-level.mjs`: default `gates-only` = `[arch, ship]` = **2 gates**; `product-only` = `[product, ship]` = 2; `auto` = 0; `strict` = 3. **No level produces exactly one gate**, and the default stops at *ship* as well as *arch*. See §2. |
| 10 | "no telemetry by default" (landing, board section) | **SUPPORTED** | `packages/cli/src/telemetry.ts` `isTelemetryEnabled()` defaults to `false`, honors `DO_NOT_TRACK`, skips CI. `docs/PRIVACY.md` confirms. This claim is exactly true — keep it. |
| 11 | "your data never leaves" / FAQ "Where does my data go? Nowhere." (landing) | **OVERSTATED** | True for code and repo, false as written: your prompts go to your LLM provider (Anthropic/OpenAI) by definition; opt-in telemetry sends a ≤256-byte anonymous ping to `telemetry.greatcto.systems`; email alerts route through `greatcto.systems/notify`. "Nowhere" is the single worst-calibrated word on the site. Qualify it (§5, change 5). |
| 12 | "~$34/month (20 pipeline runs)" (README:90, 257) | **PLAUSIBLE, illustrative** | Labeled "indicative" — fair. But it holds for small *features*, not for *building products* ($102–$319 API-equiv each in the benchmark). Mild tension with the "ship products" framing; not a blocker. |

Net: the four claims that cost credibility are **#4 ($42K, unshown), #5 (feature price sold as product price), #6 (89 vs real 70), and #9 (one gate — factually wrong)**. Everything else is either true or a wording fix.

---

## 2. The gate inconsistency — resolve it

Ground truth from `scripts/lib/approval-level.mjs` (`LEVEL_GATES`):

| Level | Gates that stop you | Count |
|---|---|---|
| `auto` | — | 0 |
| `product-only` | product, ship | 2 |
| `gates-only` **(default)** | arch, ship | **2** |
| `strict` | arch, code, ship | 3 |
| `expert` / `step-by-step` | all | 7 |

The landing promises **one** gate ("approve the spec"). Reality: the default stops you **twice**
(architecture *and* ship), and the level whose story matches the landing — "ask me about the
product, decide the technical parts, then let me approve the ship" — is `product-only`, which is
**not** the default.

**Recommendation: change the copy, keep the default.** Two reasons.

1. The ship gate is the one that protects a user from an irreversible production deploy (ADR-009
   reasoning: it escapes the machine and reaches real users). Dropping it to make "one gate"
   true would be *less safe* for a line of marketing. Don't weaken the default to win a
   headline.
2. "Two approvals — you sign what gets built, and you sign what ships" is still a strong,
   honest promise, and it is strictly more trustworthy than a claim the code contradicts.

So: replace "One approval" / "One human gate" with **"Two checkpoints, both yours: approve the
spec, approve the ship — everything between runs unattended."** If you want to keep selling a
literal single decision, expose and name `product-only` on the site as the "one product decision"
mode — but the safe default should stay two gates, and the copy should say so.

---

## 3. Positioning and ICP

| Surface | Reader it addresses | |
|---|---|---|
| README | **The technical solo builder** — explicit: "Built for the one-person engineering org… indie hacker, solo founder, or technical CTO… *Not for multi-dev engineering teams*" (README:137). Clear and consistent. |
| Landing | **Blurred between two people.** The "AI Product Builder" hero + "you approve the spec" speaks to the technical builder. But the 15-industry grid (HVAC, dental, law firms, insurance agencies) plus "the tools *your team* already trusts" reads as if it is selling to the SMB vertical *operator* — who will bounce the moment they hit `npx great-cto init` in a terminal. |

This is a **leak, not a deliberate split**. An HVAC operator does not run Claude Code and does not
approve an architecture spec. The industries grid is answering "what can I build *for* clients,"
but the second-person voice ("Describe *a product*… *you* approve the spec") makes a non-technical
visitor think they are the one clicking. Decide who the buyer is and make the grid clearly a
"products you can ship for these industries," not "industries we sell to."

**One-sentence positioning I'd use (both surfaces):**

> **great_cto is the orchestration layer that lets one technical founder run a whole software
> team — describe a product, approve the spec and the ship, and a gated pipeline of specialist
> agents builds, reviews, and deploys it to a live URL on your own machine.**

It names the reader (technical founder), the mechanism (orchestration layer above the coding
agent, not another coding agent), the honest gate count (spec + ship), and the outcome (live URL,
local). It drops "AI Product Builder" as the lead noun because that phrase is what invites the
non-technical SMB reader who then bounces.

---

## 4. The first 10 seconds

### README
- **Understands:** it is a plugin that builds a real app from a description; there is a bold cost claim in a badge.
- **Doubts:** the badge `1h26m · $3.40 vs ~$42K traditional`. A skeptical engineer's first reaction to "$3.40 vs $42K" is "no" — and they are right to, because the $42K has no shown derivation and the $3.40 was one feature. You can lose the reader at the badge.
- **Highest-leverage change — the savings badge:**
  - BEFORE: `one_real_run · 1h26m · $3.40 vs ~$42K traditional`
  - AFTER: `open benchmark · 7 products · median $171 tokens · 70/100 · reproducible`
  - Why: trades one suspicious data point for a reproducible range the reader can run themselves (`scripts/bench-run.sh`). A defensible median beats an incredible best case.

### Landing
- **Understands:** describe → ship, one approval, 34k installs, open source.
- **Doubts:** "One approval" (too good), "34k installs" (real?), and *what it actually is* — plugin? SaaS? CLI?
- **Highest-leverage change — the hero sub-line:**
  - BEFORE: "One human gate — you, the CTO, approve the spec. Everything after is automated, to a shipped repo and a live URL." + "34k installs"
  - AFTER: "A Claude Code plugin that runs a full build pipeline on your machine — you approve the spec and the ship, specialist agents do the rest, to a repo you own and a live URL." + "41k npm downloads"
  - Why: it says what the thing *is* (a Claude Code plugin, local), states the honest gate count, and fixes the two doubted numbers in one stroke.

---

## 5. What's missing — objections neither surface answers well

A skeptical engineer arrives with these; the surfaces should pre-empt them.

1. **Cost control — "how do I not get a surprise $300 bill?"** The benchmark shows products cost
   $102–$319 in tokens, but the landing headlines $3.40 and the README headlines $34/mo. The
   cost-guard hook, the daily cap, and the pre-flight estimate panel (`/start` Step 2c) are real
   and are the answer — neither surface mentions them. Add one line: "every run shows an estimate
   and stops at a daily cap you set."

2. **"What happens when it gets it wrong?"** The mid-build SPEC-OBJECTION recovery (an agent can
   re-open the gate) is in the README but buried; the landing omits it entirely. A skeptic assumes
   a long autonomous build is finish-bad-or-restart. Say the recovery path on the landing.

3. **Lock-in / "is the output a black box?"** Handled well ("a repo you own, readable, diffable,
   reversible"). Keep it.

4. **Data handling — the one that needs surgery.** "Your data never leaves" / FAQ "Nowhere" is
   over-claimed (audit #11). Your prompts go to your LLM provider — that is the *whole mechanism* —
   and opt-in telemetry plus email alerts have real endpoints. Fix:
   - FAQ BEFORE: "Where does my data go? **Nowhere.** GreatCTO runs locally… No SaaS dashboard, no telemetry by default."
   - FAQ AFTER: "Where does my data go? **Your code and repo stay on your machine.** Your prompts go to your own LLM provider (Anthropic/OpenAI) under your key — that is the only thing that has to leave, and it is governed by their retention terms, not ours. Telemetry is **off by default**; if you turn it on, it is a ≤256-byte anonymous usage ping (`docs/PRIVACY.md`). No SaaS dashboard, no account."
   - Repeat the qualified version everywhere the unqualified "your data never leaves" appears (~5 places). Getting this exactly right is worth more to a security-minded ICP than any superlative.

5. **"How do I stop it?"** No kill-switch story on either surface. Every hook honors
   `GREAT_CTO_DISABLE_<NAME>=1`, gates pause the pipeline, and the daily cap halts spend — say so.
   A reader deciding whether to run an autonomous agent wants the off-switch named before they run
   `init`, not after.

---

## Appendix — smaller fixes worth batching

- Agent count: unify to **69** (README says 67 twice, 68 twice; real = 69).
- "60 products" vs "40 target products" (`BUILD-PIPELINES.md`) — reconcile the catalog size.
- Frame "60 products" as *buildable catalog*, not delivered inventory, everywhere it appears
  bare on the landing.
- README badge and the by-the-numbers table should point at the reproducible benchmark, not the
  single-feature receipt, as the primary proof.
</content>
</invoke>
