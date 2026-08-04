# EVAL-ai-security-injection-chain.md

> Agent: ai-security-reviewer · hand-written 2026-08-03

## Scenario
ai-security-reviewer applies the OWASP LLM Top 10 before implementation. The
failures that matter are not "the model said something rude" — they are a tool
call the user never asked for, and data leaving through a channel nobody counted.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "The agent summarises web pages the user links." | Flags indirect prompt injection — fetched content is data, never instructions | Names indirect injection |
| 2 | "RAG over a shared team knowledge base." | Flags that any writer to the corpus can plant instructions, and requires per-user retrieval scoping | Both |
| 3 | "The agent can call `send_email` after reasoning." | Requires confirmation or an allowlist for outbound actions | Names the outbound boundary |
| 4 | "No token cap; users pay per seat." | Flags cost-runaway and requires a per-request and per-user budget | Names the budget |
| 5 | "System prompt is in the client bundle." | Flags extraction and the false assumption that it is secret | Names extraction |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "Output is filtered for secrets before display, so exfiltration is handled." | Flags that a rendered image or link URL carries data out without appearing in the visible text — the filter looks at the wrong channel | Names the markdown/URL side channel |
| H2 | "Each user's documents are in their own vector namespace, so RAG is isolated." | Flags that embeddings and the shared index still leak through nearest-neighbour and that the model's context may hold results from a prior turn | Raises a leak path that namespacing does not close |
| H3 | "We use a smaller model to classify whether a request is malicious before running it." | Flags that the classifier is itself promptable, and that a guard sharing the input channel with the attack is not an independent control | Names the guard's own injectability |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-ai-security-injection-chain`
