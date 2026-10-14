# ADR-031: Measured multilingual retrieval and optional refinement

**Status:** Proposed; local foundation implemented, not released
**Date:** 2026-10-14
**Deciders:** great_cto maintainer
Tracking: Beads great_cto-uwnt

## Context

This extends [stage context](ADR-026-stage-context-packet.md) and
[review evidence](ADR-030-review-evidence-and-recovery.md). Source base is
ce557759. Existing BM25 recall is local and document-ranked; section scores
select a pointer without changing document order. ASCII tokenization drops
Cyrillic entirely. Existing English golden floors are 11/16 Hit@3 and 5/5
section pointers, not claims of high general retrieval quality.

Inspiration: [Veynrel's report](https://github.com/zinverno/veynrel/blob/483b53532352944d3ff50c1250e935d16dc25257/docs/showcase500-rerank-v1.md).
No source code, assets or dataset are copied. A correct document can expose a
wrong passage, and another model stage can improve or regress ranking.

## Decision

Normalize NFC for lexical tokens, support Unicode letters/numbers/marks and
mixed identifiers, preserve English stopwords and document ordering policy.
This is not cross-language semantic search or semantic negation reasoning.

Measure document recall/nDCG separately from the selected authored passage.
Require full explicit qrels; unjudged and no-answer metrics remain null.
The 12-intent synthetic pilot exercises the machinery, not product uplift or
independent expert ground truth. Expansion to 60–100 real intents requires
source-backed annotation and independent review before any quality claim.

Construct immutable input bindings over project/query/corpus/provider/model,
candidate membership, exact source/text hashes, lines and limits. Provider
payload contains query, authored passages, model and top_n only. Generated
filenames and local IDs are not inserted into passage text. Authored sensitive
content is NOT automatically sanitized. The trusted integration must select
the allowed project corpus; hashes neither authenticate a source nor authorize
disclosure, and global memory must not enter external requests implicitly.

In-memory refinement requires explicit external permission and a fresh binding
before and after await, rejects duplicate in-flight requests, and preserves
baseline after provider errors. Validate a complete finite score permutation;
model relevance is not answer confidence or gate approval. Unknown billing
prevents a second external send in that session. Restart can lose this fence:
this is not a durable billing journal or exactly-once protocol.

## Options considered

| Option | Complexity / cost | Benefit / risk | Decision |
| --- | --- | --- | --- |
| Repair local BM25 and measure passages | Low, no API charge | Fixes known defect; no semantic translation | First |
| Add automatic cloud rerank everywhere | Medium, network and recurrent cost | Unmeasured benefit, disclosure, regressions | Rejected default |
| Manual opt-in rerank over bound candidates | Medium, bounded explicit calls | Comparable before/after; needs journal/authorization | Later integration |
| Replace storage with a vector service | High, operational dependency | No evidence it solves this defect | Not required |

## Delivery and verification

Dependencies and work status are maintained in Beads, not checkbox documents.
The first candidate contains Unicode recall, evaluator/pilot and a pure
refinement session contract using injected fixture adapters. Unit tests cover
stale results, project changes, sparse data, tampering, malformed permutations,
payload limits, duplicate sends and honest null metrics. Existing memory/golden
tests preserve rank floors. Full canonical verification and independent source
review are separate requirements before publication.

The board Docs endpoint currently uses substring search, not this BM25 module.
No new board route or button is shipped by this foundation. An actual manual
provider adapter and UI require project-scoped payload authorization, bounded
transport, durable pre-send reservations/receipts and cost reconciliation.
The OpenRouter [rerank contract](https://openrouter.ai/docs/api/api-reference/rerank/submit-a-rerank-request)
was read; no HTTP request or paid model call was made. Native host comparison
requires the same frozen task/source/acceptance/context budgets and isolated
workspaces. Retrieval metrics must not be presented as host quality uplift.

## Consequences

No new DB, embedding index, API key requirement or dependencies. Local Cyrillic
recall becomes possible. Oversized passages refuse instead of silent clipping;
this can reduce availability until explicit passage splitting is implemented.
Defaults, installed plugins, localhost board and mandatory gates are unchanged.
Cross-language embeddings, provider integration, independent annotation,
live-host outcome comparison, merge/release/install remain unverified.
