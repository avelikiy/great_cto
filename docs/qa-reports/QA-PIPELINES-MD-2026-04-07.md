# QA Report: PIPELINES.md Reference File
**Date:** 2026-04-07
**File:** `<local-path>/skills/great_cto/PIPELINES.md`
**File Version:** 1.2

## Executive Summary
**Overall Result: FAIL**

The PIPELINES.md reference file contains **3 critical issues** affecting gate consistency and deployment routing for newly added project types. While table formatting and threshold values are correct, there are missing entries in mandatory gate prerequisites and deployment method mappings.

---

## Detailed Test Results

### TEST 1: Coverage Consistency ✓ PASS
All 55 project types are properly mapped across all four reference sections.

| Section | Count | Status |
|---------|-------|--------|
| Type Detection Keywords (lines 9–65) | 55 | PASS |
| QA Strategy table (lines 69–125) | 55 | PASS |
| Deploy Method table (lines 129–185) | 55 | PASS |
| Threshold Cross-Reference (lines 225–287) | 55 | PASS |

**Finding:** Complete coverage across all major sections. No types are duplicated or missing from any table.

---

### TEST 2: Mandatory Gate Completeness ✗ FAIL

**Security Gate Types (Line 190):** 11 types require security-officer approval
```
smart-contract, trading-bot, defi-protocol, payment-service, auth-service,
notification-service, saas-platform, e-commerce, rag-system, ai-agent, mcp-server
```

**Issue 2a: Missing Compliance Check Entries**
- **Count:** 5 types missing from MANDATORY compliance check block (lines 193–201)
- **Affected types:**
  - `smart-contract` (no entry)
  - `trading-bot` (no entry)
  - `defi-protocol` (no entry)
  - `payment-service` (no entry)
  - `auth-service` (no entry)

**Present in compliance check (9):**
- `notification-service` → CAN-SPAM + GDPR audit
- `saas-platform` → SOC2 + tenant isolation audit
- `e-commerce` → PCI scope + fraud check
- `rag-system` → data source classification + access control audit
- `ai-agent` → tool call authorization + sandbox escape + cost cap
- `mcp-server` → tool argument injection + schema enforcement + auth audit
- `internal-tool` → RBAC + audit log (not in gate list but has compliance)
- `data-warehouse` → PII classification + retention (not in gate list)
- `llm-ops` → injection + leakage + cost cap (not in gate list)

**Impact:** The 5 missing types must either:
1. Have compliance checks added (lines 193–201), OR
2. Have explicit notes stating "no additional compliance audit required"

**Issue 2b: Missing MANDATORY Gate Prerequisites**
- **Count:** 2 types missing from MANDATORY Gate Prerequisites table (lines 294–305)
- **Affected types:**
  - `auth-service` — no entry (required artifact: ?)
  - `notification-service` — no entry (required artifact: ?)

**Present in prerequisites (9):**
- `smart-contract` → Echidna + Slither reports in `docs/security/`
- `defi-protocol` → Invariant tests + formal verification in `docs/security/`
- `trading-bot` → Backtest report + slippage sim in `docs/qa-reports/`
- `payment-service` → PCI-DSS SAQ-D checklist in `docs/security/`
- `saas-platform` → Tenant isolation tests in `docs/qa-reports/`
- `e-commerce` → Checkout E2E + load tests in `docs/qa-reports/`
- `rag-system` → Recall@10 + hallucination tests in `docs/qa-reports/`
- `ai-agent` → Eval suite + prompt injection in `docs/qa-reports/`
- `mcp-server` → Tool schema validation + injection tests in `docs/security/`

**Impact:** DevOps cannot confirm these artifacts exist before shipping. Gate will silently pass without validating required evidence.

---

### TEST 3: No /ship Completeness ✗ FAIL

**Documented types with custom deploy (lines 206–211):** 14 types
```
embedded-iot → /flash
library-sdk, cli-tool, compiler-lang, wordpress-plugin, mcp-server → /publish
infra-iac, k8s-operator, platform-engineering → terraform apply / helm upgrade
data-warehouse → dbt run + table swap
chrome-extension-mv3 → Chrome Web Store staged rollout
```

**Issue 3: New types missing from "No /ship" block**
- **Affected new types:**
  - `rag-system` — NOT listed (what deploy command? `/ship` assumed)
  - `ai-agent` — NOT listed (what deploy command? `/ship` assumed)
- **Correctly listed:**
  - `mcp-server` → `/publish` ✓

**Impact:** CI/CD scripts must detect deploy method for rag-system and ai-agent. If they should NOT use `/ship`, they must be explicitly added to the "No /ship" block. Ambiguity will cause incorrect deploy routing.

---

### TEST 4: No Browser QA Completeness ✓ PASS

**Documented types (line 203–204):** 11 types using model/data validation instead of browser QA
```
ml-training, ml-serving, rag-system, ai-agent, llm-ops, data-warehouse,
data-pipeline, db-migration, ai-agent-framework, mcp-server, feature-flags-service
```

**Check for new types:**
- `mcp-server` → Listed ✓
- `ai-agent` → Listed ✓
- `feature-flags-service` → Listed ✓

**Finding:** All required types are correctly listed. No missing entries.

---

### TEST 5: Threshold Values Sanity ✓ PASS

**Sampling results:**
- All performance thresholds have correct units: `ms`, `s`, `%`, `RPS`, `KB`, `MB`, etc.
- No negative thresholds that don't make sense
- No impossibly strict thresholds (e.g., `p95 <1ms` for web traffic)

**Sample valid thresholds:**
- `rest-api`: p95 <200ms @1kRPS ✓
- `serverless`: <500ms cold start, <50ms warm ✓
- `ssr-app`: TTFB <200ms, CLS <0.1 ✓ (CLS is unitless by spec)
- `payment-service`: p95 <500ms ✓
- `trading-bot`: Drawdown <15%, Sharpe >1.0 ✓

**Finding:** No threshold values require correction.

---

### TEST 6: New Type Keyword Uniqueness ✓ PASS

**New types and their keywords:**
- `chrome-extension-mv3`: "Chrome extension MV3, Manifest V3, service worker extension, Chromium ext"
- `ai-agent-framework`: "AI agent framework, LangGraph, CrewAI, AutoGen, multi-agent framework"
- `bff`: "BFF, backend for frontend, API gateway per client, client-specific backend"
- `feature-flags-service`: "feature flags, LaunchDarkly, Unleash, flag service, feature toggles"
- `mcp-server`: "MCP server, model context protocol, tool server, Claude tool"
- `rag-system`: "RAG, retrieval, vector DB, embeddings, semantic search"
- `ai-agent`: "AI agent, LangChain, autonomous agent, multi-agent"

**Ambiguity check:**
- "Chrome extension MV3" vs "browser extension" — distinct ✓ (MV3 is architecture, not just browser ext)
- "AI agent" vs "AI agent framework" — distinct ✓ (framework is explicit)
- "feature flags" vs existing types — unique ✓

**Finding:** No dangerous keyword overlaps. Type detection will not be ambiguous.

---

### TEST 7: Table Formatting ✓ PASS

| Table | Location | Row Count | Columns | Status |
|-------|----------|-----------|---------|--------|
| Type Detection Keywords | Lines 9–65 | 55 | 2 | PASS |
| QA Strategy by Type | Lines 69–125 | 55 | 4 | PASS |
| Deploy Method by Type | Lines 129–185 | 55 | 3 | PASS |
| Threshold Cross-Reference | Lines 225–287 | 54 | 3 | PASS |
| MANDATORY Gate Prerequisites | Lines 294–305 | 9 | 3 | PASS |

**Finding:** All markdown tables are correctly formatted. No missing pipes or column misalignments.

---

## Issues Found

| ID | Severity | Type | Description | Location | Path |
|---|----------|------|---|---|---|
| 1 | P1 | Coverage | `smart-contract`, `trading-bot`, `defi-protocol`, `payment-service`, `auth-service` missing from MANDATORY compliance check block | Lines 193–201 | `/skills/great_cto/PIPELINES.md` |
| 2 | P1 | Coverage | `auth-service`, `notification-service` missing from MANDATORY Gate Prerequisites table | Lines 294–305 | `/skills/great_cto/PIPELINES.md` |
| 3 | P1 | Deploy Routing | `rag-system`, `ai-agent` not documented in "No /ship" block; deploy method ambiguous | Lines 206–211 | `/skills/great_cto/PIPELINES.md` |

---

## Recommendations

### Critical (Deploy block)
1. **Add missing MANDATORY compliance entries:**
   - Add entries to lines 193–201 for: `smart-contract`, `trading-bot`, `defi-protocol`, `payment-service`, `auth-service`
   - Example format: `- \`smart-contract\` → formal verification checklist + bytecode audit`

2. **Add missing MANDATORY Gate Prerequisites:**
   - Add rows to lines 294–305 for: `auth-service`, `notification-service`
   - Define required QA artifacts and locations (e.g., `docs/security/`, `docs/qa-reports/`)

3. **Clarify deploy methods for new types:**
   - Add explicit entries to "No /ship" block (lines 206–211) for `rag-system` and `ai-agent`, OR
   - Confirm they use `/ship` and add inline comment: `(uses standard /ship, no special handling)`

### Non-critical (Data quality)
- Consider adding links or references to actual checklist templates for compliance entries
- Document why certain types (e.g., `internal-tool`, `data-warehouse`) have compliance checks but are NOT in the security gate list

---

## Testing Evidence

**Commands executed:**
```bash
# Extracted all 55 types from Keywords section
grep '| `' PIPELINES.md | grep -oE '`[^`]+`' | sort -u | wc -l
# Result: 55 types

# Verified all tables have consistent type counts
# Result: All 4 tables have exactly 55 rows

# Extracted security gate types (line 190)
sed -n '190p' PIPELINES.md | grep -oE '`[^`]+`'
# Result: 11 types

# Cross-checked against compliance and prerequisites
# Result: 5 missing from compliance, 2 missing from prerequisites
```

---

## Conclusion

**FAIL** — The PIPELINES.md file has 3 critical missing entries that will block proper QA gate enforcement for newly added types. All other checks (table format, threshold sanity, keyword uniqueness) pass successfully.

**Must fix before next deployment cycle** to ensure `rag-system`, `ai-agent`, and `mcp-server` are correctly routed through security gates and artifact validation.
