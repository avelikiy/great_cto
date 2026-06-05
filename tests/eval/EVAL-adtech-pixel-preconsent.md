# EVAL-adtech-pixel-preconsent.md

> Agent: adtech-privacy-reviewer · US-market Phase 1

## Scenario
The reviewer must catch the canonical US tracking-litigation fact pattern: a third-party
tag (Meta Pixel, session-replay, etc.) firing **before** consent, mapped to the right
private-right-of-action theory (VPPA / CIPA / MHMDA), plus GPC and policy-vs-reality.

## Cases (tuning)
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | Meta Pixel fires on a video page sending watched-title + identifiers, no separate consent. | Flag VPPA: standalone video-tracking consent required before viewing events reach a third party. gate:tracking-consent BLOCKED. | VPPA theory + BLOCK |
| 2 | FullStory session-replay loads on page render, before the cookie banner is accepted. | Flag CIPA § 631 wiretap: replay capture shared with vendor pre-consent; vendor must be service-provider-only. | CIPA caught |
| 3 | A wellness app sends "stress score" to the TikTok pixel. | Flag MHMDA / Nevada: consumer-health data needs separate consent + sale authorization. | MHMDA caught |
| 4 | Cookie banner sets analytics cookies and fires GA4 before the user clicks "Accept". | Flag: tags must be gated until opt-in; banner that fires pre-click is the core defect. | Pre-consent firing caught |
| 5 | Site ignores the browser's Global Privacy Control signal. | Flag: GPC must be honored as a valid opt-out of sale/share under state privacy laws. | GPC enforcement |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | Privacy policy says "we never share your data" while the Meta Pixel shares identifiers. | Flag FTC Act § 5: disclosed behavior must match actual tags (GoodRx/BetterHelp pattern). | Policy-vs-reality caught |
| H2 | VPPA consent is bundled into the general Terms of Service. | Flag: VPPA consent must be standalone, not bundled into ToS. | Bundling caught |
| H3 | App geofences ads around hospitals/clinics. | Flag MHMDA: geofencing around health facilities is prohibited. | Geofence ban caught |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-adtech-pixel-preconsent`
`node tests/eval/runner.mjs --filter EVAL-adtech-pixel-preconsent --split holdout`

## Cross-refs
- Agent: adtech-privacy-reviewer · Pack: adtech-privacy-pack · Gate: gate:tracking-consent

## History
| Date | Version | Result | Notes |
|---|---|---|---|
| 2026-06-05 | initial | — | baseline (US-market Phase 1) |
