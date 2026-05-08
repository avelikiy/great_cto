# Continuous Learning

> **Язык:** [English](../LEARNING.md) · **Русский** · [简体中文](../zh-CN/LEARNING.md) · [日本語](../ja/LEARNING.md) · [한국어](../ko/LEARNING.md) · [Español](../es/LEARNING.md)

great_cto v1.2.0 добавил **двухуровневый цикл обучения**, который автоматически извлекает паттерны из каждой сессии и переиспользует их в будущих.

## Pipeline

```
Сессия завершается
   ↓
SessionEnd hook делает снимок + регистрирует проект
   ↓
Агент continuous-learner читает transcript + git + verdicts
   ↓
Извлекает ≤3 уроков на сессию → .great_cto/lessons.md      (PROJECT-LOCAL)
   ↓
lessons-merge.mjs: паттерн в ≥3 проектах → ~/.great_cto/decisions.md  (CROSS-PROJECT)
   ↓
Следующая сессия
   ↓
architect, pm, senior-dev читают оба файла при старте
   ↓
Применяют выученные паттерны по умолчанию; цитируют в коммитах
```

## Двухуровневая память

| Файл | Скоуп | Критерии promotion | Кто читает |
|---|---|---|---|
| `.great_cto/lessons.md` | Project-local | Quality gates в continuous-learner | architect, pm, senior-dev |
| `~/.great_cto/decisions.md` | Все проекты на машине | Паттерн в ≥3 разных проектах | architect, pm, senior-dev |

## Что захватывается

Пять форм паттернов, каждая со строгими quality gates:

| Форма | Сигнал | Пример |
|---|---|---|
| **A. Reviewer что-то поймал** | Critical/High находка в agent-verdicts | "PCI-reviewer поймал отсутствующую webhook-подпись в 3 fintech-проектах → всегда проверяй до review-фазы" |
| **B. Cost outlier** | Запуск агента 2x+ выше его среднего | "Architect стоит 3x больше на `fintech` с `team-size: solo` — pre-allocate $8 вместо $3" |
| **C. Повторённая ошибка** | Тот же fix в ≥2 коммитах | "Рефакторили `useEffect` cleanup в 3 компонентах — анти-паттерн: missing cleanup; паттерн: AbortController" |
| **D. Discovery missed** | Архитектурное assumption переопределили в ходе imp'a | "Ассюмили US-only; реально EU-required → задавай вопрос про geo для archetype=fintech upfront" |
| **E. Tool/library decision** | ADR с измеримым outcome | "Drizzle вместо Prisma для `mlops`/`data-engineering` — 40% bundle-сокращение, equal DX" |

continuous-learner **отбраковывает** всё, что не подходит ни под одну из этих форм — silence > noise.

## Quality gates

Кандидат-урок **отбраковывается**, если хоть одно из:

- Применим только к одному файлу одного проекта (слишком узко)
- Захватывает user preference, не transferable паттерн
- Повторяет очевидную best practice
- Нет конкретных evidence (sha, file:line, cost-число)
- Содержит PII, секреты или business-confidential термины
- Pattern slug уже в lessons.md (де-дуп)
- Субъективен, без измеримого outcome

## Приватность

**Default-local, opt-in-global.** Learner работает на твоей машине; lessons.md и decisions.md никогда не покидают диск.

Что learner НЕ ДОЛЖЕН захватывать (enforced через agent prompt):
- API-ключи, токены, пароли, JWT
- Email-ы, телефоны, имена
- Внутренние codenames, business-confidential термины
- Customer/user IDs или данные `.env*`
- Содержимое исходников (только file:line ссылки)

См. **ADR-016** для полных privacy-правил.

## Конфигурация

### Opt-out

```bash
# Отключить session-end захват полностью
export GREAT_CTO_DISABLE_SESSION_LEARNING=1
```

### Manual trigger

```
/learn                  # извлечь уроки из текущей сессии
/learn cost             # focus на cost-outlier паттернах (shape B)
/learn security         # focus на reviewer-catch паттернах (shape A)
/learn architecture     # focus на tool/library решениях (shape E)
```

### Inspect state

```bash
# Какие уроки в этом проекте?
cat .great_cto/lessons.md

# Какие паттерны промоушнулись глобально?
cat ~/.great_cto/decisions.md

# Какие проекты зарегистрированы для cross-project aggregation?
ls ~/.great_cto/projects/

# Force re-aggregation
node scripts/lessons-merge.mjs

# Preview без записи
node scripts/lessons-merge.mjs --dry-run

# Re-promote даже если уже в decisions.md
node scripts/lessons-merge.mjs --force
```

### Reset

```bash
# Очистить project-local уроки (будут переучены)
rm .great_cto/lessons.md

# Очистить всю cross-project память (drastic)
rm -rf ~/.great_cto/{decisions.md,projects/}

# Убрать один проект из cross-project агрегации
rm -rf ~/.great_cto/projects/<slug>/
node scripts/lessons-merge.mjs --force   # rebuild без него
```

## Как агенты используют уроки

Три агента читают lessons.md + decisions.md при старте сессии:

### Architect

```
До любого архитектурного решения — консультируй past lessons.
Фильтруй decisions.md по текущему archetype.
Применяй high-confidence cross-project паттерны по умолчанию.
Цитируй уроки в ARCH-doc, когда следуешь или переопределяешь.
```

### PM

```
До estimation — калибруй против cost-outlier уроков (shape B).
Применяй lesson-aware дельты к cost-модели.
Цитируй урок в planning-doc.
```

### Senior-dev

```
До claim'а задачи — сканируй уроки на known анти-паттерны.
Если урок применим напрямую, упомяни в коммите:
  "Implements <task>; applied pattern <slug> (lesson 2026-05-08)"
```

## Roadmap

| Версия | Возможность |
|---|---|
| **v1.2.0** | continuous-learner + lessons-merge + agent integration |
| **v1.3.0** | Telemetry: трекать, какие уроки агенты цитируют vs игнорируют |
| **v1.4.0** | Auto-promotion: high-impact decisions → reusable skills (`~/.great_cto/global-skills/`) |

См. **ADR-017** для критериев skill-promotion.

## Reference

- **ADR-015** — архитектура цикла обучения (почему два уровня, почему threshold=3, почему Haiku)
- **ADR-016** — privacy guardrails (что мы никогда не захватываем)
- **ADR-017** — критерии promotion в skill (что становится skill'ом в v1.4.0)
- **`agents/continuous-learner.md`** — сам агент
- **`scripts/lessons-merge.mjs`** — скрипт cross-project promotion
- **`commands/learn.md`** — manual trigger
