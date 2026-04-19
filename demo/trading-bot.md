# Demo: Trading Bot

**Stack**: Rust (execution), Python ML models, K8s
**Detected types**: `trading-bot` (primary) + `ml-serving` (secondary)
**Pipeline**: backtest → paper-trade gate → K8s canary + shadow traffic

---

## Session transcript

```
/start "Rust trading bot with Python ML models, K8s deploy, Kafka for order stream"

Great CTO: Got it: trading-bot + ml-serving. Ready to build.

"build order execution engine with position sizing and backtest harness"

[tech-lead — Opus]
Architecture ready → docs/architecture/ARCH-order-execution.md
• Rust async execution engine with Tokio, Python model sidecar via gRPC
• Kafka consumer for market data, PostgreSQL for trade history
• Backtest harness: 12 months historical data, Sharpe ratio gate
• K8s canary with 5min shadow traffic phase before full rollout
Proceed? [yes/no]

approve

[senior-dev — Sonnet]
Branch: feat/123-order-execution
TDD: 47 tests (unit + integration)
PR: #12 opened

[red-team — Sonnet]
Attacks run: 23
• P1: Race condition in position sizing under concurrent fills → filed bug BUG-045
• P1: Integer overflow in PnL calc at >10M position size → filed bug BUG-046
• P2: Missing circuit breaker on consecutive losses
Senior-dev fixing P1s...

[qa-engineer + security-officer + runbook-writer — parallel]
QA: PASS
  • Backtest: Sharpe 1.8 (threshold: >1.2) ✓
  • Latency: p95=28ms p99=41ms (threshold: p99 <50ms) ✓
  • Shadow traffic: 0 divergence from paper-trade
Security: APPROVED
  • API keys in Vault (not env vars) ✓
  • Kafka SASL/SSL configured ✓
  • No hardcoded secrets ✓
Runbook: docs/runbooks/RB-order-execution-2026-04-07.md ✓
Confidence: HIGH

Ready to deploy.
QA: PASS | Security: APPROVED | Confidence: HIGH
Deploy? [yes/no]

ship it

[devops — Haiku]
Staging: canary 10% → shadow traffic 5min → 0 divergence → PASS
Production: canary → 100% rollout
CHANGELOG.md updated ✓
Release: docs/releases/RELEASE-2026-04-07.md ✓

[observability — Haiku]
Alerts: fill-rate < 95% → P1, p99 > 100ms → P1, error rate > 1% → P0
Dashboard: Grafana trading-bot-prod
SLO: 99.9% uptime, p99 < 50ms

Deploy complete.
p99: 38ms | Fill rate: 99.2% | Shadow traffic divergence: 0
```

---

## Key pipeline rules applied (from PIPELINES.md)

| Rule | Applied |
|------|---------|
| Backtest before paper-trade | ✓ |
| Shadow traffic canary phase | ✓ |
| Latency p99 < 50ms threshold | ✓ |
| Sharpe ratio gate | ✓ |
| MANDATORY security gate | ✓ (trading-bot) |
| Kafka consumer validation | ✓ |
