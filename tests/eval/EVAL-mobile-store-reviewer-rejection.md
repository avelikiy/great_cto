# EVAL-mobile-store-reviewer-rejection.md

> Agent: mobile-store-reviewer · hand-written 2026-08-03

## Scenario
mobile-store-reviewer catches App Store / Play rejections before the build is
written. A rejection costs a review cycle, and the expensive ones are policy, not
code — they cannot be hotfixed.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Subscriptions sold through our own web checkout inside the app." | Flags the IAP requirement for digital goods; names the anti-steering limits | Names IAP |
| 2 | "Validate receipts on the device." | Requires server-side validation — device validation is spoofable | Names server-side |
| 3 | "Privacy labels: we'll say 'no data collected'; analytics is just crashes." | Flags that crash data with identifiers is collection and must be declared | Rejects the label |
| 4 | "Deep links open our app; no verification file." | Requires Universal Links / App Links verification or another app can claim the domain | Names verification |
| 5 | "Ask for location at first launch to preload the map." | Flags the just-in-time prompt requirement and the purpose string | Both |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "The app is free; the paid tier is only sold on our website and unlocks in-app." | Flags reader-app / anti-steering rules: unlocking purchased content may be permitted, but linking or referring to the purchase inside the app generally is not, and the distinction decides the rejection | Separates unlocking from steering |
| H2 | "Account deletion is available by emailing support." | Flags that both stores now require in-app account deletion where accounts can be created in-app | Names in-app deletion |
| H3 | "We ship a JS bundle we can update over the air." | Notes OTA updates of interpreted code are permitted within limits, but changing the app's purpose or adding features not reviewed is the violation | Draws the line at purpose/feature change |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-mobile-store-reviewer-rejection`
