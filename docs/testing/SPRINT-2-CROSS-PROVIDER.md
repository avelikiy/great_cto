# Sprint 2 — Cross-provider testing (run instructions)

Status: 🟡 **Harness ready, awaiting OpenRouter credits**

## What it does

Runs the same 5 representative archetypes through 4 different LLM
providers to surface prompt assumptions that depend on Anthropic
specifics. Produces a `✅/⚠️/❌` matrix per (archetype × model).

## Why

Today, all great_cto agents are tested against Sonnet 4 only. We don't
know which agents:
- Work equally well on Haiku 4.5 (4× cheaper)
- Depend on Anthropic prompting style (would fail on GPT-5 / Gemini)
- Need explicit phrasing to work cross-provider

Cross-provider matrix gives data-driven answers — informs model selection
per agent in production (e.g. "use Haiku for cli-reviewer, Sonnet for
oracle-reviewer").

## Coverage

5 archetypes × 4 stages × 4 models = **80 LLM calls per full run**.

**Archetypes** (selected to maximize reviewer diversity):
- `fintech` (pci-reviewer — high regulatory specificity)
- `healthcare` (healthcare-reviewer — newest agent)
- `web3` (oracle-reviewer — Solidity-specific)
- `enterprise-saas` (enterprise-saas-reviewer — multi-tenant complexity)
- `cli-tool` (cli-reviewer — simplest baseline)

**Models** (via OpenRouter):
- `anthropic/claude-sonnet-4` — current baseline ($3/$15 per M)
- `anthropic/claude-haiku-4.5` — 4× cheaper ($0.80/$4 per M)
- `openai/gpt-5` — non-Anthropic ($10/$30 estimated)
- `google/gemini-2.5-pro` — alternative ($1.25/$5)

## Cost estimate

| Model | Per-call cost | × 20 calls | Sub-total |
|---|---|---|---|
| Sonnet 4 | ~$0.15 | 20 | $3.00 |
| Haiku 4.5 | ~$0.03 | 20 | $0.60 |
| GPT-5 | ~$0.25 | 20 | $5.00 |
| Gemini 2.5 Pro | ~$0.06 | 20 | $1.20 |
| **Total** | | 80 calls | **~$9.80** |

## Run instructions

### Full run

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
node tests/openrouter-cross-provider.mjs
```

Output:
1. Live console matrix with per-cell verdict + cost
2. `docs/testing/CROSS-PROVIDER-MATRIX.md` written with full details

### Subset runs (cheaper exploration)

```bash
# One model across all archetypes (~$3 for sonnet, $0.60 for haiku)
node tests/openrouter-cross-provider.mjs --model sonnet

# One archetype across all models (~$1.60 for fintech)
node tests/openrouter-cross-provider.mjs --archetype fintech

# Anthropic-only comparison (sonnet vs haiku, ~$3.60)
node tests/openrouter-cross-provider.mjs --model sonnet,haiku
```

## Expected output

Matrix like:

```
                  Sonnet 4   Haiku 4.5   GPT-5      Gemini 2.5
fintech           ✅ PASS    ✅ PASS     ⚠️ PARTIAL  ✅ PASS
healthcare        ✅ PASS    ⚠️ PARTIAL  ✅ PASS     ⚠️ PARTIAL
web3              ✅ PASS    ❌ FAIL    ✅ PASS     ✅ PASS
enterprise-saas   ✅ PASS    ✅ PASS    ✅ PASS     ✅ PASS
cli-tool          ✅ PASS    ✅ PASS    ✅ PASS     ✅ PASS
```

What we'd learn:
- "Haiku works for cli-tool / enterprise-saas / fintech but misses oracle subtleties → use Haiku for those, Sonnet for web3"
- "GPT-5 partial on fintech → PCI prompt depends on Anthropic specifics"
- "Gemini misses healthcare nuance → need HIPAA cues that don't rely on Claude-style implicit reasoning"

## Cell-verdict semantics

| Symbol | Meaning |
|---|---|
| ✅ **PASS** | Reviewer BLOCKED the planted-vuln stub + flagged ≥1 expected domain keyword |
| ⚠️ **PARTIAL** | Reviewer BLOCKED but missed expected keywords (shallow review) |
| ❌ **FAIL** | Reviewer APPROVED a clearly-deficient stub (bad outcome) |
| 💥 **ERROR** | API call failed (rate limit, auth, etc.) |

PASS is the only acceptable outcome. ⚠️ PARTIAL means the prompt
works on that model but loses domain-specific rigor.

## When to run

- **Before changing an agent prompt that's been validated on Sonnet**
- **When considering switching default model** (e.g. cost-optimisation
  from Sonnet to Haiku)
- **Quarterly** to detect drift as model providers update

## What blocks this from running today

OpenRouter credit balance. Each full run is ~$10. Top up at
https://openrouter.ai/settings/credits, then run as above.

## Files involved

- `tests/openrouter-cross-provider.mjs` — runner (this Sprint)
- `docs/testing/CROSS-PROVIDER-MATRIX.md` — output (created on each run,
  overwrites previous)
- `agents/<reviewer>.md` — prompts under test (unchanged)
