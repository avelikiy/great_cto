# Archetypes — Pipeline Rules by Archetype

> 10 archetypes cover 95% of projects. Domain packs add depth for specialized needs.
> See TYPE_MAP.md for how 75+ specific types resolve to archetypes.

## Archetype Definitions

| Archetype | Description | Security gate | Default compliance |
|-----------|-------------|--------------|-------------------|
| `web-service` | Backend APIs, web apps, full-stack | conditional (medium+) | OWASP Top 10, GDPR if EU users |
| `mobile-app` | Mobile, desktop, Electron apps | conditional (medium+) | OWASP MASVS, platform privacy |
| `ai-system` | AI/ML agents, RAG, LLM apps, voice, multimodal | mandatory | EU AI Act check, model card |
| `data-platform` | Pipelines, warehouses, feature stores, analytics | conditional (large+) | PII classification, data lineage |
| `infra` | IaC, K8s, platform engineering, DevOps tools | conditional (medium+) | CIS Benchmarks |
| `library` | SDKs, CLIs, compilers, extensions, plugins | no | OpenSSF Scorecard, SBOM |
| `commerce` | E-commerce, payments, SaaS platforms | mandatory | PCI-DSS, SOC2 |
| `web3` | Smart contracts, DeFi, exchanges, wallets | mandatory | SWC Registry, KYC/AML |
| `iot-embedded` | IoT devices, hardware drivers, edge computing | mandatory | ETSI EN 303 645 |
| `regulated` | GxP, critical infra, financial services, automotive | mandatory (always enterprise) | Domain-specific (see pack) |

## QA Strategy by Archetype

| Archetype | Primary QA | Secondary QA | Default threshold |
|-----------|-----------|-------------|------------------|
| `web-service` | Unit + integration + E2E (Playwright) + OWASP scan | Load test (k6), contract test (Pact) | p95 < 200ms, coverage ≥ 80%, 0 OWASP critical |
| `mobile-app` | Unit + UI test + device matrix | Accessibility audit, perf profiling | Launch < 2s, crash rate < 0.1%, coverage ≥ 75% |
| `ai-system` | Eval suite (accuracy/F1/BLEU per task) + prompt regression + cost cap test | Bias/fairness audit, hallucination rate test | Accuracy ≥ baseline, cost ≤ 2× baseline, hallucination ≤ 2% |
| `data-platform` | Data contract validation + schema test + lineage audit | Freshness SLA, PII scan | 0 schema violations, lineage 100% traced, freshness ≤ SLA |
| `infra` | Terratest / `terraform plan` + CIS benchmark scan | DR failover drill, cost delta check | 0 CIS critical, plan matches intent, cost delta < 20% |
| `library` | Unit + cross-version compat matrix + semver check | Benchmark regression, bundle size | 0 breaking changes (unless major), coverage ≥ 90% |
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
| `data-platform` | Backfill → validate → promote | Restore previous pipeline version, re-run |
| `infra` | `terraform apply` / `helm upgrade` with plan review | `terraform apply` previous state / `helm rollback` |
| `library` | Publish to registry (staging tag → release tag) | Yank + publish previous version |
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

Plus individual type overrides in TYPE_MAP.md `Overrides` column (`security-gate: mandatory`).
All agents should reference this list from ARCHETYPES.md, not maintain their own.

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

# Security
security-gate: mandatory          # force security-officer

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
