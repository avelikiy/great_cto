# PLAN — Vertical expansion: 10 new service-autopilots

Status: in progress · Owner: founder · Created 2026-06-07

Build 10 new service-autopilot verticals beyond the current 6 (rcm, legaltech, procurement,
accounting, msp, tax). Each follows the proven pattern and runs on the v2.43.0 safety engine
(`reversible` + `blastRadius` + accountable `owner`; irreversible action gated behind a human).

## Why these 10 (research-backed, US market, 2024–2026)

Ranked by: large displaceable-labor spend × a legally-required named human signer (the moat) ×
regulatory hooks × startup whitespace.

| # | Slug | Autopilot | US market (displaceable) | Human who signs the risky call | Reviewer |
|---|---|---|---|---|---|
| 1 | `prior-auth` | Prior-authorization autopilot | $35–56B admin spend | Plan medical director (denial) | prior-auth-reviewer (new) |
| 2 | `aml` | KYC/AML compliance autopilot | $61B compliance spend | BSA/AML Officer (SAR filing) | aml-bsa-reviewer (new) |
| 3 | `soc` | Managed-SOC / MDR autopilot | ~$4–6B, +20% CAGR | SOC analyst (containment) | soc-mdr-reviewer (new) |
| 4 | `insurance` | Claims & underwriting autopilot | ~$36–38B labor | Licensed adjuster/underwriter | insurance-reviewer (reuse) |
| 5 | `mortgage` | Mortgage-underwriting autopilot | ~$40B origination cost | DE underwriter (clear-to-close) | lending-credit-reviewer (reuse) |
| 6 | `title` | Title & escrow autopilot | $16.2B premiums | Licensed title/escrow officer | title-escrow-reviewer (new) |
| 7 | `credentialing` | Provider-credentialing autopilot | ~$1.2B redundancy + svc | Credentialing committee | credentialing-reviewer (new) |
| 8 | `collections` | Debt-collection / AR autopilot | $13.5→16.1B | Collections manager / attorney | collections-reviewer (new) |
| 9 | `freight` | Freight-brokerage autopilot | $19–125B | FMCSA-licensed broker | freight-broker-reviewer (new) |
| 10 | `cro` | Clinical-trial-ops autopilot | ~$20–28B US | PI / medical monitor | clinical-trials-reviewer (reuse) |

## Architecture (per vertical) — same as the 6 shipped

`flows/<slug>.flow.json` is the single source of truth. The 6-step shape, every time:

0. **intake** — agent · reversible · low blast (read/pull)
1. **core work** — agent · reversible · low (draft/compute/classify)
2. **compliance check** — agent · reversible · low (the reviewer's domain rules)
3. **HUMAN GATE** — the named signer
4. **irreversible execution** — agent · `reversible:false` · high blast (file/bind/disburse/contain) — ALWAYS after the gate
5. **monitor / follow-on** — agent · reversible · low

This guarantees `validateFlow` (v2.43.0) ships green: every irreversible action is preceded by a
human checkpoint, and every autopilot names an accountable owner.

## Connectors

~33 new connector specs added to `scripts/lib/connectors.mjs` (status `stub`), reusing live ones
where the function overlaps so each new vertical inherits some live coverage on day one:
- `aml` reuses **sanctions-screen** (live), **kyb**
- `prior-auth` / `cro` reuse **ehr-fhir** (live), **payer-rules**
- `title` / `freight` reuse **e-signature** (live)
- `insurance` / `title` / `collections` reuse **payment-rails**
- `mortgage` reuses **doc-intake**; `soc` reuses **psa-ticketing**

## Build steps

1. Plan (this doc).
2. Connectors catalog additions + reused-vertical tagging.
3. Generate 10 `flows/*.flow.json` from a spec (guarantees schema + safety invariant).
4. Reviewer agents — 7 new (parallel), 3 reused.
5. Site: `VERTICAL_ICON` + `STARTUP_DOMAINS` + homepage ICON maps; regenerate 16 autopilot pages + hub + homepage strip; deploy.
6. README autopilots table (now 16 rows).
7. Tests: flow-count 6→16, vertical lists, `validateFlow` green for all 16; full lib suite passes.
8. CHANGELOG + release.

## Acceptance criteria

- `node scripts/lib/flow-runner.mjs <slug> --validate` → ✓ safe for all 16.
- All lib tests pass; flow-count test = 16; every shipped vertical pauses at its gate.
- Site shows 16 autopilots with live/stub connector badges, irreversible-step flags, accountable owner.
- No market-facing quality numbers (internal only), per positioning.

## Out of scope (follow-ups)

- Live connector adapters for the new verticals (start keyless like rcm did across waves).
- Per-vertical eval suites (Tier-0/Tier-1) for the scorecard.
- TM-templates per new reviewer.
