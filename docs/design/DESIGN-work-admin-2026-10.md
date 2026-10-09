---
surface: web
feature: task-centric-admin
status: proposed
date: 2026-10-02
beads: great_cto-3ae3.5
---

# Админка вокруг задачи: design handoff

**Дата:** 2026-10-02. **Статус:** целевой контракт; read-side инкремент реализован в `.6`, полный lifecycle и host operations остаются в `.2`/`.3`.
**Связанный план:** [единый пользовательский вход](../plans/PLAN-2026-10-02-simple-user-entry.md).
**Tracking:** `great_cto-3ae3.5` (спецификация), `.2` (UI), `.3` (durable state и действия хостов).

## Design dials

DESIGN_VARIANCE: 2/10 - сохраняем знакомые компоненты и темы, меняем навигацию и смысл карточек.
MOTION_INTENSITY: 1/10 - обновления состояния без анимации; фокус и раскрытие работают с reduced motion.
VISUAL_DENSITY: 5/10 - цель и следующее действие на первом уровне, внутренние механизмы раскрываются отдельно.

## 1. Продуктовое решение

Админка отвечает на четыре вопроса: что я поручил, что происходит, что требуется
от меня и какой результат получен. Агенты и гейты остаются механизмами исполнения.
Их число не является прогрессом задачи. Упрощение навигации не расширяет authority.

Основная навигация: **Работа**, **Решения**, **История**. Технические разделы
Fleet, Harness, Ledger, logs, docs и memory доступны через «Инструменты».
Существующие deep links сохраняются. Settings и выбор проекта остаются доступны.
Фильтры Expensive grants / Never observed относятся только к экрану агентов;
они не должны занимать место на каждом экране.

На первом этапе сохраняем английский язык существующего board: Work, Decisions,
History, Tools. Русские подписи ниже описывают семантику, а не частичную локализацию.
Полную локализацию следует внедрять отдельно с единым словарём.

## 2. Что проверено в исходниках

| Поверхность | Текущее поведение | Следствие для дизайна |
| --- | --- | --- |
| [Board UI](../../packages/board/public/index.html) | Decisions, Ledger, Fleet, Harness; дополнительные представления и drawers | Меняем информационную архитектуру, используем существующие компоненты и темы |
| [Routes](../../packages/board/lib/routes.mjs) `/api/tasks` POST | Создаёт Beads issue | «Создать issue» нельзя просто переименовать в «Запустить задачу» |
| `/api/resume` GET | Возвращает контекст продолжения | Это не endpoint запуска; показываем контекст или команду |
| `/api/codex-runs` GET | Sanitized project-scoped projection; degraded при нечитаемых state files | Уже можно показывать реальные Codex runs без prompt/token/artifact bytes |
| `/api/inbox`, `/api/pipeline`, `/api/turns`, `/api/metrics`, `/api/cost` | Решения, стадии, сессии, метрики и расходы из разных источников | Сначала нормализуем данные; не объединяем записи по похожему заголовку |
| `/api/gates/:id` POST | Approval token, binding, подтверждение для дорогих/неизвестных действий, stale checks | Сохраняем весь протокол, упрощаем объяснение решения |
| Неизвестный `?project=` | Read route может fallback к server cwd с `X-Project-Fallback` | Новый mutation contract обязан отклонить неизвестный project |

[Проверенный скриншот](../screenshots/board.png) иллюстрирует текущую композицию,
но не доказывает состояние живого процесса. [API reference](../BOARD-API.md) и
[UI regression contract](../../packages/board/design-contract.test.mjs) дополняют исходники.

## 3. Информационная модель

**Task**: намерение пользователя, acceptance, разрешённые действия и результат.
**Run**: конкретная попытка исполнения с host, revision и lifecycle.
**Issue**: Beads work item, связанный явно с task; одна задача может иметь много issues.
**Decision**: запрос нового разрешения или существенного выбора, привязанный к run,
версии предложения и проверяемому evidence. **Operation**: принятая backend-команда.

`taskId`, `runId`, `issueId`, `decisionId` не взаимозаменяемы. Legacy issue без run
показывается как «Рабочая запись, запуск не связан». Его status=closed не доказывает
достижение цели, тестирование или deployment. Связи создаются владельцем state,
а не браузером по совпадению названия, имени агента или времени.

Task phase и качество данных независимы. Источник сообщает `accepted`, `working`,
`needs_decision`, `blocked`, `verified`, `publishing`, `completed`; adapter переводит
native state только при доказанном соответствии. Если stage известен, а весь
lifecycle неизвестен, показываем stage и «Общий статус не определён».
Data health: current, stale, degraded, unavailable; всегда source и observedAt.
Порог stale задаётся источником, а не единым произвольным таймером UI.

Завершение означает полученный запрошенный результат. `verified` требует verdicts
и receipts. Для deployment нужен результат проверки живой среды. Отсутствие
данных не превращается в зелёный статус. Общий процент прогресса не вводим:
число закрытых issues или отработавших агентов не измеряет готовность результата.

## 4. Экраны и компоненты

### Работа

```text
Проект ▾                       Решения (1)    Инструменты    Settings
Работа                                           Описать задачу
[ Нужен результат: __________________________________________ ]

Добавить экспорт операций                         Требуется решение
Claude Code · обновлено 12:41 · данные доступны
Проверено: CSV и фильтрация. Сейчас: проверка прав доступа.
От вас: выбрать, включать ли персональные данные в экспорт.
[Рассмотреть решение]                    [Открыть задачу]

Другие задачи: активные / требующие внимания / все
```

Один primary CTA на карточку: ожидающее решение, просмотр блокера либо просмотр
результата. «Продолжить» появляется только при capability execution-resume.
Host выбора задачи сохраняется; при отсутствии выбора показываем доступные хосты
и их ограничения. Нельзя молча отправить задачу в другой runtime.

Пустое состояние: краткий пример поручения и доступное действие. Loading не
показывает нулевые счётчики. Unavailable объясняет источник и способ восстановления.
Если источники неполны, показываем известные записи и предупреждение, не скрываем
нечитаемые runs за пустой выдачей. Поиск по цели, ID и проекту, агенты в Tools.

### Детали задачи

Сверху goal, acceptance, host, phase, data health, последнее изменение и next action.
Затем результат и доказательства: artifact/PR/deployment ссылки, verdict с revision,
сведения о проверках. Далее компактная хронология событий. Issues, агенты,
receipts, native stage, budgets и logs раскрываются в «Технических деталях».
Цена показывается только по измеренным данным со scope, currency и completeness;
«данные отсутствуют» отличается от $0. Политика approvals и бюджет доступны
для просмотра; редактирование политики является отдельным версионируемым действием.

Большой goal переносится; полное содержание доступно в деталях. Ошибка копирования
команды показывается inline. Ссылки/Markdown санитизируются существующим механизмом.

### Решения

```text
Опубликовать версию с новым экспортом?
Причина обращения: публикация выходит за разрешение на локальные изменения.
Рекомендация: опубликовать после проверки прав доступа.
Результат выбора: версия X станет доступна пользователям среды Y.
Альтернатива: оставить изменения в PR.
Доказательства: diff · QA verdict · security verdict · target environment
[Одобрить публикацию] [Отклонить]                [Технические детали]
```

Это пример формата, не автоматически вычисляемая рекомендация. Показываем её
только если она записана владельцем предложения; иначе «Рекомендация не записана».
Название описывает действие, `gate:ship` доступен в деталях. Причина остановки,
scope, consequences и binding revision всегда видны. Не смешиваем approvals разных
хостов. Нет bulk approve и approve-all. Ввод дополнительного подтверждения остаётся
для тех решений, где backend его требует. Reject предлагает необязательную причину.
Никакая UI-кнопка не подменяет обязательный QA/security verdict.

Во время submit блокируем повторный запрос этой карточки, сохраняем keyboard focus.
После ответа показываем подтверждённый state; optimistic approval запрещён.
409 stale: объяснение изменения, обновлённое evidence, повторное решение пользователя.
403 expired token: обновить карточку, без автоматического retry approve.
Network timeout: проверить operation/decision state до retry. Молчание не approval.

### История

Завершённые и прерванные задачи с результатом, host, датой и измеренными расходами.
Повторить создаёт новую попытку, показывает scope и authority; не переносит старые
approval tokens. Не показываем aborted run как completed task.

## 5. Backend contract и authority

Существующие источники остаются владельцами данных. Предлагаемый **новый**
`GET /api/work?project=<id>` возвращает versioned projection:

```typescript
type WorkSnapshot = {
  schemaVersion: 1;
  projectId: string;
  revision: string;
  sources: Array<{ id: string; health: string; observedAt: string | null; reason?: string }>;
  tasks: Array<{
    taskId: string; goal: string | null; acceptance: string[];
    runIds: string[]; issueIds: string[];
    phase: string | null; phaseEvidence: string[];
    nextAction: { kind: string; label: string; reason: string } | null;
    capabilities: Array<{ action: string; enabled: boolean; reason: string | null }>;
  }>;
};
```

Это эскиз, не финальная runtime schema. `.3` закрепляет enums, nullability, migration,
revision semantics, per-host adapters и ссылки на run/decision/evidence сущности.
Секреты и сырые approval tokens не попадают в общую projection, logs или URLs.
Текущий scoped inbox token transport сохраняется только для своего decision action.

Для новой модели предлагаются `POST /api/work` (создание и enqueue) и
`POST /api/work/:taskId/actions` с action, runId, expectedRevision, idempotencyKey.
Имена окончательно закрепляются вместе со schema. HTTP handler не запускает
длительную LLM-сессию: persist operation → 202 с operationId → worker → SSE/status.
Повтор с тем же ключом возвращает ту же операцию; конфликт payload отклоняется.
SSE reconnect восстанавливается snapshot, дубликаты событий не дублируют карточки.

Backend повторно проверяет project, host capability, authority, revision и locks.
Создание требует project-scoped lock; execution требует existing per-run lock.
Unknown project, unreadable state, ambiguous run, active owner, pending approval
не становятся «продолжить всё». Resume, recover, approve и publish разные действия.
Recovery требует отдельного capability и объяснения причин. Cancel можно показывать
только с точной поддерживаемой семантикой, включая состояние in-flight операций.

[Gate tokens](../../packages/board/lib/gate-tokens.mjs) сохраняют single-use, TTL,
receipt binding и fail-closed read. Native Codex decision должен проходить через
controller adapter; Beads gate POST не заменяет runtime approval. Existing host/origin
защита и read-only remote board сохраняются. Multi-user RBAC нельзя подразумевать
из localhost интерфейса. Включение удалённой записи требует отдельного auth design.

## 6. Design system, responsive и accessibility

Используем текущие dark/light tokens: `--bg-card`, `--bg-muted`, `--text`, `--text2`,
`--border`, `--status-*`, `--absent-warn-*`, `--focus-ring`. Цвет дополняется текстом.
Размеры из существующей шкалы: page title `--fs-title-l` 22px, section 19px,
card 16px, body 14px, metadata 12px. Основной смысл нельзя уносить в metadata.
Новые layout значения ниже являются предложением: card padding 16px, gap 12px,
section gap 24px. Вынести их в reusable spacing tokens при реализации.

Desktop ≥1200px: sidebar и список с detail panel. 768–1199px: существующий icon rail
56px, детали отдельной поверхностью. Mobile <768px: одна колонка, details full width,
навигация с подписями, без горизонтальной таблицы. Нормализовать текущие overlapping
media queries на границе 768px. Touch controls ≥44px, gap между decision actions 12px.

Нужны keyboard navigation, visible focus через `--focus-ring`, корректные headings,
form labels, inline reason для недоступного действия, focus return из drawer/dialog.
Status announcement через polite live region; streaming logs туда не транслируем.
Error summary связывается с полями. Без hover-only explanation и цвета как единственного
сигнала. Сохраняем reduced-motion; никаких вечных декоративных progress animations.
Поддерживаем 200% zoom, длинные заголовки и обе темы. DOM order совпадает с reading order.

## 7. Порядок поставки и проверка

| Инкремент | Результат | Зависимость |
| --- | --- | --- |
| A: source projection | Стабильное связывание task/run/issue и независимый data health | `.3`: read schema и adapters |
| B: основной UI | Work/Decisions/History, task details, source-backed карточки, Tools | A; `.2` |
| C: controlled actions | Start/resume через capabilities, operations и locks | `.3`: mutation contract и authority |

До C можно показывать «Скопировать команду» или «Открыть контекст», явно обозначая
их результат. Это не выполненный запуск. Не добавляем активные кнопки будущих API.
Не переписываем весь board на новый frontend framework ради смены навигации.
Новые projection/render компоненты выделяем из inline bundle постепенно.

Приёмка покрывает: пустой проект; один и несколько runs; legacy issue без run;
нечитаемый state; stale snapshot; Codex awaiting gate; Claude недоступен; другой
проект; double submit; повтор после timeout; expired/stale approval; SSE reconnect;
неполные cost данные; отказ публикации; отсутствие QA evidence; remote read-only.
Каждый scenario проверяет показанный смысл и фактический backend effect.
Ручная visual/a11y проверка на 375, 768, 1200px, обе темы, keyboard и 200% zoom;
fixtures и browser tests не заменяют проверку реального host adapter.

Метрики после внедрения: время до начала выполнения, число ручных выборов команды/
стадии, human decision count по причине, resume success, time-to-result и дефекты.
QA failures и осмысленные approvals считаются отдельно от технических остановок.
Baseline пока не измерен; снижение кликов и остановок не выдаём за доказанный эффект.

## 8. Component inventory

| Компонент | Обязательные состояния | Взаимодействие |
| --- | --- | --- |
| TaskComposer | empty, editing, validating, submitting, rejected | Goal, host и authority; один submit, inline errors |
| TaskSummary | partial, current, stale, unavailable | Один подтверждённый next action; переход к details |
| DecisionCard | pending, submitting, resolved, expired, stale | Scoped approve/reject с binding; обновление evidence |
| EvidenceList | absent, recorded, unreadable, outdated | Verdict, revision, источник и безопасная ссылка |
| OperationStatus | accepted, running, succeeded, failed, unknown | Reconcile после timeout; не выдавать 202 за completion |
| ToolsDisclosure | collapsed, expanded | Agents, native stage, receipts, costs; keyboard focus |
| SourceHealth | current, stale, degraded, unavailable | Видимые причина, timestamp и recovery path |

## 9. Numeric contract

Счётчик решений показывает число actionable pending decisions в выбранном проекте,
а не число всех gate issues. При partial source выводим «не менее N» и источник
неполноты; unavailable не отображается как 0. Счётчик runs считает runId, не agents.
Cost хранится числом с currency и scope, форматируется для locale; отсутствие значения
равно null, не 0. В истории сортировка по явному timestamp, UUID не хронология.
Суммы используют tabular numerals существующей шкалы; суммы разных валют не складываем.
ETA и процент готовности отсутствуют до появления обоснованной модели измерения.

## 10. Destructive actions and cost of recovery

Publish раскрывает среду, scope и последствия до одобрения; rollback не обещается,
если backend не предоставляет проверенный путь. Cancel объясняет, что будет остановлено
и что уже могло произойти. Recover раскрывает причину сбоя и возможный повтор side effects.
Ни одна из этих операций не маскируется универсальным Continue. В будущем их capability
должен содержать recovery guidance, а при отсутствии пути восстановления интерфейс
явно показывает это до действия. Не вводим blanket confirmation для просмотра,
копирования команды или обычного раскрытия деталей. Existing required gate confirmation
сохраняется. История содержит подтверждённый outcome и operationId для расследования.

## 11. Реализованный read-side адаптер

`GET /api/work` и Work/History поставляют первую полезную поверхность без нового
workflow store. Контракт текущего API описан в [BOARD-API](../BOARD-API.md).
Он использует `entries`, а не объявляет legacy issue полноценной Task: taskId=null,
goal и acceptance не выводятся из совпадения текста. Primary navigation обновлена;
одобрения по-прежнему проходят через существующий Decisions UI и runtime receipts.
Composer и ready-run resume только копируют команды; mutations C не реализованы.
Следующие целевые sections этого handoff остаются спецификацией, а не утверждением
о capabilities текущего backend.

## 12. Sidebar row pattern (2026-10-09)

Destinations, ToolsDisclosure и Fleet filters используют одну геометрию:
`--nav-row-height: 36px` на desktop/rail, `44px` на телефоне; padding `10px`,
иконка `16px`, gap `10px`, шрифт `--fs-body`. Цвета берутся из существующих
theme tokens. Work и History тоже имеют outline SVG, без текстовых исключений
в icon rail 768–1199px. В rail остаются иконки, aria-label и title; Views скрыты.

Default: `--text`, иконка `--text2`; hover: `--bg-muted`; selected/pressed:
`--bg-strong`, weight 500, иконка `--accent-text`; focus-visible: inset outline
2px `--focus-ring`. Счётчики выровнены справа и используют `--mono`,
`--fs-caption`, tabular numerals. Заголовок Views остаётся eyebrow, не control.

Различия только семантические: destination имеет `role=tab` и `aria-selected`,
Fleet filter имеет `role=button` и `aria-pressed`. Один активный destination
может содержать один выбранный filter. Tools сохраняет native details/summary
и клавиатурное раскрытие, но browser marker заменён SVG chevron в той же колонке.
Все декоративные новые SVG скрыты от screen reader. Enter/Space активируют
пункты, arrows перемещают focus между видимыми destinations, Escape закрывает
мобильный drawer. В rail видимые labels/counters скрыты; имена destinations
и Tools остаются доступны через aria-label, а полный текст возвращается на desktop.

Browser regression проверяет фактические размеры на 1440, 1000, 375px,
выбор фильтров клавиатурой, единственный selected destination и скрытие Views
вне Fleet. Этот контракт не меняет API, grants, бюджеты или pipeline gates.
