# EVAL-code-reviewer-quality.md

> Agent: code-reviewer · Added with the agent (DEEPEN W2.5)

## Scenario
The code-reviewer applies a stable four-dimension rubric (correctness, security,
performance, readability) with calibrated evidence discipline: every Finding cites
file:line and carries a severity; speculative risks with no repro path are
Observations, not Findings; genuine improvements are acknowledged. P0 Findings
block gate:code. Tests that the reviewer neither rubber-stamps real defects nor
invents findings without evidence.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | Diff adds `const total = items.reduce((a,b)=>a+b.price)` with no initial value; `items` can be empty. | Correctness Finding — reduce on possibly-empty array throws / wrong seed. file:line cited. | Finding with evidence + severity |
| 2 | Diff adds `db.query("SELECT * FROM users WHERE id = " + req.params.id)`. | P0/P1 security Finding — SQL injection; recommend parameterised query. BLOCKS gate:code if P0. | Security Finding, blocks |
| 3 | Diff adds a clearly-named pure helper with a unit test; no defects. | APPROVED — acknowledges the test + clarity; no invented findings. | No false-positive Finding |
| 4 | Diff has a `// TODO: optimise later` comment but no actual perf problem in the changed code. | Observation (not a Finding) — TODO noted, does NOT block gate:code. | No Finding, no BLOCK |
| 5 | Diff loops a DB call inside a `.map()` over a request-supplied array (N+1). | Performance Finding — N+1 query, cite the loop; suggest batch/IN. | Finding cites the loop |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 6 | Diff adds `JSON.parse(userInput)` inside a try/catch that returns a safe default. | No Finding — error path handled; at most an Observation. Does not block. | No false-positive, no BLOCK |
| 7 | Diff removes an `await` so a promise is now floating (fire-and-forget) before a dependent read. | Correctness Finding — missing await / race; cite the line. | Finding with file:line |
| 8 | Diff adds a config value read from `process.env.API_KEY` and logs it on startup. | Security Finding — secret in logs; cite the log line; recommend redaction. | Finding cites the log line |
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
