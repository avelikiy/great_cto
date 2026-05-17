# LEASH Review — {slug}

> Reviewer: `ai-leash-reviewer`
> Phase: pre-implementation
> Reference: [llm-leash](https://github.com/avelikiy/llm-leash)
> Output of this doc gates `gate:ship` for `archetype: ai-system | agent-product` and any project with LLM SDK dependencies.

## 1. Integration mode

- **Mode chosen:** `in-process` | `http-proxy` | `hybrid`
- **Rationale:** {why this mode — latency, multi-language, multi-worker, ops cost}
- **Wrapper site:** {file:line where `Firewall.wrap(client)` is called, OR env-var that points to proxy}
- **Latency budget:** target p95 overhead < 5 ms; current measurement: {value} / {how measured}

## 2. Budget controls

| Layer | Cap (USD) | Soft-warn | Notes |
|---|---|---|---|
| Daily | $___ | ___% | |
| Monthly | $___ | ___% | |
| Per-user (multi-tenant only) | $___ | ___% | |
| Per-session | $___ | ___% | |

- **Webhook on soft-warn:** {URL or "none"}
- **ENV overrides:** dev=$___ / staging=$___ / prod=$___
- **Provider tier:** {Sonnet | Haiku | Opus | mixed} — pricing assumptions: {link or value}
- **Sign-off ($/day > $1000):** `__pending__` / CTO countersign in `PROJECT.md`

## 3. Audit log

- **Sink:** `jsonl+sqlite` | `redis-stream` | `s3` | `cloud`
- **Path / URL:** `~/.leash/audit.jsonl` (or)
- **Hash chain:** enabled? `yes` / `no` — algorithm: `sha256`
- **Retention:** {N} days/months — required minimum by compliance: {SOC2=13mo / HIPAA=6yr / PCI=1yr}
- **PII redaction:** built-in patterns enabled? custom patterns: {list}
- **Verification cron:** `leash verify-chain --since 24h` runs in {CI / cron / manual}

## 4. Kill switch

- **Transport:** `in-process` | `redis` | `http`
- **Authorised to fire:** {ops on-call / board UI button / CLI / API token}
- **Propagation budget:** target < 300 ms across {N} replicas
- **Integration test:** `tests/integration/test_leash_kill.py` — present? `yes` / `no`
- **Post-kill audit check:** zero provider billings after kill timestamp — verified? `yes` / `no`

## 5. HITL gates

| Tool | Tier | HITL required | Webhook | Approver |
|---|---|---|---|---|
| `read_file` | Read | no | — | — |
| `write_file` | Write-local | optional | — | — |
| `send_email` | Write-external | **yes** | {url} | {role} |
| `payment.*` | Irreversible | **yes** | {url} | {role} |
| `shell` | Privileged | **yes (2-person)** | {url} | {two roles} |

Add one row per tool the agent exposes. Cross-reference `agent-pack.md § Irreversible Action Heuristic`.

## 6. Tool ACL

- **Policy file:** `.leash/policy.yaml` — under source control? `yes` / `no`
- **Default stance:** `deny` (required)
- **Drift test:** `leash test-policy fixtures/*.json` in CI? `yes` / `no`
- **Notable ALLOW patterns:** {list — should be minimal and specific}

## 7. PII redaction rules

Built-in (always on):
- [x] SSN
- [x] Credit card
- [x] Email
- [x] Phone

Custom (domain-specific):
- [ ] Medical record number — pattern: `MRN[0-9]{7}`
- [ ] {other — list each}

Redaction happens **before** audit-log write? `yes` (required) / `no` (blocker).

## 8. Metrics + alerts

- **Prometheus scrape:** `:9000/metrics` — configured? `yes` / `no`
- **Blocked-call counter:** `leash_calls_blocked_total` — alerting threshold: {value}/min
- **p99 overhead alert:** SLO `< 10 ms`, page on breach > 5 min
- **Cost dashboard:** {link to Grafana / board /leash tab}

## 9. Severity + sign-off

| ID | Severity | Finding | Mitigation (file:line / test) | Status |
|---|---|---|---|---|
| C1 | Critical | {e.g. direct `Anthropic()` call in app/llm.py:42 bypasses leash} | wrap in `Firewall.wrap` | `__pending__` |
| H1 | High | {e.g. no daily budget cap} | set `daily_usd: 50` in `.leash/policy.yaml` | `__pending__` |
| M1 | Medium | {e.g. audit retention < 13 months} | set `retention: 13mo` | `__pending__` |

Every Critical and High must reach `mitigated` (with file:line or test reference) OR `accepted-residual` (with CTO countersign in `PROJECT.md`) before this review is signed off.

## 10. Hand-off

```
<!-- HANDOFF
  to senior-dev: {N} controls to land
  to ai-eval-engineer: cost-overrun + kill-switch eval suites
  CI gates required: leash verify-chain, leash test-policy
-->
```

---

_Generated from `skills/great_cto/templates/LEASH-REVIEW.md`_
