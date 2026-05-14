# Full 25-archetype real-pipeline coverage — 2026-05-14

Achieved 100% coverage of all great_cto archetypes via real LLM pipeline
test (architect → pm → senior-dev → archetype-reviewer).

## Results

```
Model:         anthropic/claude-sonnet-4 via OpenRouter
Pipelines:     25 (100% of archetypes)
LLM calls:     100 (25 × 4 stages)
Total cost:    $4.04
Pipeline pass: 25/25 (every architect/pm/senior-dev stage succeeded)
Reviewer pass: 1 of 25 APPROVED, 24 of 25 BLOCKED
```

The 24 BLOCKED verdicts are **correct outcomes** — reviewers correctly
identified domain-specific gaps in the planted stub implementations.
The 1 APPROVED (regulated) is the case where the stub (change-mgmt
approval flow with 4-eyes + audit log) was actually adequate for the
review criteria.

## Per-archetype results

| Archetype | Cost | Reviewer | Verdict | Human est | Ratio |
|---|---|---|---|---|---|
| web-service | $0.18 | qa-engineer | ⚠️ blocked | $450 | 484× |
| fintech | $0.15 | pci-reviewer | ⚠️ blocked | $1,200 | 727× |
| mlops | $0.16 | mlops-reviewer | ⚠️ blocked | $2,400 | 811× |
| enterprise-saas | $0.17 | enterprise-saas-reviewer | ⚠️ blocked | $0 | — |
| agent-product | $0.15 | ai-security-reviewer | ⚠️ blocked | $1,680 | 560× |
| gov-public | $0.17 | gov-reviewer | ⚠️ blocked | $0 | — |
| healthcare | $0.17 | healthcare-reviewer | ⚠️ blocked | $1,800 | 729× |
| cli-tool | $0.16 | cli-reviewer | ⚠️ blocked | $450 | 738× |
| streaming | $0.17 | streaming-reviewer | ⚠️ blocked | $2,800 | 795× |
| marketplace | $0.17 | marketplace-reviewer | ⚠️ blocked | $0 | — |
| cms | $0.17 | cms-reviewer | ⚠️ blocked | $0 | — |
| edtech | $0.16 | edtech-reviewer | ⚠️ blocked | $1,800 | 703× |
| insurance | $0.15 | insurance-reviewer | ⚠️ blocked | $0 | — |
| mobile-app | $0.16 | mobile-store-reviewer | ⚠️ blocked | $1,800 | 796× |
| ai-system | $0.17 | ai-security-reviewer | ⚠️ blocked | $1,200 | 718× |
| data-platform | $0.16 | data-platform-reviewer | ⚠️ blocked | $450 | 592× |
| infra | $0.16 | infra-reviewer | ⚠️ blocked | $400 | 869× |
| library | $0.14 | library-reviewer | ⚠️ blocked | $450 | 703× |
| web3 | $0.17 | oracle-reviewer | ⚠️ blocked | $300 | 180× |
| iot-embedded | $0.16 | firmware-reviewer | ⚠️ blocked | $0 | — |
| **regulated** | $0.16 | regulated-reviewer | **✅ approved** | $0 | — |
| commerce | $0.16 | pci-reviewer | ⚠️ blocked | $0 | — |
| devtools | $0.16 | devtools-reviewer | ⚠️ blocked | $0 | — |
| browser-extension | $0.15 | web-store-reviewer | ⚠️ blocked | $900 | 353× |
| game | $0.17 | game-reviewer | ⚠️ blocked | $0 | — |

## Key validation outcomes

### Pipeline orchestration works for all 25 archetypes

architect / pm / senior-dev produce expected artefacts in every archetype.
No archetype causes the pipeline to deadlock, misroute, or fail to spawn
the correct domain reviewer.

### Naming aliases all resolve correctly

The 4 non-canonical reviewer mappings work end-to-end:
- fintech → `pci-reviewer` ✓
- iot-embedded → `firmware-reviewer` ✓
- browser-extension → `web-store-reviewer` ✓
- mobile-app → `mobile-store-reviewer` ✓

### Ratio sanity bound — no 7,638× regressions

All 25 archetypes stayed under the 1000× human/LLM ratio guard added in
commit `f5053c6`. Highest observed ratios:
- infra: 869×
- mlops: 811×
- mobile-app: 796×
- streaming: 795×

All within plausible range. None triggered the sanity-bound suppression.

### healthcare-reviewer (added this session) works in production

The new agent (`agents/healthcare-reviewer.md`, commit `977e2b9`)
correctly BLOCKED the PHI export stub. Found at least one of: HIPAA
audit log gap, JWT scope absence, break-glass without reason field.

## Why this matters

Before: 7 archetypes had real-pipeline coverage. The other 18 were
seeded-artifact tested only — meaning the agent prompts had never been
exercised against a live LLM in their archetype context.

After: 25/25 verified end-to-end. Any future prompt regression that
breaks an archetype-specific pipeline (e.g. infra-reviewer suddenly
stops flagging IAM-overprivilege) will be caught the next time this
test runs.

## Cost economics

- Per run: $4.04 (Sonnet 4 via OpenRouter)
- Suggested cadence: quarterly + before major releases + after agent-prompt changes
- DO NOT add to CI (cost prohibitive at PR scale)

## Run reproducer

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
node tests/openrouter-multi-archetype.mjs               # all 25
node tests/openrouter-multi-archetype.mjs fintech mlops # subset
```

## What we still don't cover

- Multi-archetype runs in OTHER LLM providers (only tested via OpenRouter
  routing to Anthropic Sonnet 4). Should also try Haiku for cost-optimised
  reviewers + GPT-5 / Gemini for non-Anthropic stack health.
- Pipeline beyond stage 4 (qa-engineer, security-officer, devops, l3-support).
  These currently rely on seeded-artifact tests only.
- Multi-reviewer flows where archetype has 2+ reviewers (e.g. fintech =
  pci + regulated). Currently the test fires only the first reviewer.

These are future work; the 25/25 main-reviewer coverage is the largest
single jump in test coverage since the project started.
