# Multi-archetype real-pipeline coverage gap analysis — 2026-05-14

Deep-dive on the **18 archetypes** not yet covered by
`tests/openrouter-multi-archetype.mjs`. Focus on the **6 most recently
added** (Wave 2-4) where the gap is most critical, plus a sketch of the
broader 12 base-archetype gap.

---

## Current state

Multi-archetype test currently runs **7 archetypes** through full
pipeline (architect → pm → senior-dev → archetype-reviewer):

```
web-service · fintech · mlops · enterprise-saas · agent-product
gov-public · healthcare
```

Total cost: ~$1.35 OpenRouter per full run.

## Coverage breakdown — all 25 archetypes

| Wave | Total | ✅ Covered | ❌ Missing |
|---|---|---|---|
| Wave 0 (initial, 11) | 11 | 2 (web-svc, agent-product) | 9 |
| Wave 1 (Apr 26, 3) | 3 | 0 | 3 |
| Wave 2 (May 3, 3) | 3 | 2 (fintech, healthcare) | 1 |
| Wave 3 (May 4, 5) | 5 | 2 (mlops, ent-saas) | 3 |
| Wave 4 (May 8, 3) | 3 | 1 (gov-public) | 2 |
| **Total** | **25** | **7** | **18** |

**Hit rate: 28%** of archetypes exercise their full pipeline against a
real LLM. 72% are still seeded-artifact tested only.

---

## The 6 missing from "recent 11" — priority deep dive

### 1. cli-tool — Wave 2

**Reviewer:** `cli-reviewer`
**Gates (medium):** 3 — plan, qa, ship
**Compliance:** none

**Why it matters:** cli-tool is the second most common archetype after
web-service (npm-publish CLIs, internal automation, AI-assistant
helpers). Wrongly-flagged "deploy" or "rm" patterns destroy user data.

**Suggested test feature:**
```
feature: 'env-vars-loader'
task: 'Build a CLI that reads .env from disk and prints variables.
Support --help / --version / --json / NO_COLOR. Stub command, no
network calls.'
reviewer: 'cli-reviewer'
```

**Planted regression risk to catch:**
- Missing `--help` or `--version` (CLI UX baseline)
- Secrets visible in `argv` (process-list leak)
- Destructive default without `--force` confirmation
- Shell-injection patterns

**Expected cost:** ~$0.15

---

### 2. streaming — Wave 3

**Reviewer:** `streaming-reviewer`
**Gates (medium):** 3 — plan, qa, ship (⚠️ no security-officer)
**Compliance:** gdpr (event retention)

**Why it matters:** streaming archetypes handle CDC, event delivery,
exactly-once semantics. Common production failures: dual-write bugs,
schema-evolution breakage, DLQ overflow. Standard STRIDE misses these.

**Suggested test feature:**
```
feature: 'order-events-cdc'
task: 'Debezium CDC pipeline from Postgres orders table to Kafka
"order-events" topic. Apache Avro schema. Idempotent producer.
Schema Registry compatibility BACKWARD.'
reviewer: 'streaming-reviewer'
```

**Planted regression risk to catch:**
- Non-idempotent producer (duplicates on retry)
- Schema compatibility mode = NONE (silent breaking changes)
- No DLQ for poison messages
- No watermark / late-event handling

**Expected cost:** ~$0.18

---

### 3. marketplace — Wave 3

**Reviewer:** `marketplace-reviewer` + `pci-reviewer`
**Gates (medium):** 5 — plan, qa, security, ship, compliance
**Compliance:** 1099-k, dsa-eu, gdpr, kyc-aml, p2b-eu, pci-dss (6 keys)

**Why it matters:** marketplaces have the highest compliance density
of any commerce archetype. KYC failure = AML enforcement. Wrong tax
withholding = IRS audit. EU DSA breach = €6M+ fines.

**Suggested test feature:**
```
feature: 'seller-onboarding-payout'
task: 'POST /sellers — accepts seller signup (name, address, tax_id),
runs Stripe Connect verification, creates platform-managed Connect
account. Hold-and-release escrow with 7-day delay.'
reviewer: 'marketplace-reviewer'
```

**Planted regression risk to catch:**
- No KYC step before payout (instant payouts to unverified seller)
- Tax_id stored plaintext (1099-K reporting risk)
- No DSA Article 16 notice-and-action endpoint
- Missing marketplace facilitator tax logic (US Wayfair v. SD)

**Expected cost:** ~$0.20

---

### 4. cms — Wave 3

**Reviewer:** `cms-reviewer`
**Gates (medium):** 3 — plan, qa, ship (⚠️ no security-officer)
**Compliance:** dmca, dsa-eu, gdpr, wcag-2.2

**Why it matters:** cms is the **primary attack target** (XSS, RCE via
upload, content injection). Yet pipeline has no security-officer.
**Open question:** is this correct?

**Suggested test feature:**
```
feature: 'image-upload-with-srcset'
task: 'POST /upload accepts image, generates AVIF/WebP variants with
responsive srcset, stores to S3 with cache-control headers. EXIF strip.
Schema.org Article markup auto-generated.'
reviewer: 'cms-reviewer'
```

**Planted regression risk to catch:**
- EXIF preserved (GPS coordinates leak)
- No file-type validation (server-side magic-bytes check)
- Missing schema.org structured data
- Cache-control too aggressive (stale-while-revalidate misuse)

**Expected cost:** ~$0.18

---

### 5. edtech — Wave 4

**Reviewer:** `edtech-reviewer`
**Gates (medium):** 6 — plan, qa, edtech-review, security, ship, compliance
**Compliance:** coppa, ferpa, gdpr-k, section-508, sopipa-ca, wcag-2.2-aa (6 keys)

**Why it matters:** Working with student data triggers FERPA + COPPA
(<13) + state laws (SOPIPA-CA, NY 2-D). Section 508 a11y is federal-
contract mandatory. Mistakes = lawsuits + Title IV funding loss.

**Suggested test feature:**
```
feature: 'student-roster-import'
task: 'CSV import endpoint: bulk-create student records (name, age,
grade, parent_email). Auto-detect minors (<13) → require parent consent
flow. Section 508-compliant error feedback (no color-only).'
reviewer: 'edtech-reviewer'
```

**Planted regression risk to catch:**
- No COPPA verifiable parental consent for under-13s
- Student data flows to analytics vendor without BAA
- Error messages color-only (Section 508 fail)
- No FERPA disclosure consent UI

**Expected cost:** ~$0.17

---

### 6. insurance — Wave 4

**Reviewer:** `insurance-reviewer` + `regulated-reviewer`
**Gates (medium):** 6 — plan, qa, insurance-review, security, ship, compliance
**Compliance:** **8 keys** — actuarial-asops, anti-discrimination-pricing,
ccpa, gdpr, ifrs-17, naic, solvency-ii, state-doi (most of any
archetype)

**Why it matters:** insurance has the highest compliance load.
Actuarial calculations are regulated (ASOPs). State Department of
Insurance approves each rate. Anti-discrimination pricing = disparate
impact lawsuits.

**Suggested test feature:**
```
feature: 'quote-pricing-engine'
task: 'POST /quote — accepts (state, age, vehicle), returns auto
insurance premium using ratemaking algorithm. Decision must be
explainable (audit log of factors). State-specific multipliers from
filed rate tables.'
reviewer: 'insurance-reviewer'
```

**Planted regression risk to catch:**
- Pricing uses ZIP code (proxy for race, disparate-impact risk)
- Rate not filed with state DOI
- No explainability log (regulator audit requirement)
- IFRS 17 contract liability not separated from earned premium

**Expected cost:** ~$0.20

---

## Aggregate proposal

Add all 6 missing recent archetypes to
`tests/openrouter-multi-archetype.mjs`:

| Archetype | Reviewer | Est. cost | Catches regressions in |
|---|---|---|---|
| cli-tool | cli-reviewer | $0.15 | CLI UX baseline, argv secrets |
| streaming | streaming-reviewer | $0.18 | Exactly-once, schema-compat, DLQ |
| marketplace | marketplace-reviewer | $0.20 | KYC, payout escrow, tax facilitator |
| cms | cms-reviewer | $0.18 | XSS, EXIF, schema.org |
| edtech | edtech-reviewer | $0.17 | COPPA, Section 508, BAA |
| insurance | insurance-reviewer | $0.20 | Anti-discrim pricing, ASOPs, state DOI |
| **Total addition** | | **~$1.08** | **All Wave 2-4 covered** |

After this addition: **13 of 25 archetypes** with full real-pipeline E2E
coverage (52%). Cost per full multi-archetype run rises from $1.35 to
~$2.43.

---

## The other 12 — base/Wave 1 still missing

Lower priority because:
- Wave 0 archetypes are mature (smaller regression risk)
- Wave 1 archetypes (devtools, browser-extension, game) are niche

Future addition (not urgent):

| Archetype | Reviewer | Est. cost | Why eventually needed |
|---|---|---|---|
| mobile-app | mobile-store-reviewer | $0.18 | App Store IAP / push token validation |
| ai-system | ai-security-reviewer | $0.18 | Prompt injection, output exfil |
| data-platform | data-platform-reviewer | $0.18 | dbt contracts, PII in lineage |
| infra | infra-reviewer | $0.16 | Terraform drift, IAM least-privilege |
| library | library-reviewer | $0.15 | Semver, public API surface |
| web3 | oracle-reviewer | $0.18 | Oracle staleness, MEV, upgradeability |
| iot-embedded | firmware-reviewer | $0.18 | OTA, secure boot, watchdog |
| regulated | regulated-reviewer | $0.17 | DORA, NIS2, SOX ITGC |
| commerce | pci-reviewer | $0.17 | PCI scope, idempotency |
| devtools | devtools-reviewer | $0.15 | Sigstore, SLSA, telemetry leak |
| browser-extension | web-store-reviewer | $0.15 | Manifest V3, host_permissions |
| game | game-reviewer | $0.15 | COPPA <13, ESRB, loot-box odds |
| **All 12** | | **~$2.00** | **All 25 archetypes covered** |

If all 25 covered: cost per full run rises from $1.35 to ~$4.43.
Run quarterly before major releases.

---

## Decision matrix

### Option A — close just the 6 (recommended now)

- Effort: ~30 min to add fixtures + verify
- Cost per run: $1.35 → $2.43
- Coverage: 7/25 → 13/25 (52%)
- Closes Wave 2/3/4 gap completely

### Option B — close all 18

- Effort: ~1 hour
- Cost per run: $1.35 → $4.43
- Coverage: 7/25 → 25/25 (100%)
- Full coverage but high per-run cost

### Option C — tier the test runs

Split into 3 tiers (already supports subset via argv):
- `npm run test:e2e:critical` — 5 archetypes (~$0.85)
- `npm run test:e2e:wave2-4` — 11 archetypes (~$1.95)
- `npm run test:e2e:all` — 25 archetypes (~$4.43)

Best for ergonomics: developers run `critical` on every PR, `all`
quarterly.

---

## Risk if we don't close

| Gap | Probability of silent break | Impact |
|---|---|---|
| streaming-reviewer prompt regresses | medium | CDC bugs ship to prod (data corruption) |
| marketplace-reviewer prompt regresses | medium | KYC step removed; AML breach |
| cms-reviewer prompt regresses | high | XSS lands on public site |
| edtech-reviewer prompt regresses | low (rare archetype) | FERPA/COPPA breach + lawsuits |
| insurance-reviewer prompt regresses | low (rare archetype) | Disparate-impact pricing ships |
| cli-tool-reviewer prompt regresses | medium | UX baseline (--help) goes missing |

Three of six (streaming, marketplace, cms) have **medium-to-high
probability of silent regression**. Closing the gap is high-ROI.
