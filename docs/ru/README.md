<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

# great_cto

**Перестань быть единственным, кто может выпустить релиз.**

Ты — CTO. Ты же и узкое место. **GreatCTO — это 30 специализированных агентов**, которые занимаются архитектурой, ревью, QA, безопасностью и деплоем — пока ты принимаешь **два решения на фичу**.

> **v2.7.0** · 34 агента · 25 архетипов · 24 правила безопасности · 9 хуков · работает в **Claude Code · Cursor · Codex · Aider · Continue** · MCP-сервер · webhooks · CI gate · per-stage Beads tasks · ~$34/мес на проект · MIT

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![JSR](https://jsr.io/badges/@avelikiy/great-cto)](https://jsr.io/@avelikiy/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![Stars](https://img.shields.io/github/stars/avelikiy/great_cto?style=flat)](https://github.com/avelikiy/great_cto/stargazers)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)

[Сайт](https://greatcto.systems) · [Демо](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Блог](https://velikiy.hashnode.dev)

**Язык:** [English](../../README.md) · **Русский** · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português (BR)](../pt-BR/README.md)

</div>

## Что нового

### v2.7.0 — консистентность промптов агентов + model-tier policy (май 2026)
- 3 новых правила линтера: `CONS-MODEL` (модель агента соответствует роли) · `CONS-OUTPUT` (reviewers объявляют output-файл) · `CONS-SIGNOFF` (sign-off / gate semantics)
- ADR-002 — единая policy выбора tier модели (architect → opus|sonnet, continuous-learner → haiku, *-reviewer → sonnet)
- Bug fix: SessionEnd auto-capture логи теперь рендерятся в board admin (раньше показывались как «0 done · 0 pending»)
- Линт-baseline: 34 агента · 0 ошибок · 0 предупреждений


[Полный changelog →](../../CHANGELOG.md)

## Что такое great_cto?

great_cto — это [плагин для Claude Code](https://claude.com/plugins), который запускает полный SDLC-пайплайн в виде **30 специализированных агентов** — архитектор, планирование, имплементация, ревью под 12 углов, QA, безопасность, деплой, поддержка — координируемых через борд, в который ты реально заглядываешь. Ты принимаешь два решения на фичу; всё остальное — автоматически.

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto kanban — 5 колонок, inline-аппрув гейтов, live SSE" width="900" />
  <br/>
  <em>Kanban — 5 колонок, inline-редактирование статуса, live-обновления через SSE из <code>bd</code> CLI.</em>
</p>

| Слой | Что делает |
|-------|--------------|
| **33 специалистов** | architect · pm · senior-dev · code-reviewer · qa-engineer · security-officer · devops · l3-support · performance-engineer · ai-prompt-architect · ai-eval-engineer · ai-security-reviewer · pci-reviewer · regulated-reviewer · oracle-reviewer · firmware-reviewer · web-store-reviewer · db-migration-reviewer · mobile-store-reviewer · library-reviewer · infra-reviewer · cli-reviewer · game-reviewer · data-platform-reviewer · devtools-reviewer · enterprise-saas-reviewer · mlops-reviewer · streaming-reviewer · marketplace-reviewer · cms-reviewer · edtech-reviewer · gov-reviewer · insurance-reviewer · continuous-learner |
| **25 архетипов** | web-service · agent-product · ai-system · mlops · commerce · marketplace · fintech · healthcare · mobile-app · cli-tool · library · browser-extension · game · web3 · iot-embedded · data-platform · streaming · devtools · infra · cms · enterprise-saas · regulated · edtech · gov-public · insurance |
| **Авто-детект** | Сканирует `package.json`, `pyproject.toml`, `Cargo.toml`, README, структуру кода → подбирает архетип + compliance-гейты за 2 секунды. Anthropic Haiku даёт second-opinion (~$0.001), когда уверенность низкая. |
| **Compliance** | EU AI Act · OWASP LLM Top 10 · PCI-DSS · SOX · KYC/AML · HIPAA · HITECH · GDPR · ISO27001 · ETSI EN 303 645 · COPPA · SOC2 — авто-подтягивается под архетип. |
| **Память** | 4 уровня — `PROJECT.md` (архетип) · `lessons.md` (ретро по проекту) · `~/.great_cto/decisions.md` (каждое решение через гейт, с поиском между проектами) · `verdicts/` (каждый вердикт агента). |
| **Борд** | `great-cto board` открывает 6 представлений на `localhost:3141` — Inbox · Kanban · Metrics · Agents · Memory · Публичный отчёт. Live-обновления через SSE. |

## Два решения на фичу

```
Ты:  /start "добавить подписки Stripe — месячные и годовые"

great_cto:
  → архетип: commerce | масштаб: standard | ~45 мин
  → compliance: pci-dss + gdpr (привязано автоматически)
  → ARCH-stripe-subscriptions.md готов  →  РЕШЕНИЕ 1: одобряешь архитектуру?

Ты: "одобряю"

  → senior-dev → ревью под 12 углов → qa-engineer → security-officer → devops
  → 412 тестов зелёные · 0 high · canary готов
  → РЕШЕНИЕ 2: катим?

Ты: "катим"  →  canary 5% → 20% → 100%  →  RELEASE-документ написан
```

## Быстрая установка

```bash
npx great-cto init
```

CLI сканирует репозиторий, подбирает правильный архетип, автоматически подключает compliance-гейты. Работает на новых и существующих проектах. После — перезапусти Claude Code.

**Требуется:** [Claude Code](https://claude.com/claude-code) · Node 18.17+ · [Beads](https://github.com/steveyegge/beads) · [Superpowers](https://github.com/obra/superpowers)

## Борд, в который ты реально заглядываешь

```bash
great-cto board   # localhost:3141
```

Шесть представлений, реальные скриншоты — см. [greatcto.systems#board](https://greatcto.systems#board).

| View | Что там |
|------|---------|
| **Inbox** | Карточка возобновления (продолжи с того места) · Решения, ждущие тебя · Открытые P0 · Заблокировано · Зависло (in-progress > 48ч) |
| **Kanban** | 5 колонок · inline-аппрув/реджект гейтов · фильтр-бар (агент / приоритет / лейбл) · ⌘K-поиск · `j`/`k` навигация |
| **Metrics** | Hero-карточки (velocity, cost, MTTR) · график трат на LLM за 30 дней с budget-алертами |
| **Agents** | Время на агента, стоимость LLM, эквивалент человеко-часов по $150/час · фид активности (последние 20 вердиктов) |
| **Memory** | Браузер 4-х уровней: PROJECT.md · lessons.md · decisions.md · verdicts/ |
| **Публичный отчёт** | Включи toggle → неугадываемый URL с зашипанными задачами, AI-vs-human стоимостью. Без кода и кредов. |

Переключатель проектов — один борд, все клиенты. Лог межпроектных решений отвечает на *«мы это уже решали?»* по всем твоим репо.

## Три команды на каждый день

| Команда | Что делает |
|---------|------------|
| `/start "описание"` | Запускает полный SDLC-пайплайн — детектит архетип, генерит арх-док, имплементит через TDD, ревью, QA, безопасность, деплой |
| `/review` | 12 независимых углов код-ревью на текущей ветке |
| `/inbox` | Открытые гейты, заблокированные задачи, P0-инциденты, security-алерты — всё, что требует твоего решения сейчас |

Всё остальное (`/audit` · `/digest` · `/sec` · `/cost` · `/release` · `/crystallize`) запускается автоматически или только когда нужно. См. [`docs/COMMANDS.md`](../COMMANDS.md) для полного справочника.

## 25 архетипов, авто-детект

Каждый архетип активирует свои специализированные агенты и compliance-чеклисты.

| Архетип | Tier по умолчанию | Авто-загруженные специалисты | Compliance |
|---------|-------------------|------------------------------|------------|
| `web-service` | baseline | — | gdpr · owasp-api-top-10 |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act · owasp-llm-top-10 |
| `ai-system` | **standard** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act |
| `mlops` | **deep** | mlops-reviewer · ai-eval-engineer | eu-ai-act · nist-ai-rmf · iso42001 |
| `commerce` | standard | pci-reviewer | pci-dss · gdpr · sca-psd2 |
| `marketplace` | **deep** | marketplace-reviewer · pci-reviewer | pci-dss · kyc-aml · dsa-eu · 1099-k · ofac |
| `fintech` | **deep** | pci-reviewer · regulated-reviewer | pci-dss · sox · kyc-aml · gdpr · dora |
| `healthcare` | **deep** | regulated-reviewer | hipaa · hitech · gdpr |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `cli-tool` | baseline | cli-reviewer | — |
| `library` | baseline | library-reviewer | openssf · sbom |
| `browser-extension` | standard | web-store-reviewer | csp · mv3-security · gdpr |
| `game` | standard | game-reviewer | coppa · age-rating · accessibility |
| `web3` | **deep** | oracle-reviewer | soc2 · audit-prep |
| `iot-embedded` | standard | firmware-reviewer | iso27001 · etsi-en-303-645 · cra |
| `data-platform` | standard | data-platform-reviewer | gdpr · data-residency · lineage |
| `streaming` | standard | streaming-reviewer | gdpr · soc2-cc7 |
| `devtools` | standard | devtools-reviewer | openssf · soc2-type-2 · slsa-l3 |
| `infra` | standard | infra-reviewer · db-migration-reviewer | soc2 · cis-benchmarks |
| `cms` | standard | cms-reviewer | dmca · wcag-2.2-aa · dsa-eu · gdpr |
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `regulated` | **deep** | regulated-reviewer | soc2 · hipaa · sox · dora · nis2 · iso27001 |
| `edtech` | **deep** | edtech-reviewer | coppa · ferpa · gdpr-k · wcag-2.2-aa · section-508 · sopipa-ca |
| `gov-public` | **deep** | gov-reviewer | fedramp · nist-800-53 · fisma · section-508 · pia · ato · cjis · stateramp |
| `insurance` | **deep** | insurance-reviewer | naic · solvency-ii · ifrs-17 · gdpr · ccpa · anti-discrimination-pricing · actuarial-asops |

Переопределить в любой момент: `npx great-cto init --archetype <name>` или отредактируй `.great_cto/PROJECT.md`. CLI также предлагает second-opinion от Anthropic Haiku (~$0.001), когда heuristic-уверенность низкая — установи `ANTHROPIC_API_KEY`, чтобы включить, либо отключи через `--no-llm`.

Отдельные landing-страницы: [agent-product](https://greatcto.systems/for/agent-product) · [fintech](https://greatcto.systems/for/fintech) · [healthcare](https://greatcto.systems/for/healthcare).

## Чем это отличается?

Мы не редактор — мы оркеструем процесс вокруг твоего редактора. Используй Cursor, Copilot или Claude Code внутри цикла, если хочешь.

| | great_cto | Cursor | Copilot Workspace | Claude Projects |
|---|---|---|---|---|
| Multi-agent SDLC pipeline | ✓ 33 специалистов | ✕ | ✕ | ✕ |
| Авто-детект архетипа | ✓ 25 типов | ✕ | ✕ | ✕ |
| Compliance-гейты (PCI / HIPAA / SOX / EU AI Act) | ✓ | ✕ | ✕ | ✕ |
| Persistent memory | ✓ decisions.md + verdicts | ⚠ только чат | ✕ | ✓ scope чата |
| Multi-project view | ✓ | ✕ | ✕ | ⚠ |
| Ревью под 12 углов | ✓ | ⚠ single-pass | ⚠ single-pass | ✕ |
| Публичные шарящиеся отчёты | ✓ | ✕ | ✕ | ✕ |
| Open source | ✓ MIT | ✕ | ✕ | ✕ |
| Запуск локально | ✓ | ⚠ частично | ✕ | ✕ |
| Платишь свой API | ✓ | ✕ | ✕ | ✕ |
| **Цена** | **$0 + твой API** | $20/мес | $39/мес | $20/мес |

## Стоимость

```
~$34/месяц для типичной продуктовой команды — 20 запусков пайплайна/месяц, ориентировочно.
```

| Pipeline | Стоимость/запуск | Запусков/мес | Итого |
|----------|------------------|--------------|-------|
| quick (конфиг / typo) | $0.10 | 10 | $1 |
| quick (новый эндпоинт) | $1 | 6 | $6 |
| standard (фича) | $5 | 3 | $15 |
| deep (cross-cutting) | $12 | 1 | $12 |
| | | | **~$34** |

Платишь свои Anthropic API токены. **Без per-seat-фи. Без SaaS lock-in.** Рутинный triage авто-роутится на Kimi K2 (Sonnet-эквивалент при ~5× меньшей стоимости) → 60–80% экономии на кластеризации логов и шумных стактрейсах.

## Пайплайн масштабируется под задачу

```
architect → pm → senior-dev → [/review ×12] → qa-engineer → security-officer → devops → l3-support
```

| Масштаб | Агенты | Время | Когда |
|---------|--------|-------|-------|
| `quick` | 1–3 | 5–20мин | Хотфикс, typo, новый эндпоинт, маленькая фича |
| `standard` | 5 | ~45мин | **По умолчанию** — стандартная фича, новый сервис |
| `deep` | 7+ | 90мин+ | Cross-cutting, регулируемый домен, миграция архитектуры |

`/start` определяет масштаб автоматически. Переопредели в любой момент: `"сделай deep"`, `"это quick fix"`.

## Память и межпроектное обучение

Мы синтезируем, а не записываем. Общая локальная память ~10–50 КБ на проект, индексируется при старте сессии.

| Уровень | Файл | Что помнит | Триггер синтеза |
|---------|------|------------|-----------------|
| L1 | `.great_cto/PROJECT.md` | Архетип, размер, compliance, owners | `/start` |
| L2 | `.great_cto/lessons.md` | Ретро по проекту, что не получилось, что сработало | `/digest` еженедельно + каждый постмортем |
| L3 | `~/.great_cto/decisions.md` | Каждое approve/reject через гейт по всем проектам (append-only ADR-лог) | Авто на каждый gate-action |
| L4 | `~/.great_cto/verdicts/` | Каждый вердикт агента (APPROVED / DONE / BLOCKED / FAIL) с обоснованием | Авто на каждый запуск агента |

Агенты ищут в памяти **до** чтения сорсов — решённые проблемы остаются решёнными. Между проектами: решение по «JWT auth» в проекте A всплывёт в проекте B, когда применимо. После P0-инцидента агенты извлекают структурированный паттерн и `/crystallize` промоутит его глобально — **MTTR падает на 94% при втором повторении**.

## Приватность и телеметрия

Анонимный opt-in install-пинг (один на `npx great-cto init`):

- Случайный UUID install_id, версия CLI, архетип, версия Node, OS.
- **Никаких путей, кода, имён репо или PII.**
- Хранится в `~/.great_cto/config.json`, чтобы одна установка не считалась дважды.
- Отключить: `--no-telemetry`, `GREATCTO_NO_TELEMETRY=1`, или `{ "telemetry": false }` в конфиге.

Питает live-счётчик на [greatcto.systems](https://greatcto.systems).

## MCP-интеграции

Нативная поддержка серверов [Model Context Protocol](https://modelcontextprotocol.io/). Опционально — пайплайн работает и без них.

| MCP | Кем используется | Что включает |
|-----|------------------|--------------|
| Grafana | `l3-support` | LogQL через `query_loki`, `search_alerts`, `query_tempo`, `get_panel`. Pre-P0 alert-detection |
| LLM-роутер | `l3-support`, `qa-engineer` | Роутит рутинный triage на Kimi K2. **60–80% экономии LLM** на кластеризации логов |
| Beads | все агенты | Git-нативный task-tracker. Переживает рестарты сессии с зависимостями + блокерами |
| Свои | любой агент | Добавь в `.claude-plugin/plugin.json` → `mcpServers` |

Specialist sub-agents из [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) (419 агентов + 336 команд) вызываются через инструмент `Agent`. Установка: `/template install <name>`.

## Полностью автоматические триггеры

| Триггер | Что происходит |
|---------|----------------|
| Старт сессии | PROJECT.md + lessons.md + decisions.md + verdicts загружаются |
| Approve/reject гейта | Логируется в `~/.great_cto/decisions.md` (append-only ADR) + broadcast через SSE на live-борд |
| `bd create / update / close` | Детектится через dolt-DB watcher, борд обновляется за <1с |
| Сжатие контекста | Пишется HANDOFF.md → следующая сессия продолжает с точного состояния пайплайна |
| P0 или итераций > 3 | Агент пишет KE-файл → запусти `/crystallize`, чтобы промоутить в глобальный паттерн |
| Пн 9:00 | `/digest` — DORA-метрики + обновление brain + статистика библиотеки паттернов |
| Вс 23:00 | `/audit` — скан зависимостей + секретов |
| Каждый Bash-вызов | Safety-проверка: блокирует `rm -rf`, `git push --force`, `DROP TABLE` |

## Ограничения и не-цели

- **Не замена сеньорам** — кодифицирует процесс; не делает архитектурных решений без них.
- **Не IDE** — работает внутри Claude Code. Если ты не используешь Claude Code, это не для тебя.
- **Не CI/CD-система** — гейты работают локально / в сессии. GitHub Actions для самого мерж-пайплайна всё равно нужен.
- **Не secrets-manager / observability-платформа** — интегрируется с ними, не хостит данные.
- **Не детерминирован** — выходы LLM. Каждый вердикт гейта стоит проверять; `/inbox` показывает rubber-stamping drift.
- **Не сертифицирован** — PCI/HIPAA/SOC2 archetype-скаффолды — стартовая точка, не сертификация.

## FAQ

**Работает ли без интернета?**
Сами агенты работают локально как Claude Code субагенты. Только Claude API запросы идут к Anthropic. Никакого кода, телеметрии или памяти никуда больше не отправляется.

**Используется ли мой код для обучения моделей?**
Нет. Claude API по умолчанию zero-retention для платных клиентов. great_cto ничего не добавляет — твой код остаётся твоим.

**Что если у меня уже есть CI/CD?**
great_cto работает *до* CI. Ловит проблемы на этапах архитектуры, ревью и pre-merge. Используй оба — они дополняют друг друга, а не конкурируют.

**Поддержка Cursor / Copilot / Aider?**
Пока только Claude Code. Cross-harness поддержка (на базе `AGENTS.md`) — в roadmap v2.x.

**Можно ли отключить хуки, если они мешают?**
Каждый хук уважает env-переменные `GREAT_CTO_DISABLE_<NAME>=1` (например `GREAT_CTO_DISABLE_SECRET_SCAN=1`). Per-file opt-out через `// agentshield:ignore` для security-сканов.

**Как держите токен-стоимость низкой?**
Три уровня — (1) Haiku по умолчанию для дешёвых агентов, (2) [Kimi K2 router](https://github.com/avelikiy/great_cto/blob/main/agents/llm-router.md) для triage (60–80% экономии), (3) хук `cost-guard` предупреждает перед дорогими промптами. См. `/cost` для live-трат.

**Что происходит с данными при удалении?**
Состояние плагина живёт в `~/.great_cto/` (глобальные решения) и `.great_cto/` (per-project). Оба — обычный markdown, `rm -rf` чистит всё. Никаких внешних сервисов для деавторизации.

**Почему не auto-pilot? Почему "два решения на фичу"?**
LLM мощные, но теряют продуктовое чутьё на неоднозначных спеках. Человек на gate:plan и gate:ship ловит те 5% плохих решений, которые отвечают за 95% затрат. См. [ADR-015 — Архитектура цикла обучения](../architecture/ADR-015-learning-loop-architecture.md).

## Архитектура

```
┌──────────────────────────┐    ┌──────────────────┐
│   Сессия Claude Code     │───→│  great_cto       │
│   (тут запускаешь /start)│    │  пайплайн +      │
└──────────────────────────┘    │  33 агента       │
              │                 └────────┬─────────┘
              ↓                          ↓
┌──────────────────────────┐    ┌──────────────────┐
│   .great_cto/            │    │  Beads (dolt)    │
│   PROJECT · lessons ·    │←──→│  task DB         │
│   decisions · verdicts   │    └──────────────────┘
└──────────────────────────┘
              │
              ↓
┌──────────────────────────┐
│   great-cto board        │
│   localhost:3141         │
│   (vanilla HTML, 0 deps) │
└──────────────────────────┘
```

| Слой | Стек |
|------|------|
| Plugin runtime | Claude Code (Anthropic) |
| Агенты | Markdown agent-спеки + библиотека skill'ов |
| Task tracker | [Beads](https://github.com/steveyegge/beads) (dolt, git-нативный) |
| Память | Plain markdown файлы (без vector store) |
| Борд | Vanilla HTML/CSS/JS + Node http server, 0 зависимостей |
| Публичный отчёт | Cloudflare Worker (`/r/<hash>`) — toggleable |
| Телеметрия | Cloudflare Worker + D1 (`/api/install`, opt-in) |

## Автор

[avelikiy](https://github.com/avelikiy) — Chief AI & Technology Officer / Founder. CTO, строящий AI-native trading- и fintech-платформы (0→1, 1→N). Специализация — высоконагруженные финансовые системы, где технология напрямую влияет на PnL, риск и юнит-экономику.

**Зачем существует great_cto.** Те же код-ревью, те же архитектурные вопросы, те же security-аудиты — в нескольких компаниях те же циклы. Делегирование помогало. Процесс помогал. Но узким местом всегда был сеньор-инженер, принимающий решение. Когда вышел Claude Code, я начал автоматизировать свои циклы по одному агенту за раз. great_cto — результат: каждое правило в этой системе появилось в ответ на реальную проблему в реальном проде.

## ⭐ Поставь звезду

Если great_cto сэкономил тебе время на проекте — поставь звезду репозиторию. Это поможет другим solo-фаундерам и небольшим командам найти его.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

## 💬 Комьюнити и поддержка

| Канал | Что |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Баги, фичереквесты, предложения архетипов |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Вопросы, паттерны, show & tell |
| 📝 [Блог](https://velikiy.hashnode.dev) | Глубокие разборы архитектуры, цикла обучения, калибровки стоимости |
| 🐦 [@Greatcto на Hashnode](https://hashnode.com/@Greatcto) | Релизные ноты, статьи, серия AI-CTO |
| 📦 [npm](https://www.npmjs.com/package/great-cto) · [JSR](https://jsr.io/@avelikiy/great-cto) | Реестры пакетов |
| 🔒 [Security](../../SECURITY.md) | Responsible disclosure для CVE в хуках/сканере |

## Roadmap

- **v2.2** — телеметрия качества уроков (трекаем, какие уроки агенты реально цитируют vs игнорируют)
- **v2.3** — авто-промоушн: high-impact решения → переиспользуемые skill'ы (`~/.great_cto/global-skills/`)
- **v3.0** — cross-harness поддержка (`AGENTS.md` для Cursor / Codex / OpenCode / Gemini)

[Голосуй за следующую фичу →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

## Контрибьютинг

Pull request'ы приветствуются — см. [CONTRIBUTING.md](../../CONTRIBUTING.md). Good-first-issue помечены лейблом [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue).

Особенно нужны:
- Новые archetype-скаффолды (предложить через Discussions)
- Переводы: `docs/<lang>/README.md` для не-английской аудитории
- Реальные кейс-стади — если great_cto тебе что-то выпустил, поделись цифрами

## Лицензия

MIT — см. [LICENSE](../../LICENSE).

---

<div align="center">

**Сделано [@avelikiy](https://github.com/avelikiy) · [@Greatcto](https://hashnode.com/@Greatcto) на Hashnode**
*Перестань быть единственным, кто может выпустить релиз.*

</div>
