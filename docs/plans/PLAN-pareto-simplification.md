# PLAN — Pareto Simplification (v1.0.70)

> 20% функционала даёт 80% результата. Цель — убрать ментальную нагрузку с первого знакомства, не ломая внутренние возможности.

## Context

Плагин мощный (10 archetypes, 73 types, 4 packs, 13 compliance, 5 sizes, 5 approval levels, 10 commands, 7 agents), но **первый экран README и первый запуск** перегружены. Юзер видит "73 типа" и уходит.

Gap: реальный daily loop — **3 команды** (`/start`, `/review`, `/inbox`). Остальное — автоматика или редкие события. Но READM продаёт 10 команд, 7 персон, 5 размеров и 5 уровней аппрувов — как enterprise-tool, а не как "lightweight AI-powered CTO for solo founders".

## Non-goals

- Не трогаем 12-angle `/review` (это killer feature)
- Не трогаем brain.md, HANDOFF, SessionStart hooks (работают автоматически)
- Не удаляем функционал, только скрываем/сливаем
- Не меняем advisor pattern (Opus escalation) — юзер не видит
- Compliance auto-detect остаётся как есть
- 10 archetypes остаются (просто не выставляем таблицу на первый экран)
- Agent-файлы остаются read-only (нарушает cache discipline из v1.0.69)

## 5 изменений, в порядке ROI

---

### 1. README top-fold slim-down (1 файл, высокий эффект)

**Проблема**: 430 строк, 11 больших таблиц на первом экране. Юзер скроллит мимо. Плотность "73 types × 13 compliance × 10 archetypes × 5 sizes × 5 approval" — пугает.

**Что меняем в `README.md`**:

**Верхний фолд (первые 40 строк) = только это:**
1. Headline: "The engineering process for solo founders and teams up to 50 engineers — without the overhead."
2. Pain paragraph (3 строки — уже есть)
3. **Один** example (текущий stripe — оставить)
4. Install: `npx great-cto init`
5. Three commands: `/start`, `/review`, `/inbox`

**Остальное — сворачиваем в `<details>`:**
- "The math" (таблица $1M vs $400) → `<details><summary>ROI math</summary>`
- "10 archetypes" таблица → `<details><summary>10 archetypes (auto-detected)</summary>`
- "13 compliance frameworks" → `<details><summary>Compliance frameworks</summary>`
- "5 approval levels" → `<details><summary>Advanced: approval levels</summary>`
- "Pipeline sizes" таблица → `<details>`
- "How it's different" → `<details>`
- "FAQ" → оставить, но после Quick Start
- "Author" блок → оставить

**Commands section: 3 primary + 1 "more"**:
```
## Commands

/start "…"  — new feature (detects archetype, runs pipeline)
/review     — 12-angle code review
/inbox      — what needs your attention

<details><summary>More commands</summary>
/audit /rfc /digest /release /ownership /oncall /triage
</details>
```

**Эффект**: первый экран читается за 30 сек, не за 5 мин.

---

### 2. Approval levels: 5 → 2 + custom (3-4 файла)

**Проблема**: никто не помнит разницу `strict` vs `expert` vs `step-by-step`. 5 модов — это overkill. Внутренний код обрабатывает все 5, но 95% юзеров используют 2.

**Что меняем**:

**В `commands/start.md`** (секция про approval-level, сейчас линии ~192, 221-226):
```yaml
approval: <auto|review|custom>
# auto   — no gates (hotfix, trusted automation)
# review — default: arch + ship approval (2 gates)
# custom — explicit gate list: [arch, code, qa, ship]
```

Секция migration (для старых PROJECT.md):
```
Legacy values are auto-mapped:
  gates-only    → review
  strict        → custom, gates: [arch, code, ship]
  expert        → custom, gates: [arch, code, qa, ship], checkpoints: true
  step-by-step  → custom, gates: all, checkpoints: true
```

**В `agents/*.md`** (7 файлов — убираем прямые упоминания `strict|expert|step-by-step` из логики gates, заменяем на `gate:<name> exists`):
Проверка была: `if approval-level == strict then run code review`
Становится: `if "code" in gates then run code review`
— агенты читают `gates: [...]` из PROJECT.md, а не approval-level name.

**В `commands/audit.md`**: при генерации PROJECT.md пишем `approval: review` (было `review_mode: auto` или `strict`).

**Rollback**: если миграция ломает что-то — возврат одной заменой в `commands/start.md`.

---

### 3. Pipeline sizes: 5 → 3 (2 файла)

**Проблема**: `nano` vs `small` = 1 агент разницы. `large` vs `enterprise` = compliance checklists. Юзер решает 3 вещи: "быстро, обычно, или капитально".

**Что меняем**:

**В `skills/great_cto/ARCHETYPES.md`** (таблицы на строках 53, 70):
```
| Size     | Agents | Gates | Time   | When                                    |
|----------|--------|-------|--------|------------------------------------------|
| quick    | 1-3    | 0-1   | ~5-20m | Hotfix, typo, new endpoint              |
| standard | 5      | 2     | ~45m   | Default: standard feature, new service   |
| deep     | 7+     | 3-4   | ~90m+  | Cross-cutting, regulated, arch change    |
```

**В `commands/start.md`**: при detect size — auto-mapping:
- diff lines < 50 → `quick`
- diff lines 50-500 → `standard`
- diff lines > 500 OR archetype in {web3, regulated, iot-embedded} → `deep`

**Legacy mapping** (для старых PROJECT.md):
```
nano       → quick
small      → quick
medium     → standard
large      → deep
enterprise → deep
```

**В агентах**: код, который читал `size == "medium"`, теперь читает `size in ["standard"]` или использует boolean `has_security_gate`.

**Rollback**: одна замена в ARCHETYPES.md + start.md.

---

### 4. Убрать "type" (73 штуки) из user-facing UI (1-2 файла)

**Проблема**: `TYPE_MAP.md` с 73 типами — это внутренний словарь, но юзер видит его в README ("10 archetypes covering 73 project types") и думает что нужно выбрать. В PROJECT.md хранится `type:` + `archetype:` — дубль.

**Что меняем**:

- `TYPE_MAP.md` остаётся, но помечаем как **internal** (строка "Used by audit for auto-detection; users never pick types manually")
- Из `README.md` убираем упоминание "73 types" (остаётся "10 archetypes")
- В `PROJECT.md` template (commands/start.md, audit.md): убираем `type:` поле — оставляем только `archetype:`
- Агенты, которые читали `type:` из PROJECT.md, читают только `archetype:` (уже поддерживается)

**Rollback**: вернуть `type:` в template — field ignorable, старые PROJECT.md не ломаются.

---

### 5. Hide situational commands from primary surface (1 файл README + 1 plugin.json)

**Проблема**: README продаёт "5 commands you use every day" + "Plus situational" — 9 команд на первом экране. Слишком много для советника "use every day".

**Что меняем**:

**README.md** секция "## Commands":
Primary (3):
```
/start "…"
/review
/inbox
```

Occasional (скрыто в details):
```
/audit /rfc
```

Automatic or advanced (скрыто глубже):
```
/digest (Mon 9:00 auto) /release /ownership /oncall /triage
```

**plugin.json** остаётся с всеми командами в CMD loop — мы ничего не удаляем, только переупорядочиваем визуал в README.

**Эффект**: первый юзер видит 3 команды, запоминает 3 команды, не боится 10.

---

## Порядок implementation

| # | Change | Files | Risk | Rollback |
|---|--------|-------|------|----------|
| 1 | README slim (<details>) | `README.md` | 0 | git revert |
| 2 | Primary commands: 3 в top, 2 в occasional, остальные hidden | `README.md` | 0 | git revert |
| 3 | Approval 5→2+custom | `commands/start.md`, `agents/*.md` (7), `commands/audit.md` | средний | map back |
| 4 | Sizes 5→3 | `skills/great_cto/ARCHETYPES.md`, `commands/start.md`, 2-3 агента | средний | map back |
| 5 | Убрать type из UI | `commands/start.md`, `commands/audit.md`, `README.md`, `TYPE_MAP.md` header | низкий | не удаляем файл |
| 6 | Version bump + CHANGELOG | `.claude-plugin/plugin.json`, `CHANGELOG.md` | 0 | — |

**Общий объём**: ~12-14 файлов, ~300 строк изменений.

---

## Migration safety

Все старые PROJECT.md остаются рабочими:
- `approval-level: gates-only` auto-maps на `approval: review`
- `size: medium` auto-maps на `size: standard`
- `type: saas-api` игнорируется (используется `archetype:`)

Агенты получают backward-compat слой в первых 5-10 строках:
```bash
APPROVAL=$(grep "^approval" PROJECT.md | awk '{print $2}')
case "$APPROVAL" in
  gates-only) APPROVAL="review" ;;
  strict|expert|step-by-step) APPROVAL="custom" ;;
esac
```

---

## Success criteria

1. Новый юзер сканирует README за **≤ 60 секунд** и понимает: "поставь → `/start` → 2 approvals → done"
2. `grep -c "nano\|small\|medium\|large\|enterprise"` в README → 0 (только внутри `<details>`)
3. `grep -c "73 types"` в README → 0
4. `grep "approval:" commands/start.md` показывает только 3 варианта
5. Backward compat: существующий PROJECT.md v1.0.68 запускается без миграций
6. CI (если есть) не ломается
7. Cache discipline из v1.0.69 сохранена (агенты остаются read-only)

---

## Что NOT делаем в v1.0.70

- Не переименовываем агентов (tech-lead/senior-dev/qa-engineer — это good lexicon, для внутреннего)
- Не удаляем команды из plugin.json (скрываем в README, код остаётся)
- Не меняем 12-angle review
- Не трогаем packs, compliance auto-detect, brain.md

Эти вещи остаются для v1.0.71+ если Pareto-тест покажет что нужно идти глубже.

---

## Verification (after implementation)

```bash
# README slim check
wc -l README.md                                              # target: ≤ 250 total
grep -c "<details>" README.md                                # target: ≥ 6

# Commands surface
head -120 README.md | grep -c "^| /"                         # primary commands: 3

# Approval surface
grep "^approval:" commands/start.md | head -5                # target: 3 options

# Sizes surface  
grep -E "^\| (nano|quick|standard|deep)" skills/great_cto/ARCHETYPES.md

# No "73 types" on first fold
head -100 README.md | grep -c "73 types"                     # target: 0

# Backward compat
grep -A 3 "gates-only" commands/start.md                     # should show legacy mapping

# Version
grep '"version"' .claude-plugin/plugin.json                  # 1.0.70
grep "v1.0.70" CHANGELOG.md                                  # present
```
