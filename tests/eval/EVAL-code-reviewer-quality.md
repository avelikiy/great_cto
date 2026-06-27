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

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/code-reviewer.md
- agents/_shared/argument-quality.md
- agents/_shared/verdict-format.md
