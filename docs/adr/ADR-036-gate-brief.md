# ADR-036: One brief per gate — what the approver is actually approving

**Date:** 2026-10-19
Status: Accepted — implemented (great_cto-jtto)
Deciders: great_cto maintainers

## Context

A gate is a beads task titled `gate:<name>` (`scripts/lib/gate-state.mjs:69`).
The board approves it through `POST /api/gates/:id` with a token bound to a tree
receipt (ADR-024, `packages/board/lib/gate-tokens.mjs`). Everything the approver
needs to judge the change already exists, but in six places:

| Evidence | Where it lives today |
|---|---|
| What changed | `treeReceipt` (`scripts/lib/receipt.mjs:91`), `/api/receipt` |
| How risky the change is | `classify` T0/T1/T2 (`scripts/lib/change-tier.mjs:62`), `/api/change-tier` |
| Whether undo is expensive | `reversibilityOf` (`scripts/lib/gate-reversibility.mjs:91`) |
| What reviewers said | `.great_cto/verdicts/*.log`, `latestApproval` (`receipt.mjs:354`) |
| Second model | `secondOpinionForTree` (`scripts/lib/second-opinion-for-tree.mjs:22`) |
| Which parts of the system | `systemMap` (`scripts/lib/system-map.mjs:103`), only on the docs page |

The inbox shows a title, a reversibility chip and a "Claude / ? Codex" cell
(`index.html` `reviewerCells`). To approve with understanding, the operator
opens the diff in a terminal and reads verdict logs by hand — or approves on the
title. The human's job shifts from writing code to understanding what the
agents produced; the gate is where that understanding has to happen, and today
it has no page.

## Options and decision

| Option | Benefit | Cost / risk | Decision |
|---|---|---|---|
| Agents write a prose summary into the gate bead | Cheap | The summary is the author's own claim — the thing the gate exists to check | Rejected |
| Generate a static HTML report per gate | Shareable | A second source of truth that goes stale when the tree moves | Rejected |
| A read-only projection over existing evidence, one route + one panel | Nothing new is trusted; stale is detectable | Has to say "unknown" honestly where evidence is missing | **Chosen** |

## Contract

`GET /api/gates/:id/brief` returns a pure projection. It never approves, never
writes, and does not change the token, the binding or the guarded-name rule.

```
{ gate, moved, sections: [
    { key: 'tree',      state: 'recorded'|'unknown', moved, changed, added, removed },
    { key: 'change',    state: 'recorded'|'unknown', files, total, tier },
    { key: 'risk',      state, reversibility, categories, why },
    { key: 'reviews',   state, verdicts: [{agent, verdict, ts, onThisTree}] },
    { key: 'second',    state, provider, verdict, p0 },          // as secondOpinionForTree
    { key: 'touches',   state, containers: [{name, files, tests}] } ] }
```

Rules that carry the weight:

- **Unknown is not pass.** A section whose source could not be read is
  `unknown` with the reason, never an empty list (failed read ≠ empty). A
  source that was read and holds nothing — no verdict recorded — is `empty`,
  and the page says "nobody has looked", not "no findings".
- **Bound to the tree.** The receipt stored with the gate's token is compared
  with the tree now (`compareReceipts`). If it moved, the brief says so first,
  before any section.
- **A verdict counts only for this tree.** `onThisTree` is true only when the
  verdict's receipt matches; older verdicts are shown greyed, not counted.
- **No new dependency.** `touches` is a table (container → files → affected
  tests via `affected-tests.mjs`). No Mermaid library joins the zero-dep board;
  the diagram is a later slice if the table proves insufficient.
- Heavy reads run in `receipt-read-worker.mjs` (mode `touches`: the tree plus
  the test mapping, which walks the repository), off the request thread, like
  `/api/receipt` today. The evidence reader runs at most two workers, so the
  route reads sequentially.

## Delivery

1. `scripts/lib/gate-brief.mjs` — pure function over injected readers; unit
   tests per section incl. unreadable sources and a moved tree.
2. Route + inbox panel "Brief" next to the approve button. An HTTP test on a
   real board and tree: the change, an empty review column, a moved tree, no
   write. A Playwright test: the panel opens, survives an inbox refresh, closes,
   and sends no write.
3. Not in scope: diagrams, LLM-written summaries, any change to who may approve.

## Consequences

- The approver sees one page per gate; an empty reviewer column becomes visible
  as `unknown` instead of looking like silence.
- Cost: one route, one module, one panel. No new state, no migration.
