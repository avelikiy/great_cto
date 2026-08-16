# PLAN — Style belongs at the boundary; substance belongs everywhere

Source: Kuber Mehta, *Humanising LLM Outputs is Dumb* (2026-08-10). Its thesis
is that stylistic preference belongs in a renderer at the consumption boundary,
not in an agent's operating instructions, because an agent asked to compress
while it works compresses lossily and nobody sees what was dropped.

## First, a correction to my own reading

I told the owner this repository was "applying a humanisation linter to
machine-facing state" and that the fix was a one-line path filter. Checking
rather than asserting shrank that claim twice:

- `SLOP-HEDGE` — the rule I used as the example, because an ADR must be able to
  record real uncertainty — is already **opt-in** and off by default. The
  example was wrong.
- `prose-slop` runs at **push time on committed markdown**, not inside an
  agent's reasoning. That is already a boundary check, which is what the article
  argues for. It is not the target the article describes.

What survives the check is smaller and real: **58 findings across internal
records** — ADRs, ARCH docs, plans, QA and security reports — and nearly all of
them are `SLOP-ADVERB` on single words:

```
docs/security/SEC-execution-claims.md:167   SLOP-ADVERB  "very"
docs/security/SEC-pipeline-gate-reading.md  SLOP-ADVERB  "merely"
docs/adr/ADR-007-board-always-on.md:65      SLOP-ADVERB  "honestly"
```

Two agents also carry style items inside their working instructions:
`qa-engineer` runs the checker on its own report before emitting (after writing,
so not compression-during-reasoning), and `architect` has "no filler bullets, no
em-dash habit?" as a self-review question — which is the article's target,
exactly.

## The distinction worth making

The article's dichotomy is presentation versus internals. Applied here the
useful cut is not by file path but **by rule**, because our rules are two
different things wearing one name:

| Kind | Rules | Where it applies |
|---|---|---|
| **Substance** — a claim the text cannot support | `SLOP-WEASEL` (no source), `SLOP-BRAG` / `SLOP-PASSIVE-BRAG` (achievement language), `SLOP-HEDGE` when asked | **Everywhere.** An unsourced claim in an ADR is worse than in a README: the ADR is the record someone will trust in six months. |
| **Style** — a word a reader would rather not see | `SLOP-ADVERB`, `SLOP-OPENER`, `SLOP-DEAD`, `SLOP-EMOJI-HEAD` | **Presentation only.** A security report saying "merely a warning" is fine; polishing it costs a rewrite of a record and risks changing what it claims. |

Path-based filtering was the wrong axis and I proposed it first. A README can
make an unsourced claim just as easily, and an ADR is allowed to say "very".

## Work

1. `prose-slop.mjs` classifies each rule as `substance` or `style`, and takes a
   `--layer` flag: `presentation` (all rules, today's behaviour) or `record`
   (substance only). Default stays `presentation` — a file whose layer nobody
   declared should be checked as strictly as before, not less.
2. The push hook asks for `--layer record` on paths that are records
   (`docs/adr/`, `docs/architecture/`, `docs/plans/`, `docs/qa/`,
   `docs/security/`, `.great_cto/`) and leaves everything else as it is.
3. `architect`'s checklist keeps the substance question and drops the em-dash
   one — a design review is not the place to audit punctuation.

## What this does not do

- No second representation of docs. The article's databases-and-dashboards
  analogy would have us render records separately for humans; we have one
  `docs/` read by both, and splitting it costs more than the 58 adverbs are
  worth.
- No change to what agents emit. Verdicts, HANDOFF blocks and receipts are
  already machine-facing and structured — the thing the article asks for, which
  this repository arrived at for its own reasons.
- No new rule. This is a smaller change than the one I first described, and
  saying so is part of it.
