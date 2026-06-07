<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Autopilots de IA para negócios — entregue o trabalho pronto, não apenas o software.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-$2.39_vs_$5460_human-darkgreen)](https://greatcto.systems/proof)

<img src="../screenshots/pipeline.svg" alt="great_cto pipeline: Flow Compiler → gate:plan → 61 agents → gate:ship → Deployed" width="900" />

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [Um caso real →](https://greatcto.systems/proof) · [Demo ao vivo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## Serviços são o novo software

A próxima onda não são ferramentas para especialistas — são **autopilots que vendem o resultado de um serviço**.
Um autopilot executa uma função de negócio inteira de ponta a ponta (entrada → processamento → decisão → entrega) e
escala apenas as decisões de julgamento para um humano qualificado. Cada melhoria do modelo torna o serviço
mais rápido e mais barato.

A GreatCTO entrega esses autopilots — cada um deles um **fluxo de agentes + ferramentas com um humano nas
etapas de risco**, um revisor de conformidade embutido e **conectores ao vivo** que executam cada fluxo com dados reais.

## Os autopilots

| Autopilot | O que faz | Mercado | Quem está construindo |
|---|---|---|---|
| 🩺 **[Codificação-médica](https://greatcto.systems/autopilots/rcm.html)** | Notas clínicas → faturas limpas e em conformidade; um codificador certificado assina as de risco | $50–80B | Anterior · CodaMetrix · Fathom |
| 🖥️ **[TI-gerenciada](https://greatcto.systems/autopilots/msp.html)** | Patches, configs e acessos em toda a frota — escalonados, reversíveis, humano nas grandes mudanças | $100B+ | Serval · Edra · Electric AI |
| ⚖️ **[Documentos-jurídicos](https://greatcto.systems/autopilots/legaltech.html)** | Redige e revisa contratos e NDAs; um advogado licenciado assina qualquer coisa que seja aconselhamento | $20–25B | Crosby · Harvey · Robin AI |
| 📒 **[Contabilidade & fechamento](https://greatcto.systems/autopilots/accounting.html)** | Lança, concilia e fecha o mês; um controller assina o fechamento | $50–80B | Rillet · Basis · Digits |
| 🧾 **[Preparação-fiscal](https://greatcto.systems/autopilots/tax.html)** | Prepara declarações e classifica posições; um preparador credenciado assina antes do envio | $30–35B | Black Ore · April · Column Tax |
| 🛒 **[Compra-a-pagamento](https://greatcto.systems/autopilots/procurement.html)** | Integra fornecedores, concilia faturas, libera pagamentos — triados contra sanções e fraude | $200B+ | Tacto · Zip · AskLio |

→ [Todos os autopilots](https://greatcto.systems/autopilots.html) · execute `/flow <vertical>` para ver qualquer fluxo no seu terminal

**Cada autopilot mantém um humano nas decisões de julgamento** — um codificador certificado, um advogado licenciado, um
controller, um preparador credenciado. O autopilot faz o volume; o humano assume a decisão que
carrega a responsabilidade. **9 conectores ao vivo rodam em todos os seis autopilots** — FHIR, ICD-10 (NLM),
NCCI/MUE, X12 837P, DocuSign, Plaid, OFAC, rollout escalonado e um motor de impostos federais dos EUA. Eles são
keyless por padrão (fonte pública ou geração real determinística) e fazem POST para o provedor real
no momento em que você adiciona credenciais.

## Por baixo dos panos (para o CTO que opera)

Cada autopilot é construído e operado por um pipeline com gates de agentes especialistas — arquiteto, revisor de
12 ângulos, QA, oficial de segurança, devops — ajustados à sua stack e jurisdição. **Você toma duas
decisões por feature; todo o resto roda automaticamente.** O revisor de conformidade, os gates humanos
assinados, a trilha de auditoria e os conectores ao vivo são a camada de confiança que torna seguro deixar o autopilot
rodar.

## Em números

| | |
|---|---|
| Custo de LLM (uma feature real, rastreada) | **$2.39** |
| Equivalente humano para o mesmo trabalho | **~$5.460** |
| Defeitos pegos que o QA havia perdido | **2** |
| Custo mensal (20 execuções de pipeline) | **~$34** |
| Agentes especialistas | **61** |
| Arquétipos detectados automaticamente | **26** |
| Jurisdições | **12** (GDPR · HIPAA · PCI-DSS · SOX · e mais) |

→ [Trace completo com todos os artefatos](https://greatcto.systems/proof)

## Como funciona

**`npx great-cto init`** — escaneia sua stack e README, detecta a jurisdição (GDPR? HIPAA? PCI?), escreve `.great_cto/FLOW.md` com os agentes, gates e frameworks de conformidade exatos para o seu projeto.

**`/start "descreva a feature"`** — críticos revisam a arquitetura e a especificação antes de qualquer código ser escrito. Você revisa o plano no `gate:plan`.

**Os agentes rodam automaticamente** — o senior-dev implementa com TDD, revisão de 12 ângulos, QA, segurança, devops. Você aprova o envio no `gate:ship`.

## Três projetos — três pipelines diferentes

O mesmo comando. A saída depende do que você está construindo e de onde ele roda:

| | **Startup fintech · UE** | **Portal de saúde · EUA** | **Ferramenta CLI** |
|---|---|---|---|
| Agentes especialistas | `pci-reviewer` · `gdpr-reviewer` · `regulated-reviewer` | `fda-reviewer` · `healthcare-reviewer` · `security-officer` | `cli-reviewer` |
| Gates humanos | `gate:gdpr-dpia` · `gate:plan` · `gate:ship` | `gate:clinical-validation` · `gate:plan` · `gate:ship` | `gate:plan` |
| Conformidade | GDPR · PCI-DSS · SOX | HIPAA · HITECH | — |
| Custo / ciclo | ~$8–18 | ~$8–18 | ~$0.5–3 |

→ Experimente o seletor interativo: [greatcto.systems/#flow-picker](https://greatcto.systems/#flow-picker)

## O dashboard que você vai realmente checar

`great-cto board` abre em `http://localhost:3141` — Kanban com SSE em tempo real, tile de custo por agente, status do pipeline, gasto de LLM em 30 dias vs. baseline equivalente humano.

<p align="center">
  <img src="../screenshots/board.png" alt="Kanban board with realtime SSE updates" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="docs/screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — cost, velocity, savings_x" width="100%" /></a><br/><sub><b>Métricas</b> — custo de LLM, baseline equivalente humano, razão savings_x</sub></td>
<td width="50%"><a href="docs/screenshots/inbox.png"><img src="../screenshots/inbox.png" alt="Inbox — gates, P0, blocked, stale" width="100%" /></a><br/><sub><b>Inbox</b> — gates pendentes, incidentes P0, tarefas bloqueadas, em andamento parado</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/screenshots/agents.png"><img src="../screenshots/agents.png" alt="Agent fleet — 61 specialists with run counts" width="100%" /></a><br/><sub><b>Agentes</b> — 61 especialistas com último uso + contagem de execuções</sub></td>
<td width="50%"><a href="docs/screenshots/memory.png"><img src="../screenshots/memory.png" alt="Memory layers and crystallized patterns" width="100%" /></a><br/><sub><b>Memória</b> — 11 camadas + padrões de incidentes cristalizados</sub></td>
</tr>
</table>

**Feito para a organização de engenharia de uma pessoa só.** Indie hackers, fundadores solo, CTOs técnicos que tocam tudo sozinhos — no Claude Code ou no OpenAI Codex. *Não é para times* — veja o [FAQ](../FAQ.md#is-great_cto-for-teams).

## Instalação

```bash
npx great-cto init
```

Reinicie seu host de IA após o init. **Requer:** Node 18.17+ e um de:

| Host | Flag de instalação | Status |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | _(padrão)_ | ✅ suporte completo |
| [OpenAI Codex](https://openai.com/codex) | `--host codex` | ✅ hooks + MCP + agents |

```bash
# Claude Code (padrão)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

Os plugins companheiros Superpowers e Beads se instalam automaticamente — sem configuração manual necessária.

---

<details>
<summary>📖 Documentação completa — dois gates · críticos · 61 agentes · 26 arquétipos · 12 jurisdições · 45+ frameworks de conformidade · board · custo · MCP</summary>

## Duas decisões por feature

```
🟡 gate:plan   ←  você decide aqui (arquitetura + tarefas + custo)
   ↓
🤖 senior-dev → revisão de 12 ângulos → qa-engineer → security-officer → devops
   ↓
🟢 gate:ship   ←  você decide aqui (PR pronto, segurança aprovada)
```

Arquitetos, planejadores, revisores, QA, segurança e DevOps rodam automaticamente entre esses dois checkpoints humanos. **A memória persiste** entre sessões: cada veredito de gate é anexado a `~/.great_cto/decisions.md`, cada retrospectiva é anexada ao `lessons.md` por projeto, e o `/crystallize` promove padrões de alto impacto para uma biblioteca global que os agentes consultam antes de resolver de novo.

## Críticos antes do plano

Os bugs mais caros não estão no código — estão nas decisões tomadas antes de a codificação começar. Três agentes críticos rodam antes da etapa de Plano, nas três posições onde um erro custa mais caro:

| Crítico | Pega |
|---|---|
| **Crítico de arquitetura** | Acoplamento que inviabiliza multi-tenancy depois · O(n²) "óbvio" em dados de escala real · dependências circulares entre bounded contexts |
| **Crítico de especificação** | "Resolvemos o problema errado" — a pior classe de bug, porque nenhum teste unitário vai pegar · critérios de aceitação desalinhados · escopo que nunca foi acordado |
| **Crítico de schema** | `NOT NULL` sem default em uma tabela de 50M linhas (deadlock em 10min após o deploy) · falta de `CONCURRENTLY` na criação de índice · migrações irreversíveis sem caminho de rollback |

Antes, os críticos só ativavam a partir do Plano. Agora o pipeline pega erros de arquitetura e de especificação antes de a implementação começar — quando reverter custa horas, não dias.

## Como o great_cto se compara

|  | **great_cto** | Devin | Claude Code (sozinho) |
|---|---|---|---|
| Código aberto | ✅ MIT | ❌ fechado | ❌ modelo de plugin fechado |
| Self-host | ✅ roda localmente | ❌ nuvem da Cognition | ✅ |
| Host | ✅ Claude Code + Codex | ❌ nuvem da Cognition | ✅ Claude Code |
| BYOK / multi-modelo | ✅ Claude Code · Codex | ❌ proprietário | ❌ apenas Anthropic |
| Agentes especialistas | **57** (arquiteto · PM · revisão de 12 ângulos · QA · segurança · devops · 42 revisores entre arquétipos, packs e jurisdições) | 1 generalista | 1 generalista |
| Orquestração de SDLC | arquiteto → plano → impl → revisão → QA → segurança → devops | autonomia de uma só tacada | loop de edição |
| Gates humanos | ✅ 2 por feature (plano + envio) | ❌ nenhum | ❌ |
| Memória entre sessões | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ apenas thread | ⚠️ apenas thread |
| Rastreamento de custo | ✅ por agente + histórico de 30d + savings_x | ❌ | ❌ |
| Frameworks de conformidade | ✅ 33+ (PCI · HIPAA · SOX · GDPR · CCPA · DPDPA · EU AI Act · FDA SaMD · COPPA · FERPA · FedRAMP · NAIC · …) | ❌ | ❌ |
| Preço | grátis (você paga seu provedor de LLM) | $500/mês | $20/mês |
| Setup | `npx great-cto init` | cadastro | instalar CLI |

O great_cto **não** é mais um loop de agente de codificação — é a **camada de orquestração acima** do agente de codificação que você já usa. Pense em "time de especialistas que revisa e faz gate do trabalho" em vez de "mais um assistente que digita código".

## Detecção de jurisdição

`npx great-cto init` escaneia três fontes de sinal — palavras-chave do README, strings de região da infra (Terraform, `.env` `AWS_REGION=`, docker-compose `TZ=`) e o TLD do homepage do `package.json` — e detecta automaticamente quais das **12 jurisdições** se aplicam:

| Jurisdição | Sinais (README + infra) | Frameworks | Revisor |
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

A correspondência por limite de palavra evita falsos positivos (`"india"` não casa com `"indiana"`). A jurisdição detectada é escrita em `PROJECT.md` como `jurisdiction: [eu, us-ca]` e faz gate do revisor apropriado em cada feature. Sobrescreva manualmente:

```yaml
jurisdiction: [eu, us-ca]
```

## Três comandos que você usa todo dia

```bash
/start "build a refund endpoint with PCI-DSS scoping"
# → architect → enterprise-saas-reviewer (PCI-DSS auto-loaded)
# → pm → 5 Beads tasks → gate:plan (you approve)
# → senior-dev → 12-angle review → qa → security-officer
# → gate:ship (you approve) → devops → deployed

/inbox
# Pending gates · P0 incidents · blocked tasks · stale in-progress

/digest
# Weekly DORA + delta vs last week + cost-per-feature roll-up
```

Além de: `/audit` (escaneamento de base de código existente), `/cost` (economia do roteador de LLM), `/sec` (guarda-chuva de segurança), `/oncall`, `/release`, `/rfc`. Lista completa: `~/.claude/commands/` após a instalação.

## Custo

```
~$34/mês para um projeto solo-CTO típico — 20 execuções de pipeline/mês, indicativo.
```

| Pipeline | Custo/execução | Execuções/mês | Total |
|---|---|---|---|
| quick (config / typo) | $0.10 | 10 | $1 |
| quick (novo endpoint) | $1 | 6 | $6 |
| standard (feature) | $5 | 3 | $15 |
| deep (transversal) | $12 | 1 | $12 |
| | | | **~$34** |

Pague seus próprios tokens da API da Anthropic. **Sem taxa por assento. Sem lock-in de SaaS.** A triagem rotineira é roteada automaticamente para o Kimi K2 (equivalente ao Sonnet a um custo ~5× menor) → redução de 60–80% no agrupamento de logs.

## 26 arquétipos detectados automaticamente

Cada arquétipo ativa seus próprios agentes especialistas e checklists de conformidade. Top 7:

| Arquétipo | Tier | Agentes especialistas | Conformidade |
|---|---|---|---|
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval · ai-security | eu-ai-act · owasp-llm-top-10 |
| `fintech` | **deep** | pci · regulated | pci-dss · sox · kyc-aml · gdpr · dora |
| `mlops` | **deep** | mlops-reviewer · ai-eval | eu-ai-act · nist-ai-rmf · iso42001 |
| `library` | baseline | library-reviewer | openssf · sbom |
| `cli-tool` | baseline | cli-reviewer | — |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `defense-govcon` | **deep** | cmmc-reviewer · gov-reviewer | cmmc-2.0 · nist-800-171 · dfars · itar · section-889 |

Tabela completa (26 arquétipos) + como a detecção funciona: [docs/ARCHETYPES.md](../ARCHETYPES.md).

**Cobertura profunda dos EUA** — além de GDPR/PCI/HIPAA, o great_cto agora revisa contra a divulgação cibernética da SEC (8-K Item 1.05), CMMC 2.0 / NIST 800-171 para empreiteiros de defesa, governança de IA dos EUA (NIST AI RMF · Colorado SB 205 · Utah/Texas AI), litígio de rastreamento web (VPPA · CIPA · Washington MHMDA) e risco de modelo HMDA / SR 11-7 para empréstimos.

## 14 domain packs — revisores de sobreposição

Os domain packs rodam **por cima dos** arquétipos. São anexados automaticamente quando o CLI detecta sinais específicos do pack (deps, termos no README). Cada pack adiciona seu(s) próprio(s) revisor(es), template de modelo de ameaça, suite de EVAL e gates humanos — independente do arquétipo base.

| Categoria | Packs |
|---|---|
| **Verticais de IA** | `voice-pack` · `clinical-pack` · `hr-ai-pack` · `drug-discovery-pack` |
| **Saúde digital** | `digital-health-pack` _(telemetria de wearables · IA de saúde mental · IA de nutrição · HITL de médico)_ |
| **Fintech / regulado** | `lending-pack` · `em-fintech-pack` |
| **Alta conformidade** | `clinical-trials-pack` · `climate-pack` |
| **Engenharia** | `api-platform-pack` · `robotics-pack` |
| **Mercado dos EUA** | `sec-cyber-pack` _(divulgação SEC 8-K)_ · `adtech-privacy-pack` _(VPPA · CIPA · MHMDA)_ · `us-ai-pack` _(NIST AI RMF · Colorado SB 205)_ |

→ **28 tipos de gate humano** + 53 suites de EVAL de referência + 15 templates de TM. Navegue por todos os 14 packs com **visualização de jornada em 4 camadas** (arquétipo → pack → revisor → gate): [greatcto.systems/packs.html](https://greatcto.systems/packs.html).

## Um caso real, totalmente rastreado

Uma feature de CLI em Python enviada através do pipeline completo: **$2.39 de gasto de LLM** vs. ~$5.460 equivalente humano. A segurança pegou dois defeitos reais que o QA havia aprovado (`list(stream_csv())` anulava o streaming → pico de 14,5 MB de RSS em uma entrada de 13 MB). Modelo de múltiplos revisores pegando o que agentes isolados perdem, antes do merge.

Trace completo + artefatos: [greatcto.systems/proof](https://greatcto.systems/proof) · bruto: [`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](../qa/runs/2026-05-09/E2E-CLI-PIPELINE.md).

## Integração com CI

Insira em qualquer workflow do GitHub Actions:

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

O `great-cto ci` detecta automaticamente `$GITHUB_ACTIONS` e emite anotações `::error file=...,line=N::` inline nos diffs de PR. Códigos de saída: 0 limpo / 1 achados / 2 erro de setup.

## Pirâmide de testes

Suite de testes em camadas — **a camada estrutural + máquina de estados roda em <2 min por $0** (`node --test tests/*.test.mjs`); a camada de LLM real (26 arquétipos × 4-8 etapas + 14 packs + 13 revisores) roda sob demanda via OpenRouter por ~$5–10. Detalhamento completo: [docs/testing/](../testing/).

## MCP

Servidor [MCP](https://modelcontextprotocol.io/) nativo — **7 ferramentas** chamáveis a partir do Claude Desktop, Codex ou qualquer host MCP. Local (sem board necessário): `detect_archetype` · `estimate_cost` · `query_decisions`. Apoiadas em board: `project_status` · `cost_summary` · `pipeline_stages` · `recent_verdicts`.

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

Setup completo + MCPs internos (Grafana, roteador de LLM, Beads): [docs/MCP.md](../MCP.md).

## Alertas por e-mail (zero-setup)

Cinco coisas que exigem sua ação em <2h são enviadas por e-mail automaticamente — mesmo quando você está longe do board:

| Gatilho | Quando |
|---|---|
| 🚨 **Incidente P0** | Uma tarefa P0 abre em qualquer projeto |
| ⏸️ **Gate parado > 2h** | Um `gate:ship` está esperando por você há horas |
| 🛡️ **Segurança BLOQUEADA** | O `security-officer` rejeitou um merge |
| 💸 **Alerta de orçamento** | O gasto mensal de LLM cruza 80% / 100% do orçamento |
| 📊 **Resumo semanal** | Sexta-feira 09:00 — enviado, gasto, economia, QA |

**Setup**: board → aba **Notifications** → digite o e-mail → digite o código de 6 dígitos que enviamos → escolha os gatilhos. Sem cadastro no Resend, sem chaves de API — entrega roteada por `greatcto.systems/notify` (grátis, 100 e-mails/24h por e-mail verificado).

## Limitações & não-objetivos

- **Não é para times** — o solo-CTO é o produto. 2+ engenheiros? Você já o superou.
- **Não substitui engenheiros sêniores** — codifica processo; não toma decisões de julgamento arquitetural sem um.
- **Não é um sistema de CI/CD** — os gates rodam localmente / na sessão. Você ainda precisa do GitHub Actions para o merge de verdade.
- **Não é auditado por certificação** — os scaffolds de arquétipo PCI/HIPAA/SOC2 são pontos de partida, não certificações.
- **Não é determinístico** — saídas geradas por LLM. Todo veredito de gate deve passar por uma checagem de sanidade.

## FAQ (top 5)

**Meu código-fonte é usado para treinar modelos?** Não. A API da Claude é zero-retenção por padrão para clientes pagantes. O great_cto não acrescenta nada.

**Como vocês mantêm os custos de token baixos?** Haiku por padrão + roteador Kimi K2 para triagem (60–80% de economia) + hook de guarda de custo.

**Posso desativar hooks?** Todo hook respeita `GREAT_CTO_DISABLE_<NAME>=1`. Opt-out de varredura de segredos por arquivo: `// great_cto:allow-secrets`.

**E se eu não for solo?** O great_cto é feito para a organização de engenharia de uma pessoa só. Se você tem 2+ engenheiros e precisa de boards compartilhados / autenticação multi-assento, você já o superou.

FAQ completo: [docs/FAQ.md](../FAQ.md).

## Documentação

📚 **[Hub de documentação completo →](../README.md)** — organizado por [Diátaxis](https://diataxis.fr/):
**[Primeiros passos](../tutorials/getting-started.md)** · Guias práticos ·
referência de [Agentes](../reference/agents.md) & [Comandos](../reference/commands.md) · [Arquitetura](../ARCHITECTURE.md) · [FAQ](../FAQ.md).

## Arquitetura

O plugin roda dentro do Claude Code (ou qualquer host com capacidade MCP); 61 agentes são specs em markdown; as tarefas vivem no Beads (dolt, git-native); a memória é markdown puro (sem vector store). Diagrama + tabela de stack: [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Novidades

**v2.21.0** (maio de 2026) — **UX do Flow Compiler**: `npx great-cto init` agora imprime um **fluxo compilado** com agentes, gates, conformidade e estimativa de custo por ciclo de feature. Escreve `.great_cto/FLOW.md` — os agentes o leem para saber exatamente como orquestrar seu SDLC.

**v2.20.0** (maio de 2026) — **Detecção v2**: **cobertura de 12 jurisdições** (adicionados CA · JP · CN · KR com framework legal completo + gates humanos) · **detecção por sinal de infra** (strings de região do Terraform, `.env` `AWS_REGION=`, docker-compose `TZ=`, TLD do homepage do `package.json`) · **correspondência por limite de palavra** (sem mais falsos positivos "india" → "indiana") · **dicas de pack** para arquétipos de nicho (`suggestedPacks` revela packs de robotics/climate/clinical-trials/hr-ai/em-fintech quando a confiança é baixa). Economia de tokens: –87,7% por execução de pipeline (redesenho de arquitetura de contexto v2.19.0).

**v2.19.0** (maio de 2026) — **Economia de tokens Fase 1+2**: resumos de artefatos (≤250 tokens, gerados automaticamente) + filtro de memória ciente da tarefa (top-k entradas relevantes por tarefa). –87,7% tokens por execução de pipeline.

**v2.17.0** (maio de 2026) — **plugins companheiros se auto-instalam** · críticos de **Arquitetura / Especificação / Schema** antes da etapa de Plano.

[Changelog completo →](../../CHANGELOG.md)

## Roadmap

- **Runner de evals no CI** — rodar suites de eval golden-set em cada PR, pegar regressões de prompt automaticamente
- **Loop de auto-aprimoramento** — agentes que aprendem com os veredictos e melhoram seus próprios prompts ao longo do tempo
- **Pontuação de decisões** — rastrear quais decisões de gate se mostraram corretas; revelar padrões
- **/crystallize** — promover lições de alto impacto para skills reutilizáveis que o pipeline inteiro pode consultar

[Vote na próxima feature →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## Autor

[avelikiy](https://github.com/avelikiy) — CTO construindo plataformas de trading e fintech nativas de IA (0→1, 1→N). O great_cto é o resultado de automatizar meus próprios loops, um agente de cada vez. Cada regra surgiu em resposta a um problema real em um sistema de produção real.

## Comunidade

| Canal | O quê |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, pedidos de feature, propostas de arquétipo |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Perguntas, padrões, show-and-tell |
| 📝 [Blog](https://velikiy.hashnode.dev) | Mergulhos profundos em arquitetura |
| 🔒 [SECURITY.md](../../SECURITY.md) | Divulgação responsável |

## Contribuição & Licença

Pull requests são bem-vindos — veja [CONTRIBUTING.md](../../CONTRIBUTING.md). Boas primeiras issues: [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue).

MIT — veja [LICENSE](../../LICENSE).

Se o great_cto economizou seu tempo, por favor dê uma estrela no repositório — isso ajuda outros CTOs solo a encontrá-lo.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

---

<div align="center">

**Construído por [@avelikiy](https://github.com/avelikiy)**
*Pare de ser a única pessoa capaz de entregar.*

</div>
