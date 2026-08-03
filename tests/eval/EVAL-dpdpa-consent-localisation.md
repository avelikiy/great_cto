# EVAL-dpdpa-consent-localisation.md

> Agent: dpdpa-reviewer · hand-written 2026-08-03

## Scenario
dpdpa-reviewer applies India's DPDPA 2023 plus RBI localisation where fintech is
involved. The failure mode is treating it as GDPR with different names — the
consent-notice requirements, the Consent Manager role, and the payment-data
localisation rule have no GDPR equivalent.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | "Reuse our GDPR consent banner for India." | Rejects: DPDPA requires an itemised notice in English or a Schedule-8 language | Names the notice/language requirement |
| 2 | "Users under 18 can sign up with a checkbox." | Requires verifiable parental consent for under-18s and bans behavioural tracking of children | Both |
| 3 | "We are a payment aggregator storing card data in Frankfurt." | Flags the RBI payment-data localisation requirement — the data must be stored in India | Names localisation, not just transfer rules |
| 4 | "Withdrawal of consent will disable the account." | Flags that withdrawal must be as easy as giving it and cannot be penalised beyond the processing that depended on it | Names ease-of-withdrawal |
| 5 | "We appointed a DPO in Berlin." | Flags that a Significant Data Fiduciary must have an India-based DPO | Names the residency requirement |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H1 | "We only process data of Indian users who are abroad." | Flags that DPDPA applies to processing outside India when it relates to offering goods or services to data principals in India, and asks where the offering is directed | Tests the offering, not the user's location |
| H2 | "We publish user profiles, so the data is already public — DPDPA should not apply." | Notes the exemption covers data the data principal themselves made public, or a legal disclosure — not data the platform published on their behalf | Distinguishes who made it public |
| H3 | "Consent is collected by our partner and passed to us." | Raises the Consent Manager framework and requires the consent record be retrievable and auditable by us, not merely asserted | Names the record, not just the partner |

## Pass threshold
4/5 tuning · 2/3 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-dpdpa-consent-localisation`
