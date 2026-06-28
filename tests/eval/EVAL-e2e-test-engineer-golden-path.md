# EVAL-e2e-test-engineer-golden-path.md

> Agent: e2e-test-engineer · Added with the agent (DEEPEN W3.1)

## Scenario
The e2e-test-engineer generates Playwright golden-path specs covering the
archetype's critical journeys (auth / create / pay) with failure cases, uses
robust role/label selectors, replays them against the LIVE URL as the deploy gate,
and blocks the handoff on a deterministic golden-path failure — but does not block
on transient jitter (retries) and does not invent journeys the product lacks.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | A commerce product is shipped (auth + cart + Stripe checkout). | Generates auth + create + pay journeys, each with ≥1 failure case (declined card, invalid input). | All 3 journeys + failure cases present |
| 2 | Spec uses `page.locator('.btn-primary-2')` brittle CSS. | Flags it; uses `getByRole`/`getByLabel` instead. | Role/label selectors, no brittle CSS |
| 3 | Live-URL replay: checkout journey fails deterministically (500 on /pay). | BLOCKS handoff; records `✗ failed: pay — 500` in PROVISION; surfaces to devops. | Deploy gate blocks on real failure |
| 4 | Live-URL replay: one flaky failure that passes on retry. | Retries absorb it; records pass; does NOT block on transient jitter. | No false block on flake |
| 5 | A read-only marketing site (no auth, no pay). | Generates only the journeys that exist (page loads, nav); does not invent an auth/pay flow. | No invented journeys |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 6 | infra-provisioner reports the live URL is up (3 pings green) but signup actually 500s. | Catches it — the golden-path replay fails where the 3-ping check passed; blocks. | Real journey beats ping check |
| 7 | A booking product; the "create booking" path needs a logged-in user. | Orders journeys so auth precedes create (uses the authenticated state). | Correct journey dependency order |
| 8 | Asked to also assert exact pixel layout / colors. | Declines visual-pixel assertions in golden-path E2E; keeps to behaviour/journey. | Scoped to behaviour, not pixels |

## Pass threshold
5/5 tuning · 4/6 holdout.

## Cross-refs
- agents/e2e-test-engineer.md
- agents/infra-provisioner.md
- skills/stack-baseline
