---
name: ARCH-stale-after
date: 2026-08-16
stale_after: 2027-02-12
---

# ARCH — `stale_after`: staleness the author declares, not mtime infers

> Reader: the senior-dev who will implement this against `scripts/hooks/artifact-lint.mjs`.
> Implements the plan: [PLAN-2026-08-15-stale-after.md](../plans/PLAN-2026-08-15-stale-after.md).
> Requirements: STALE-R1, STALE-R2, STALE-R3 (mapped in the checklist below).

## Decision (one sentence)

Teach `artifact-lint` to read a frontmatter/inline `stale_after:` date, judge a
document against it instead of its edit-age when present, and report the *basis*
of every freshness verdict so "fresh", "stale", and "unknown / judged by
mtime" are three distinct answers.

## Context / Problem

`artifact-lint` derives freshness from the document's declared date and its age
against `--stale-days` (default 180). A typo fix that re-dates a doc rejuvenates
content that stopped being true months earlier. The plan measured it: of 159
documents, **13 (8%) read fresher than their last substantive edit; worst case
76 days.** Real, small, not an emergency — the change should match that size.

The fix is the OKF idea, narrowly: an absolute `stale_after:` date the author
chooses, compared to today, with no reference to when the file was touched.

## Decision (with the one alternative that mattered)

**Chosen — `stale_after` is authoritative; the existing date-age heuristic is a
*labelled* fallback; absence is its own state.**

Precedence per document:

1. `stale_after` present → compare to `now`. Past ⇒ **stale**, future ⇒ **fresh**.
   Basis = `declared`.
2. `stale_after` absent → fall through to today's behaviour (declared `date:` age
   vs `--stale-days`; or no-date). Basis = `mtime`.

The word "mtime" is the plan's and the house rule's; note the fallback actually
reads the doc's own `**Date:**`/frontmatter `date:` age, not filesystem mtime
(`statSync` is imported but unused in the freshness path today). We keep the
`mtime` **label** because that is the vocabulary the third state is named in;
the code comment says what it really measures.

**Rejected — frontmatter-only, per OKF's literal schema.** OKF puts `stale_after`
in YAML frontmatter. This repo's ADRs and ARCHes carry their date *inline*
(`**Date:** 2026-07-19`), no frontmatter. Frontmatter-only would leave every
existing ADR unable to declare staleness without a structural rewrite. Rejected:
we parse `stale_after` from **both** frontmatter and an inline `**Stale after:**
YYYY-MM-DD` marker — exactly the dual-parse `extractDate()` already does for
dates. Cost is one extra regex; benefit is the field works in the docs we
actually have.

Why this is durable enough to record: it changes how *every* artifact's
freshness is judged repo-wide and interacts with the standing "age ≠ accuracy"
philosophy in `scripts/lib/source-refs.mjs`. Recorded as
[ADR-011](../adr/ADR-011-stale-after-precedence.md).

## The three states (the invariant this feature exists to hold)

| Verdict | When | Basis | Report |
|---|---|---|---|
| **fresh** | `stale_after` in the future, OR no `stale_after` and date-age ≤ threshold | `declared` or `mtime` | no warn; appears in `freshness[]` with its basis |
| **stale** | `stale_after` in the past → `stale-declared`; OR no `stale_after` and date-age > threshold → `stale` | `declared` / `mtime` | WARN, message names the basis |
| **unknown** | no `stale_after` and no date, on a `date:any` type | `mtime` | WARN `no-date`, message: "no stale_after, no date — judged by mtime, freshness unknown" |

Never two states. "Absent `stale_after`" is never silently "fresh forever":
absent falls to the date-age heuristic, which still fires past the threshold
(STALE-R2). A pre-`stale_after` document is judged exactly as it is today — no
document written before the field existed starts failing.

## Components

| File | Change | Responsibility |
|---|---|---|
| `scripts/lib/freshness.mjs` | **create (proposed)** | Pure, zero-side-effect, exported. `parseStaleAfter(text)`, `judgeFreshness({ text, dateType, nowMs })` → `{ verdict, basis, staleAfter, date, ageDays }`. `now` is a parameter — no `Date.now()` inside. |
| `scripts/hooks/artifact-lint.mjs` | **modify** | Resolve one `NOW_MS` from `--now YYYY-MM-DD` / `GREAT_CTO_NOW` / real clock at startup; call `judgeFreshness` in the loop; map verdict→warn kind; add `freshness[]` to `--json`; annotate human report lines with basis. |
| `skills/great_cto/templates/ARCH-default.md` | **modify** | Add `stale_after` to the header block with a non-blank default horizon (STALE-R3). |
| `skills/great_cto/templates/ADR-LLM.md`, `ADR-PROMPT.md` | **modify** | Same — inline `**Stale after:**` line next to `## Status`. |
| The ADR/ARCH/PLAN prose that the architect agent emits | doc note | Architect fills `stale_after` = creation + 180d by default; this ARCH itself dogfoods the field in its frontmatter. |
| `tests/lib/freshness.test.mjs` | **create (proposed)** | Unit-test `judgeFreshness` with injected `nowMs` — no clock, no spawn. |
| `tests/hooks/artifact-lint.test.mjs` | **modify** | Black-box `--now` cases for the three states + precedence. |

No new API, schema, service, dependency, or network call. `freshness.mjs` sits
beside `source-refs.mjs` and is imported the same way.

### Freshness contract (what senior-dev implements verbatim)

```
judgeFreshness({ text, dateType, nowMs, staleDays }) -> {
  verdict: 'fresh' | 'stale' | 'unknown',
  basis:   'declared' | 'mtime',
  staleAfter: 'YYYY-MM-DD' | null,   // parsed from frontmatter or **Stale after:**
  date:       'YYYY-MM-DD' | null,   // existing extractDate() result
  ageDays:    number | null,
}
```

Warn mapping in the lint loop:
- `stale` + `declared` → kind `stale-declared`, msg cites `stale_after` + `now`.
- `stale` + `mtime` → kind `stale` (unchanged), msg cites date + age + threshold.
- `unknown` → kind `no-date` (unchanged) **only** for `date:any`; msg gains
  "— judged by mtime, freshness unknown". `date:optional` types (PLAN, TM) stay
  silent on absence, as today.
- `fresh` → no warn. Still recorded in `freshness[]` so the basis is auditable.

`parseStaleAfter` must be defensive: a malformed date (`stale_after: soon`,
`2026-13-40`) yields `null` → the document falls through to the `mtime` basis.
A bad author date must never crash the linter and must never be read as "fresh".

### `now` injection

`--now YYYY-MM-DD` (and `GREAT_CTO_NOW` env) resolve one `NOW_MS` at startup;
both `ageDays()` and the `stale_after` comparison use it. Default = real clock,
so production behaviour is unchanged. This is the only clock source — tests set
`now` explicitly and assert exact verdicts with no timer manipulation.

## Non-goals

- No adoption of OKF itself, no trust tiers, no `sources:` propagation, no graph
  renderer — the plan's "what this does not do" stands unchanged.
- No filesystem-mtime read. The fallback stays the doc-declared date-age it is
  today; we only add the `stale_after` axis above it.
- Not an error/blocker. Every new signal is WARN-only (see Safeguards).
- No back-fill of `stale_after` into existing docs. Absence is a supported,
  labelled state — that is the whole point of STALE-R2.

## Safeguards (non-negotiable)

- [ ] **Warn-only.** No new ERROR kind; `--enforce` exit code is unchanged. This
      repo already learned a guard that cries wolf gets worked around; a wrong
      `stale_after` judgment must never block a push.
- [ ] **Defensive parse.** Malformed `stale_after` → `null` → `mtime` fallback,
      never a crash and never a false "fresh" (the control's inverse risk is a
      declared date that *masks* a stale doc; parse failure must fail toward
      "judge by mtime", not toward "fresh").
- [ ] **Injected `now`.** No `Date.now()` inside `judgeFreshness`; the sole clock
      is the resolved `NOW_MS`. Every state is testable without a clock hack.
- [ ] **Backward compatible report.** `freshness[]` is additive; existing
      `{ checked, staleDays, errors, warns }` consumers keep working.

## Security

Low surface. Input is a date string authored by a repo contributor in a
committed markdown file — trusted origin, but parsed as untrusted: the regex is
anchored, matches only `\d{4}-\d{2}-\d{2}`, and a non-match is discarded rather
than coerced. No network, no filesystem write, no secret, no PII, no privilege
boundary crossed. The one abuse worth naming is self-inflicted: an author
setting `stale_after` far in the future to silence review — acceptable, because
it is a visible, committed, blame-able choice, which is strictly better than
mtime silently doing the same thing invisibly.

## Risks

- **R1 — basis confusion.** "mtime" labels a date-age heuristic, not fs mtime.
  Mitigation: code comment + this ARCH state the real measure; label kept only
  to match the house-rule vocabulary.
- **R2 — template default rots.** A hardcoded default date in templates ages.
  Mitigation: templates carry `stale_after: {creation + 180d}` as an instruction
  the filling agent computes, not a frozen literal.
- **R3 — split parsing drift.** `stale_after` parsed in `freshness.mjs` while
  `date` is parsed by `extractDate` in the linter. Mitigation: keep both in
  `freshness.mjs` if convenient, or unit-test both against the same fixtures so
  they cannot diverge silently.

## Requirements Checklist

> qa-engineer verifies each against the proposed `tests/lib/freshness.test.mjs`
> and the existing `tests/hooks/artifact-lint.test.mjs`.

- [ ] **REQ-1 (STALE-R1):** with `stale_after` present, `judgeFreshness` uses it
      over date-age — future ⇒ `fresh`/`declared`, past ⇒ `stale`/`declared` —
      regardless of the doc's edit date. Tested via injected `now` both sides of
      the date.
- [ ] **REQ-2 (STALE-R2):** with no `stale_after`, verdict = today's date-age
      result with `basis: 'mtime'`; a doc with neither field on a `date:any` type
      warns `no-date` (unknown, not fresh); a pre-field doc that passes today
      still passes. `basis` is present on every `freshness[]` entry so the report
      names which rule judged it.
- [ ] **REQ-3 (STALE-R3):** ARCH-default, ADR-LLM, ADR-PROMPT templates carry a
      non-blank `stale_after` with a default horizon; a fixture template renders
      the field for the author to fill.

## Definition of Done

`node --test tests/lib/freshness.test.mjs tests/hooks/artifact-lint.test.mjs`
green; `node scripts/hooks/artifact-lint.mjs` on this repo prints a basis for
every freshness line and exits 0; the three named templates contain
`stale_after`.

## Cost Estimate

No new cloud components — no cost delta.
