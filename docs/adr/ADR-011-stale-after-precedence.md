# ADR-011: Declared `stale_after` beats edit-age; absence is a labelled state, not "fresh"

**Status:** Proposed (implements STALE-R1..R3)
**Date:** 2026-08-16
**Context doc:** [ARCH-stale-after.md](../architecture/ARCH-stale-after.md) · [PLAN-2026-08-15-stale-after.md](../plans/PLAN-2026-08-15-stale-after.md)

## Context

`scripts/hooks/artifact-lint.mjs` judges document freshness by the doc's declared
date and its age against `--stale-days`. A typo fix re-dates a document that
stopped being true months earlier — measured at 13 of 159 docs (8%), worst case
76 days. This decision fixes *how freshness is judged*, which touches every
linted artifact, so it is recorded rather than left implicit in the diff. It also
sits next to the standing "age is not accuracy" principle in
`scripts/lib/source-refs.mjs`, and must not contradict it.

## Decision

1. A frontmatter or inline `stale_after: YYYY-MM-DD` is **authoritative**: the
   document is stale on/after that date, compared to an injectable `now`, with no
   reference to its edit-age.
2. When `stale_after` is **absent**, freshness falls through to today's date-age
   heuristic — unchanged — and the report labels the basis `mtime`. Absence is
   never silently "fresh forever": the heuristic still fires past the threshold,
   and a doc with neither `stale_after` nor a date reads as **unknown**, not fresh.
3. There are **three states, never two**: `fresh`, `stale`, and `unknown / judged
   by mtime`. Every freshness line in the report names which rule judged it.
4. Every new signal is **WARN-only**; no new ERROR kind, `--enforce` unchanged.

## Alternatives Considered

- **Frontmatter-only, per OKF's literal schema** — rejected: this repo's ADRs and
  ARCHes date themselves *inline* (`**Date:**`), no frontmatter. Frontmatter-only
  would exclude every existing ADR from declaring staleness. We accept `stale_after`
  from frontmatter **and** an inline `**Stale after:**` marker (the dual-parse
  `extractDate()` already uses), for one extra regex.
- **Replace mtime with `stale_after` outright** — rejected: it would make every
  pre-field document (all of them) instantly undeclared, and either fail them or
  silence freshness entirely. Keeping the labelled fallback preserves today's
  behaviour for undeclared docs.
- **Make staleness an ERROR under `--enforce`** — rejected: a freshness signal is
  a judgment call, and this repo already learned that a guard which cries wolf
  gets worked around. WARN-only keeps it honest and un-gamed.

## Consequences

- **Positive:** authors can pin a real review horizon; a cosmetic edit no longer
  hides expiry; the report distinguishes a confident verdict from an inferred one.
- **Negative:** two freshness axes (`stale_after` vs date-age) to keep coherent;
  the `mtime` label names a date-age heuristic, not filesystem mtime — a comment
  and the ARCH carry that caveat.
- **Risks:** an author can silence review by dating `stale_after` far out — but
  visibly, in committed blame-able frontmatter, which beats mtime doing it
  invisibly. Malformed dates must parse to `null` and fall to `mtime`, never to
  "fresh".
