# Archetype & pipeline analysis — 2026-05-14

System-wide review of 25 archetypes with focus on the **11 added in the
last 6 weeks** (2026-04-26 → 2026-05-08). Identifies coverage strength,
gaps, and concrete next-action priorities.

---

## Timeline — 14 archetypes added since April 26

| Wave | Date | Commit | New archetypes |
|---|---|---|---|
| Wave 0 | 2026-04-19 | `330d2b3` (initial) | 12 base: web-service, mobile-app, ai-system, data-platform, infra, library, commerce, web3, iot-embedded, regulated, greenfield, healthcare-stub |
| Wave 1 | 2026-04-26 | `2e4d9f5` | devtools, browser-extension, game |
| Wave 2 | 2026-05-03 | `6437f72` | cli-tool, fintech, healthcare (refined) |
| Wave 3 | 2026-05-04 | `5e98537` | enterprise-saas, mlops, streaming, marketplace, cms |
| Wave 4 | 2026-05-08 | `5c7c10d` | edtech, gov-public, insurance |
| total | | | **14 new in 6 weeks**, 25 currently active |

## Coverage matrix — 11 most recent archetypes

| Archetype | Wave | Det. signals | Reviewer(s) | Gates (med) | Compliance keys | Fixture | OR regr. | OR pipeline |
|---|---|---|---|---|---|---|---|---|
| **fintech**         | 2 | 18 | pci + regulated | 5 | 4 (gdpr, kyc-aml, pci-dss, sox) | ✅ plaid | ✅ pci | ✅ |
| **healthcare**      | 2 | 12 | healthcare + sec-officer | 5 | 3 (gdpr, hipaa, hitech) | ✅ fhir | ✅ healthcare | ✅ |
| **cli-tool**        | 2 | 12 | cli | 3 | 0 | ✅ python | ✅ cli | ❌ |
| **enterprise-saas** | 3 | 23 | enterprise-saas | 5 | 4 (ccpa, gdpr, iso27001, soc2-type-2) | ✅ workos | ✅ ent-saas | ✅ |
| **mlops**           | 3 | 23 | mlops + ai-security | 5 | 3 (eu-ai-act, iso42001, nist-ai-rmf) | ✅ mlflow | ✅ mlops | ✅ |
| **streaming**       | 3 | 24 | streaming | 3 | 1 (gdpr) | ✅ kafka | ❌ | ❌ |
| **marketplace**     | 3 | 22 | marketplace + pci | 5 | 6 (1099-k, dsa-eu, gdpr, kyc-aml, p2b-eu, pci-dss) | ✅ connect | ❌ | ❌ |
| **cms**             | 3 | 23 | cms | 3 | 4 (dmca, dsa-eu, gdpr, wcag-2.2) | ✅ sanity | ❌ | ❌ |
| **edtech**          | 4 | **8** ⚠️ | edtech | 6 | 6 (coppa, ferpa, gdpr-k, section-508, sopipa-ca, wcag-2.2-aa) | ❌ | ❌ | ❌ |
| **gov-public**      | 4 | **9** ⚠️ | gov + sec-officer | 6 | 6 (ato, fedramp, fisma, nist-800-53, pia, section-508) | ❌ | ❌ | ✅ |
| **insurance**       | 4 | **9** ⚠️ | insurance + regulated | 6 | **8** (actuarial-asops, anti-discrim-pricing, ccpa, gdpr, ifrs-17, naic, solvency-ii, state-doi) | ❌ | ❌ | ❌ |

---

## Gaps by archetype

### 🔴 Wave 4 — edtech, gov-public, insurance (newest, weakest)

**Severity: HIGH** — these are the most regulated archetypes (FERPA,
FedRAMP, NAIC) with the LEAST coverage.

- **Detection weakness:** only 8-9 scoring signals each (vs 23+ for Wave
  3). Risk: false-negatives on real edtech / gov / insurance projects.
- **Zero fixtures.** `tests/fixtures/edtech-*`, `gov-public-*`,
  `insurance-*` don't exist. `run-archetype-e2e.mjs` can't validate
  detection on them.
- **Zero reviewer regression coverage.** The new `edtech-reviewer`,
  `gov-reviewer` (real coverage), `insurance-reviewer` agents have
  never been tested against a planted vulnerability.
- **Real-pipeline coverage uneven:** gov-public was tested in
  multi-archetype run; edtech + insurance never have been.

### 🟡 Wave 3 — streaming, marketplace, cms (high detection, low test cov)

**Severity: MEDIUM** — strong detection (22-24 signals), full fixtures,
but **no reviewer regression tests** and **no real-pipeline coverage**.

- streaming, marketplace, cms reviewers (`streaming-reviewer`,
  `marketplace-reviewer`, `cms-reviewer`) have no planted-vulnerability
  regression test.
- Their archetype prompts haven't been exercised by a real LLM run
  end-to-end.

### 🟢 Wave 2 — fintech, healthcare, cli-tool (well covered)

**Severity: LOW** — all 3 covered in both multi-archetype real run AND
reviewer regression test. fintech + healthcare are the strongest in the
recent set.

cli-tool partially: has reviewer regression but no full-pipeline run.

---

## Coverage gaps in numbers

| Coverage layer | Wave 2 (3) | Wave 3 (5) | Wave 4 (3) | Total |
|---|---|---|---|---|
| Detection signals ≥ 12 | 3/3 ✅ | 5/5 ✅ | **0/3** 🔴 | 8/11 |
| Test fixture exists | 3/3 ✅ | 5/5 ✅ | **0/3** 🔴 | 8/11 |
| Reviewer regression (OR) | 3/3 ✅ | **0/5** 🟡 | **0/3** 🔴 | 3/11 |
| Real-pipeline E2E (OR) | 2/3 (miss cli) | **1/5** (miss most) 🟡 | **1/3** 🟡 | 4/11 |

---

## Pipeline stage analysis — how recent archetypes flow through

Pipeline stages (from `getPipeline()` in board/server.mjs):
```
architect → pm → senior-dev → reviewers → qa-engineer
                                       → security-officer → devops → l3-support
```

Each recent archetype's flow:

### fintech
```
architect (cost-est) → pm → senior-dev →
  pci-reviewer (PCI scope + idempotency + webhook sig)
  regulated-reviewer (SOX + DORA + ISO27001)
→ qa-engineer → security-officer →
  gate:compliance ← human → devops → l3-support
```
5 stages of review. Heaviest pipeline alongside gov-public + insurance.

### healthcare
```
architect → pm → senior-dev →
  healthcare-reviewer (HIPAA: BAA chain, PHI inventory, audit log, FHIR)
  security-officer (STRIDE fallback)
→ qa-engineer → security-officer → gate:compliance → devops
```
healthcare-reviewer is the most thorough new reviewer (10-section TM
framework, see agents/healthcare-reviewer.md).

### enterprise-saas
```
architect → pm → senior-dev →
  enterprise-saas-reviewer (RLS, SSO/SAML, audit log, multi-tenant)
→ qa-engineer → security-officer → gate:compliance → devops
```
Tenant-isolation focus.

### mlops
```
architect (gate:cost!) → pm → senior-dev →
  mlops-reviewer (drift, lineage, model-registry)
  ai-security-reviewer (prompt injection if LLM in pipeline)
→ qa-engineer → security-officer → devops
```
Only AI archetype with gate:cost wired in v2.7.

### streaming, marketplace, cms — three-gate light pipelines

```
architect → pm → senior-dev → <reviewer> → qa-engineer → ship
```

streaming, cms: no security-officer in standard flow. **Gap candidate:**
should marketplace include security-officer? Currently relies on
pci-reviewer for payment-side security only.

### edtech, gov-public, insurance — six-gate heavy pipelines

```
architect → pm → senior-dev →
  domain-reviewer →
  gate:<archetype>-review (human)
→ qa-engineer → security-officer →
  gate:compliance →
  devops
```

The only 3 archetypes with their own dedicated `gate:<archetype>-review`
human checkpoint. Reflects regulatory exposure.

---

## Detection signal analysis — where false-negatives hide

For **edtech, gov-public, insurance** (8-9 signals each), what triggers
detection? Looking at the actual rules:

### edtech (8 signals)
- README keywords: "K-12", "LMS", "school", "student"
- Stack: `firebase` + `clever-sdk` + `aeries-sdk` + `infinite-campus`
- File: presence of `student-roster` / `gradebook` in src

**Gap:** doesn't detect on:
- Tutoring / micro-learning platforms (no LMS terminology)
- Higher-ed (no K-12 keyword)
- ESL apps (no student SDK)

### gov-public (9 signals)
- README: "government", "civic", "municipal"
- Stack: `login-gov-sdk`, `id-me-sdk`, `idme-sdk`, `okta-gov`
- File: `IRB.md`, `compliance/PIA.md`

**Gap:** state/municipal projects WITHOUT login-gov-sdk dependency
(most prototypes) won't trigger. Federal contractors using AWS GovCloud
without explicit SDK references also won't.

### insurance (9 signals)
- README: "insurance", "underwriting", "actuarial"
- Stack: `acord-sdk`, `naic-sdk`, `solvency2-sdk`, `gemfire-insurance`
- File: `actuarial-models/` dir

**Gap:** P&C startups using stripe-only payments + custom claim logic
without insurance-SDKs won't trigger. InsurTech BNPL or warranty-only
products miss.

---

## Recommended actions (priority order)

### 🔴 Critical (close within 1 sprint)

1. **Create 3 fixtures for Wave 4 archetypes** (~2h, $0)
   - `tests/fixtures/edtech-clever/` — Clever SDK + LMS hints
   - `tests/fixtures/gov-public-login/` — Login.gov SDK + IRB docs
   - `tests/fixtures/insurance-acord/` — ACORD SDK + actuarial dir
   - Add to `tests/run-archetype-e2e.mjs` expected map

2. **Reviewer regression for 5 missing reviewers** (~30min, ~$0.10)
   - streaming-reviewer, marketplace-reviewer, cms-reviewer,
     edtech-reviewer, insurance-reviewer
   - Add fixtures to `tests/openrouter-reviewer-regressions.mjs`
   - Verifies all 23 reviewers can BLOCK on domain vulns

3. **Strengthen Wave 4 detection signals** (~3h, $0)
   - Add 5+ more rules per archetype (tutoring keywords for edtech,
     state govcloud refs for gov-public, BNPL for insurance)
   - Target: each Wave 4 ≥ 14 signals (closer to Wave 3 strength)

### 🟡 High (next sprint)

4. **Add 6 archetypes to multi-archetype real-pipeline test** (~5min, ~$0.60)
   - cli-tool, streaming, marketplace, cms, edtech, insurance
   - Total 14 archetype runs at ~$1.95

5. **Verify gate-count expectations for Wave 4** (~30min, $0)
   - Manually verify edtech-review / gov-review / insurance-review gates
     actually fire in pipeline runs (use openrouter-multi-archetype)
   - Asset they show in /api/inbox.pending_gates as expected

6. **Reconsider streaming / cms missing security-officer** (~1h, $0)
   - streaming handles event data that often has PII
   - cms is the primary attack target (XSS, RCE via uploads)
   - Decision: add security-officer to both? Or document why not?

### 🟢 Medium (later)

7. **Add explicit `gate:cost` test** (~30min, $0)
   - Verify mlops, ai-system, agent-product all open gate:cost
   - Currently only typed-map verified; not orchestration-tested

8. **Document insurance compliance complexity** (~2h, $0)
   - 8 compliance keys — most of any archetype
   - User-facing doc: which apply when, what reviewer covers each

9. **Add naming-alias detection in archetypes.ts** (~1h, $0)
   - Currently aliases (pci-reviewer for fintech) live only in docs/code
   - Validation function that fails CI on undocumented alias addition

### ℹ️ Polish

10. Backfill `rationale` field on Wave 3 + Wave 4 archetypes (currently empty)
11. Add `confidence` weight tuning — Wave 4 detections often hit "low confidence"
12. Consider splitting `regulated` into more specific buckets (it's a catch-all)

---

## Summary table

| Question | Answer |
|---|---|
| How many archetypes total? | 25 (26 with greenfield) |
| Added in last 6 weeks? | 14 (Wave 1-4) |
| Most recent 10 covered with fixtures? | **7 of 10** (Wave 4 missing all 3) |
| Most recent 10 with reviewer regression? | **3 of 10** (only fintech + healthcare + cli-tool from Wave 2; gov-public's tests via multi-arch only) |
| Heaviest pipeline (most gates)? | **edtech, gov-public, insurance** — 6 gates each |
| Lightest pipeline? | **cli-tool, streaming, cms** — 3 gates each |
| Most compliance keys? | **insurance** (8 keys) |
| Weakest detection signal strength? | **Wave 4** (edtech/gov-public/insurance ≈ 8 each) |
| Top 3 gaps to close? | (1) Wave 4 fixtures, (2) 5 missing reviewer regressions, (3) Strengthen Wave 4 detection signals |

**Total work to close all 11 critical actions: ~12-15 hours, ~$2 OpenRouter.**
