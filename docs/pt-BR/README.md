<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Execute fluxos de desenvolvimento. Confira as evidências. Decida o que publicar.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<img src="../screenshots/board.png" alt="Projeto de exemplo com dados sintéticos, não um benchmark de modelos em produção." width="900" />

*Projeto de exemplo com dados sintéticos, não um benchmark de modelos em produção. 3.70.1.*

```bash
npx great-cto init
```

[Site](https://greatcto.systems) · [Uma execução real →](https://greatcto.systems/proof) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> Tradução do [README](../../README.md) em inglês, versão **v3.70.1** (2026-10-25).
> Em caso de divergência, vale a versão em inglês.

---

great_cto coordena fluxos nativos do Claude Code e execuções controladas experimentais do Codex com etapas, revisões e gates explícitos. O painel local conecta tarefas, execução registrada, documentos e consumo. O catálogo público tem **72** agentes; a presença no catálogo não prova execução nem especialização. Evidência ausente continua desconhecida. Merge, release e deploy precisam de evidências e autorizações próprias. Você paga seu provedor; great_cto usa MIT e não cobra.

**Limite da distribuição verificada (ADR-045):** os artefatos assinados são validados antes de qualquer ativação. A autoatualização de uma instalação npm global convencional só é suportada com um verificador autenticado de forma independente e configurado separadamente, além do conjunto completo de artefatos assinados da versão. O pacote local admitido é instalado offline, com os scripts de ciclo de vida desabilitados; um checkout do código ou uma sessão de plugin existente não comprova uma atualização verificada.

Atualmente, `init`, a atualização nativa de plugins e a instalação automática de componentes adicionais recusam a ativação. A adaptação do Codex por `adapt` gera apenas comentários: não baixa arquivos nem ativa hooks ou uma rota de execução MCP. Também não há suporte para habilitar o temporizador de atualização do macOS. Os temporizadores existentes continuam executando o cache anterior até que uma migração explicitamente autorizada os altere.

Os exemplos de instalação, plugins e temporizadores abaixo descrevem **LEGACY 3.70.1**. Eles não prometem uma rota de ativação disponível atualmente. Consulte as [atualizações verificadas](../reference/verified-updates.md).

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

## Um projeto, cinco visões

Execute `great-cto board` para abrir o painel local, normalmente em `localhost:3141`.

| Visão | O que você pode inspecionar |
|---|---|
| **Work** | Tarefas, critérios de aceitação, próxima ação suportada e abas Overview, Execution e Evidence |
| **Decisions** | Decisões pendentes e controles dos gates existentes, sem ampliar sua autoridade |
| **Knowledge** | Markdown do projeto, ADRs e visualizador limitado de diagramas com alternativa do código Mermaid, somente leitura |
| **Insights** | Resultados registrados, tokens por projeto, estimativas e orçamentos separados |
| **Settings** | Executors, Runtime, Capabilities e General |

`unverifiable`, `unmeasured` e `unavailable` não significam aprovação de uma verificação.

Execution mostra grafos causais registrados pelo controlador; sessões nativas e antigas continuam parciais ou indisponíveis. Ligações ausentes não são inventadas. O exemplo usa respostas offline simuladas, não modelos ao vivo. Diagramas descrevem a arquitetura declarada. Tokens e custos não medem qualidade. Documentos mantêm seu idioma; a interface é em inglês.

<details>
<summary>Ver execução, evidências, documentos e resultados</summary>

![Execution: Projeto de exemplo com dados sintéticos, não um benchmark de modelos em produção.](../screenshots/execution.png)

![Evidence: Projeto de exemplo com dados sintéticos, não um benchmark de modelos em produção.](../screenshots/evidence.png)

![Knowledge: Projeto de exemplo com dados sintéticos, não um benchmark de modelos em produção.](../screenshots/knowledge.png)

![Insights: Projeto de exemplo com dados sintéticos, não um benchmark de modelos em produção.](../screenshots/insights.png)

[Contrato das capturas](../reference/public-showcase.md).

</details>

## Oito papéis centrais, especialistas conforme a tarefa

| Responsabilidade | Papel |
|---|---|
| Problema e aceitação | `product-owner` |
| Projeto do sistema e escolhas | `architect` |
| Plano e dependências | `pm` |
| Implementação | `senior-dev` |
| Revisão independente de código | `code-reviewer` |
| Verificação e regressões | `qa-engineer` |
| Riscos e gate de publicação | `security-officer` |
| Deploy autorizado | `devops` |

São contratos de responsabilidade, não oito chamadas obrigatórias ao modelo nem oito agentes simultâneos. Project focus é uma visão de apresentação: não remove especialistas, não altera o despacho e não dispensa verificações obrigatórias. Os revisores específicos de cada risco continuam sujeitos à política do projeto.

## Contexto de engenharia focado

Cinco candidatos a domain packs, versionados e ativados explicitamente, cobrem quatro áreas:

| Área | Invariantes de engenharia | Limite |
|---|---|---|
| **Dinheiro e execução cripto** | Idempotência de pagamentos, envios com resultado incerto, autoridade limitada; limites de assinatura, separação paper/live e finalidade da cadeia | Dois packs técnicos; sem afirmação de desempenho de investimentos |
| **Fluxos de telemedicina** | Autoridade do profissional clínico, transições de estado de prescrições e integridade das evidências | Sem afirmação de eficácia clínica ou certificação |
| **Evidências de venture** | Proveniência de afirmações, linhagem de entidades e quarentena de alegações não verificadas | Sem afirmação sobre resultados de investimentos |
| **Segurança do bem-estar mental** | Isolamento do estado de cada pessoa, prioridade do escalonamento em crises e limites das afirmações clínicas | Separada de diagnóstico, tratamento e validação clínica |

Os packs acrescentam contexto de engenharia. Não ampliam permissões nem alteram o roteamento dos revisores obrigatórios. Sua presença não prova execução, expertise ou resultados melhores. Não foi estabelecido ganho de qualidade em ensaios comparáveis do núcleo isolado versus núcleo com pack. Overlays privados de projetos não fazem parte da apresentação pública.

## No OpenAI Codex

| Modo | Execução e autoridade |
|---|---|
| Claude Code native | Comandos, papéis especializados e hooks nativos; decisões ficam no host correspondente |
| Controlled Codex / mixed-host (experimental) | O controlador gerencia roteamento, propostas de texto, verificador e gates explícitos |
| Codex plugin session | Skills, MCP e hooks de segurança; instalar não inicia automaticamente a pipeline controlada |

`npx great-cto init --host codex` dá ao Codex os skills, o servidor MCP e seis hooks
de segurança (aprove-os uma vez: rode `codex` em um terminal e escolha
**Trust all and continue**). O Codex não tem superfície nativa de plugins para
comandos slash nem agentes de papel, então o pipeline roda pela CLI:

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

A atualização é explícita por padrão (`great-cto upgrade codex`). No macOS, `sh scripts/codex-auto-update.sh enable` ativa um temporizador opcional de usuário a cada seis horas; `status` consulta o estado e `disable` o remove. Cada execução valida a origem Git. O temporizador segue a referência Git configurada, não as versões npm; hooks alterados ainda precisam da aprovação do host em uma nova sessão. Detalhes e execuções mistas:
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
| Um produto inteiro — 7 construídos no benchmark aberto | mediana **$171** · **70/100**, **2026-07-10** — [reproduza](../benchmarks/BENCH-2026-07-batch1.md) |

São observações históricas, não um benchmark da pipeline atual com dois hosts nem dos domain packs. Não há percentual comprovado de melhoria da qualidade. Domain packs continuam opt-in; sua presença não prova especialização nem resultados melhores.

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
