# TM-patent-{slug} — Patent-Prosecution Threat Model

**Owner:** patent-reviewer  |  **ARCH:** docs/architecture/ARCH-{slug}.md  |  **Date:** {YYYY-MM-DD}  |  **Verdict:** signed-off | blocked

> Prosecuting an application before the USPTO is a regulated professional activity requiring a
> **USPTO-registered patent attorney or agent**; the dominant failure mode is **forfeited or invalidated
> rights and inequitable conduct (a duty-of-candor breach)**, not a typo. This model forces a
> registered-practitioner sign-off into the pipeline.

## 1. Scope
- Pipeline: invention disclosure → prior-art search + patentability (101/102/103/112) + inventorship → statutory-bar / candor-IDS / foreign-filing-license screen → USPTO filing → docket
- Autonomy: suggest-to-practitioner (assistant) · autonomous-above-confidence (autopilot)
- Filing types: provisional · non-provisional · response · ids …
- Filing modes: us · pct · foreign …
- Setting: applicant-of-record · practitioner-filed · self-filed

## 2. Applicability matrix
| Regime | In scope? | Notes |
|---|---|---|
| Patent bar / UPL (37 CFR 11; 35 USC 2(b)(2)(D)) | | only a registered practitioner may prosecute |
| Duty of candor & good faith / IDS (37 CFR 1.56) | | breach → inequitable conduct, unenforceable |
| Patentability (35 USC 101 / 102 / 103 / 112) | | eligibility / novelty / obviousness / enablement |
| Inventorship (35 USC 115) | | improper inventorship can invalidate |
| Statutory bars (35 USC 102 on-sale / public-use) | | 1-year US grace period vs absolute novelty abroad |
| Priority / benefit deadlines (35 USC 119 / 120) | | incl. 12-month non-provisional conversion |
| Foreign-filing license (35 USC 184) | | required before filing abroad |
| ITAR / EAR export-control adjacency | | USML / ECCN for sensitive subject matter |
| Confidentiality / attorney-client privilege | | disclosures are confidential / privileged |
| Registered-practitioner requirement | | practitioner of record signs the filing |

## 3. Output→evidence trace (the candor / patentability defence)
| Output | Evidence span required | Present? |
|---|---|---|
| Patentability (102/103/112) | prior-art search results + claim mapping | |
| Inventorship (35 USC 115) | conception/contribution record per inventor | |
| Material-art / IDS set | known references with materiality basis | |
| Statutory bars + deadlines | sale/use dates, priority/benefit chain | |

## 4. Edits & guardrails
- Patentability assessed against current prior art (101/102/103/112), evidenced not asserted: …
- Material prior art surfaced into an IDS (37 CFR 1.56), never suppressed: …
- On-sale / public-use bar + grace period screened; priority/benefit deadlines docketed (119/120): …
- Foreign-filing license (35 USC 184) cleared + ITAR/EAR recognised before any foreign filing: …

## 5. Autonomy boundary
- Confidence floor below which a filing escalates to a USPTO-registered patent practitioner: …
- High-risk patterns always escalated (auto-file with no practitioner, IDS suppression, on-sale/public-use bar, missed deadline, inventorship dispute, unlicensed foreign filing): …
- Practitioner audit trail (who/what searched, analysed, screened, and signed each filing): … (composes with service-autopilot audit trail)

## 6. Inventorship, export control & candor record
- Correct inventorship (35 USC 115) determined and recorded: …
- Foreign-filing license (35 USC 184) + ITAR (USML) / EAR (ECCN) recognition, no auto-file abroad of controlled subject matter: …
- Per-filing candor record (material art considered, IDS filed) + confidentiality / privilege preservation: …

## 7. Findings
| # | Severity | Finding | Mitigation | Status |
|---|---|---|---|---|
| 1 | | | | open |

## 8. Required gates
- `gate:patent-attorney-signoff` — USPTO-registered patent practitioner signs off on every USPTO filing and on every high-risk pattern, before transmission to the USPTO.
- `gate:ship` — standard (security-officer).

<!-- HANDOFF -->
patent-reviewer-verdict: signed-off | blocked
filing-types: [provisional | non-provisional | response | ids]
filing-modes: [us | pct | foreign]
prosecution-high-risk-paths: <count>
critical-findings: <count>
high-findings: <count>
must-implement-before-senior-dev:
  - Output→evidence trace (patentability, inventorship, material-art basis)
  - Patentability assessed against current prior art (101/102/103/112)
  - Duty of candor / IDS — material prior art surfaced, never suppressed (37 CFR 1.56)
  - Statutory-bar (on-sale/public-use) + grace-period screen; priority/benefit deadlines docketed (119/120)
  - Foreign-filing license (35 USC 184) + ITAR/EAR export-control recognition (no auto-file abroad)
  - Correct inventorship (35 USC 115); confidentiality / attorney-client privilege preserved
  - Every USPTO filing → USPTO-registered patent practitioner sign-off (gate:patent-attorney-signoff)
gate: gate:patent-attorney-signoff
