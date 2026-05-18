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

## 6a. Policy rules inventory (v2.23 GA)

Mark every rule the project has consciously decided to ENABLE or SKIP. Default for `ai-system` / `agent-product` projects is the full GA set; `SKIP` requires a written rationale per row.

| Rule | Tier | Enabled? | Notes |
|---|---|---|---|
| `SecretsRule` | cheap | required | Detects AWS keys / GitHub PATs / Stripe / OpenAI / Anthropic / PEMs / JWTs in prompts and outputs |
| `PresidioRule` | cheap | required | PII redaction (SSN, credit card, email, phone, custom patterns) |
| `ArtifactLeakageRule` (v2.7 GA) | cheap | required | Detects file paths, internal repo names, secret-file references leaking via LLM output |
| `ToolResultScanner` (v2.19) | cheap | **required** | OWASP LLM01 — indirect prompt injection in tool-result content. 7 detectors (injection markers, role confusion, hidden channels, exfil phrases, zero-width chars, script mixing, long base64 blobs). The #1 unaddressed attack vector for agentic systems. |
| `BehavioralBaselineRule` (v2.3) | cheap | recommended | Anomaly detection on token-spike / new-model / new-tool patterns; needs SQLite or in-memory baseline store |
| `ExfilChainDetector` (v2.21) | cheap | recommended | Session-correlated: catches sensitive→encode→exfil sequence in a 60s window. Needs `window_store=`. |
| `EnumerationDetector` (v2.21) | cheap | recommended | Rapid same-tool repetition (≥10× in 30s → warn). Useful against reconnaissance / scraping. |
| `LocalLLMGuardRule` (v2.9) | expensive | **recommended default** | Local LLM (Ollama / vLLM / LM Studio) for semantic threat detection — ~$0 / ~100 ms. Front-runs `LLMGuardRule`. |
| `LLMGuardRule` (v2.2) | expensive | optional fallback | Cloud Haiku-based semantic guard, ~$1/1k escalations, ~500 ms. Use only if LocalLLMGuard cannot serve. |
| `LlamaFirewallRule` | expensive | optional | External scanner integration via `external.py` adapter |

For each row that's `SKIP`, fill the rationale: {row → why omitted}.

**Cascade design** (two-stage):
- Cheap rules fire on every call (~ms each)
- If any cheap rule signals `warn` or `hitl`, expensive tier escalates
- LocalLLMGuard runs first in expensive tier; if it abstains/fails, falls through to cloud LLMGuard
- Cost: ~$0.10/1k escalations at 90% local-hit rate (vs $1/1k Haiku-only)

**Engine choice** (v2.20):
- `PolicyEngine` (default): first rule to fire wins.
- `EnsemblePolicyEngine`: weighted multi-rule aggregation. Reduces FP by requiring corroboration, catches weak signals via summation. Opt-in via `Firewall(engine=EnsemblePolicyEngine(...))`. Recommended for prod fintech / healthcare where FP cost is high.

**Operator feedback loop** (v2.22 — required for prod):
- Every HITL approve/reject is now an audited `HitlDecisionEvent` linked to the original `policy_decision` by `rule_id`.
- `GET /api/feedback/rules?period=...` aggregates per-rule fires + operator decisions → **FP-rate** per rule.
- Review the FP-rate weekly: rules with > 30 % approve-rate are noisy and should be tightened.

**Continuous eval + drift** (v2.23 — required for prod):
- `llm-leash eval-record --dataset tests/fixtures/eval/jailbreaks_v1.jsonl` runs per-rule eval and appends F1 to `~/.leash/eval-history.jsonl`.
- Schedule daily (cron or GitHub Actions). Exits 1 on drift > 5pp vs 7-day baseline.
- `/api/eval/status` surfaces drifting rules to operators before incidents.

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

## 7a. Eval pipeline integration (v2.8+)

llm-leash ships a Layer-5 eval pipeline (`python -m llm_leash.eval`) that
benchmarks any Rule against a labelled dataset and tracks precision /
recall / F1 / FP-rate / p50 / p95 latency over time.

- **Dataset used:** `tests/fixtures/eval/jailbreaks_v1.jsonl` (107 cases as of v2.10) OR project-specific golden set
- **CI hook:** nightly drift-compare workflow runs? `yes` / `no` / `not-required`
- **Failure thresholds:** F1 drop > {X} pp triggers Slack page; FP-rate > {Y}% triggers warning
- **Custom rules:** {list project-specific Rules and the dataset they're evaluated against}

If the project ships its own Rules, the LEASH reviewer requires at least
one eval file under `tests/eval/EVAL-leash-rules.md` describing the
acceptance bar and the dataset shape.

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
