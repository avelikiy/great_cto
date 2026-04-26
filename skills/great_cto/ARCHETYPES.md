# Archetypes — Pipeline Rules by Archetype

> 10 archetypes cover 95% of projects. Domain packs add depth for specialized needs.
> See TYPE_MAP.md for how 75+ specific types resolve to archetypes (internal).

## User-facing scales vs internal sizes

The CTO chats about three scales: `quick` / `standard` / `deep`. Agents read five internal sizes from PROJECT.md:

| User-facing | Internal `size:` values | When |
|-------------|------------------------|------|
| `quick` | `nano` OR `small` | Hotfix, typo, new endpoint, small feature |
| `standard` | `medium` (default) | Standard feature, new service |
| `deep` | `large` OR `enterprise` | Cross-cutting, regulated, arch migration |

`/start` writes the canonical internal name to PROJECT.md. Agents never need to know about the user-facing vocabulary.

For approvals: the CTO chooses `auto` or `review` (default); PROJECT.md stores `auto` / `gates-only` (canonical). Advanced levels (`strict` / `expert` / `step-by-step`) are opt-in, written verbatim.

## Archetype Definitions

Security gate is tier-based since v1.0.102 — see `references/security-tiers.md` for definitions.
Signals emitted by `senior-dev` (new deps, auth-path changes, PII columns, IAM diffs) can **upgrade** the tier at runtime.

| Archetype | Description | Default tier | Default compliance |
|-----------|-------------|--------------|-------------------|
| `web-service` | Backend APIs, web apps, full-stack | **baseline** (→ standard on auth/crypto signals) | OWASP Top 10, GDPR if EU users |
| `mobile-app` | Mobile, desktop, Electron apps | **baseline** (→ standard on payment/biometric signals) | OWASP MASVS, platform privacy |
| `ai-system` | Internal AI/ML: RAG, LLM ops, evals, voice, multimodal — not user-facing agents | **standard** (→ deep on MCP/tool-use) | EU AI Act check, model card |
| `agent-product` | User-facing autonomous agents built on Claude Agent SDK / LangGraph / CrewAI. Agent executes tools on behalf of end-users. | **deep** (always — user input controls tool execution) | OWASP LLM Top 10, EU AI Act, GDPR if storing memory |
| `data-platform` | Pipelines, warehouses, feature stores, analytics | **baseline** (→ standard on PII) | PII classification, data lineage |
| `infra` | IaC, K8s, platform engineering, DevOps tools | **standard** | CIS Benchmarks |
| `library` | SDKs, CLIs, compilers, plugins (consumed by other devs as a dependency) | **baseline** (never off — supply-chain floor) | OpenSSF Scorecard, SBOM |
| `devtools` | Developer platforms: API-first products, SDKs as the product, agent infra, RAG/eval platforms, IDE plugins | **standard** | OpenSSF Scorecard, OpenAPI/GraphQL stability |
| `browser-extension` | MV3 Chrome / Firefox / Safari / Edge extensions | **standard** (→ deep on host_permissions:<all_urls>) | Web Store review, CSP, host_permissions audit |
| `game` | Single/multi-player games, game engines, game services | **baseline** (→ deep on multiplayer + anti-cheat) | COPPA if <13, age ratings (ESRB/PEGI), accessibility |
| `commerce` | E-commerce, payments, SaaS platforms | **standard** (→ deep on PCI dep) | PCI-DSS, SOC2 |
| `web3` | Smart contracts, DeFi, exchanges, wallets | **deep** | SWC Registry, KYC/AML |
| `iot-embedded` | IoT devices, hardware drivers, edge computing | **deep** | ETSI EN 303 645 |
| `regulated` | GxP, critical infra, financial services, automotive | **deep** | Domain-specific (see pack) |

**Tier floor:** `baseline` (CVE + secret scan, ~2 min) runs on **every** pipeline, no exceptions. Previous "no gate" default for `library` is removed — supply-chain attacks made that default indefensible.

## QA Strategy by Archetype

| Archetype | Primary QA | Secondary QA | Default threshold |
|-----------|-----------|-------------|------------------|
| `web-service` | Unit + integration + E2E (Playwright) + OWASP scan | Load test (k6), contract test (Pact) | p95 < 200ms, coverage ≥ 80%, 0 OWASP critical |
| `mobile-app` | Unit + UI test + device matrix | Accessibility audit, perf profiling | Launch < 2s, crash rate < 0.1%, coverage ≥ 75% |
| `ai-system` | Eval suite (accuracy/F1/BLEU per task) + prompt regression + cost cap test | Bias/fairness audit, hallucination rate test | Accuracy ≥ baseline, cost ≤ 2× baseline, hallucination ≤ 2% |
| `agent-product` | Agent evals (task completion rate, tool accuracy) + prompt injection test suite + cost regression | Cross-user isolation test, loop bound verification, output filter test | Task completion ≥ 80%, 0 prompt injection bypasses, cost ≤ budget cap, 0 cross-user leaks |
| `data-platform` | Data contract validation + schema test + lineage audit | Freshness SLA, PII scan | 0 schema violations, lineage 100% traced, freshness ≤ SLA |
| `infra` | Terratest / `terraform plan` + CIS benchmark scan | DR failover drill, cost delta check | 0 CIS critical, plan matches intent, cost delta < 20% |
| `library` | Unit + cross-version compat matrix + semver check | Benchmark regression, bundle size | 0 breaking changes (unless major), coverage ≥ 90% |
| `devtools` | Unit + integration + SDK example test (each language) + OpenAPI/GraphQL contract test | API spec linting, SDK auto-gen verification, docs build | 0 breaking spec changes (unless major), SDK examples pass on all supported runtimes, docs build clean |
| `browser-extension` | Unit + content script test + MV3 service worker lifecycle test + cross-browser smoke | Web Store review pre-flight, host_permissions audit, performance profile | 0 Web Store policy violations, host_permissions justified, no eval/innerHTML on untrusted input |
| `game` | Unit + gameplay smoke (deterministic) + frame-time budget + memory profile per platform | Multiplayer netcode test (latency injection), anti-cheat verification, age-rating pre-flight | 60 FPS sustained on baseline device, no memory leaks across 1h play, multiplayer rollback recovers within N frames |
| `commerce` | Unit + E2E checkout flow + idempotency proof + PCI scan | Load test, reconciliation test | p95 < 200ms, 0 PCI findings, idempotency verified |
| `web3` | Unit + fuzz (Echidna) + static analysis (Slither) + formal verification | Economic attack sim, gas optimization | 0 Slither high/critical, fuzz 10k+ runs, formal spec verified |
| `iot-embedded` | QEMU/HIL test + OTA update test + ETSI checklist | Power profiling, field condition sim | 0 ETSI critical, OTA verified, memory < limit |
| `regulated` | Full compliance suite per domain (see enterprise-pack) | Pentest, audit trail completeness | 0 compliance violations, audit trail 100% |

## Deploy Method by Archetype

| Archetype | Deploy | Rollback |
|-----------|--------|----------|
| `web-service` | Canary (1%→5%→25%→100%) or blue-green | Previous container tag / git revert |
| `mobile-app` | Staged rollout (1%→10%→50%→100%) per app store | Rollback store version / feature flag disable |
| `ai-system` | Shadow mode → A/B test → full traffic | Previous model version / prompt rollback |
| `agent-product` | Feature flag off → 1% canary (monitor cost + errors) → 10% → 100%. Async agents via queue. | Disable feature flag / drain queue / roll back agent version |
| `data-platform` | Backfill → validate → promote | Restore previous pipeline version, re-run |
| `infra` | `terraform apply` / `helm upgrade` with plan review | `terraform apply` previous state / `helm rollback` |
| `library` | Publish to registry (staging tag → release tag) | Yank + publish previous version |
| `devtools` | API: canary 1%→5%→25%→100% on tenant boundaries. SDK: publish per language registry (npm/PyPI/crates/Maven/NuGet) on tag. Docs site: atomic deploy. | API: traffic-shift to previous version. SDK: yank + restore previous version, dispatch deprecation note via SDK telemetry. |
| `browser-extension` | Web Store staged rollout (1%→10%→50%→100%) per browser. Submit + wait for review (Chrome ~24h, Firefox ~24-72h, Safari ~7d, Edge ~24h). | Submit previous version as new build (Web Stores have no instant rollback). Pre-stage emergency previous build before risky release. |
| `game` | Console: certification → staged via store dashboard. PC (Steam): branch system (default branch + opt-in beta). Mobile: standard store rollout. Live-service: feature flag + remote config. | Roll back via store dashboard branch swap (Steam < 5min, console depends on cert). Live-service: feature flag off, drain matchmaking, hotfix patch. |
| `commerce` | Canary with transaction monitoring | Instant traffic shift to previous version |
| `web3` | Timelock → multisig → deploy (proxy upgrade if upgradeable) | Emergency pause / proxy downgrade |
| `iot-embedded` | OTA staged rollout (1%→10%→100% of devices) | OTA rollback to previous firmware |
| `regulated` | Validated deploy: approval chain → change control → deploy → verify | Documented rollback per compliance framework |

## Gates by Archetype × Size

| Gate | nano | small | medium | large | enterprise |
|------|------|-------|--------|-------|-----------|
| `gate:arch` | — | — | ✅ | ✅ | ✅ |
| `gate:code` | — | — | if strict | ✅ | ✅ |
| `gate:ship` | — | ✅ | ✅ | ✅ | ✅ |
| `gate:compliance` | — | — | — | — | ✅ |

Override: if archetype has `security gate: mandatory` → minimum `medium` size → always includes security-officer.

**Single source of truth for mandatory security gate** — archetypes with `mandatory` in the table above:
`ai-system`, `commerce`, `web3`, `iot-embedded`, `regulated`

**v1.0.102+ note:** per-type `security-gate:` overrides in TYPE_MAP.md are deprecated and
ignored. Tier derives from archetype + signals (see `references/security-tiers.md`). The
archetypes listed above are the only mandatory-security set; everything else runs at its
archetype default tier and upgrades on signal.

## Required Agents by Size

| Agent | nano | small | medium | large | enterprise |
|-------|------|-------|--------|-------|-----------|
| tech-lead | — | ✅ | ✅ | ✅ | ✅ |
| senior-dev | ✅ | ✅ | ✅ | ✅ | ✅ |
| qa-engineer | — | ✅ lightweight | ✅ | ✅ | ✅ |
| security-officer | — | if mandatory | ✅ if mandatory | ✅ | ✅ |
| devops | — | ✅ simple | ✅ | ✅ canary | ✅ canary |
| l3-support | — | — | ✅ 15min | ✅ 30min | ✅ 60min+ |

## Parameters (override archetype defaults via PROJECT.md)

These parameters customize behavior without changing archetype:

```yaml
# PROJECT.md — parameter section
archetype: web-service
approval-level: strict

# Compliance (additive — each adds checklist items)
compliance: [gdpr, pci-dss, hipaa, sox]

# Security (v1.0.102+ tier model — see references/security-tiers.md)
default-tier: standard            # override archetype's default tier (rarely needed)
tier-override-reason: "explain why" # mandatory when downgrading from archetype default

# Performance SLA (overrides archetype default)
performance-sla: p95 < 100ms

# QA extras (from domain packs — extend base QA)
qa-extras: [wer, ttfb, barge-in]  # voice-specific from ai-pack

# Cloud (triggers Well-Architected review in ARCH doc)
cloud: aws

# Domain pack (loads additional rules)
packs: [ai-pack, enterprise-pack]
```

### Parameter Resolution Order

1. **Archetype base** — default QA, deploy, thresholds from table above
2. **approval-level** — gates and checkpoints scaled per level
3. **compliance: []** — each value adds compliance checklist items to security-officer
4. **qa-extras: []** — each value adds QA checks to qa-engineer (from domain pack)
5. **Explicit overrides** — `performance-sla`, `security-gate`, `review_mode` override any default
6. **Domain pack** — `packs: [ai-pack]` loads additional type-specific depth

### Packs Auto-load Map

Each archetype auto-loads a domain pack when the archetype is detected. Multiple packs can be combined.

| Archetype | Auto-loaded pack | What the pack adds |
|-----------|------------------|--------------------|
| `web-service` | `web-pack` | Framework decision tree (Next/Nuxt/Hono/Fastify), ORM choice, edge runtime constraints, auth providers, perf budgets |
| `mobile-app` | `mobile-pack` | Native vs Flutter vs RN vs KMM decision, App Store / Play submission gotchas, MASVS V1-V8 detailed checklist, OTA update patterns |
| `ai-system` | `ai-pack` | LLM serving (vLLM/Ollama), prompt programming (DSPy/Instructor), evaluation (Ragas/Promptfoo/Braintrust), vector DBs |
| `agent-product` | `agent-pack` | OWASP LLM Top 10, agent constitution, budget cap, tool sandboxing, isolation, Langfuse observability |
| `data-platform` | `data-pack` | dbt/Dagster/Polars/DuckDB/Iceberg, lakehouse patterns, streaming, data quality |
| `infra` | `infra-pack` | Terraform/Pulumi/CDK decision, GitOps (ArgoCD/Flux), FinOps + Karpenter, secrets, observability stack |
| `library` | `library-pack` | OpenSSF Scorecard, npm provenance, PyPI Trusted Publishing, SBOM (Syft), semver enforcement, deprecation policy |
| `devtools` | `devtools-pack` | API-first design, OpenAPI/GraphQL spec stability, multi-language SDK quality, docs as product, deprecation channels, dev relations |
| `browser-extension` | `browser-extension-pack` | MV3 service worker, content script isolation, host_permissions audit, Web Store review pre-flight, cross-browser compat |
| `game` | `game-pack` | Engine choice (Unity/Unreal/Godot/custom), multiplayer netcode (rollback/lockstep), anti-cheat, monetization (IAP/loot box compliance), platform certifications, age ratings |
| `commerce` | `commerce-pack` | Stripe/Adyen/Paddle decision, subscription billing, idempotency, fraud detection, PCI-DSS scope reduction, tax |
| `web3` | `web3-pack` | Slither/Echidna/Foundry/Certora, KYC/AML, custody (HSM/MPC/Shamir), MEV protection |
| `iot-embedded` | (no dedicated pack — use detection signals) | platformio.ini, Zephyr (`west.yml`), ESP-IDF detected from filesystem |
| `regulated` | `enterprise-pack` | DORA, NIS2, GxP/21CFR11, ISO 27001, TISAX detailed checklists |

**Multi-pack combinations** — common stacking patterns:

- `[ai-pack, enterprise-pack]` — regulated AI system (e.g. healthcare diagnosis)
- `[web-pack, commerce-pack]` — SaaS with checkout
- `[mobile-pack, commerce-pack]` — mobile app with in-app purchases
- `[infra-pack, enterprise-pack]` — regulated infrastructure (financial services, critical infra)
- `[library-pack, ai-pack]` — open-source LLM SDK

### Parameter Values

| Value | What it adds |
|-------|-------------|
| `gdpr` | Privacy notice, consent mechanism, right-to-erasure, DPIA |
| `pci-dss` | PCI-DSS SAQ-D checklist, TLS audit, MFA enforcement |
| `hipaa` | PHI isolation, access log, BAA verification |
| `sox` | SOX ITGC: change management, logical access, computer ops, SoD |
| `soc2` | Access controls, audit logging, encryption at rest + transit |
| `iso27001` | Annex A 93 controls, SoA, risk register, internal audit |
| `dora` | ICT risk assessment, third-party register, TLPT, incident classification |
| `nis2` | Article 21 measures, Article 23 reporting, supply chain security |
| `21cfr11` | Electronic records, signatures, IQ/OQ/PQ, audit trail, CAPA |
| `tisax` | VDA ISA checklist, AL determination, prototype protection |
| `togaf` | ADM phase mapping in ARCH doc |
| `eu-ai-act` | Annex III high-risk check, conformity assessment, EUAI database |
| `tcpa` | Call recording consent, opt-out, autodial restrictions |
| `ccpa` | California privacy rights, opt-out of sale |
| `casl` | Canadian anti-spam, express consent |
