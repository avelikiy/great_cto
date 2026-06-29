<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Construtor de Produtos com IA — descreva um produto, aprove a especificação, entregue o software.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-1h26m_·_$3.40_vs_~$42K_traditional-darkgreen)](https://greatcto.systems/proof)

```bash
npx great-cto init
```

[Website](https://greatcto.systems) · [Um caso real →](https://greatcto.systems/proof) · [Demo ao vivo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## Construa o produto, não apenas o código

**Você descreve o produto. O great_cto o entrega.** Não um trecho de código, não um esqueleto — uma aplicação
real, deployada, com backend, frontend, testes gerados e uma URL ao vivo. Você toma exatamente **uma decisão:
aprovar a spec.** Tudo depois disso — arquitetura, modelo de dados, build, revisão, deploy — roda sem supervisão.

É um **Construtor de Produtos com IA**, não mais um loop de agente de codificação. A camada de orquestração
*acima* do agente de codificação que você já usa: um time de agentes especialistas que planejam, constroem,
revisam e fazem gate do trabalho — para que uma pessoa entregue como uma organização de engenharia.

> **Uma feature real: ideia → PR merjado em `1h 26m` por `$3.40` de custo de LLM.** O caminho tradicional para
> a mesma feature foi ~6 semanas e ~$42K. [Veja o trace completo →](https://greatcto.systems/proof)

Ele constrói nas principais indústrias de serviços dos EUA — serviços domésticos e de campo, serviços
profissionais, hospitalidade, varejo/e-commerce, proptech, fitness, marketing & criadores, RH/recrutamento,
construção, logística — que se reduzem a **6 pipelines de construção reutilizáveis** (SaaS vertical CRUD,
agendamento, CRM, dashboard, marketplace, conteúdo/mídia). Um comando entrega qualquer um dos **~40 produtos**.
Veja [docs/strategy/BUILD-PIPELINES.md](../strategy/BUILD-PIPELINES.md).

```
   descreva um produto
        │
   síntese da spec  ── arquitetura · modelo de dados · telas          (automatizado)
        ▼
   👤  gate do CTO — aprove a spec        ← o único checkpoint humano
        │
   scaffold → backend → frontend → integrar → testar → deploy        (automatizado)
        ▼
   produto entregue · repo · URL ao vivo
```

A CI e os testes gerados são o gate de qualidade — você assina a **direção**, não cada linha.

## Por baixo dos panos (para o CTO que opera)

→ *A história voltada para o construtor desta superfície: [greatcto.systems/build](https://greatcto.systems/build)*

Cada produto é construído por um pipeline de agentes especialistas — arquiteto, design-advisor, senior-dev,
QA, security-officer, devops — que roda spec → scaffold → backend → frontend → testes → deploy.
**Você toma uma decisão: aprovar a spec.** Tudo depois disso é automatizado. O pipeline é
escalonado por risco — uma correção de manutenção não abre gate (a CI é o gate), uma feature reversível abre apenas o
gate de plano e uma mudança irreversível força o conjunto completo — então a cerimônia escala com o raio de impacto,
não com a papelada. A CI e os próprios testes gerados da construção são o gate de qualidade que torna seguro
deixar o pipeline rodar até o deploy.

**Um gate, onde importa.** As etapas de construção são escalonadas por risco: uma mudança reversível constrói e entrega
atrás da CI; uma irreversível — um deploy em produção, uma migração de schema, uma nova integração com capacidade de
escrita — escala para o gate do CTO e para o modelo de fronteira antes de rodar. Você assina a spec
e as chamadas de alto raio de impacto; o resto roda direto. `change-tier` + `effectiveGates`
impõem o invariante no código.

## Em números

| | |
|---|---|
| Uma feature, de ponta a ponta (caso real, totalmente rastreado) | **1h 26m · $3.40 de LLM** vs ~$42K / ~6 semanas tradicional |
| Um caso anterior de feature de CLI, mesmo pipeline | $2.39 de LLM vs ~$5.460 equivalente humano; a segurança pegou 2 defeitos que o QA havia aprovado |
| Custo mensal (20 execuções de pipeline) | **~$34** |
| Indústrias-alvo dos EUA | **10** (serviços domésticos · varejo · proptech · fitness · RH · …) |
| Produtos construíveis | **~40** nas 10 indústrias |
| Pipelines de construção reutilizáveis | **6** (CRUD · agendamento · CRM · dashboard · marketplace · conteúdo) |
| Agentes especialistas | **61** |

→ [Trace completo com todos os artefatos](https://greatcto.systems/proof) · [os 6 pipelines](https://greatcto.systems/pipelines)

## Como funciona

**`npx great-cto init`** — escaneia sua stack e escreve `.great_cto/FLOW.md` com o pipeline para o seu produto: os agentes, o arquétipo de construção e o único gate do CTO.

**`/start "descreva o produto"`** — o arquiteto e o design-advisor esboçam a spec, o modelo de dados e as telas. Você revisa e aprova no **único gate** — `gate:plan`.

**O pipeline entrega** — o senior-dev faz scaffold e constrói com TDD, o QA roda os testes gerados, o devops faz deploy. Nenhuma aprovação adicional necessária para uma construção reversível.

## Três produtos — um pipeline

Mesmo comando, produto diferente. O arquétipo de construção molda a stack e as integrações:

| | **App de despacho** | **App de agendamento de aulas** | **Dashboard de lucratividade** |
|---|---|---|---|
| Arquétipo | SaaS vertical CRUD | Agendamento / reservas | Dashboard / analytics |
| Stack | Next.js · Postgres · shadcn | Next.js · Postgres · cal | Next.js · warehouse-lite · charts |
| Integrações | Auth · RBAC | Stripe · Twilio | conectores de fonte |
| Gates humanos | `gate:plan` (o gate do CTO) | `gate:plan` | `gate:plan` |

→ Veja os 6 pipelines: [greatcto.systems/pipelines](https://greatcto.systems/pipelines)

## O dashboard que você vai realmente checar

`great-cto board` abre em `http://localhost:3141` — o board de construção: SSE em tempo real, o pipeline ao vivo com seu badge de change_tier (um gate do CTO · juiz barato), custo por agente, gasto de LLM em 30 dias vs. baseline equivalente humano.

<p align="center">
  <img src="../screenshots/board.png" alt="The build board — live pipeline with the change_tier gate badge, inbox and cost" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="../screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — tasks shipped, AI spend, cost savings vs FTE" width="100%" /></a><br/><sub><b>Métricas</b> — tarefas entregues, gasto de IA, economia de custo vs. um time humano, queima diária</sub></td>
<td width="50%"><a href="../screenshots/memory.png"><img src="../screenshots/memory.png" alt="Project memory — browsable layers: PROJECT.md, archetypes, lessons" width="100%" /></a><br/><sub><b>Memória</b> — camadas navegáveis de memória do projeto: PROJECT.md, arquétipos, skills, lições</sub></td>
</tr>
</table>

**Feito para a organização de engenharia de uma pessoa só.** O GreatCTO é para o indie hacker, fundador solo ou CTO técnico que quer entregar produtos reais sem um time — rodando o pipeline no Claude Code ou no OpenAI Codex, aprovando uma spec e entregando para uma URL ao vivo. *Não é para times de engenharia com múltiplos devs* — veja o [FAQ](../FAQ.md#is-great_cto-for-teams).

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
<summary>📖 Documentação completa — um gate do CTO · escalonamento por risco · críticos · 61 agentes · arquétipos de construção · board · custo · MCP</summary>

## Uma decisão por feature

```
🤖 architect + design-advisor  →  spec · modelo de dados · telas
   ↓
🟡 gate:plan   ←  você decide aqui — aprove a spec (o único gate do CTO)
   ↓
🤖 senior-dev → review → qa-engineer → devops  →  construído · testado · deployado
```

O pipeline é escalonado por risco (`change_tier`): uma correção de manutenção **não** abre gate (a CI é o gate), uma feature reversível abre **apenas** o `gate:plan` e uma mudança irreversível força o conjunto completo + o modelo de fronteira. Tudo entre o gate e o deploy roda automaticamente. **A memória persiste** entre sessões: cada veredito de gate é anexado a `~/.great_cto/decisions.md`, cada retrospectiva ao `lessons.md` por projeto, e o `/crystallize` promove padrões de alto impacto para uma biblioteca global que os agentes consultam antes de resolver de novo.

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
| Agentes especialistas | **61** (arquiteto · design-advisor · senior-dev · QA · segurança · devops · revisores de arquétipo) | 1 generalista | 1 generalista |
| Pipeline de construção | spec → gate do CTO → scaffold → build → test → deploy | autonomia de uma só tacada | loop de edição |
| Gates humanos | ✅ um — você aprova a spec (escalonado por risco) | ❌ nenhum | ❌ |
| Memória entre sessões | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ apenas thread | ⚠️ apenas thread |
| Rastreamento de custo | ✅ por agente + histórico de 30d + savings_x | ❌ | ❌ |
| Design embutido | ✅ design-advisor + ui-ux-pro-max → Next.js/Tailwind/shadcn | ❌ | ❌ |
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
/start "build a dispatch & scheduling app for an HVAC business"
# → architect + design-advisor → spec, data model, screens
# → pm → Beads tasks → gate:plan (you approve the spec — the one gate)
# → senior-dev → review → qa → devops → built · tested · deployed

/inbox
# Pending gate · P0 incidents · blocked tasks · stale in-progress

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

## Arquétipos de construção

Cada produto mapeia para um **arquétipo de construção** que molda seu pipeline — o template de stack,
o formato dos dados, a integração característica. Os 6 arquétipos do Construtor de Produtos (os ~40 produtos
se reduzem a estes):

| Arquétipo | Formato | Stack | Integração |
|---|---|---|---|
| `vertical-saas` | entidades · papéis · workflow · UI de registros | Next.js · Postgres · shadcn | Auth · RBAC |
| `booking` | calendário · disponibilidade · lembretes · pagamentos | Next.js · Postgres · cal | Stripe · Twilio |
| `crm` | contatos · pipeline · sequências automatizadas | Next.js · Postgres · queue | email / SMS · webhooks |
| `dashboard` | ingestão · métricas · visualização · alertas | Next.js · warehouse-lite · charts | conectores de fonte |
| `marketplace` | listagens de dois lados · matching · pagamentos | Next.js · Postgres · Stripe Connect | Stripe Connect / escrow |
| `content` | catálogo · tiers de acesso · entrega · monetização | Next.js · object storage · CDN | Stripe · pipeline de mídia |

Além dos arquétipos subjacentes por tipo de software (`web-service`, `mobile-app`, `cli-tool`,
`library`, …) que o motor detecta automaticamente para ajustar a construção. Veja [os 6 pipelines](https://greatcto.systems/pipelines).

Tabela completa (26 arquétipos) + como a detecção funciona: [docs/ARCHETYPES.md](../ARCHETYPES.md).

**Cobertura profunda dos EUA** — além de GDPR/PCI/HIPAA, o great_cto agora revisa contra a divulgação cibernética da SEC (8-K Item 1.05), CMMC 2.0 / NIST 800-171 para empreiteiros de defesa, governança de IA dos EUA (NIST AI RMF · Colorado SB 205 · Utah/Texas AI), litígio de rastreamento web (VPPA · CIPA · Washington MHMDA) e risco de modelo HMDA / SR 11-7 para empréstimos.

## Overlays de domínio (opcional)

Além do arquétipo de construção, o motor pode anexar automaticamente um **overlay de domínio** opcional quando
detecta sinais específicos de domínio (deps, termos no README) — adicionando um revisor especialista e algumas
verificações extras para coisas como voz/telefonia, privacidade (GDPR/CCPA) ou governança de IA. São
opt-in e ortogonais ao pipeline de construção; a maioria dos produtos não precisa de nenhum.

## Um caso real, totalmente rastreado

O recibo canônico: **uma feature real** entregue através do pipeline completo em **1h 26m
de wall-clock por $3.40 de custo de LLM** — arquiteto → plano → implementação → revisão → gate humano →
PR merjado. O caminho tradicional para a mesma feature: ~170 horas e ~$42K. Cada etapa
com timestamp, cada artefato com link para um PR público no GitHub.

Um caso anterior em uma feature de CLI em Python ($2.39 vs. ~$5.460 equivalente humano) mostrou o modelo de revisão funcionando: a segurança pegou dois defeitos reais que o QA havia aprovado (`list(stream_csv())` anulava o streaming → pico de 14,5 MB de RSS em uma entrada de 13 MB).

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
| 📊 **Resumo semanal** | Sexta-feira 09:00 — entregue, gasto, economia, QA |

**Setup**: board → aba **Notifications** → digite o e-mail → digite o código de 6 dígitos que enviamos → escolha os gatilhos. Sem cadastro no Resend, sem chaves de API — entrega roteada por `greatcto.systems/notify` (grátis, 100 e-mails/24h por e-mail verificado).

## Limitações & não-objetivos

- **Não é para times de engenharia com múltiplos devs** — um construtor é o produto; 2+ engenheiros compartilhando o pipeline já o superaram.
- **Não substitui engenheiros sêniores** — codifica processo; não toma decisões de julgamento arquitetural sem um.
- **Não é um sistema de CI/CD** — os gates rodam localmente / na sessão. Você ainda precisa do GitHub Actions para o merge de verdade.
- **Não é auditado por certificação** — os scaffolds de arquétipo PCI/HIPAA/SOC2 são pontos de partida, não certificações.
- **Não é determinístico** — saídas geradas por LLM. Todo veredito de gate deve passar por uma checagem de sanidade.

## FAQ (top 5)

**Meu código-fonte é usado para treinar modelos?** Não. A API da Claude é zero-retenção por padrão para clientes pagantes. O great_cto não acrescenta nada.

**Como vocês mantêm os custos de token baixos?** Haiku por padrão + roteador Kimi K2 para triagem (60–80% de economia) + hook de guarda de custo.

**Posso desativar hooks?** Todo hook respeita `GREAT_CTO_DISABLE_<NAME>=1`. Opt-out de varredura de segredos por arquivo: `// great_cto:allow-secrets`.

**E se eu não for solo?** O pipeline de construção do GreatCTO é feito para um engenheiro — se você tem 2+ engenheiros que precisam de boards de construção compartilhados e pipelines concorrentes, você já o superou.

FAQ completo: [docs/FAQ.md](../FAQ.md).

## Documentação

📚 **[Hub de documentação completo →](../README.md)** — organizado por [Diátaxis](https://diataxis.fr/):
**[Primeiros passos](../tutorials/getting-started.md)** · Guias práticos ·
referência de [Agentes](../reference/agents.md) & [Comandos](../reference/commands.md) · [Arquitetura](../ARCHITECTURE.md) · [FAQ](../FAQ.md).

## Arquitetura

O plugin roda dentro do Claude Code (ou qualquer host com capacidade MCP); 61 agentes são specs em markdown; as tarefas vivem no Beads (dolt, git-native); a memória é markdown puro (sem vector store). Diagrama + tabela de stack: [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Novidades

**v2.74+** (junho de 2026) — **O pivô do Construtor de Produtos**: o GreatCTO se torna um *Construtor de Produtos com IA* — descreva um produto de software, aprove a spec em um único gate do CTO, e o pipeline o entrega (spec → build → test → deploy). 10 indústrias dos EUA, ~40 produtos, 6 pipelines reutilizáveis. Os gates de construção são escalonados por risco (`change_tier`); a superfície de runtime regulada mudou para [avelikiy/operate](https://github.com/avelikiy/operate). História: [a estratégia](../strategy/PRODUCT-BUILDER-DIRECTION.md) · [os 6 pipelines](https://greatcto.systems/pipelines)

**v2.40–v2.62** (junho de 2026) — **O pivô dos autopilots**: o GreatCTO se torna *autopilots de IA para negócios* — 25 verticais de autopilot de serviço, cada uma um fluxo com um scorecard de qualidade medido, um dono responsável e o invariante de runtime de que **uma ação irreversível nunca executa sem uma assinatura humana**. 22 conectores ao vivo rodam cada vertical com dados reais. História: [Nós pivotamos →](https://greatcto.systems/blog/autopilots-pivot-25-verticals)

**v2.46–v2.63** (junho de 2026) — **O console do operador**: execuções duráveis pausam no gate humano e esperam em uma inbox por um humano licenciado e nomeado; a assinatura executa a escrita. Acesso baseado em papéis, convites com escopo, determinações redigidas por IA com evidências, amostragem de QA, relógios de SLA, aba Ops (medição · saúde de conectores · requeue de dead-letter), WCAG 2.2 AA, claro/escuro. História: [O console do operador →](https://greatcto.systems/blog/operator-console)

**v2.37–v2.65** (junho de 2026) — **Por baixo dos panos**: o board de dev se torna um *pult* — aprovar um gate pode disparar uma execução de agente transmitida ao vivo; auto-aprimoramento de prompt condicionado a evals retidos (inspirado em SIA); compressão de contexto a $0 (log de CI 31.475 → 155 caracteres com o FATAL preservado); suporte ao Fable 5. História: [Junho por baixo dos panos →](https://greatcto.systems/blog/june-under-the-hood)

[Changelog completo →](../../CHANGELOG.md)

## Roadmap

- **Detecção de arquétipo de produto** — escolher o arquétipo de construção a partir do brief do produto, não apenas da stack
- **Templates de construção por indústria** — entregar um produto de referência de ponta a ponta através de cada um dos 6 pipelines
- **Juiz ciente de tier** — um juiz barato afinado em evals de T0/T1, fronteira + humano em T2 (ADR-004)
- **Task-runner headless** — enfileirar construções de produto e rodá-las em um VPS, sem supervisão

[Vote na próxima feature →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## Autor

[avelikiy](https://github.com/avelikiy) — CTO construindo plataformas de trading e fintech nativas de IA (0→1, 1→N). O great_cto é o resultado de automatizar meus próprios loops, um agente de cada vez. Cada regra surgiu em resposta a um problema real em um sistema de produção real.

## Comunidade

| Canal | O quê |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, pedidos de feature, propostas de arquétipo |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Perguntas, padrões, show-and-tell |
| 📝 [Blog](https://greatcto.systems/blog/) | Recibos, detalhamentos de custo, mergulhos profundos em arquitetura |
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
