# Hooks

> **Idioma:** [English](../HOOKS.md) · [Русский](../ru/HOOKS.md) · [简体中文](../zh-CN/HOOKS.md) · [日本語](../ja/HOOKS.md) · [한국어](../ko/HOOKS.md) · **Español**
>
> ⚠️ Resumen traducido por máquina. Para detalles completos y enlaces a ADRs, ver [English original](../HOOKS.md).

great_cto usa [hooks de Claude Code](https://docs.anthropic.com/en/docs/claude-code/hooks) para aplicar políticas y capturar estado automáticamente.

## Hooks conectados

| Evento | Matcher | Hook | Qué hace |
|---|---|---|---|
| `SessionStart` | — | inline | Carga PROJECT.md, sincroniza agents/commands |
| `SessionEnd` | — | `session-end.mjs` | Escribe snapshot de sesión a `.great_cto/logs/` |
| `PreToolUse` | `Bash` | inline | Bloquea bash peligroso (rm -rf, force push, DROP TABLE) |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | `secret-scan.mjs` | Bloquea writes con API keys hardcodeadas |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | `format-check.mjs` | Auto-formato por extensión |
| `UserPromptSubmit` | — | `cost-guard.mjs` | Advierte antes de prompts costosos |
| `PreCompact` | — | inline | Guarda HANDOFF.md antes de compactar contexto |
| `SubagentStart` | — | inline | Inyecta contexto del proyecto a sub-agentes |
| `PermissionDenied` | — | inline | Registra denegaciones para diagnóstico |

## Hooks clave

### `secret-scan.mjs`
Detecta claves AWS / Stripe / GitHub PAT / OpenAI / Anthropic / PEM / JWT. Si detecta, **bloquea** la llamada al tool (exit 2).
- Rutas omitidas: `tests/`, `fixtures/`, `*.test.*`, `.example`, etc.
- Opt-out: `export GREAT_CTO_DISABLE_SECRET_SCAN=1` o agregar `// great_cto:allow-secrets` en el archivo

### `format-check.mjs`
Auto-formatea con prettier (JS/TS/MD/YAML/JSON), ruff/black (Python), gofmt (Go), rustfmt (Rust). Fallos no bloquean.
- Opt-out: `export GREAT_CTO_DISABLE_FORMAT=1`

### `cost-guard.mjs`
Imprime estimación de costo a stderr cuando un prompt dispara operación costosa (`/start`, `/audit`, refactor grande). Lee `cost-cap-usd-month` de `PROJECT.md` y `cost-history.log`. Solo informativo — no bloquea.
- Opt-out: `export GREAT_CTO_DISABLE_COST_GUARD=1`

### `session-end.mjs`
Captura snapshot al terminar sesión: estado git, tareas Beads, log de costo reciente. Phase 2 (v1.2.0) además dispara el agente continuous-learner.
- Opt-out: `export GREAT_CTO_DISABLE_SESSION_LEARNING=1`

## Desactivar todo

```bash
# Dentro de Claude Code:
/plugin disable great_cto

# O master switch (respetado por todos los hooks .mjs):
export GREAT_CTO_DISABLE_HOOKS=1
```

## Testing

```bash
node --test tests/hooks/*.test.mjs

# Probar un hook individual:
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x.ts","content":"..."}}' \
  | node scripts/hooks/secret-scan.mjs
```

## Arquitectura

- **ADR-013** — modelo de ejecución de hooks
- **ADR-014** — patrones de detección de secretos

Documentación completa (agregar hooks personalizados, convenciones, testing avanzado) en [English HOOKS.md](../HOOKS.md).
