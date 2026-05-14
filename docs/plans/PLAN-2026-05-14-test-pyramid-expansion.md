# Plan — test-pyramid expansion (3 follow-ups from full-25 coverage)

After PR #23 merged (`b717f41`) we have **25/25 archetypes** real-LLM
covered. This plan extends in 3 orthogonal directions:

1. **Packs** — 10 domain-pack overlays on top of 25 archetypes (25 → 35)
2. **Cross-provider** — same 25 archetypes through Haiku + GPT-5 + Gemini
3. **Downstream pipeline** — extend from 4 stages to 8 (architect→l3-support)

Each is independent — can be done in parallel or any order. Recommended
execution order at the bottom.

---

## Task 1 — Pack overlays in real-LLM test

**Goal:** 10 domain packs (v2.8.0) get their own real-LLM E2E run. Each
pack-specific reviewer is exercised against a planted pack-relevant
vulnerability. Pack reviewers ride on top of their base archetype.

**Files:** new `tests/openrouter-pack-overlays.mjs`

### Pack-feature mapping

| Pack | Base archetype | Pack reviewer | Suggested feature | Planted vuln |
|---|---|---|---|---|
| voice-pack | agent-product | voice-ai-reviewer | "Build POST /call/handle for Twilio voice IVR webhook. Capture user speech via Deepgram STT, generate TTS reply via ElevenLabs" | No TCPA consent capture; voice-synth disclosure missing; PII in transcripts unredacted |
| clinical-pack | healthcare | ai-clinical-reviewer + fda-reviewer | "Build clinical-decision-support endpoint that suggests drug dosage from patient EHR. SaMD class detection." | No SaMD classification; no FDA premarket review; no clinical validation logs |
| hr-ai-pack | ai-system | hr-ai-reviewer | "Build resume-screening endpoint that ranks candidates by job-description fit. Persist scores." | No AEDT bias audit; no NYC LL 144 compliance; no candidate notification |
| api-platform-pack | web-service | api-platform-reviewer | "Public API: POST /v1/widgets with OpenAPI spec, rate limits, API-key auth, webhooks for events" | No versioning strategy; no deprecation window; webhooks not signed |
| lending-pack | fintech | lending-credit-reviewer | "Build loan-approval endpoint reading Plaid bank-data; returns approve/deny + APR" | No FCRA adverse-action notice; no fair-lending disparate-impact log |
| clinical-trials-pack | healthcare | clinical-trials-reviewer + bio-data-reviewer | "EDC endpoint: capture subject vitals (CDISC SDTM), eConsent signature, push to CTMS" | No 21 CFR Part 11 e-signature; no IRB protocol reference; no de-identification on export |
| robotics-pack | agent-product | robotics-safety-reviewer | "ROS 2 cobot grasp-planning node, MoveIt motion plan, force-limit guard" | No HARA analysis; no functional-safety test plan; no ISO TS 15066 cobot-force limit |
| em-fintech-pack | fintech | emerging-markets-fintech-reviewer | "BNPL India endpoint: UPI payment via Razorpay, NBFC license check, RBI KYC tier" | No RBI tier-classification; license-strategy unclear; lender-of-record not declared |
| climate-pack | web-service | climate-mrv-reviewer + biosecurity-reviewer | "Carbon-credit calculator: Scope 1+2+3 emissions, Verra methodology, CBAM border adjustment" | MRV methodology not cited; emission factors not from a registered source; DURC review missing |
| drug-discovery-pack | ai-system | drug-discovery-ml-reviewer + glp-glab-reviewer + lab-automation-reviewer | "AlphaFold-style protein structure prediction service; lab-automation SiLA2 integration for results upload" | No model card; no CSV validation (computer system validation); IQ/OQ/PQ docs missing |

### Test structure (per pack)

```js
'voice-pack': {
  baseArchetype: 'agent-product',
  feature: 'twilio-voice-ivr',
  task: '<above>',
  packReviewers: ['voice-ai-reviewer'],
  expectedBlocked: ['tcpa', 'consent', 'disclosure', 'pii', 'redact'],
},
```

Then for each pack, run **5 stages**: architect → pm → senior-dev →
base-reviewer → **pack-reviewer**. Assert pack-reviewer BLOCKS with at
least one expected keyword.

### Acceptance

- 10 packs × 5 stages = 50 LLM calls
- Estimated cost: 10 × ~$0.15 = ~$1.50
- All 10 pack reviewers correctly BLOCK their planted vuln
- Verdict format passes parsing

### Effort

~1 hour:
- 30 min — define 10 pack configs (above is the spec)
- 20 min — adapt harness to run pack-reviewer as stage 5
- 10 min — run + verify

---

## Task 2 — Cross-provider testing

**Goal:** Run the same 25-archetype pipeline through Haiku, GPT-5, and
Gemini (alongside Sonnet 4) to:
- Surface prompt assumptions that depend on Anthropic specifics
- Find which agents work on cheaper models
- Document model-suitability matrix per agent type

**Files:** new `tests/openrouter-cross-provider.mjs`

### Models to test

| Model | OpenRouter slug | $/M input | $/M output | Use case |
|---|---|---|---|---|
| Sonnet 4 (current baseline) | `anthropic/claude-sonnet-4` | $3 | $15 | reference |
| Haiku 4.5 | `anthropic/claude-haiku-4.5` | $0.80 | $4 | cost-optimised reviewer |
| GPT-5 | `openai/gpt-5` (or `gpt-5-preview`) | $10 (est) | $30 (est) | non-Anthropic stack health |
| Gemini 2.5 Pro | `google/gemini-2.5-pro` | $1.25 | $5 | non-Anthropic, cheaper than Sonnet |

### Strategy

Run a **subset** of 5 representative archetypes (covering full reviewer
diversity) through all 4 models:
1. fintech (pci-reviewer — high regulatory specificity)
2. healthcare (healthcare-reviewer — newest agent)
3. web3 (oracle-reviewer — Solidity-specific)
4. enterprise-saas (enterprise-saas-reviewer — multi-tenant complexity)
5. cli-tool (cli-reviewer — simplest baseline)

Per archetype × 4 models × 4 stages = **80 LLM calls per full run**.

### Cost estimate (5 archetypes × 4 models)

| Model | Per call | Calls (20) | Total |
|---|---|---|---|
| Sonnet 4 | $0.15 | 20 | $3.00 |
| Haiku 4.5 | $0.03 | 20 | $0.60 |
| GPT-5 | $0.25 (est) | 20 | $5.00 |
| Gemini 2.5 Pro | $0.06 | 20 | $1.20 |
| **Total** | | **80 calls** | **~$9.80** |

### Output

Generates a matrix like:

```
                Sonnet 4   Haiku 4.5   GPT-5     Gemini 2.5
fintech         ✅ BLOCKED  ✅ BLOCKED  ⚠️ partial  ✅ BLOCKED
healthcare      ✅ BLOCKED  ⚠️ shallow  ✅ BLOCKED  ⚠️ generic
web3            ✅ BLOCKED  ❌ missed   ✅ BLOCKED  ✅ BLOCKED
enterprise-saas ✅ BLOCKED  ✅ BLOCKED  ✅ BLOCKED  ✅ BLOCKED
cli-tool        ✅ BLOCKED  ✅ BLOCKED  ✅ BLOCKED  ✅ BLOCKED
```

This tells us:
- "Haiku works for cli-tool / web-service but misses oracle subtleties"
- "GPT-5 partial on fintech — likely needs more specific PCI prompt"
- "Gemini misses healthcare nuance — extra HIPAA cues needed"

### Acceptance

- Generated cross-model matrix in `docs/testing/CROSS-PROVIDER-MATRIX.md`
- Documented model-suitability per archetype/agent type
- Recommendation: which agents to default to which model

### Effort

~2 hours:
- 30 min — adapt harness to take `--model` flag and loop
- 30 min — pick the 5 representative archetypes (curate to maximize signal)
- 30 min — run all 80 calls (real LLM cost ~$10)
- 30 min — generate matrix + recommendations doc

---

## Task 3 — Downstream pipeline (stages 5-8)

**Goal:** Extend `openrouter-multi-archetype.mjs` from 4 stages to 8.
Currently truncates at archetype-reviewer; add qa-engineer →
security-officer → devops → l3-support.

**Files:** modify `tests/openrouter-multi-archetype.mjs`

### Stages to add

| Stage | Agent | Expected output | Planted vuln to catch |
|---|---|---|---|
| 5 | qa-engineer | docs/qa/QA-*.md (coverage report, test gaps) | Missing test for edge case (e.g. empty input) |
| 6 | security-officer | docs/sec-threats/TM-*.md (STRIDE table) | Auth bypass, SQLi |
| 7 | devops | deploy script + canary config | No rollback path; secrets in env exposed |
| 8 | l3-support | runbook for top failure modes | No on-call rotation; no alert SLO |

### Acceptance criteria per stage

- qa-engineer produces a QA report referring to actual src files
- security-officer produces a threat-model with ≥3 entries
- devops produces deploy script + healthcheck endpoint
- l3-support produces runbook with ≥2 documented failure modes

### Cost estimate

Per archetype, 4 new stages × ~$0.05 each = **$0.20 extra**.
25 archetypes × $0.20 = **$5 extra per full run**.

Total full-run cost rises: $4 (current) → **~$9 per run**.

Per-stage budget remains under $1 — sustainable for quarterly runs.

### Effort

~2 hours:
- 1h — wire 4 stages in harness (extend runStage calls)
- 30 min — define per-stage minimum-output assertions
- 30 min — full 25-archetype × 8-stage run (~$9)

---

## Recommended execution order

### Sprint 1 (this/next session) — Tasks 1 + 3

```
Day 1:
  Task 1 — Pack overlays (1h, $1.50)        →  35/35 coverage
  Task 3 — Downstream stages (2h, $5)       →  full 8-stage E2E

Total: ~$6.50, 3 hours, gives 100% coverage of:
  - All 25 archetypes (PR #23 ✓)
  - All 10 packs (Task 1)
  - All 8 pipeline stages (Task 3)
```

### Sprint 2 — Task 2 (cross-provider)

```
Day 2:
  Task 2 — Cross-provider matrix (2h, $10)

Total: $10 — biggest insight value (informs model selection per agent),
but lowest urgency. Run after Sprint 1 baseline established.
```

### Per-task acceptance gates

Before merging each:
- [ ] Test runs cleanly via `node tests/<file>.mjs`
- [ ] Documented in `docs/testing/<date>-<name>.md`
- [ ] All assertions pass on first dedicated run
- [ ] Ratio guard (anti-7,638×) still under 1000×
- [ ] PR description includes raw cost numbers + finding summary

### Out-of-scope (explicitly NOT in this plan)

- Live testing against Claude Code itself (we already do this for ad-hoc
  validation; not productizable as automated test)
- Cross-archetype interaction tests (e.g. "what if a project hits both
  healthcare AND streaming archetypes?") — separate plan if needed
- Performance regression on prompt-size — handled by structural tests
- Multi-language LLM (LLM in Russian/Ukrainian) — not currently a goal

---

## Total commitment if all 3 done

| | Effort | Cost (one run) | Coverage gain |
|---|---|---|---|
| Task 1 (packs) | 1h | $1.50 | 25→35 archetypes |
| Task 2 (providers) | 2h | $10 | Model-suitability matrix |
| Task 3 (downstream) | 2h | $5 | 4 → 8 stages per archetype |
| **Total** | **5h** | **$16.50** | **Full pipeline × full archetype × multi-provider** |

After all 3 done: great_cto has the most rigorous real-LLM
agent-orchestration test suite of any open-source project (verified
via this comprehensive matrix).
