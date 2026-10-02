<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Entregue produtos com o agente de código que você já tem.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<a href="https://greatcto.systems/proof"><img src="https://greatcto.systems/assets/one-real-run.gif" alt="One real run, end to end: prompt, architect, human gate, parallel implementers, a reviewer's PARTIAL and the fix, 47 passing assertions, the ship gate, the merged PR — 1h 26m, $3.40" width="720" /></a>

```bash
npx great-cto init
```

[Site](https://greatcto.systems) · [Uma execução real →](https://greatcto.systems/proof) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> Tradução do [README](../../README.md) em inglês, versão **v3.48.0** (2026-10-02).
> Em caso de divergência, vale a versão em inglês.

---

**Seu agente de código entrega código. Isto é o que o verifica.**

Descreva um produto ou uma funcionalidade. **71 agentes** com tarefas específicas o
levam por brief, arquitetura, construção, revisão e segurança; um segundo modelo de
outra família lê o mesmo diff. Três decisões continuam suas — o que é construído, como
e se vai para produção — e o resultado é um **repositório seu** e uma **URL que
funciona**. Você paga seu próprio provedor de LLM; great_cto é MIT e não cobra nada.

## Início rápido

```bash
npx great-cto init
```

Reinicie o Claude Code. No dia a dia são três coisas:

| | No Claude Code | No terminal |
|---|---|---|
| **Começar o trabalho** | `/start "add Google login"` | `great-cto run "add Google login"` |
| **O que espera por você** | `/inbox` | `great-cto status` |
| **Continuar** | `/resume` | `great-cto resume` |

`/start` aceita um produto novo ou uma tarefa em um projeto existente e escolhe o
fluxo sozinho. `/resume` continua só o que você já aprovou; uma decisão pendente
continua esperando você. Todo o resto — `/review`, `/spec`, `/save`, `/digest` e o
que mais houver — está lá quando você precisar: [todos os comandos](../COMMANDS.md).

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto board" width="900" />
</p>

O painel em `localhost:3141` abre em **Work** — suas tarefas, as decisões que
esperam por você e o que já foi entregue. Custos, agentes e revisores ficam em
**Tools**. Nada ali mostra uma ausência como sucesso: uma verificação que não
conseguiu decidir aparece como `unverifiable`, um custo que ninguém mediu como
`unmeasured`, um revisor que não conseguiu rodar como `unavailable`.

## No OpenAI Codex

`npx great-cto init --host codex` dá ao Codex os skills, o servidor MCP e seis hooks
de segurança (aprove-os uma vez: rode `codex` em um terminal e escolha
**Trust all and continue**). O Codex não tem superfície nativa de plugins para
comandos slash nem agentes de papel, então o pipeline roda pela CLI:

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

O Codex nunca atualiza o plugin sozinho — quem faz isso é `great-cto upgrade`.
Detalhes, execuções mistas Claude + Codex e o Codex como segundo revisor:
[guia do host Codex](../HOST-CODEX.md).

## Quando ele te para

Uma linha em `.great_cto/PROJECT.md`:

| `approval-level` | Para você em | Paradas |
|---|---|---|
| **`ship-only`** | **o deploy — e te passa um brief do que será construído** | **1** |
| `product-only` | o que construímos · se vai para produção | 2 |
| `gates-only` *(padrão)* | o que construímos · o design · o deploy | 3 |
| `strict` | o design · a revisão de código · o deploy | 3 |
| `auto` | nada no pipeline | 0 |

Produtos regulados — fintech, saúde, governo — mantêm seus gates de segurança,
conformidade e entrega em todos os níveis. [Como os gates funcionam](../GATES.md).

## Números, medidos

| | |
|---|---|
| Uma funcionalidade de ponta a ponta, totalmente rastreada | **1h 26m · $3.40** — [os recibos](https://greatcto.systems/proof) |
| Um produto inteiro — 7 construídos no benchmark aberto | **$171** · **70/100**, **2026-07-10** — [reproduza](../benchmarks/BENCH-2026-07-batch1.md) |
| Mês típico, 20 execuções | **~$34** — você paga seu próprio provedor de LLM, nada mais |

## Limitações

Para uma pessoa, não para uma equipe; não é um construtor de apps hospedado —
precisa do seu agente de código; não é um sistema de CI/CD; os modelos de
conformidade são ponto de partida, não certificações; a saída de um LLM não é
determinística. A versão honesta de cada item e o que ele se recusa a afirmar:
[docs/DETAILS.md](../DETAILS.md).

## Saiba mais

[Documentação](../README.md) · [Primeiros passos](../tutorials/getting-started.md) ·
[Comandos](../COMMANDS.md) · [Gates](../GATES.md) · [Agentes](../reference/agents.md) ·
[FAQ](../FAQ.md) · [Todo o resto](../DETAILS.md) ·
[Issues](https://github.com/avelikiy/great_cto/issues) · [Segurança](../../SECURITY.md) ·
[Contribuir](../../CONTRIBUTING.md) · [Privacidade — telemetria desligada por padrão](../PRIVACY.md)

MIT — [LICENSE](../../LICENSE). Criado por [@avelikiy](https://github.com/avelikiy).
Se ele te poupou tempo, uma estrela ajuda outros desenvolvedores solo a encontrá-lo.
