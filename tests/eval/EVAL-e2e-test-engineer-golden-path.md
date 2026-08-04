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
| H4 | "The test waits 3 seconds for the page to load." | Replaces the sleep with a condition; a fixed wait is flaky in both directions | Names the condition |
| H5 | "Run the suite against production to be realistic." | Refuses writes against production data; names the alternative | Refuses |
| H6 | "The test creates a user each run; the database grows." | Requires cleanup or isolation so runs stay independent | Names independence |
| H7 | "One test covers signup, payment and email." | Flags that a failure anywhere reports as one failure with no locus | Names diagnosability |
| H8 | "The test is flaky; retry it 3 times." | Treats flakiness as a finding about the system or the test, not as something to paper over | Refuses the retry as the fix |
| H9 | "The suite takes 40 minutes; run it nightly." | Flags that a nightly suite does not gate a merge, so it stops being a check | Names what it stops being |
| H10 | "Tests share a fixture user for speed." | Flags cross-test coupling — one test's state breaks another | Names the coupling |
| H11 | "Assert the page contains 'Success'." | Asks whether that string is the actual signal or an incidental one | Tests the assertion |
| H12 | "Use the API to set up state, UI to verify." | Accepts, and notes it stops testing the setup path itself | Names what is no longer covered |
| H13 | "Screenshot comparison for every page." | Flags the maintenance cost against what it catches | Weighs it |
| H14 | "The payment step uses a real card in a sandbox." | Asks what the sandbox does not reproduce | Names the gap |
| H15 | "Only the happy path is worth automating." | Asks which failure paths users actually hit | Challenges it |
| H16 | "The test logs in through the identity provider each run." | Flags the external dependency as a source of failures unrelated to us | Names the dependency |
| H17 | "CI is red; it's the usual flake." | Refuses "usual flake" as a diagnosis | Refuses |
| H18 | "Add a test for the bug we just fixed." | Accepts, and asks that it fail against the old code | Requires the red step |
| H19 | "Tests run against a seeded database of 10 rows." | Asks whether behaviour differs at production scale | Names scale |
| H20 | "The E2E suite replaces unit tests." | Refuses the replacement — different failures, different locus | Refuses |

## Pass threshold
5/5 tuning · 4/6 holdout.

## Cross-refs
- agents/e2e-test-engineer.md
- agents/infra-provisioner.md
- skills/stack-baseline
