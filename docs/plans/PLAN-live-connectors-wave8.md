# PLAN — Live connectors Wave 8: every vertical goes live + domain "brains"

Status: in progress · Created 2026-06-07

Goal: give **all 16 verticals ≥1 live connector** and add the real domain "brain" where it's a
deterministic engine. Follows the established keyless-live pattern (real/public source or
deterministic real generation by default; POST/fetch the real provider when env creds are set) —
same as Waves 1–7 (FHIR, NLM, NCCI, 837, DocuSign, Plaid, OFAC, RMM, tax-engine).

## 8 new live adapters

Close the **5 zero-live** verticals + 3 easy public/deterministic wins:

| # | Vertical | Connector | What becomes real (keyless default) | Real provider when keyed |
|---|---|---|---|---|
| 1 | soc | `threat-intel` | deterministic IOC scoring + abuse.ch/URLhaus-style enrich | VirusTotal / GreyNoise |
| 2 | insurance | `fraud-score` | deterministic claims-fraud indicator model → score + reasons | Shift / FRISS |
| 3 | mortgage | `aus` | DU/LPA-style eligibility engine (DTI / LTV / FICO codified) | Fannie DU / Freddie LPA |
| 4 | credentialing | `primary-source` | OIG LEIE / SAM exclusion screen (public list) + license validation | NPDB / state boards |
| 5 | collections | `comms-outreach` | Reg F 7-in-7 + TCPA 8a–9p window + cease/opt-out guardrail | Twilio |
| 6 | freight | `carrier-vet` | FMCSA SAFER vetting (authority / insurance / safety) | FMCSA QCMobile API |
| 7 | prior-auth | `um-criteria` | medical-necessity matcher (CMS NCD/LCD-style ruleset) | MCG / InterQual |
| 8 | aml | `sar-filing` | FinCEN SAR (Form 111) deterministic generation | FinCEN BSA E-File |

After Wave 8: **16/16 verticals live.** soc / insurance / mortgage / credentialing / collections go 0→1.

## Adapter contract (each `scripts/lib/connectors/<name>.mjs`)

- exports `capabilities` array + `async call(op, payload)` returning `{ ok, data | error }`.
- deterministic + network-free by default (unit-testable); hits the real provider only when its env
  var/URL is set, else returns the deterministic result with a `note`.
- the "brain" connectors (fraud-score, aus, um-criteria, comms-outreach, sar-filing) are real
  domain logic; the "lookup" connectors (threat-intel, carrier-vet, primary-source) default to a
  curated public slice and call the live source when keyed.

## Integration (central, after adapters land)

1. register each in `scripts/lib/connectors.mjs` `LIVE_ADAPTERS` (lazy `() => import()`).
2. flip each connector's `status` → `live-ready`.
3. add `DEMO_INPUTS` in `flow-runner.mjs` so `flow-runner.mjs <v> --live` exercises it.
4. tests in `tests/lib/flow-runner.test.mjs`: per-adapter behaviour + `hasLiveAdapter` updated.
5. `flow-runner.mjs <v> --live` for all 16 → confirm the new live connectors fire.

## Acceptance

- `hasLiveAdapter` true for all 8 new ids; 16/16 verticals exercise ≥1 live connector.
- All lib tests pass. Site live/stub badges auto-update (generator reads connector status).

## Follow-ups (not this wave)

- prior-auth scored NEEDS-WORK (79.75) on the internal scorecard — tune its reviewer/flow (recall/gate).
- Deepen second-order connectors (siem/edr live read, policy-admin rating, eligibility-match).
