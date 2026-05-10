# Хуки

great_cto использует [хуки Claude Code](https://docs.anthropic.com/en/docs/claude-code/hooks) для автоматического обеспечения политик и захвата состояния.

> **Язык:** [English](../HOOKS.md) · **Русский** · [简体中文](../zh-CN/HOOKS.md) · [繁體中文](../zh-TW/HOOKS.md) · [日本語](../ja/HOOKS.md) · [한국어](../ko/HOOKS.md) · [Español](../es/HOOKS.md) · [Português (BR)](../pt-BR/HOOKS.md)

## Что подключено

| Событие | Matcher | Хук | Что делает |
|---|---|---|---|
| `SessionStart` | — | inline (plugin.json) | Загружает PROJECT.md, синкает агенты/команды, прогревает контекст |
| `SessionEnd` | — | `session-end.mjs` | Пишет снимок сессии в `.great_cto/logs/` |
| `PreToolUse` | `Bash` | inline | Блокирует опасный bash (rm -rf, force push, DROP TABLE и т.д.) |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | `secret-scan.mjs` | Блокирует записи с захардкоженными API-ключами |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | inline + `format-check.mjs` | Логирует записи + auto-форматирует по расширению |
| `UserPromptSubmit` | — | `user-prompt-submit.py` + `cost-guard.mjs` | Ставит title сессии + warn'ит на дорогих промптах |
| `PreCompact` | — | inline | Пишет HANDOFF.md перед компакцией контекста |
| `SubagentStart` | — | inline | Инжектит project-контекст в субагенты |
| `PermissionDenied` | — | inline | Логирует отказы для диагностики |

Источник: `.claude-plugin/plugin.json`, скрипты в `scripts/hooks/`.

## Что делает каждый хук

### `secret-scan.mjs`

Сканирует контент `Edit`, `Write` и `MultiEdit` tool-вызовов на захардкоженные секреты (AWS, Stripe, GitHub PAT, OpenAI/Anthropic, PEM-ключи, JWT и т.д.).

- **Блокирует** tool-вызов (exit 2) на high-confidence обнаружениях
- **Предупреждает** (stderr) на патернах с возможными false positive (например JWT)

**Пропускаемые пути:** `tests/`, `fixtures/`, `*.test.*`, `*.spec.*`, `.example`, `.sample`, `.template`, `EXAMPLES.md`, `CHANGELOG.md`.

**Opt-out:**
```bash
# Отключить на текущую сессию
export GREAT_CTO_DISABLE_SECRET_SCAN=1
```

Или per-file:
```typescript
// great_cto:allow-secrets
const TOK = "ghp_realToken...";  // намеренно, например туториал
```

См. **ADR-014** для полного каталога паттернов.

### `format-check.mjs`

После `Edit`/`Write`/`MultiEdit` авто-форматирует файл по расширению, если соответствующий инструмент в PATH:

| Расширения | Форматтер | Фолбэк |
|---|---|---|
| `.js .jsx .ts .tsx .mjs .cjs .json .md .yml` | `prettier` | — |
| `.py` | `ruff format` | `black` |
| `.go` | `gofmt -w` | — |
| `.rs` | `rustfmt` | — |

Ошибки логируются в `.great_cto/format.log`, никогда не блокируют.

**Opt-out:**
```bash
export GREAT_CTO_DISABLE_FORMAT=1
```

### `cost-guard.mjs`

Следит за промптами, триггерящими дорогие операции (`/start`, `/audit`, "architect this", крупные рефакторинги) и печатает оценку стоимости в stderr.

Если в `.great_cto/PROJECT.md` есть строка `cost-cap-usd-month: <N>`, а `.great_cto/cost-history.log` содержит недавние траты — также печатает оставшийся бюджет и warning, если операция превысит cap.

Информационный — никогда не блокирует.

**Opt-out:**
```bash
export GREAT_CTO_DISABLE_COST_GUARD=1
```

### `session-end.mjs`

Захватывает снимок при завершении сессии:

- Git-состояние (ветка, последний коммит, незакоммиченные файлы, коммиты за 8 часов)
- Состояние Beads (открытые / заблокированные задачи)
- Свежий cost-лог
- Phase 2 (v1.2.0) — дополнительно триггерит агент continuous-learner

Пишет в `.great_cto/logs/session-YYYY-MM-DD-HHMM-end.md`.

**Opt-out:**
```bash
export GREAT_CTO_DISABLE_SESSION_LEARNING=1
```

## Добавить свой хук

1. Создай `scripts/hooks/<your-hook>.mjs`, читающий JSON из stdin, exit 0/2.
2. Зарегистрируй в `.claude-plugin/plugin.json` под нужным событием:
   ```jsonc
   "PreToolUse": [
     {
       "matcher": "Edit|Write",
       "hooks": [
         {
           "type": "command",
           "command": "PLUGIN_DIR=$(...); node \"${PLUGIN_DIR}/scripts/hooks/your-hook.mjs\" 2>&1; exit $?",
           "timeout": 5,
           "statusMessage": "Running your-hook..."
         }
       ]
     }
   ]
   ```
3. Добавь тесты в `tests/hooks/your-hook.test.mjs`.
4. Задокументируй здесь.

### Соглашения

- Читай JSON из `stdin`. Используй `readFileSync(0, 'utf8')`.
- Exit 0 по умолчанию; exit 2 только в `PreToolUse` хуках, которые планируют блокировать.
- Логируй в `.great_cto/<hook>.log` для дебага — никогда не пиши в stdout (Claude Code интерпретирует некоторые stdout-сообщения как control-сообщения).
- User-visible сообщения — в stderr.
- Всегда оборачивай top-level логику в try/catch — упавший хук ломает каждую сессию.
- Уважай переменную окружения `GREAT_CTO_DISABLE_<NAME>=1` для per-feature opt-out.

## Отключить все хуки

Если нужно отключить всё разом (например для troubleshooting), временно деактивируй плагин:

```bash
# В Claude Code:
/plugin disable great_cto
```

Или установи master kill-switch (используется всеми хуками):

```bash
export GREAT_CTO_DISABLE_HOOKS=1
```

> Master kill-switch уважается всеми `*.mjs` хуками с v1.1.0, но не inline shell-хуками (для них нужно править `plugin.json`).

## Локальное тестирование хуков

```bash
# Все hook-тесты
node --test tests/hooks/*.test.mjs

# Один хук с handcrafted input
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x.ts","content":"AKIAIOSFODNN7EXAMPLE"}}' \
  | node scripts/hooks/secret-scan.mjs
echo "exit=$?"
# expected: exit=2 с сообщением в stderr
```

## Архитектура

См.:
- **ADR-013** — Hook execution model (почему Node.mjs вместо bash, blocking vs non-blocking)
- **ADR-014** — Secret detection patterns (что детектим, почему)
