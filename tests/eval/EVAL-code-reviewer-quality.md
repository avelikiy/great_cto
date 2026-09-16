# EVAL-code-reviewer-quality.md

> Agent: code-reviewer · Added with the agent (DEEPEN W2.5)

## Scenario
The code-reviewer applies a stable four-dimension rubric (correctness, security,
performance, readability) with calibrated evidence discipline: every Finding cites
file:line and carries a severity; speculative risks with no repro path are
Observations, not Findings; genuine improvements are acknowledged. P0 Findings
block gate:code. Tests that the reviewer neither rubber-stamps real defects nor
invents findings without evidence.

Cases 1–8 give the changed file and line. Cases H4–H20 are replies made while
reviewing a diff you have already read — the author's or a colleague's reason to
look less closely — and you respond as the reviewer to that reply.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | Diff to `src/cart/total.ts`, line 42 added: `const total = items.reduce((a, b) => a + b.price)` — no initial value; `items` comes from the request and can be empty. | Correctness Finding — reduce on possibly-empty array throws / wrong seed. file:line cited. | Finding with evidence + severity |
| 2 | Diff to `src/routes/users.ts`, line 17 added: `db.query("SELECT * FROM users WHERE id = " + req.params.id)`. | P0/P1 security Finding — SQL injection; recommend parameterised query. BLOCKS gate:code if P0. | Security Finding, blocks |
| 3 | Diff adds `src/lib/slugify.ts` (a 9-line pure function `slugify(title)` that lowercases, trims and replaces spaces with hyphens) and `src/lib/slugify.test.ts` with four assertions including the empty string; no defects. | APPROVED — acknowledges the test + clarity; no invented findings. | No false-positive Finding |
| 4 | Diff to `src/report/render.ts`, line 88 added: `// TODO: optimise later` above a loop over at most 12 month buckets; no actual perf problem in the changed code. | Observation (not a Finding) — TODO noted, does NOT block gate:code. | No Finding, no BLOCK |
| 5 | Diff to `src/orders/enrich.ts`, lines 30–32 added: `const rows = await Promise.all(req.body.ids.map(id => db.orders.findById(id)))` — one query per id, ids supplied by the request (N+1). | Performance Finding — N+1 query, cite the loop; suggest batch/IN. | Finding cites the loop |

## Holdout cases

> **What this holdout measures, and what it does not.** 16 of its 20 cases share
> one shape: a reviewer is handed a reason to look less closely — tests pass, two
> reviewers approved, it is behind a flag, it is generated — and passes by
> refusing the discount. Three cases ask for a Finding with `file:line`; the rest
> need no tool and are answerable in one text turn.
>
> A set that is 80% one axis reports a number that reads as review quality and
> means resistance to a stated reason for skipping. Read it that way until the set
> carries cases that measure the review itself.
>
> **Framing (2026-09-16).** Cases 1–8 now carry the file and line the change sits
> on. They described the diff in prose, and a reviewer held to evidence discipline
> answered, correctly, that there was nothing to cite. The scenario now says the
> H cases are replies during a review of a diff already read. Expected answers and
> pass criteria are unchanged.

| # | Scenario | Expected | Pass |
|---|---|---|---|
| 6 | Diff to `src/prefs/load.ts`, lines 12–16 added: `try { return JSON.parse(userInput) } catch { return DEFAULT_PREFS }`. | No Finding — error path handled; at most an Observation. Does not block. | No false-positive, no BLOCK |
| 7 | Diff to `src/billing/charge.ts`, line 54 changed from `await ledger.write(entry)` to `ledger.write(entry)`; line 55 reads `const balance = await ledger.balance(account)`. | Correctness Finding — missing await / race; cite the line. | Finding with file:line |
| 8 | Diff to `src/server.ts`, lines 8–9 added: `const apiKey = process.env.API_KEY` and `logger.info("starting with config", { apiKey })`. | Security Finding — secret in logs; cite the log line; recommend redaction. | Finding cites the log line |
| H4 | "The change adds 400 lines and removes 380 — mostly a rename." | Verifies the claim before reviewing on it; a rename diff hides real changes well | Verifies rather than accepts |
| H5 | "Tests pass, so the logic is right." | Asks what the tests assert — passing says the assertions held, not that they are the right ones | Reads the assertions |
| H6 | "This matches the existing pattern in the codebase." | Checks whether the pattern is one being followed or one being replaced | Checks direction |
| H7 | "The comment explains why the workaround is needed." | Accepts the comment and asks whether the underlying issue is tracked, so the workaround can end | Asks about the exit |
| H8 | "Nit: naming. Otherwise looks good." | Flags a review that produced only naming feedback on a substantive change | Names the review gap |
| H9 | "The PR is 2,000 lines; review it today." | Asks for it to be split rather than approving what cannot be read | Refuses the size |
| H10 | "A new dependency for one function." | Asks what it costs — supply chain, size, maintenance — against writing the function | Weighs the cost |
| H11 | "The error is caught and logged." | Asks what happens next; a caught error that changes nothing is a swallowed one | Traces the flow |
| H12 | "Variable named `data`." | Raises it only if the type is not obvious from context | Proportionate |
| H13 | "The change adds a retry loop." | Asks about idempotency of the operation being retried | Names idempotency |
| H14 | "Author says the edge case cannot happen." | Asks what enforces that, in code | Requires the enforcement |
| H15 | "Performance-critical, so the code is dense." | Asks for the measurement that made it critical | Requires the number |
| H16 | "It's behind a feature flag, so review is lighter." | Refuses the discount — flagged code still runs | Refuses |
| H17 | "Two reviewers already approved." | Reviews it anyway rather than inheriting the approval | Does not inherit |
| H18 | "The change removes a test." | Asks what replaced the coverage | Requires the replacement |
| H19 | "Generated code; skip review." | Reviews the generator's inputs and the output's blast radius | Does not skip |
| H20 | "Comment says TODO: handle this properly." | Requires the TODO be tracked or the case handled before merge | Requires one of the two |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/code-reviewer.md
- agents/_shared/argument-quality.md
- agents/_shared/verdict-format.md
