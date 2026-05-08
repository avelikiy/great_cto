# Hooks

> **Idioma:** [English](../HOOKS.md) · [Русский](../ru/HOOKS.md) · [简体中文](../zh-CN/HOOKS.md) · [繁體中文](../zh-TW/HOOKS.md) · [日本語](../ja/HOOKS.md) · [한국어](../ko/HOOKS.md) · [Español](../es/HOOKS.md) · **Português (BR)**
>
> ⚠️ Resumo traduzido por máquina. Para detalhes completos e links de ADR, ver [English original](../HOOKS.md).

great_cto usa [hooks do Claude Code](https://docs.anthropic.com/en/docs/claude-code/hooks) para aplicar políticas e capturar estado automaticamente.

## Hooks conectados

| Evento | Matcher | Hook | O que faz |
|---|---|---|---|
| `SessionStart` | — | inline | Carrega PROJECT.md, sincroniza agents/commands |
| `SessionEnd` | — | `session-end.mjs` | Escreve snapshot de sessão em `.great_cto/logs/` |
| `PreToolUse` | `Bash` | inline | Bloqueia bash perigoso (rm -rf, force push, DROP TABLE) |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | `secret-scan.mjs` | Bloqueia writes com API keys hardcoded |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | `format-check.mjs` | Auto-formata por extensão |
| `UserPromptSubmit` | — | `cost-guard.mjs` | Avisa antes de prompts caros |
| `PreCompact` | — | inline | Salva HANDOFF.md antes de compactar contexto |
| `SubagentStart` | — | inline | Injeta contexto do projeto em sub-agentes |
| `PermissionDenied` | — | inline | Loga negações para diagnóstico |

## Hooks principais

### `secret-scan.mjs`
Detecta chaves AWS / Stripe / GitHub PAT / OpenAI / Anthropic / PEM / JWT. Se detecta, **bloqueia** a chamada do tool (exit 2).
- Paths ignorados: `tests/`, `fixtures/`, `*.test.*`, `.example`, etc.
- Opt-out: `export GREAT_CTO_DISABLE_SECRET_SCAN=1` ou comentário `// great_cto:allow-secrets` no arquivo

### `format-check.mjs`
Auto-formata com prettier (JS/TS/MD/YAML/JSON), ruff/black (Python), gofmt (Go), rustfmt (Rust). Falhas não bloqueiam.
- Opt-out: `export GREAT_CTO_DISABLE_FORMAT=1`

### `cost-guard.mjs`
Imprime estimativa de custo no stderr quando um prompt dispara operação cara (`/start`, `/audit`, refactor grande). Lê `cost-cap-usd-month` do `PROJECT.md` e `cost-history.log`. Apenas informativo — não bloqueia.
- Opt-out: `export GREAT_CTO_DISABLE_COST_GUARD=1`

### `session-end.mjs`
Captura snapshot ao terminar sessão: estado git, tarefas Beads, log recente de custo. Phase 2 (v1.2.0) também dispara o agente continuous-learner.
- Opt-out: `export GREAT_CTO_DISABLE_SESSION_LEARNING=1`

## Desativar tudo

```bash
# Dentro do Claude Code:
/plugin disable great_cto

# Ou master switch (respeitado por todos os hooks .mjs):
export GREAT_CTO_DISABLE_HOOKS=1
```

## Testing

```bash
node --test tests/hooks/*.test.mjs

# Testar um hook individual:
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x.ts","content":"..."}}' \
  | node scripts/hooks/secret-scan.mjs
```

## Arquitetura

- **ADR-013** — modelo de execução de hooks
- **ADR-014** — padrões de detecção de secrets

Documentação completa (adicionar hooks customizados, convenções, testing avançado) em [English HOOKS.md](../HOOKS.md).
