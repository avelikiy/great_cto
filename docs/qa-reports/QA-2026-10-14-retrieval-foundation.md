# QA: Multilingual retrieval foundation

Date: 2026-10-14
Scope: Beads great_cto-uwnt, first local foundation
Design: [ADR-031](../adr/ADR-031-measured-retrieval-refinement.md)
Base: ce55775912b2dcf8c667290fe3e030f1edf08764, CLI 3.63.2 source
Status: full frozen candidate gate passed; independent review pending

## Implemented and measured

Unicode NFC tokenization preserves mixed code identifiers and the existing
English stopword policy. Two new regressions failed before repair (6 passed,
2 failed), then passed. Complete memory-search/golden focused suite: 34 passed,
0 failed, 0 skipped. The existing English golden remained 11/16 Hit@3 and 5/5
section pointers before and after. No floor was lowered or query rewritten.
This does not establish cross-language translation or negation reasoning.

Pure refinement contract and pilot tests initially passed 9/9 with no skips.
They cover metadata-free authored outbound sections, all input bindings,
tampering, bounds, sparse arrays, duplicate IDs/indices, finite permutations,
explicit permission, duplicate sends, stale/project-changed replies, provider
refusal, baseline preservation and null unjudged/no-answer metrics. Cost stays
null, never a fabricated zero. Additional freshness-unreadable regression
rejects external sends before transport.

The pilot contains 12 engineering-authored synthetic intents over 12 sources:
10 positive and 2 no-answer. Explicit grades cover every document pair. Its
frozen protocol digest is
`c6acdd1aa263e53bdb93da1d7fef386eb7b891713fd0cbd9c066fc3be7ec0622`.
Observed lexical Hit@1 is 10/10 and mean document nDCG@10 is 0.9843752384;
these easy fixture results are not evidence of general product quality.
The long-document counterexample has document nDCG 1 but answer-bearing count
0 in its sole selected passage. No reranker, embeddings or native hosts ran.
The JSON runner emits corpus/query/qrels/input hashes and local latency, not
source paths or bodies. Output: `/tmp/great-cto-retrieval-pilot-20261014.json`.

## Full canonical candidate verification

`GREAT_CTO_TEST_PLUGIN_DIR` explicitly selected this worktree as the artifact.
Complete `bash scripts/ci-local.sh --e2e` exited 0 at frozen executable candidate
`676e5b83e42e740ce5bd94f470e8b081eb66c71f`:

| Stage | Passed | Failed | NOT CHECKED |
| --- | ---: | ---: | ---: |
| Root/hooks/board | 1432 | 0 | 0 |
| Libraries | 3356 | 0 | 6 |
| Evals | 242 | 0 | 0 |
| Documentation tests | 76 | 0 | 0 |
| Browser scenarios | 16 | 0 | 0 |
| CLI unit tests | 369 | 0 | 0 |
| Archetype e2e | 34 | 0 | 0 |
| Pipeline L1–L5 | 36 | 0 | 9 |

Scanner passed at score 82 (threshold 80), no new baseline/exception; structural,
generated-reference, artifact-lint, import closure and TypeScript build passed.
Fifteen skipped checks remain NOT CHECKED, including native role/model execution,
external notification/deployment and actual operator inventory observations.
Log: `/tmp/great-cto-retrieval-canonical-20261014.log`.

This is candidate-source/artifact evidence, not installed plugin, live-model
comparison, independent review, npm publication or deployment evidence. After
the frozen run, only this QA report changed; documentation/scanner rechecks
are separate and do not imply a second full canonical run at the report commit.

## Remaining boundaries

The corpus is caller-selected and hashes do not authorize disclosure or prove
authorship. Authored sensitive content is not automatically scrubbed.
In-memory fencing is cooperative, not durable financial idempotency; process
restart loses its send state. No actual provider adapter, budget journal or
board Refine button is shipped. The existing board Docs search is substring
based and unchanged. There is no silent conversion of it to semantic search.

Representative real-intent annotation (60–100), independent source review,
provider/UI integration and live matched Claude/Codex outcome experiments
remain separate work. No default, installed plugin, local board, npm version,
merge, release or deployment was changed.
