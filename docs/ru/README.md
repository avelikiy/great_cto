<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**AI Product Builder — опиши продукт, утверди спецификацию, отгрузи софт.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-1h26m_·_$3.40_vs_~$42K_traditional-darkgreen)](https://greatcto.systems/proof)

```bash
npx great-cto init
```

[Сайт](https://greatcto.systems) · [Один реальный прогон →](https://greatcto.systems/proof) · [Живое демо](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Обсуждения](https://github.com/avelikiy/great_cto/discussions) · [Журнал изменений](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## Стройте продукт, а не просто код

**Вы описываете продукт. great_cto его отгружает.** Не сниппет, не каркас — настоящее, задеплоенное
приложение с бэкендом, фронтендом, сгенерированными тестами и живым URL. Вы принимаете ровно
**одно решение: утверждаете спецификацию.** Всё после этого — архитектура, модель данных, сборка,
ревью, деплой — выполняется без вашего участия.

Это **AI Product Builder**, а не очередной цикл кодирующего агента. Слой оркестрации *над*
кодирующим агентом, которым вы уже пользуетесь: команда специализированных агентов, которые планируют,
строят, ревьюят и пропускают работу через гейты — так один человек отгружает как целая инженерная организация.

> **Одна реальная фича: идея → смёрдженный PR за `1h 26m` при `$3.40` расходов на LLM.** Традиционный
> путь для той же фичи — ~6 недель и ~$42K. [Смотрите полную трассировку →](https://greatcto.systems/proof)

Он строит под топовые сервисные отрасли США — домашние и выездные сервисы, профессиональные услуги,
гостеприимство, ретейл/e-commerce, proptech, фитнес, маркетинг и креаторы, HR/рекрутинг,
строительство, логистика — которые схлопываются в **6 переиспользуемых конвейеров сборки** (CRUD vertical-SaaS,
booking, CRM, dashboard, marketplace, content/media). Одна команда отгружает любой из **~40 продуктов**.
См. [docs/strategy/BUILD-PIPELINES.md](../strategy/BUILD-PIPELINES.md).

```
   describe a product
        │
   spec synthesis  ── architecture · data model · screens          (automated)
        ▼
   👤  CTO gate — approve the spec        ← the one human checkpoint
        │
   scaffold → backend → frontend → integrate → test → deploy        (automated)
        ▼
   shipped product · repo · live URL
```

CI и сгенерированные тесты — это гейт качества: вы подписываете **направление**, а не каждую строку.

## Под капотом (для CTO, который этим управляет)

→ *Сторонняя для билдера история этой поверхности: [greatcto.systems/build](https://greatcto.systems/build)*

Каждый продукт строится конвейером из специализированных агентов — architect, design-advisor, senior-dev,
QA, security-officer, devops — который проходит spec → scaffold → backend → frontend → tests → deploy.
**Вы принимаете одно решение: утверждаете спецификацию.** Всё после этого автоматизировано. Конвейер
тиерирован по риску — фикс в рамках сопровождения не открывает ни одного гейта (гейт — это CI), обратимая фича открывает только
гейт плана, а необратимое изменение требует полного набора — так что церемония масштабируется по радиусу поражения,
а не по бумажной работе. CI и собственные сгенерированные тесты сборки — это гейт качества, который делает безопасным
прогон конвейера вплоть до деплоя.

**Один гейт, там где это важно.** Шаги сборки тиерированы по риску: обратимое изменение собирается и отгружается
за CI; необратимое — продакшен-деплой, миграция схемы, новая интеграция с правом записи —
эскалируется на CTO-гейт и frontier-модель перед запуском. Вы подписываете спецификацию
и вызовы с высоким радиусом поражения; остальное проходит насквозь. `change-tier` + `effectiveGates`
обеспечивают этот инвариант в коде.

## В цифрах

| | |
|---|---|
| Одна фича, от и до (реальный прогон, полностью трассирован) | **1h 26m · $3.40 LLM** против ~$42K / ~6 недель традиционно |
| Более ранний прогон CLI-фичи, тот же конвейер | $2.39 LLM против ~$5,460 человеческого эквивалента; безопасность поймала 2 дефекта, которые QA пропустил |
| Месячная стоимость (20 прогонов конвейера) | **~$34** |
| Целевые отрасли США | **10** (home services · retail · proptech · fitness · HR · …) |
| Продуктов, которые можно собрать | **~40** по 10 отраслям |
| Переиспользуемые конвейеры сборки | **6** (CRUD · booking · CRM · dashboard · marketplace · content) |
| Специализированных агентов | **61** |

→ [Полная трассировка со всеми артефактами](https://greatcto.systems/proof) · [6 конвейеров](https://greatcto.systems/pipelines)

## Как это работает

**`npx great-cto init`** — сканирует ваш стек и пишет `.great_cto/FLOW.md` с конвейером для вашего продукта: агенты, архетип сборки и единственный CTO-гейт.

**`/start "опишите продукт"`** — architect и design-advisor набрасывают спецификацию, модель данных и экраны. Вы проверяете и утверждаете на **одном гейте** — `gate:plan`.

**Конвейер отгружает это** — senior-dev делает scaffolding и сборку через TDD, QA запускает сгенерированные тесты, devops деплоит. Дальнейшее одобрение для обратимой сборки не требуется.

## Три продукта — один конвейер

Одна и та же команда, разный продукт. Архетип сборки формирует стек и интеграции:

| | **Dispatch-приложение** | **Приложение для записи на занятия** | **Дашборд прибыльности** |
|---|---|---|---|
| Архетип | CRUD vertical-SaaS | Booking / scheduling | Dashboard / analytics |
| Стек | Next.js · Postgres · shadcn | Next.js · Postgres · cal | Next.js · warehouse-lite · charts |
| Интеграции | Auth · RBAC | Stripe · Twilio | source connectors |
| Человеческие гейты | `gate:plan` (CTO-гейт) | `gate:plan` | `gate:plan` |

→ Смотрите 6 конвейеров: [greatcto.systems/pipelines](https://greatcto.systems/pipelines)

## Дашборд, в который вы реально будете заглядывать

`great-cto board` открывается по адресу `http://localhost:3141` — доска сборки: realtime SSE, живой конвейер с бейджем change_tier (один CTO-гейт · дешёвый судья), стоимость по каждому агенту, расходы на LLM за 30 дней против базовой линии человеческого эквивалента.

<p align="center">
  <img src="../screenshots/board.png" alt="The build board — live pipeline with the change_tier gate badge, inbox and cost" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="../screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — tasks shipped, AI spend, cost savings vs FTE" width="100%" /></a><br/><sub><b>Метрики</b> — отгруженные задачи, расходы на ИИ, экономия против человеческой команды, дневной burn</sub></td>
<td width="50%"><a href="../screenshots/memory.png"><img src="../screenshots/memory.png" alt="Project memory — browsable layers: PROJECT.md, archetypes, lessons" width="100%" /></a><br/><sub><b>Память</b> — просматриваемые слои памяти проекта: PROJECT.md, архетипы, навыки, уроки</sub></td>
</tr>
</table>

**Создано для инженерной организации из одного человека.** GreatCTO — для indie-хакера, соло-основателя или технического CTO, который хочет отгружать реальные продукты без команды — гоняя конвейер на Claude Code или OpenAI Codex, утверждая одну спецификацию и отгружая на живой URL. *Не для команд из нескольких разработчиков* — см. [FAQ](../FAQ.md#is-great_cto-for-teams).

## Установка

```bash
npx great-cto init
```

Перезапустите свой ИИ-хост после init. **Требуется:** Node 18.17+ и одно из:

| Хост | Флаг установки | Статус |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | _(по умолчанию)_ | ✅ полная поддержка |
| [OpenAI Codex](https://openai.com/codex) | `--host codex` | ✅ хуки + MCP + агенты |

```bash
# Claude Code (default)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

Плагины-компаньоны Superpowers и Beads устанавливаются автоматически — ручная настройка не нужна.

---

<details>
<summary>📖 Полная документация — один CTO-гейт · тиеринг по риску · критики · 46 агентов · архетипы сборки · дашборд · стоимость · MCP</summary>

## Одно решение на фичу

```
🤖 architect + design-advisor  →  spec · data model · screens
   ↓
🟡 gate:plan   ←  you decide here — approve the spec (the one CTO gate)
   ↓
🤖 senior-dev → review → qa-engineer → devops  →  built · tested · deployed
```

Конвейер тиерирован по риску (`change_tier`): фикс в рамках сопровождения открывает **ни одного** гейта (гейт — это CI), обратимая фича открывает **только** `gate:plan`, а необратимое изменение требует полного набора + frontier-модель. Всё между гейтом и деплоем работает автоматически. **Память сохраняется** между сессиями: каждый вердикт гейта дописывается в `~/.great_cto/decisions.md`, каждая ретроспектива — в `lessons.md` по каждому проекту, а `/crystallize` продвигает высокоэффективные паттерны в глобальную библиотеку, к которой агенты обращаются перед повторным решением.

## Критики перед планом

Самые дорогие баги не в коде — они в решениях, принятых до начала написания кода. Три агента-критика работают перед стадией Plan, на трёх позициях, где ошибка обходится дороже всего:

| Критик | Что ловит |
|---|---|
| **Архитектурный критик** | Связность, которая позже исключает мультитенантность · «очевидное» O(n²) на данных реального масштаба · циклические зависимости между ограниченными контекстами |
| **Критик спецификации** | «Мы решили не ту задачу» — худший класс багов, потому что ни один юнит-тест его не поймает · несогласованные критерии приёмки · объём работ, о котором никто не договаривался |
| **Критик схемы** | `NOT NULL` без значения по умолчанию на таблице в 50M строк (дедлок через 10 минут после деплоя) · отсутствие `CONCURRENTLY` при создании индекса · необратимые миграции без пути отката |

Раньше критики активировались только начиная со стадии Plan. Теперь конвейер ловит архитектурные ошибки и ошибки уровня спецификации до начала реализации — когда откат стоит часы, а не дни.

## Как great_cto сравнивается с другими

|  | **great_cto** | Devin | Claude Code (сам по себе) |
|---|---|---|---|
| Открытый исходный код | ✅ MIT | ❌ закрытый | ❌ закрытая модель плагинов |
| Self-host | ✅ работает локально | ❌ облако Cognition | ✅ |
| Хост | ✅ Claude Code + Codex | ❌ облако Cognition | ✅ Claude Code |
| BYOK / мультимодельность | ✅ Claude Code · Codex | ❌ проприетарно | ❌ только Anthropic |
| Специализированные агенты | **61** (architect · design-advisor · senior-dev · QA · security · devops · ревьюеры по архетипам) | 1 универсал | 1 универсал |
| Конвейер сборки | spec → CTO gate → scaffold → build → test → deploy | автономия в один проход | цикл правок |
| Человеческие гейты | ✅ один — вы утверждаете спецификацию (тиерирован по риску) | ❌ нет | ❌ |
| Память между сессиями | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ только в рамках треда | ⚠️ только в рамках треда |
| Отслеживание стоимости | ✅ по каждому агенту + история за 30 дней + savings_x | ❌ | ❌ |
| Дизайн встроен | ✅ design-advisor + ui-ux-pro-max → Next.js/Tailwind/shadcn | ❌ | ❌ |
| Цена | бесплатно (вы платите своему LLM-провайдеру) | $500/мес | $20/мес |
| Настройка | `npx great-cto init` | регистрация | установка CLI |

great_cto — это **не** очередной цикл кодирующего агента, это **слой оркестрации над** кодирующим агентом, которым вы уже пользуетесь. Думайте «команда специалистов, которая ревьюит и пропускает работу через гейты», а не «ещё один ассистент, который печатает код».

## Определение юрисдикции

`npx great-cto init` сканирует три источника сигналов — ключевые слова в README, строки инфраструктурных регионов (Terraform, `.env` `AWS_REGION=`, docker-compose `TZ=`) и TLD домена homepage в `package.json` — и автоматически определяет, какие из **12 юрисдикций** применимы:

| Юрисдикция | Сигналы (README + инфраструктура) | Фреймворки | Ревьюер |
|---|---|---|---|
| `eu` | gdpr · eu users · nis2 · eu ai act · `eu-west-*` · `.de` TLD | GDPR · EU AI Act · NIS2 · ePrivacy | `gdpr-reviewer` |
| `us-ca` | ccpa · cpra · california residents · do not sell | CCPA / CPRA | `us-privacy-reviewer` |
| `uk` | uk gdpr · information commissioner · dpa 2018 | UK GDPR · DPA 2018 | `gdpr-reviewer` |
| `in` | dpdpa · india users · rbi data localisation | DPDPA 2023 · RBI | `dpdpa-reviewer` |
| `br` | lgpd · anpd · brazil users | LGPD | `gdpr-reviewer` |
| `au` | privacy act 1988 · oaic · notifiable data breach | Privacy Act 1988 · CDR | `us-privacy-reviewer` |
| `sg` | pdpa · pdpc · mas guidelines · singpass | PDPA · MAS TRM | `us-privacy-reviewer` |
| `ca` | pipeda · quebec law 25 · casl · canadian users · `ca-central-*` | PIPEDA · Quebec Law 25 · CASL · OSFI B-10 | `us-privacy-reviewer` |
| `jp` | appi · japan users · my number · `ap-northeast-1` · `japaneast` | APPI 2022 · PPC Guidelines · FISC | `us-privacy-reviewer` |
| `cn` | pipl · mlps · china users · `cn-north-*` · `cn-east-*` | PIPL 2021 · DSL 2021 · MLPS 2.0 · CBDT | `gdpr-reviewer` |
| `kr` | pipa korea · isms-p · kisa · korea users · `ap-northeast-2` | PIPA · ISMS-P · FSC regulations | `us-privacy-reviewer` |
| `us` | ftc · us users · virginia cdpa · texas tdpsa | FTC Act · US state privacy laws | `us-privacy-reviewer` |

Сопоставление по границам слов предотвращает ложные срабатывания (`"india"` не совпадает с `"indiana"`). Определённая юрисдикция записывается в `PROJECT.md` как `jurisdiction: [eu, us-ca]` и подключает соответствующего ревьюера на каждой фиче через гейт. Переопределение вручную:

```yaml
jurisdiction: [eu, us-ca]
```

## Три команды, которые вы используете каждый день

```bash
/start "build a dispatch & scheduling app for an HVAC business"
# → architect + design-advisor → spec, data model, screens
# → pm → Beads tasks → gate:plan (you approve the spec — the one gate)
# → senior-dev → review → qa → devops → built · tested · deployed

/inbox
# Pending gate · P0 incidents · blocked tasks · stale in-progress

/digest
# Weekly DORA + delta vs last week + cost-per-feature roll-up
```

Плюс: `/audit` (сканирование существующей кодовой базы), `/cost` (экономия LLM-роутера), `/sec` (зонтик безопасности), `/oncall`, `/release`, `/rfc`. Полный список: `~/.claude/commands/` после установки.

## Стоимость

```
~$34/month for a typical solo-CTO project — 20 pipeline runs/month, indicative.
```

| Конвейер | Стоимость/прогон | Прогонов/мес | Итого |
|---|---|---|---|
| quick (конфиг / опечатка) | $0.10 | 10 | $1 |
| quick (новый эндпоинт) | $1 | 6 | $6 |
| standard (фича) | $5 | 3 | $15 |
| deep (сквозное изменение) | $12 | 1 | $12 |
| | | | **~$34** |

Вы платите за собственные токены Anthropic API. **Никакой платы за место. Никакого замыкания на SaaS.** Рутинная сортировка автоматически направляется в Kimi K2 (эквивалент Sonnet при стоимости ~в 5 раз ниже) → снижение на 60–80% на кластеризации логов.

## Архетипы сборки

Каждый продукт мапится на **архетип сборки**, который формирует его конвейер — шаблон стека,
форму данных, фирменную интеграцию. 6 архетипов Product Builder (в них схлопываются ~40 продуктов):

| Архетип | Форма | Стек | Интеграция |
|---|---|---|---|
| `vertical-saas` | entities · roles · workflow · records UI | Next.js · Postgres · shadcn | Auth · RBAC |
| `booking` | calendar · availability · reminders · payments | Next.js · Postgres · cal | Stripe · Twilio |
| `crm` | contacts · pipeline · automated sequences | Next.js · Postgres · queue | email / SMS · webhooks |
| `dashboard` | ingest · metrics · visualization · alerts | Next.js · warehouse-lite · charts | source connectors |
| `marketplace` | two-sided listings · matching · payments | Next.js · Postgres · Stripe Connect | Stripe Connect / escrow |
| `content` | catalog · access tiers · delivery · monetization | Next.js · object storage · CDN | Stripe · media pipeline |

Плюс лежащие в основе архетипы по виду софта (`web-service`, `mobile-app`, `cli-tool`,
`library`, …), которые движок определяет автоматически, чтобы донастроить сборку. См. [6 конвейеров](https://greatcto.systems/pipelines).

Полная таблица (26 архетипов) + как работает определение: [docs/ARCHETYPES.md](../ARCHETYPES.md).

**Глубокое покрытие США** — помимо GDPR/PCI/HIPAA, great_cto теперь проверяет на соответствие SEC cyber-disclosure (8-K Item 1.05), CMMC 2.0 / NIST 800-171 для оборонных подрядчиков, US AI governance (NIST AI RMF · Colorado SB 205 · Utah/Texas AI), судебной практике по веб-трекингу (VPPA · CIPA · Washington MHMDA) и HMDA / SR 11-7 model risk для кредитования.

## Доменные оверлеи (опционально)

Помимо архетипа сборки, движок может автоматически подключить опциональный **доменный оверлей**, когда он
обнаруживает специфичные для домена сигналы (зависимости, термины в README) — добавляя специализированного ревьюера и несколько
дополнительных проверок для таких вещей, как голос/телефония, приватность (GDPR/CCPA) или AI governance. Они
опциональны и ортогональны конвейеру сборки; большинству продуктов они не нужны.

## Один реальный прогон, полностью трассированный

Канонический чек: **одна реальная фича** прошла через полный конвейер за **1h 26m
по настенным часам за $3.40 расходов на LLM** — architect → plan → реализация → review → человеческий гейт →
смёрдженный PR. Традиционный путь для той же фичи: ~170 часов и ~$42K. Каждая стадия
с таймстампом, каждый артефакт ссылается на публичный GitHub PR.

Более ранний прогон на фиче Python CLI ($2.39 против ~$5,460 человеческого эквивалента) показал, что модель ревью работает: безопасность поймала два реальных дефекта, которые пропустил QA (`list(stream_csv())` сводил на нет потоковую обработку → пиковый RSS 14.5 МБ на входе 13 МБ).

Полная трассировка + артефакты: [greatcto.systems/proof](https://greatcto.systems/proof) · сырьё: [`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](../qa/runs/2026-05-09/E2E-CLI-PIPELINE.md).

## Интеграция с CI

Вставьте в любой workflow GitHub Actions:

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci` автоматически определяет `$GITHUB_ACTIONS` и выдаёт аннотации `::error file=...,line=N::` прямо в диффах PR. Коды выхода: 0 чисто / 1 находки / 2 ошибка настройки.

## Пирамида тестов

Многослойный набор тестов — **структурный уровень + уровень конечного автомата работает <2 мин за $0** (`node --test tests/*.test.mjs`); уровень с реальным LLM (26 архетипов × 4-8 стадий + 14 паков + 13 ревьюеров) запускается по требованию через OpenRouter за ~$5–10. Полная разбивка: [docs/testing/](../testing/).

## MCP

Нативный [MCP](https://modelcontextprotocol.io/) сервер — **7 инструментов**, вызываемых из Claude Desktop, Codex или любого MCP-хоста. Локальные (дашборд не нужен): `detect_archetype` · `estimate_cost` · `query_decisions`. На базе дашборда: `project_status` · `cost_summary` · `pipeline_stages` · `recent_verdicts`.

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

Полная настройка + внутренние MCP (Grafana, LLM router, Beads): [docs/MCP.md](../MCP.md).

## Уведомления по email (без настройки)

Пять вещей, которые требуют вашего действия в течение <2ч, отправляются по email автоматически — даже когда вы вдали от дашборда:

| Триггер | Когда |
|---|---|
| 🚨 **Инцидент P0** | Задача P0 открывается в любом проекте |
| ⏸️ **Гейт завис > 2ч** | `gate:ship` ждёт вас часами |
| 🛡️ **Безопасность ЗАБЛОКИРОВАЛА** | `security-officer` отклонил мёрдж |
| 💸 **Оповещение о бюджете** | Месячные расходы на LLM перешли 80% / 100% бюджета |
| 📊 **Еженедельный дайджест** | Пятница 09:00 — отгружено, потрачено, экономия, QA |

**Настройка**: дашборд → вкладка **Notifications** → введите email → введите 6-значный код, который мы отправим → выберите триггеры. Никакой регистрации в Resend, никаких API-ключей — доставка идёт через `greatcto.systems/notify` (бесплатно, 100 писем/24ч на каждый подтверждённый email).

## Ограничения и нецели

- **Не для команд из нескольких разработчиков** — один билдер это и есть продукт; 2+ инженера, делящих конвейер, из него выросли.
- **Не замена senior-инженерам** — кодифицирует процесс; не принимает архитектурных решений без него.
- **Не CI/CD-система** — гейты работают локально / в рамках сессии. Для реального мёрджа вам всё ещё нужен GitHub Actions.
- **Без сертификационного аудита** — каркасы архетипов PCI/HIPAA/SOC2 это отправные точки, а не сертификации.
- **Не детерминирован** — выходы генерируются LLM. Каждый вердикт гейта стоит проверять на здравый смысл.

## FAQ (топ-5)

**Используется ли мой исходный код для обучения моделей?** Нет. Claude API по умолчанию работает с нулевым хранением для платящих клиентов. great_cto ничего к этому не добавляет.

**Как вы держите расходы на токены низкими?** Haiku по умолчанию + роутер Kimi K2 для сортировки (экономия 60–80%) + хук cost-guard.

**Можно ли отключить хуки?** Каждый хук уважает `GREAT_CTO_DISABLE_<NAME>=1`. Отказ от сканирования секретов по файлу: `// great_cto:allow-secrets`.

**Что если я не один?** Конвейер сборки GreatCTO создан для одного инженера — если у вас 2+ инженера, которым нужны общие доски билдера и параллельные конвейеры, вы из него выросли.

Полный FAQ: [docs/FAQ.md](../FAQ.md).

## Документация

📚 **[Хаб полной документации →](../README.md)** — организован по [Diátaxis](https://diataxis.fr/):
**[Начало работы](../tutorials/getting-started.md)** · How-to гайды ·
[Агенты](../reference/agents.md) и [Команды](../reference/commands.md) — справочник · [Архитектура](../ARCHITECTURE.md) · [FAQ](../FAQ.md).

## Архитектура

Плагин работает внутри Claude Code (или любого MCP-совместимого хоста); 46 агентов — это markdown-спецификации; задачи живут в Beads (dolt, git-native); память — обычный markdown (без векторного хранилища). Диаграмма + таблица стека: [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Что нового

**v2.74+** (Июнь 2026) — **Поворот к Product Builder**: GreatCTO становится *AI Product Builder* — опишите программный продукт, утвердите спецификацию на одном CTO-гейте, и конвейер отгрузит его (spec → build → test → deploy). 10 отраслей США, ~40 продуктов, 6 переиспользуемых конвейеров. Гейты сборки тиерированы по риску (`change_tier`); регулируемая runtime-поверхность выехала в [avelikiy/operate](https://github.com/avelikiy/operate). История: [стратегия](../strategy/PRODUCT-BUILDER-DIRECTION.md) · [6 конвейеров](https://greatcto.systems/pipelines)

**v2.40–v2.62** (Июнь 2026) — **Поворот к автопилотам**: GreatCTO становится *ИИ-автопилотами для бизнеса* — 25 сервис-автопилот-вертикалей, каждая представляет собой поток с измеряемым скоркартом качества, ответственным владельцем и runtime-инвариантом, что **необратимое действие никогда не выполняется без подписи человека**. 22 живых коннектора гоняют каждую вертикаль на реальных данных. История: [Мы сделали поворот →](https://greatcto.systems/blog/autopilots-pivot-25-verticals)

**v2.46–v2.63** (Июнь 2026) — **Консоль оператора**: durable-прогоны ставятся на паузу на человеческом гейте и ждут во входящих именованного лицензированного человека; подпись выполняет запись. Ролевой доступ, scoped-приглашения, определения, набросанные ИИ с доказательствами, выборочный QA, SLA-таймеры, вкладка Ops (метеринг · здоровье коннекторов · повторная постановка dead-letter), WCAG 2.2 AA, светлая/тёмная тема. История: [Консоль оператора →](https://greatcto.systems/blog/operator-console)

**v2.37–v2.65** (Июнь 2026) — **Под капотом**: dev-доска становится *пультом* — одобрение гейта может запустить прогон агента с live-стримом; самоулучшение промптов, гейтированное на held-out evals (вдохновлено SIA); сжатие контекста за $0 (CI-лог 31,475 → 155 символов с сохранённым FATAL); поддержка Fable 5. История: [Июнь под капотом →](https://greatcto.systems/blog/june-under-the-hood)

[Полный журнал изменений →](../../CHANGELOG.md)

## Дорожная карта

- **Определение архетипа продукта** — выбор архетипа сборки из брифа продукта, а не только из стека
- **Шаблоны сборки по отраслям** — отгрузка эталонного продукта от и до через каждый из 6 конвейеров
- **Судья с учётом тиера** — дешёвый дообученный судья на T0/T1 evals, frontier + человек на T2 (ADR-004)
- **Headless task-runner** — постановка сборок продуктов в очередь и прогон на VPS без присмотра

[Голосуйте за следующую фичу →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## Автор

[avelikiy](https://github.com/avelikiy) — CTO, строящий AI-нативные трейдинговые и финтех-платформы (0→1, 1→N). great_cto — результат автоматизации моих собственных циклов, по одному агенту за раз. Каждое правило появилось в ответ на реальную проблему в реальной продакшен-системе.

## Сообщество

| Канал | Что |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Баги, запросы фич, предложения архетипов |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Вопросы, паттерны, show-and-tell |
| 📝 [Blog](https://greatcto.systems/blog/) | Чеки, разбивки стоимости, глубокие разборы архитектуры |
| 🔒 [SECURITY.md](../../SECURITY.md) | Ответственное раскрытие уязвимостей |

## Участие и лицензия

Pull request'ы приветствуются — см. [CONTRIBUTING.md](../../CONTRIBUTING.md). Хорошие первые задачи: [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue).

MIT — см. [LICENSE](../../LICENSE).

Если great_cto сэкономил вам время, пожалуйста, поставьте звезду репозиторию — это помогает другим соло-CTO найти его.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

---

<div align="center">

**Создано [@avelikiy](https://github.com/avelikiy)**
*Перестаньте быть единственным человеком, который может отгрузить.*

</div>
