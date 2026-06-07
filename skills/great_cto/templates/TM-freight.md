# TM-freight-{slug} — Freight-Brokerage Threat Model

**Owner:** freight-broker-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Brokering freight is a federally licensed activity; the dominant failure mode is **brokerage
> liability** — a booked load is a binding contract and tendering to an unvetted carrier invites
> double-brokering, fraud, and cargo loss. This model forces a licensed-broker sign-off into the pipeline.

## 1. Scope
- Pipeline: shipper's load → carrier match → quote → book / rate confirmation → tender → track-and-trace → documents (BOL/POD) → cargo claims
- Autonomy: suggest-to-broker (assistant) · autonomous-above-confidence (autopilot)
- Authority: MC number · BMC-84 bond on file …
- Lanes: interstate · intrastate · modes (FTL/LTL/intermodal/reefer) …
- Setting: brokerage of record · co-brokerage …

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| FMCSA broker authority (active MC) | | unlawful to arrange transport without it |
| BMC-84 surety bond ($75k) / BMC-85 trust | | shipper/carrier recourse; must not be exhausted |
| Carrier vetting via SAFER (authority/insurance/safety/identity) | | the highest-risk path |
| Double-brokering / carrier fraud | | cargo theft, re-brokering, non-delivery |
| Carmack Amendment (cargo loss/damage liability) | | claim chain shipper→broker→carrier |
| DOT recordkeeping (per-transaction) | | parties, rate, carrier, amounts, retention |
| No rebrokering without authorization | | core double-brokering harm; never autonomous |
| Binding commitments (rate confirmation / booking) | | financial commitment above threshold |

## 3. Carrier-vetting → SAFER-pull evidence trace (the fraud defence)
| Check | Source | Present? |
|---|---|---|
| Active operating authority | FMCSA SAFER / L&I | |
| Insurance on file (cargo + liability) | FMCSA / certificate | |
| Safety rating / out-of-service status | SAFER | |
| Identity match (MC/DOT ↔ contact, not a spoof) | cross-check | |

## 4. Edits & guardrails
- Carrier vetting must pass before tender is possible, traceable to the SAFER pull: …
- Binding rate confirmation only after vetting passes; rate commitments above threshold gated: …
- No autonomous rebrokering / re-tender without explicit authorization: …
- Carmack cargo-claim window tracking + uninsured-carrier exposure check: …

## 5. Autonomy boundary
- Confidence floor below which a load escalates to a licensed broker: …
- High-risk paths always escalated (binding rate commitment above threshold, carrier-vetting exception, cargo claim, any rebrokering): …
- Broker-of-record audit trail (who/what tendered each load): … (composes with service-autopilot audit trail)

## 6. Recordkeeping & bond
- Per-transaction DOT record (parties, rate, carrier, amounts paid) retained: …
- Active MC + intact BMC-84 bond monitoring (not silently exhausted): …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:broker-signoff` — licensed freight broker signs off below the confidence floor and on every high-risk path.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
freight-broker-reviewer-verdict: signed-off | blocked
broker-authority: [mc-number | bond-on-file]
lanes: [interstate | intrastate | modes]
high-risk-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Carrier vetting (active authority + insurance + safety + identity) passing before tender
  - Vetting result → SAFER-pull evidence trace (the fraud defence)
  - Binding rate confirmation only after vetting passes; rate commitments above threshold gated
  - No autonomous rebrokering / re-tender without explicit authorization
  - Carmack cargo-claim window + uninsured-carrier exposure check
  - Per-transaction DOT recordkeeping; active MC + intact BMC-84 bond
  - Confidence floor → licensed-broker sign-off (gate:broker-signoff)
gate: gate:broker-signoff
