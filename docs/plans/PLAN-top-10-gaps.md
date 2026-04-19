# PLAN — Top 10 Great-CTO Gaps (v1.0.71 — v1.0.75)

> Каждый gap разобран отдельно: что именно мы строим, где он вплетается в уже работающий пайплайн, какие edge cases, какой rollback, сколько строк. Дальше — порядок релизов.

## Общие принципы для всех 10

1. **Артефакты в `docs/` и `.great_cto/` — never in agent/command docs** (cache discipline из v1.0.69)
2. **Агенты расширяются небольшими блоками** (~10-30 строк каждый), чтобы prompt cache оставался стабильным
3. **Каждый новый артефакт имеет template** в `skills/great_cto/references/` и ссылку из ARCHETYPES.md / SKILL.md
4. **Backward-compat**: если артефакт не создан — агенты молча пропускают (0 breaking changes для существующих проектов)
5. **Один артефакт — один файл.** Не комбинируем в "универсальный reliability.md" — каждый имеет distinct lifecycle

---

# 1. Error budgets — SLO + INCIDENT-LOG

## Problem

Сейчас в плагине:
- tech-lead пишет `performance-sla: p95 < 200ms` в ARCH → это **цель**
- qa-engineer проверяет соответствие при test → это **спот-чек**
- Что между ARCH и next check через 3 месяца — неизвестно

Это "хотим, чтобы было". **Нет budget burn.** Нет принудительной остановки feature work когда budget исчерпан.

## Solution

Три файла + интеграция в 4 места.

### Artifact 1: `docs/reliability/SLO.md`

**Owner**: tech-lead пишет при создании сервиса, CTO правит вручную
**Schema**:
```markdown
# SLO — <project>

## <service>
| SLI | Target | Budget (30d) | Window |
|-----|--------|--------------|--------|
| Availability (HTTP 200/total) | 99.9% | 43.2 min | rolling 30d |
| Latency p95 | < 200ms | 2h > threshold | rolling 30d |
| Error rate | < 0.5% | 3.6h above | rolling 30d |

## Response policy
- Budget < 50% → notify #engineering
- Budget < 20% → freeze risky deploys (warn at gate:ship)
- Budget < 0% → freeze all feature work until budget recovers
```

### Artifact 2: `docs/reliability/INCIDENT-LOG.md` (append-only)

**Owner**: l3-support при postmortem, devops при failed canary, CTO вручную
**Schema**:
```
# Incident Log — append only

## 2026-04-18T14:22Z | api | 15min downtime
Cause: DB pool exhaustion during traffic spike
SLI impact: availability -0.035% | latency p95 not affected
Budget consumed: 15min of 43.2min (35%)
Postmortem: PM-003

## 2026-04-19T09:15Z | api | p95 spiked 400ms for 8min
Cause: slow N+1 query introduced in #PR-452
SLI impact: latency p95 breach 8min
Budget consumed: 8min of 120min (7%)
Postmortem: —
```

### Artifact 3: `.great_cto/slo-budget-current.md` (computed cache)

Обновляется `/digest` — текущее состояние budget per SLI. `/inbox` читает его без пересчёта. Формат:
```
| Service | SLI | Budget used | Status |
|---------|-----|-------------|--------|
| api | availability | 35% | ok |
| api | latency p95 | 7% | ok |
| billing | availability | 85% | WARN |
```

## Integration points

| Agent/command | Change | LOC |
|---------------|--------|-----|
| `l3-support` agent | Постmortem завершён → append to INCIDENT-LOG (derive SLI impact) | +15 |
| `devops` agent | При canary failure → append to INCIDENT-LOG, block if budget < 20% | +12 |
| `tech-lead` agent | При новом сервисе в ARCH → template SLO.md entry | +10 |
| `/inbox` | Читать `slo-budget-current.md`, показывать при warn/burn | +20 |
| `/digest` | Пересчитывать budget from INCIDENT-LOG → write cache | +30 |
| `references/reliability.md` | Новый файл с templates и rules | new, ~100 |

## Edge cases

- **Нет мониторинга** → работаем manual-mode, CTO пишет incidents сам. 80% value сохраняется.
- **Budget < 0%** → `gate:ship` выдаёт warning, но **не блочит** (CTO может override явно). Блок = опасный default.
- **Service не имеет SLO.md entry** → agents skip молча, не падают
- **Legacy projects** без `docs/reliability/` → продолжают работать (агенты проверяют file exists)

## Rollback

Удаление `docs/reliability/` + `.great_cto/slo-budget-current.md` → агенты возвращаются к old behavior.

## Files changed

```
docs/reliability/SLO.md                                       (new template)
docs/reliability/INCIDENT-LOG.md                              (new, append-only)
.great_cto/slo-budget-current.md                              (new, computed)
skills/great_cto/references/reliability.md                    (new, ~100 lines)
agents/l3-support.md                                          (+15)
agents/devops.md                                              (+12)
agents/tech-lead.md                                           (+10)
commands/inbox.md                                             (+20)
commands/digest.md                                            (+30)
```

**Total: 5 new files + 5 edited, ~190 LOC.**

## Risk

**Low.** Всё написание — в новых артефактах. Существующие проекты без SLO.md игнорируют расширения.

---

# 2. Risk register (rolling)

## Problem

Backlog tasks имеют done-state. Постmortem описывает уже произошедшее. **Active risks** (что *может* случиться) нигде не трекаются. Результат: 
- Security-officer находит CVE — fix merged, но systemic pattern (ex: "у нас слабая 2FA") не фиксируется
- tech-lead видит архитектурный риск в ARCH → пишет один раз, забывается
- Pre-mortem (см. #4) генерит 5 failure scenarios → теряются после ship'а

Нужен **persistent реестр живых рисков** с owner + status.

## Solution

Artifact: `docs/risks/RISK-REGISTER.md` (single file, не per-risk)

**Schema**:
```markdown
# Risk Register

> Active architectural, operational, and security risks. Updated by agents + CTO.
> Closed risks move to `docs/risks/closed/` (append-only audit trail).

## Active risks

| ID | Title | Probability | Impact | Mitigation | Owner | Status | Source | Added |
|----|-------|-------------|--------|-----------|-------|--------|--------|-------|
| R-001 | Stripe rate limit in Black Friday | M | H | Queue + retry | @alex | mitigating | ARCH-stripe | 2026-03-15 |
| R-002 | Auth0 EOL 2026-12 | H | H | Migrate to Supabase Auth | @kate | planned | RFC-007 | 2026-04-01 |
| R-003 | DB pool exhaustion (recurring) | H | M | Connection pooling redesign | @alex | analysis | INC-LOG 3× | 2026-04-18 |

## Scoring
- Probability: L (<10%) / M (10-50%) / H (>50%) over 6 months
- Impact: L (minor) / M (feature degraded) / H (revenue/data/reputation)
- Priority = Prob × Impact (HH, HM first)
```

## Sources of risk entries

**Who writes what:**

| Trigger | Who | Result |
|---------|-----|--------|
| security-officer finds CVE pattern (3rd similar) | security-officer | new R- with Source: `CSO-<id>` |
| tech-lead identifies in ARCH "Risks" section | tech-lead | new R- with Source: `ARCH-<name>` |
| Pre-mortem scenario (see #4) with mitigation not ready | tech-lead | new R- with Source: `PRE-<name>` |
| INCIDENT-LOG pattern (same cause 3× in 30d) | `/digest` | new R- with Source: `INC-LOG recurring` |
| CTO manual: "add risk: X" in chat | manual edit | new R- |
| Deprecation calendar EOL < 6mo (see #9) | `/audit` quarterly | new R- with Source: `DEPRECATION` |

## Integration points

| Agent/command | Change | LOC |
|---------------|--------|-----|
| `tech-lead` | ARCH "Risks" section → auto-append R- entries to register | +12 |
| `security-officer` | CVE pattern detection → R- entry | +10 |
| `/inbox` | Show top 5 risks by priority (HH > HM > MM) | +15 |
| `/digest` | Recurring INCIDENT pattern → R- entry | +15 |
| `/audit` | List active risks at beginning of report | +8 |
| `references/risk-register.md` | Templates + scoring rubric | new, ~60 |

## Edge cases

- **Risk duplicate** — same cause, different wording: `/digest` dedup'ит через fuzzy match (sorry — keyword match на title, не LLM — чтобы не жечь токены). Manual review раз в квартал.
- **Closed risk** — когда mitigation реализован и incident >60d не повторялся → move to `docs/risks/closed/<ID>.md` с closing reason
- **Stale risk** — `added:` > 180d без updates → `/digest` выдаёт warning "review R-XXX (180d old)"

## Rollback

Удалить `docs/risks/` → агенты пропускают append шаги.

## Files changed

```
docs/risks/RISK-REGISTER.md                          (new)
docs/risks/closed/                                   (new dir, populated lazy)
skills/great_cto/references/risk-register.md         (new, ~60)
agents/tech-lead.md                                  (+12)
agents/security-officer.md                           (+10)
commands/inbox.md                                    (+15)
commands/digest.md                                   (+15)
commands/audit.md                                    (+8)
```

**Total: 3 new + 5 edited, ~120 LOC.**

## Dependencies

- Consumes INCIDENT-LOG (from #1)
- Consumed by Pre-mortem (#4), Q-review (#6), Deprecation (#9)

## Risk

**Low.** Single file, append/modify discipline.

---

# 3. Waiver log

## Problem

CTO в chat: "skip security gate for this hotfix, we'll fix later." → senior-dev пропускает compliance review → **молчаливый tech debt**, никто не помнит через 2 недели, security audit upset through quarter.

Сейчас это "устная договорённость". Нужен **форсированный запись** с expiry date.

## Solution

Artifact: `docs/waivers/WAIVER-<id>.md` (one file per waiver — чтобы audit trail был чистый)

**Schema**:
```markdown
# WAIVER-042 — Skip gate:compliance for P0 hotfix

**Approved by:** CTO
**Approved at:** 2026-04-18T15:30Z
**Expires:** 2026-05-01 (14 days)
**Gate(s) skipped:** gate:compliance
**Reason:** P0 hotfix for payment failure, needs ship in 30 min

**Follow-up action:** SEC-AUDIT-042 task created in Beads (priority 1)

**Verification that this was intentional:** CTO said "skip security this time, we'll audit after ship" in session on 2026-04-18.

---

**Status updates (append-only):**
- 2026-04-18T15:30Z | created
```

## Enforcement

**How it's triggered:**
- devops/security-officer agent encounters a gate скип → **refuses** unless WAIVER-XXX.md exists and is within expiry
- Agent reads waiver, logs "proceeding with WAIVER-042 active" in verdicts log
- If no waiver → agent creates **draft** waiver and asks CTO to approve explicitly (new approval flow, 1 Q)

**Expiry handling:**
- `/digest` scans active waivers → if `expires < now` → surface in `/inbox` as "WAIVER EXPIRED — SEC-AUDIT-042 still open?"
- After follow-up task closed → waiver moves to `docs/waivers/closed/`

## Integration

| Agent/command | Change | LOC |
|---------------|--------|-----|
| `security-officer` | Gate skip attempt → create draft WAIVER + require CTO confirm | +25 |
| `devops` | Same flow for gate:ship skip | +15 |
| `/inbox` | List active + expired waivers | +12 |
| `/digest` | Expired waivers → WARN section | +10 |
| `references/waivers.md` | Template + enforcement rules | new, ~60 |

## Edge cases

- **CTO says "skip this" without reason** → agent refuses: "provide reason + follow-up task"
- **Emergency hotfix** — special short-form: waiver-type `emergency` with max 48h expiry, required incident link
- **Repeat waiver** — same gate skipped 3+ times in 90d → `/digest` flags as pattern, suggests process change

## Rollback

Delete `docs/waivers/` → agents treat all gate skips as hard error (no skip allowed). This is actually a *stricter* rollback — existing behavior was silent skip, new behavior without waivers would be no-skip.

**Therefore**: this change **must** include the waiver mechanism; removing it later breaks existing "silent skip" UX.

## Files changed

```
docs/waivers/                                (new dir)
docs/waivers/closed/                         (new dir)
skills/great_cto/references/waivers.md       (new, ~60)
agents/security-officer.md                   (+25)
agents/devops.md                             (+15)
commands/inbox.md                            (+12)
commands/digest.md                           (+10)
```

**Total: 3 dirs + 1 reference + 4 edited, ~122 LOC.**

## Risk

**Medium** (behavioral change: we add a forced-confirm step where none existed). Mitigated by phased rollout: agents show "draft waiver ready, approve?" — CTO can still say yes in 1 sec. Not actually slower, just explicit.

---

# 4. Pre-mortem

## Problem

Already explained in prior deep-dive. Recap: forward-looking failure analysis, trigger before risky work starts, separate from ADR/postmortem/threat-model.

## Solution

Artifact: `docs/pre-mortems/PRE-<slug>.md`

**Trigger** (в tech-lead agent):
- `size: large` or `enterprise` → always
- `archetype in [web3, iot-embedded, regulated]` → always
- CTO flag: `/start "..." risk=high` or `risk=high` in PROJECT.md
- ARCH estimated runtime cost > $500/month (proxy for "ambitious")

**Schema**:
```markdown
# PRE-stripe-subs — Pre-mortem (2026-04-18)

## Scenario
It's 2026-10-01. Stripe subscriptions launched on 2026-04-30. It's now considered a failure.
What happened?

## Failure modes (brainstorm — not filtered)
1. Webhook signature verification missed → fraudulent charge disputes spiked
2. Subscription upgrade mid-cycle → double-charge + refund mess
3. Annual plan pricing math off-by-one (365 vs 366 days)
4. Cancel flow hit Stripe API rate limit during churn event
5. Tax calculation wrong for EU VAT thresholds

## Ranked by probability × impact
| # | Prob | Impact | Score |
|---|------|--------|-------|
| 1 | M | H | 6 |
| 2 | M | H | 6 |
| 5 | H | H | 9 |
| 4 | L | M | 2 |
| 3 | L | L | 1 |

## Early warning signs (to monitor)
- Support tickets mentioning "charged twice" > 3/week
- Webhook verification errors > 10/day
- VAT customer complaints from EU

## Mitigations (map to gates)
| Failure mode | Mitigation | Gate |
|--------------|-----------|------|
| #1 webhook signature | Idempotency proof + signature test in QA extras | gate:qa |
| #2 upgrade mid-cycle | Write test suite for partial refund logic | gate:qa |
| #5 VAT calculation | Use Stripe Tax (outsource) OR test matrix 27 EU states | gate:compliance |

## Risks added to register
- R-008: VAT calculation complexity (H prob, H impact, source: PRE-stripe-subs #5)

## Post-ship review (fill after 90 days)
_[To be filled by tech-lead at 2026-07-30 review]_
- Realized: —
- Mitigated: —
- New risks discovered: —
```

## Integration

| Agent/command | Change | LOC |
|---------------|--------|-----|
| `tech-lead` | Detect trigger → generate pre-mortem before ARCH → use in ARCH Risks section | +30 |
| `security-officer` | Read PRE-*.md mitigations → verify enforcement | +10 |
| `/digest` (quarterly) | Cross-check: active pre-mortems, unrealized scenarios | +15 |
| `references/pre-mortem.md` | Template + brainstorming prompts | new, ~80 |

## Edge cases

- **Trigger false positive**: small change in commerce repo gets pre-mortem'd unnecessarily → add override: `pre-mortem: skip` in `/start` args
- **Brainstorm too shallow**: prompt уточняет: "list at least 5 scenarios, don't stop at 2 obvious ones"
- **Retroactive**: after incident that wasn't in pre-mortem → brain.md logs "pre-mortem missed scenario X" → improves brainstorm prompts over time

## Rollback

Simply disable trigger (one boolean in tech-lead agent).

## Files changed

```
docs/pre-mortems/                            (new dir)
skills/great_cto/references/pre-mortem.md    (new, ~80)
agents/tech-lead.md                          (+30)
agents/security-officer.md                   (+10)
commands/digest.md                           (+15)
```

**Total: 1 dir + 1 reference + 3 edited, ~135 LOC.**

## Dependencies

- Feeds Risk register (#2)
- Consumed by Q-review (#6)

## Risk

**Low.** New artifact, non-blocking if generation fails.

---

# 5. Executive narrative (в `/digest board`)

## Problem

`/digest board` сейчас выдаёт DORA metrics в квартальном формате. CEO читает и видит цифры — "что это значит?" — не видит.

Board/investor narrative = **история**, не таблица: "В этом квартале мы сделали X, потому что Y. Метрики показывают Z. Впереди риски A, B."

## Solution

Расширить существующий `/digest board` — не новая команда, extension.

**Новые секции в board report** (`docs/board-reports/BOARD-<Y>-Q<N>.md`):

```markdown
# Executive narrative

## What we shipped (Q2 2026)
- Stripe subscriptions (ARCH-stripe-subs) — enables $X/mo recurring revenue
- Auth migration to Supabase (RFC-007) — unblocks mobile app team
- AI code review integration (ARCH-ai-review) — cuts PR review time ~40%

## Why it matters
Narrative connecting ships to business outcomes. Two sentences each.

## Metrics that tell the story
- Deploys: 47 (↑ 30% vs Q1) — team velocity compounding
- Lead time: 2.1 days p50 (↓ 40%) — CI overhaul in M2 paying off
- MTTR: 45 min (↑ from 32 min) — two gnarly P0s pulled average up

## Risks on the horizon
- R-002: Auth0 EOL December → Supabase migration on schedule
- R-008: EU VAT complexity for Stripe expansion → needs legal input
- Budget burn: billing service at 78% reliability budget → stability week planned

## Next quarter focus
- Launch in-app notifications (ARCH-notif, in review)
- Complete Auth0 decommission
- Reduce median review time by another 20%
```

## Source of narrative blocks

Not LLM-generated from thin air. Generated from **existing artifacts** that agents already write:

| Narrative section | Source |
|-------------------|--------|
| What we shipped | ARCH-*.md files in the quarter |
| Why it matters | ARCH "Business context" section + ADR rationale |
| Metrics that tell the story | DORA numbers already in /digest + trend calculation |
| Risks | Top 3 from RISK-REGISTER (from #2) |
| Next quarter focus | Beads tasks tagged `epic:q<N+1>` |

Этот approach — "synthesizer, not writer" — избегает hallucination и делает narrative аудируемым.

## Integration

| Agent/command | Change | LOC |
|---------------|--------|-----|
| `/digest` `board` mode | New `narrative` section builder | +50 |
| `references/board-narrative.md` | Template + rules | new, ~50 |

## Edge cases

- **First quarter** — no prior data for comparison → narrative уточняет: "Q1 baseline, trends will show next quarter"
- **No ARCH files** — small projects → narrative на основе merged PRs с топ-5 лейблами
- **No risks in register** — narrative says so explicitly (good signal, not bad)

## Rollback

`board` режим падает обратно на текущий output (только DORA) если section builder fails.

## Files changed

```
skills/great_cto/references/board-narrative.md    (new, ~50)
commands/digest.md                                (+50)
```

**Total: 1 new + 1 edited, ~100 LOC.**

## Dependencies

- Consumes RISK-REGISTER (#2)
- Consumes ARCH docs (existing)

## Risk

**Low.** Extension of existing feature.

---

# 6. Quarterly architecture review

## Problem

Weekly `/digest` dream cycle обновляет brain непрерывно. Но **нет step-back ritual**:
- Какие ADR противоречат?
- Какой tech debt живёт > 90d?
- Drift от плана?
- God nodes эволюция?

## Solution

Новый artifact: `docs/architecture/ARCH-REVIEW-<Y>-Q<N>.md` (one per quarter)

**Trigger**: scheduled task 1st of Jan/Apr/Jul/Oct at 10:00 → auto-runs. OR manual: `/digest Q2 architecture`.

**Inputs** (synthesizer approach, like narrative):
- All ADR-*.md added/modified last 90d
- All RFC-*.md last 90d
- brain.md synthesis diff vs 90d ago (requires snapshot at start of quarter)
- CODEBASE.md god nodes delta
- INCIDENT-LOG recurring causes (for #1)
- RISK-REGISTER active + aging (for #2)
- Pre-mortems not yet post-reviewed (for #4)
- WAIVERs unresolved (for #3)

**Output structure**:
```markdown
# Architecture Review — 2026-Q2

## Decisions Landscape
- ADRs: 14 added, 3 superseded, 1 conflict (ADR-023 ↔ ADR-011) → action
- RFCs: 4 posted, 2 accepted, 2 rejected, 1 in progress

## Drift Analysis
Planned in Q1 retro:
- Migrate auth → Supabase (60% done, blocked team-X onboarding)
- Deprecate API v1 (not started)

Recommendation: update ADR-015 with new timeline OR re-scope.

## God Nodes Evolution
- `services/api/router.ts`: +15% imports (25 → 29) → coupling growing
- New entrant top-10: `libs/trading/engine.ts` (12 imports, none at Q1 start)
  → Warrants ADR for encapsulation strategy

## Aged Tech Debt (> 90d open)
- TECH-DEBT-012 retry in billing (aged 142d, severity M) — in risk register as R-003
- 6 similar → recommendation: debt-sprint OR waive explicitly

## Active Risks Summary
From RISK-REGISTER:
- 3 H-H risks, 2 H-M, 8 M-M → top-5 tracked, 3 in progress, 2 unowned → ASSIGN

## Unresolved Waivers
- WAIVER-038 expired 14d ago → follow-up SEC-AUDIT-038 still in draft — ESCALATE

## Pre-mortem Post-Reviews Due
- PRE-stripe-subs: 90d post-launch — has anything from the list realized?
- PRE-ai-review: 60d post-launch — check again at 90d

## Recommendations for Q3
1. Split router.ts — coupling threshold hit (ADR-025 draft)
2. Debt-sprint week for billing module
3. Re-scope Auth0 migration OR accept slip
```

## Integration

| Agent/command | Change | LOC |
|---------------|--------|-----|
| `/digest` `architecture` mode (new) | Synthesizer across all artifacts | +80 |
| `scheduled-tasks` | Quarterly task registered by /start | +15 in start.md |
| `references/quarterly-review.md` | Template + synthesis rules | new, ~120 |

## Edge cases

- **First quarter** — no prior snapshot → saves current brain.md as `.great_cto/brain-Q<N-1>-snapshot.md` for next Q
- **No god nodes delta** — small project → skip section with note
- **Massive review** — if 50+ ADRs → summarize by theme, don't list each

## Rollback

Remove scheduled task + delete archived ARCH-REVIEW files → Q-review mode disabled.

## Files changed

```
docs/architecture/ARCH-REVIEW-<placeholder>      (new, generated)
.great_cto/brain-Q<N>-snapshot.md                (new, generated)
skills/great_cto/references/quarterly-review.md  (new, ~120)
commands/digest.md                               (+80)
commands/start.md                                (+15, add to scheduled tasks)
```

**Total: 2 artifacts + 1 reference + 2 edited, ~215 LOC.**

## Dependencies

**Consumes all previous** — #1 (INCIDENT-LOG), #2 (RISK-REGISTER), #3 (WAIVERs), #4 (PRE-mortems). Therefore: **this should be LAST in phase-1 release**.

## Risk

**Medium.** Biggest surface area, synthesizes multiple sources. Mitigation: generate в **draft** status, CTO review + edit → finalize.

---

# 7. Third-party vendor register

## Problem

`/audit` находит npm CVEs. `security-officer` проверяет compliance. Но **вендоры-сервисы** (Stripe, Auth0, OpenAI, Twilio, AWS region) не трекаются систематически: SLA, incident history, fallback plan, contract renewal, compliance certs.

Результат: инцидент у vendor'а → 2 часа паники "как мы без OpenAI если он down?"

## Solution

`docs/vendors/VENDOR-<slug>.md` per vendor.

**Schema**:
```markdown
# VENDOR-stripe

## Role
Payment processing for subscriptions and one-time charges.

## SLA
- Commitment: 99.99% uptime (per Stripe public SLA)
- Our dependency tier: CRITICAL (no fallback for payments)

## Incident history (last 12 months)
- 2025-09-12: 2h partial outage (US-WEST) — impacted us 45min
- 2026-02-03: 20min API degraded — idempotent retries absorbed it
Source: https://status.stripe.com

## Fallback plan
- Payments: queue failed webhook events, retry after 1h (6h max)
- Subscription renewals: delay by up to 24h, notify user
- Manual override: CTO can force-retry via admin panel

## Compliance certs
- PCI-DSS Service Provider Level 1: valid until 2026-12
- SOC 2 Type II: valid until 2027-03

## Contract
- Renewal: annual, auto-renew 2026-08-15
- Pricing tier: 2.9% + $0.30 standard
- Volume commitment: none

## Risks (linked)
- R-005: Stripe rate limit during Black Friday
- R-012: Vendor lock-in — cost to migrate to Adyen estimated 3 eng-months

## Last reviewed: 2026-04-01 (security-officer)
```

## Integration

| Agent/command | Change | LOC |
|---------------|--------|-----|
| `tech-lead` | At ARCH time, for new external service → check VENDOR exists, else prompt "add vendor?" | +15 |
| `security-officer` | Quarterly review: incident history, cert validity, risk delta | +20 |
| `/audit` (quarterly) | Scan package.json/requirements/env for vendor calls → suggest VENDOR docs for missing | +25 |
| `references/vendors.md` | Template + review cadence | new, ~70 |

## Edge cases

- **Unknown vendor** (new SDK introduced) → `/audit` suggests create VENDOR doc, don't auto-generate
- **Deprecated vendor** — if announced EOL → auto-link to deprecation calendar (#9)
- **Free tier** — small projects may have many vendors, overwhelming. Filter: only vendors with `criticality: critical|high`

## Rollback

Delete `docs/vendors/` → auditing skips.

## Files changed

```
docs/vendors/                                 (new dir)
skills/great_cto/references/vendors.md        (new, ~70)
agents/tech-lead.md                           (+15)
agents/security-officer.md                    (+20)
commands/audit.md                             (+25)
```

**Total: 1 dir + 1 reference + 3 edited, ~130 LOC.**

## Risk

**Low.** Advisory artifact, doesn't block anything.

---

# 8. Auto-generated onboarding

## Problem

Новый eng приходит → "почитай что найдёшь в wiki" → 2 недели on-ramping. Чаще knowledge в головах existing engineers, blocked by calendar.

Great CTO solution: **one artifact, reading 2 hours, real context**. Generated automatically from existing materials.

## Solution

`docs/onboarding/README.md` — single doc, auto-updated monthly.

**Schema** (synthesized from existing artifacts):
```markdown
# Onboarding — <project>

> Read this first. Updated 2026-04-01. Next update: 2026-05-01.

## What we're building (from brain.md synthesis)
One paragraph describing project essence.

## Key architectural decisions
Top 10 most-referenced ADRs + 1-liner each.

## Where the code lives (from CODEBASE.md god nodes)
- `services/api/router.ts` — HTTP entry, 29 downstream imports
- `libs/trading/engine.ts` — core domain logic, 12 imports
- ...

## Who owns what (from OWNERSHIP.md)
- Backend: @alex / team-core / #eng-core
- Mobile: @kate / team-mobile / #eng-mobile
- ...

## What to avoid (from brain.md "What Has Failed")
- Don't import from `legacy/` — being deprecated (ADR-011)
- Don't write raw SQL — use ORM (ADR-003)
- ...

## How to ship (from pipeline docs)
- Describe feature → /start → 2 approvals → done
- See [README.md](../../README.md) commands section

## Common tasks (runbooks)
- Deploy to staging: `docs/runbooks/deploy-staging.md`
- Roll back a release: `docs/runbooks/rollback.md`
- Respond to P0: `docs/runbooks/p0-response.md`

## Current focus
Top 5 active Beads tasks + links.

## People to ping
- Architecture questions: @alex
- Security compliance: @kate
- Deploy issues: @ops-team
```

## Integration

| Agent/command | Change | LOC |
|---------------|--------|-----|
| `/audit` | Generate `docs/onboarding/README.md` if missing | +30 |
| Monthly scheduled | Regenerate if stale > 30d | +10 in /digest |
| `project-auditor` | Ensure synthesis is accurate | +15 |
| `references/onboarding.md` | Template | new, ~80 |

## Edge cases

- **Small project (team-size: 1)** → skip onboarding generation (it's overkill for solo)
- **No god nodes** (brand new) → placeholder "will populate after first /audit"
- **Conflicting sources** — ADR says X, brain.md says Y → flag as inconsistency for Q-review

## Rollback

Remove file + schedule → no impact.

## Files changed

```
docs/onboarding/README.md                     (new, generated)
skills/great_cto/references/onboarding.md     (new, ~80)
commands/audit.md                             (+30)
commands/digest.md                            (+10)
agents/project-auditor.md                     (+15)
```

**Total: 1 artifact + 1 reference + 3 edited, ~135 LOC.**

## Dependencies

Consumes brain.md, CODEBASE.md, OWNERSHIP.md, ADRs — all existing.

## Risk

**Low.** Pure synthesis, advisory.

---

# 9. Deprecation calendar

## Problem

Tech leader знает что framework X EOL через год. Нигде не записано. Новый ARCH использует X. 6 месяцев потом — эмergency migration.

## Solution

`docs/deprecations/DEPRECATION-CALENDAR.md` — single file, chronological.

**Schema**:
```markdown
# Deprecation Calendar

> What we're sunsetting, when, why, how. Updated by tech-lead + security-officer.

## Active deprecations

| What | EOL date | Replacement | Owner | Status | Linked |
|------|----------|-------------|-------|--------|--------|
| framework X (2.x) | 2026-12-01 | framework Y | @alex | plan ready | ADR-012, R-002 |
| API v1 `/api/v1/*` | 2027-03-01 | API v2 | @kate | migration 40% | RFC-008 |
| node 18 runtime | 2026-06-01 | node 22 | ops | testing | — |
| us-east-1 for jobs | 2026-08-01 | us-west-2 | ops | scheduled | — |

## Completed deprecations (last 12 months)
- 2026-02-01: removed python 3.9 support (moved to 3.12)
- 2025-11-15: removed legacy webhook endpoint /hooks/old
```

## Integration

| Agent/command | Change | LOC |
|---------------|--------|-----|
| `tech-lead` | At ARCH: check DEPRECATION-CALENDAR, warn if planned to use deprecated thing | +15 |
| `/audit` | Detect deps with no releases > 24mo → suggest entry | +20 |
| `/inbox` | EOL < 90d remaining → show in "upcoming deadlines" | +10 |
| `/digest` (quarterly) | EOL in next 90d → call out in narrative | +8 |
| `references/deprecations.md` | Template + rules | new, ~50 |

## Edge cases

- **Forced EOL** (security vuln in abandoned lib) → auto-added as "EOL: ASAP" with source `CVE-XXXX`
- **Internal deprecation** (our own API) — same mechanism, source: RFC
- **Linked risks** — EOL < 6mo and status != migrating → auto-add to RISK-REGISTER

## Rollback

Delete file → agents skip checks.

## Files changed

```
docs/deprecations/DEPRECATION-CALENDAR.md         (new)
skills/great_cto/references/deprecations.md       (new, ~50)
agents/tech-lead.md                               (+15)
commands/audit.md                                 (+20)
commands/inbox.md                                 (+10)
commands/digest.md                                (+8)
```

**Total: 2 new + 4 edited, ~103 LOC.**

## Dependencies

- Feeds RISK-REGISTER (#2) when EOL < 6mo unmitigated

## Risk

**Low.**

---

# 10. Cost attribution (expanded ARCH)

## Problem

tech-lead estimates **pipeline cost** (running the pipeline itself). Doesn't estimate **runtime cost** (monthly bill after deploy). Doesn't calculate **unit economics** (cost per user/transaction).

Result: features ship, stay in production, cost compounds, nobody tracks.

## Solution

**ARCH template extension** — новая обязательная секция.

**New section in ARCH-*.md** (written by tech-lead):
```markdown
## Cost Model

### Runtime cost (estimated monthly)
| Component | Assumption | Cost |
|-----------|-----------|------|
| Compute: 3× t3.medium | 24/7, us-east-1 | $90/mo |
| RDS Postgres db.t3.small | single-AZ | $30/mo |
| Data transfer | 500GB/mo egress | $45/mo |
| External APIs: Stripe | 5000 txns × $0.30 | $1500/mo |
| External APIs: OpenAI | 100k tok/day × $0.01/1k | $300/mo |
| **Total estimate** | | **$1965/mo** |

### Unit economics
- Per active user: $1.30/mo (assuming 1500 DAU)
- Per transaction: $0.39 ($1965 / 5000 txns)
- Break-even point: needs ≥ 1000 paying users at $2/mo

### Cost controls
- OpenAI: rate limit client-side, cache responses, $500/mo cap
- Stripe: no cap (revenue-correlated)
- Infra: scheduled scale-down off-hours (save ~$30/mo)

### Review cadence
- Quarterly (Q-review #6)
- Alert if actual > estimate × 1.2
```

**И расширение OWNERSHIP.md:**
```markdown
| Path | Team | TL | Expected cost/mo | Notes |
|------|------|-----|-------------------|-------|
| services/api | core | @alex | $2000 | 3 containers + RDS |
```

## Integration

| Agent/command | Change | LOC |
|---------------|--------|-----|
| `tech-lead` | Add Cost Model section to ARCH output | +25 |
| `/audit` | Scan IaC (tf/helm) → flag services без cost estimate | +20 |
| `/digest` (quarterly) | Suggest: "review actual vs estimate for N services" | +10 |
| `references/cost-model.md` | Template | new, ~60 |

## Edge cases

- **No cloud yet** (greenfield) → placeholder: "TBD pre-deploy"
- **Dev/staging vs prod** — clarify: estimate is for production
- **FinOps integration** — optional webhook from AWS CostExplorer → `.great_cto/cost-actual.log` → compare

## Rollback

Make Cost Model section optional in tech-lead prompt → legacy ARCH docs remain valid.

## Files changed

```
skills/great_cto/references/cost-model.md    (new, ~60)
agents/tech-lead.md                          (+25)
commands/audit.md                            (+20)
commands/digest.md                           (+10)
```

**Total: 1 new + 3 edited, ~115 LOC.**

## Risk

**Low.** Advisory, non-blocking.

---

# Implementation order (across releases)

Нельзя всё в один релиз — cache discipline не позволит: агенты чуть-чуть меняются несколько раз подряд, каждое изменение инвалидирует prefix. Группируем по **агент-affinity** — один релиз трогает каждого агента ровно один раз.

## v1.0.71 — Foundation artifacts (no inter-dependencies)

**Goal**: добавить новые артефакты-реестры, которые будут consumed следующими релизами.

| # | Gap | Agents touched |
|---|-----|----------------|
| 2 | Risk register | tech-lead, security-officer |
| 3 | Waiver log | security-officer, devops |
| 9 | Deprecation calendar | tech-lead |

**Новые файлы**: 
- `docs/risks/RISK-REGISTER.md` + `docs/risks/closed/`
- `docs/waivers/` + `docs/waivers/closed/`
- `docs/deprecations/DEPRECATION-CALENDAR.md`
- 3 references в skills/

**LOC**: ~345
**Risk**: Medium (waiver changes behavior — new forced-confirm step)
**Agents edited once**: tech-lead (+27), security-officer (+35), devops (+15)
**Commands edited**: inbox (+37), digest (+33), audit (+28)

## v1.0.72 — Reliability layer

**Goal**: closing reliability loop (SLO + INCIDENT-LOG).

| # | Gap | Agents touched |
|---|-----|----------------|
| 1 | Error budgets | tech-lead, devops, l3-support |

**Новые файлы**:
- `docs/reliability/SLO.md` + `INCIDENT-LOG.md`
- `.great_cto/slo-budget-current.md`
- `references/reliability.md`

**LOC**: ~190
**Risk**: Low
**Agents edited**: tech-lead (+10), devops (+12), l3-support (+15)

## v1.0.73 — Forward-looking + vendor

**Goal**: pre-mortem (новая capability для deep projects) + vendor register.

| # | Gap | Agents touched |
|---|-----|----------------|
| 4 | Pre-mortem | tech-lead, security-officer |
| 7 | Third-party vendor register | tech-lead, security-officer |

**Новые файлы**:
- `docs/pre-mortems/`
- `docs/vendors/`
- 2 references

**LOC**: ~265
**Risk**: Low
**Agents edited**: tech-lead (+45), security-officer (+30)

## v1.0.74 — Cost + onboarding

**Goal**: cost discipline + new-engineer ramp.

| # | Gap | Agents touched |
|---|-----|----------------|
| 8 | Onboarding | project-auditor |
| 10 | Cost attribution | tech-lead |

**Новые файлы**:
- `docs/onboarding/README.md` (generated)
- 2 references

**LOC**: ~250
**Risk**: Low
**Agents edited**: tech-lead (+25), project-auditor (+15)

## v1.0.75 — Synthesis consumers

**Goal**: квартальный review + narrative — они READ всё построенное выше.

| # | Gap | Agents touched |
|---|-----|----------------|
| 5 | Executive narrative | (none — /digest only) |
| 6 | Quarterly architecture review | (none — /digest only) |

**Новые файлы**:
- `docs/architecture/ARCH-REVIEW-*.md` (generated)
- `docs/board-reports/` extensions
- 2 references

**LOC**: ~315
**Risk**: Medium (largest synthesis surface)
**Agents edited**: 0 (!)
**Commands edited**: digest (+130), start (+15)

Это **ключевое преимущество** последнего релиза: никакие агенты не трогаются, только /digest. Самый большой новый функционал с минимальным риском для cache.

---

# Total footprint

Across 5 releases:

| Метрика | Value |
|---------|-------|
| New artifacts (dirs/files) | 15 |
| New references | 10 |
| Agents edited | 6 (each touched 1-2 times across all releases) |
| Commands edited | 5 (audit, inbox, digest, start + release left alone) |
| Total LOC change | ~1365 |

**Cache impact** (critical per v1.0.69):
- Agent files: each touched at most 2× across 5 releases → cache prefix stable between releases
- Commands: incremental edits don't invalidate cache between unrelated commands
- New artifacts: all in `docs/` or `.great_cto/` — outside the cache-hot agent/command zone

**Backward-compat**: all 5 releases are pure additions. Old PROJECT.md works through all of them. No migration needed.

---

# Success criteria (за 5 релизов)

1. **Solo-founder scenario**: project created v1.0.69 → upgraded to v1.0.75 → everything works, new features opt-in
2. **Team scenario**: new engineer reads `docs/onboarding/README.md` за 2 часа → productive
3. **Reliability scenario**: P0 incident → INCIDENT-LOG updated → budget burn visible in /inbox → next deploy auto-warns
4. **Risk scenario**: pre-mortem brainstorm генерит R-XXX → 3 mo later post-review checks if realized
5. **Board scenario**: `/digest Q2 board` produces narrative + architecture + DORA в 1 documenте
6. **Waiver scenario**: "skip security" в chat → agent демандит explicit waiver → 14d later reminder auto-fires
7. **Deprecation scenario**: tech-lead планирует use framework X → warning "X EOL in 8mo, see ADR-012"
8. **Vendor scenario**: Stripe incident → runbook найден → fallback активирован
9. **Cost scenario**: new ARCH включает runtime estimate → quarterly review сравнивает с actual
10. **Synthesis scenario**: Q3 review cross-checks всё выше → recommends Q4 focus

---

# Verification (после каждого релиза)

```bash
# После v1.0.71 (foundations)
ls docs/risks/RISK-REGISTER.md docs/waivers/ docs/deprecations/DEPRECATION-CALENDAR.md
grep -c "RISK-" agents/tech-lead.md agents/security-officer.md

# После v1.0.72 (reliability)
ls docs/reliability/SLO.md docs/reliability/INCIDENT-LOG.md .great_cto/slo-budget-current.md
grep -c "INCIDENT-LOG" agents/l3-support.md agents/devops.md

# После v1.0.73 (forward-looking)
ls docs/pre-mortems/ docs/vendors/
grep -c "pre-mortem\|VENDOR-" agents/tech-lead.md

# После v1.0.74 (cost + onboarding)
ls docs/onboarding/README.md
grep -c "Cost Model" agents/tech-lead.md
grep -c "onboarding" commands/audit.md

# После v1.0.75 (synthesis)
grep -c "ARCH-REVIEW\|narrative" commands/digest.md
# Scheduled task для Q-review exists
grep -c "architecture" commands/start.md
```

---

# What we explicitly do NOT do

- **Monitoring integration** (Datadog, Grafana, Honeycomb) — out of scope, kept as "advisory reminder" system
- **LLM hallucination-prone synthesis** — все narrative/Q-review построены на **existing artifacts**, не free-form generation
- **Team-specific HR tooling** (promotion evidence, 1:1 notes, career plans) — not CTO domain in our framing
- **Visual dashboards / UI** — files-only, CLI-only (по принципу zero-dependency)
- **Cross-project aggregation** — каждый PROJECT.md standalone, никакого "organization view"
