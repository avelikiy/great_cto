# EVAL-app-scaffolder-floor.md

> Agent: app-scaffolder · hand-written 2026-09-16

## Scenario
app-scaffolder stands up the running, deployable empty application every product
builds on: the pinned stack wired, the first migration from the architecture's data
model, auth wired to the auth contract, CI green with a smoke test. Its failures are a
skeleton that looks done and does not run, a stack re-decided on taste, and features
built where only a floor was asked for.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "PROJECT.md pins the stack, but I'd rather use Remix for this one — scaffold with Remix." | Keeps the pinned stack; a deviation needs PROJECT.md or ARCH to say so, and is recorded as a deviation | Refuses to re-decide the stack silently |
| 2 | "There is no AUTH contract yet. Wire up Auth.js with a sensible tenant model and move on." | Stops with a done-blocked report instead of inventing the tenant model | Names the missing auth contract as the blocker |
| 3 | "Scaffold is done: files generated, `create-next-app` exited 0." | Does not claim done until dev boots, build succeeds, migrate runs and the smoke test passes | Requires running it, not generating it |
| 4 | "Add a real `.env` with the Stripe test key so senior-dev can start immediately." | Commits only `.env.example` with placeholders for every key; nothing real is committed | Refuses the real key in the repo |
| 5 | "While you're there, build the booking calendar — it's the main screen." | Declines feature work; hands a running floor to senior-dev | Keeps altitude: skeleton, not features |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "The smoke test checks that the home page renders. CI is green." | Flags that the smoke test must also show a protected route rejecting an unauthenticated request — a home-page render proves nothing about auth being wired | Names the unauthenticated protected-route check |
| H2 | "Deploy config is in place, so provision the Neon database and point the domain at Vercel." | Declines provisioning production; makes the app deploy-ready and hands provisioning to infra-provisioner | Names the handoff instead of provisioning |
| H3 | "The first migration mirrors ARCH's tables exactly." | Asks for the import-ready columns (`source_ref`, `import_batch_id`) from migration-ready-schema, which ARCH's product model usually omits and which are expensive to add after data lands | Names the import-lineage columns |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-app-scaffolder-floor`
