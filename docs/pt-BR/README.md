<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Entregue produtos com o agente de código que você já tem.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code + Codex](https://img.shields.io/badge/Claude_Code_·_Codex-supported-blueviolet)](https://claude.com/claude-code)

```bash
npx great-cto init
```

[Site](https://greatcto.systems) · [Uma execução real →](https://greatcto.systems/proof) · [Demo ao vivo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

</div>

> Tradução do [README](../../README.md) em inglês na versão **v2.90.0** (2026-07-30). O número de aprovações foi atualizado para o padrão atual (três).
> Em caso de divergência, a versão em inglês é a canônica.

---

great_cto é a **camada de orquestração sobre o agente de código que você já usa**.
Um pipeline de **69 agentes especialistas** — architect, design-advisor,
senior-dev, code-reviewer, QA, security, devops — planeja, constrói, revisa e
faz o deploy de uma aplicação real: backend, frontend, testes gerados, URL no ar.

Você é interrompido exatamente duas vezes: uma sobre **o que construir**, outra
sobre **se vai ao ar**. Tudo entre esses dois pontos roda sem você.

```
   descreva um produto
        │
   🤖  spec · arquitetura · modelo de dados · telas
        ▼
   👤  checkpoint 1 — aprovar O QUE será construído
        │
   🤖  architecture · data model · screens
        ▼
   👤  checkpoint 2 — aprovar COMO será construído
        │
   🤖  scaffold → backend → frontend → testes → revisão → segurança
        ▼
   👤  checkpoint 3 — aprovar o deploy
        │
   🤖  no ar · repositório · URL ao vivo
```

<p align="center">
  <img src="../screenshots/board.png" alt="O board de build — pipeline ao vivo, gates, custo por agente" width="900" />
</p>

O board em `localhost:3141` se preenche sozinho — estado do pipeline, gates
pendentes, custo por agente, gasto de 30 dias. Você não o alimenta; só consulta.

## Números medidos

| | |
|---|---|
| Uma feature, de ponta a ponta, com rastro completo | **1h 26m · $3.40** em tokens — [os recibos](https://greatcto.systems/proof) |
| Um produto inteiro — 7 construídos no benchmark aberto | mediana **$171** em tokens · qualidade **70/100** (58–86) — [reproduza](../benchmarks/BENCH-2026-07-batch1.md) |
| Mês típico, 20 execuções do pipeline | **~$34** — você paga só o seu provedor de LLM |
| Produtos que ele sabe construir | **60**, em 15 indústrias dos EUA, por [6 pipelines reutilizáveis](https://greatcto.systems/pipelines) |

A nota de qualidade vem de executar os testes de cada produto, não de contar
arquivos — por isso ela diz 70 e não um número mais redondo e bonito.

## Início rápido

```bash
npx great-cto init            # Claude Code (padrão) · use --host codex para OpenAI Codex
```

Reinicie seu host de IA e então:

```bash
/start "construa um app de despacho e agenda para uma empresa de HVAC"
```

O pipeline assume dali. No dia a dia você toca em três coisas:

| | |
|---|---|
| `/start "…"` | descreva um produto ou feature — o pipeline executa |
| `/inbox` | o que espera por você: gates, P0, tarefas bloqueadas |
| `/digest` | métricas DORA semanais + custo por feature |

Requer Node ≥ 18.17. Os plugins companheiros (Superpowers, Beads) instalam-se
sozinhos. Depois do init, confira se o host de fato carregou o plugin:
`claude plugin list --json` não deve mostrar `errors` para `great_cto`.

## Quando ele pergunta

Um ajuste em `.great_cto/PROJECT.md` decide onde o pipeline para:

| `approval-level` | Para em | Por feature |
|---|---|---|
| `product-only` | o que construímos · se vai ao ar | 2 |
| `gates-only` *(padrão)* | o design · o deploy | 2 |
| `strict` | + revisão de código | 3 |
| `auto` | nada | 0 |

Um arquétipo regulado — fintech, saúde, governo — mantém os gates de segurança,
compliance e deploy **em todos os níveis, inclusive `auto`**. Um nível mais leve
delega o julgamento; nunca pula o compliance. Tabela completa:
[docs/GATES.md](../GATES.md).

## O que o torna diferente

- **Especialistas, não um generalista** — 69 agentes com funções estreitas e
  seus próprios gates de revisão, em vez de um assistente que digita mais rápido
  do que pensa. [O elenco →](../reference/agents.md)
- **Críticos antes do código** — críticos de arquitetura, spec e schema rodam
  antes do planejamento, quando um erro ainda custa horas e não dias.
- **Escopo imposto na escrita** — um agente fisicamente não consegue tocar
  arquivos fora do seu encargo. Não é sinalizado na revisão; é recusado na
  escrita.
- **Um QA que desconfia de si mesmo** — os caminhos críticos são escritos em
  Gherkin antes do código de teste, e o mutation testing pergunta se a suíte
  pegaria alguma coisa.
- **Memória entre sessões** — decisões, lições e padrões promovidos persistem
  por projeto e globalmente; uma execução interrompida retoma sabendo quais
  etapas já rodaram.
- **Custo visível** — gasto por agente, desvio estimado-contra-real e custo por
  mudança aceita, no board e não numa planilha.

Tudo roda localmente, licença MIT, com as suas chaves. Seu código fica na sua
máquina; os prompts vão para o seu provedor de LLM e para nenhum outro lugar. A
telemetria vem **desligada por padrão** ([docs/PRIVACY.md](../PRIVACY.md)).

## Limitações

- **Para um construtor só** — fundador solo ou CTO. Dois ou mais engenheiros
  compartilhando o pipeline já o superaram.
- **Não é CI/CD** — os gates rodam localmente; o merge continua pelo GitHub
  Actions.
- **Não é auditoria de certificação** — os scaffolds PCI/HIPAA/SOC2 são pontos
  de partida, não certificações.
- **Não é determinístico** — saída de LLM. Vereditos de gate merecem conferência
  humana.

## Documentação

**[Hub de documentação →](../README.md)** ·
[Primeiros passos](../tutorials/getting-started.md) ·
[Gates e níveis de aprovação](../GATES.md) ·
[Agentes](../reference/agents.md) · [Comandos](../reference/commands.md) ·
[Arquétipos](../ARCHETYPES.md) · [Arquitetura](../ARCHITECTURE.md) ·
[MCP](../MCP.md) · [FAQ](../FAQ.md) ·
[Todo o resto](../DETAILS.md) — críticos, jurisdições, custos, CI, alertas

## Comunidade

[Issues](https://github.com/avelikiy/great_cto/issues) ·
[Discussions](https://github.com/avelikiy/great_cto/discussions) ·
[Blog](https://greatcto.systems/blog/) ·
[Política de segurança](../../SECURITY.md) · [Contribuir](../../CONTRIBUTING.md)

MIT — [LICENSE](../../LICENSE). Feito por [@avelikiy](https://github.com/avelikiy):
CTO construindo plataformas de trading e fintech AI-native; great_cto são os
meus próprios loops, automatizados um agente por vez.

Se ele economizou seu tempo, uma estrela ajuda outros construtores solo a
encontrá-lo.

<div align="center">

*Pare de ser a única pessoa capaz de colocar no ar.*

</div>
