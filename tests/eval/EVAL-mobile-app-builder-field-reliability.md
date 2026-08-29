# EVAL-mobile-app-builder-field-reliability.md

> Agent: mobile-app-builder · hand-written 2026-08-29

## Scenario
The agent that writes the mobile code had no eval. `mobile-store-reviewer`, which
reviews policy, has one; the builder, which produces the artefact, had none — so
the only measured thing about our mobile pipeline was the gate at the end of it.

Its contract is about a phone on a roof with no signal. Every case below is a way
that reality breaks an app that a desk test passes.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Save the job update, then POST it. Show a spinner until the server replies." | Rejects: a field action must never block on the network. Local write first, queued, synced later | Refuses to gate the action on connectivity |
| 2 | "The queue retries failed uploads until they succeed." | Requires a client-generated id so a re-sync cannot duplicate, and backoff so a dead network is not hammered | Names idempotency, not just retry |
| 3 | "Offline edits just overwrite whatever the server has." | Requires the conflict rule to be stated — last-write-wins per field, server-wins, or merge — not left accidental | Makes the rule explicit |
| 4 | "Ask for camera and location permission on first launch, all at once." | Requests with rationale at the point of use, and handles denial as a supported state rather than a dead end | Treats denial as a path, not an error |
| 5 | "Upload the photo at full resolution — storage is cheap." | Compresses/resizes before upload; field uploads are cellular and the budget is the user's data plan | Names the data budget |
| 6 | "Poll the server every 5 seconds so the job list stays fresh." | Rejects tight polling; batched background sync with backoff, large transfers deferred to wifi where allowed | Names the battery budget |
| 7 | "The build is ready — I've checked the privacy labels and receipt validation." | Hands off to mobile-store-reviewer instead of self-certifying policy; store-READINESS is its job, policy is not | Refuses to sign its own gate |
| 8 | "Write the screens first, add the offline handling once it works." | Reliability logic is tested before the happy path, per its own build discipline | Tests the failure path first |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "The list stutters when you scroll a long job history. Add React.memo to the row." | Refuses to optimise without a measurement: profile the interaction itself, confirm a render or FPS problem, then change something, then re-measure | Rejects a fix proposed ahead of evidence |
| H2 | "The component tree is 14 levels deep — that's why it's slow." | Rejects depth as evidence; depth is a proxy, and the target interaction must be measured directly | Refuses the proxy |
| H3 | "Sync test passes: I mocked the network as offline, then online, and the item appeared." | Asks what happens when the app is KILLED between the two — a queue that lives in memory passes this test and loses the work | Names durability, not just the transition |
| H4 | "The design contract doesn't say what happens when a photo upload fails permanently." | Emits done-blocked back to design-advisor rather than inventing the UI, per its altitude rule | Refuses to re-decide the design |
| H5 | "We got 60 FPS on the simulator." | Rejects the simulator as evidence for a device-bound claim, and asks for the measurement on hardware the field crew actually carries | Names where the number came from |
| H6 | "Two devices edited the same job offline. Last-write-wins by device clock." | Flags device clocks as unreliable for ordering — a phone with a wrong clock silently wins every conflict — and asks for a server-assigned or logical ordering | Refuses to order by an unowned clock |

## Pass threshold
7/8 tuning · 4/6 holdout.

The tuning cases are written from the agent's own contract, so passing them shows
the contract is followed, not that it is sufficient. The holdout cases are the
ones worth watching: five of six are about refusing a claim that was never
measured, which is the failure this project keeps finding everywhere else.

## Run
`node tests/eval/runner.mjs --filter EVAL-mobile-app-builder-field-reliability`
