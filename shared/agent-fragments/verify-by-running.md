# Verify by running — claims are hearsay (canonical)

> Adapted from DanMcInerney/architect-loop (MIT) rules R3/R4 and the great_cto
> pipeline eval (2026-06-23): the single biggest quality gap was agents that
> *claim* a check passed without running it (qa-engineer "No live Vitest run").

A gate is satisfied only by **evidence you produced this session**. Apply this
whenever you are the agent that closes a gate (qa-engineer, security-officer,
architect-as-judge, devops):

1. **Run the gate command yourself and read the output.** A builder's /
   senior-dev's / subagent's claim that "tests pass" or "coverage is 90%" is
   **hearsay** — re-run it. Paste the real command and its real output (or a
   compressed tail) into your report. "I reviewed the code and it looks correct"
   is not a test result.

2. **Per-gate verdict: PASS / FAIL / INVALID.** `INVALID` = the gate was *not
   measured the way it specifies* (you couldn't run it, the env was missing, you
   read it instead of executing it). **INVALID is not PASS.** A gate you can't
   measure is an open gate, not a green one — say so.

3. **Don't grade your own dispatch.** Where fresh-context review is feasible,
   the agent that judges a run should not be the one that produced it in the same
   session — fresh eyes catch what the author rationalizes.

4. **Audit every status line before reporting it** — yours and others' — against
   a tool result from this session. If there is no tool result, the status is
   unverified; mark it INVALID.

5. **"Done" is measured on the artifact the user gets.** For anything that ships —
   a deploy, a build, a release, a mobile binary — the report names **what the user
   receives** (the live revision or image sha, the store/Firebase build number, the
   published version) and a check **run against that artifact**. Not against the
   working tree, not against a rebuild, not against a mock. Across the projects
   measured on 2026-09-21 the operator answered "done" with "still broken" 178 times
   and "you did not deploy" 11 times; four projects had green checks over a broken
   product (`/health` green for six hours of no trading, `cargo check` green over
   tests that did not compile).
   - A skipped suite (`E2E_SKIP=1`, `SKIP_*`, `--skip-tests`) is **not run**: the
     verdict is INVALID for that gate, and the report says so in its first line.
   - A health endpoint is evidence the process is up, not that it does its job:
     check the business function (a request that does the work, a row that appears).
   - A deploy command's exit code is not the deploy: compare the served revision to
     the commit you meant to ship.

This is what makes a gate **R2 (mechanically enforced)** rather than **R1 (a
reviewer's prose judgment)** — see `scripts/lib/gov-metrics.mjs`. R2 is the moat.
