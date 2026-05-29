<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

# great_cto

**Descreva seu projeto e onde ele opera. GreatCTO compila o pipeline SDLC correto automaticamente.**

`npx great-cto init` escaneia seu stack, detecta a jurisdição e compila um **Delivery Flow** — o conjunto exato de agentes, frameworks de compliance e human gates que seu projeto precisa. Você aprova dois checkpoints: o plano e o deploy. Todo o resto é automático.

**Feito para a organização de engenharia de uma pessoa só.** Indie hackers, fundadores solo e CTOs técnicos que gerenciam tudo sozinhos.

<sub>Sob o capô: 57 agentes especialistas · 25 arquétipos de produto · 11 domain packs · 33+ frameworks de compliance · 12 overlays de jurisdição.</sub>

> **v2.21.0** · 57 agentes · 25 arquétipos · 12 jurisdições · funciona em **Claude Code · Cursor · Codex · Aider · Continue** · servidor MCP · webhooks · CI gate · ~$8–$18 por feature · MIT

> ⚠️ Esta tradução foi gerada por máquina. Revisão por falante nativo é bem-vinda — abra um PR. [English original](../../README.md).

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![JSR](https://jsr.io/badges/@avelikiy/great-cto)](https://jsr.io/@avelikiy/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)

[Site](https://greatcto.systems) · [Demo ao vivo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discussions](https://github.com/avelikiy/great_cto/discussions) · [Blog](https://velikiy.hashnode.dev)

**Idioma:** [English](../../README.md) · [Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · **Português (BR)**

</div>

## Novidades

### v2.7.0 — consistência cross-prompt + política de tier de modelo (maio 2026)
- 3 novas regras de linter: `CONS-MODEL` (modelo do agente combina com o papel) · `CONS-OUTPUT` (reviewers declaram arquivo de output) · `CONS-SIGNOFF` (semântica de sign-off / gate)
- ADR-002 — política unificada de seleção de tier de modelo (architect → opus|sonnet, continuous-learner → haiku, *-reviewer → sonnet)
- Bug fix: logs de auto-captura do SessionEnd agora renderizam corretamente no admin do board
- Baseline do linter: 34 agentes · 0 erros · 0 warnings


[Changelog completo →](../../CHANGELOG.md)

## O que é great_cto?

Execute `npx great-cto init` em qualquer repo. GreatCTO escaneia seu stack, detecta a jurisdição a partir de sinais de infra e README, e compila um **Delivery Flow** — o conjunto exato de agentes, frameworks de compliance e human gates que seu projeto precisa:

```
$ npx great-cto init

Compiled flow: Fintech · EU + UK
  Agents:     architect · gdpr-reviewer · pci-reviewer · regulated-reviewer · senior-dev · qa-engineer
  Gates:      gate:plan · gate:compliance · gate:security · gate:ship
  Compliance: gdpr, pci-dss, dora
  Cost:       ~$8–$18 per feature cycle
```

A partir daí, `/start "construir um endpoint de reembolso"` executa o pipeline compilado de ponta a ponta.

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto kanban — 5 colunas, gate approval inline, SSE ao vivo" width="900" />
</p>

| Camada | O que faz |
|--------|-----------|
| **33 especialistas** | architect · pm · senior-dev · code-reviewer · qa-engineer · security-officer · devops · l3-support · performance-engineer · ai-prompt-architect · ai-eval-engineer · ai-security-reviewer · pci-reviewer · regulated-reviewer · oracle-reviewer · firmware-reviewer · web-store-reviewer · db-migration-reviewer · mobile-store-reviewer · library-reviewer · infra-reviewer · cli-reviewer · game-reviewer · data-platform-reviewer · devtools-reviewer · enterprise-saas-reviewer · mlops-reviewer · streaming-reviewer · marketplace-reviewer · cms-reviewer · edtech-reviewer · gov-reviewer · insurance-reviewer · continuous-learner |
| **25 arquétipos** | web-service · agent-product · ai-system · mlops · commerce · marketplace · fintech · healthcare · mobile-app · cli-tool · library · browser-extension · game · web3 · iot-embedded · data-platform · streaming · devtools · infra · cms · enterprise-saas · regulated · edtech · gov-public · insurance |
| **Auto-detectado** | Escaneia `package.json`, `pyproject.toml`, `Cargo.toml`, README, estrutura do código → escolhe arquétipo + gates de compliance em 2 seg. Segunda opinião do Anthropic Haiku (~$0.001) quando confiança é baixa. |
| **Compliance** | EU AI Act · OWASP LLM Top 10 · PCI-DSS · SOX · KYC/AML · HIPAA · HITECH · GDPR · LGPD · ISO27001 · ETSI EN 303 645 · COPPA · SOC2 — anexado automaticamente por arquétipo. |
| **Memória** | 4 camadas — `PROJECT.md` (arquétipo) · `lessons.md` (retros do projeto) · `~/.great_cto/decisions.md` (toda aprovação de gate, consultável entre projetos) · `verdicts/` (todo veredito de agente). |
| **Board** | `great-cto board` abre 6 visões em `localhost:3141` — Inbox · Kanban · Metrics · Agents · Memory · Public report. Updates ao vivo via SSE. |

## Duas decisões por feature

```
Você:  /start "adicionar assinaturas Stripe — planos mensais e anuais"

great_cto:
  → arquétipo: commerce | escala: standard | ~45min
  → compliance: pci-dss + gdpr + lgpd (auto-anexado)
  → ARCH-stripe-subscriptions.md pronto  →  DECISÃO 1: aprovar arquitetura?

Você: "aprovado"

  → senior-dev → review de 12 ângulos → qa-engineer → security-officer → devops
  → 412 testes verdes · 0 highs · canary pronto
  → DECISÃO 2: subir?

Você: "subir"  →  canary 5% → 20% → 100%  →  doc RELEASE escrito
```

## Instalação rápida

```bash
npx great-cto init
```

O CLI escaneia seu repo, escolhe o arquétipo correto, conecta gates de compliance automaticamente. Funciona em projetos novos ou existentes. Reinicie o Claude Code depois.

**Requer:** [Claude Code](https://claude.com/claude-code) · Node 18.17+ · [Beads](https://github.com/steveyegge/beads) · [Superpowers](https://github.com/obra/superpowers)

## O board que você realmente vai checar

```bash
great-cto board   # localhost:3141
```

Seis visões, screenshots reais — veja [greatcto.systems#board](https://greatcto.systems#board).

| Visão | O que tem |
|-------|-----------|
| **Inbox** | Card de retomar (continue de onde parou) · Decisões pendentes · P0 abertas · Bloqueadas · Estagnadas (em progresso > 48h) |
| **Kanban** | 5 colunas · aprovar/rejeitar gate inline · barra de filtro · busca ⌘K · navegação `j`/`k` |
| **Metrics** | Hero cards (velocidade, custo, MTTR) · gráfico de gasto LLM 30 dias com alertas de orçamento |
| **Agents** | Tempo por agente, custo LLM, equivalente humano a $150/h · feed de atividade |
| **Memory** | Browser de 4 camadas: PROJECT.md · lessons.md · decisions.md · verdicts/ |
| **Relatório público** | Toggle on → URL não-adivinhável com tarefas entregues, comparação custo IA vs humano. Sem código, sem credenciais. |

Switcher multi-projeto — um board, todos os clientes.

## Três comandos que você usa todo dia

| Comando | O que faz |
|---------|-----------|
| `/start "descrição"` | Roda o pipeline SDLC completo — detecta arquétipo, gera arch doc, implementa com TDD, revisa, QA, segurança, deploya |
| `/review` | 12 ângulos independentes de code review na branch atual |
| `/inbox` | Gates abertos, tarefas bloqueadas, incidentes P0, alertas de segurança — tudo que precisa da sua decisão agora |

O resto (`/audit` · `/digest` · `/sec` · `/cost` · `/release` · `/crystallize`) roda automaticamente ou apenas quando você precisa. Veja [`docs/COMMANDS.md`](../COMMANDS.md) para referência completa.

## 25 arquétipos auto-detectados

Cada arquétipo ativa seus próprios agentes especialistas e checklists de compliance.

| Arquétipo | Tier padrão | Especialistas auto-carregados | Compliance |
|-----------|-------------|-------------------------------|------------|
| `web-service` | baseline | — | gdpr · owasp-api-top-10 |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act · owasp-llm-top-10 |
| `ai-system` | **standard** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act |
| `mlops` | **deep** | mlops-reviewer · ai-eval-engineer | eu-ai-act · nist-ai-rmf · iso42001 |
| `commerce` | standard | pci-reviewer | pci-dss · gdpr · sca-psd2 |
| `marketplace` | **deep** | marketplace-reviewer · pci-reviewer | pci-dss · kyc-aml · dsa-eu · 1099-k · ofac |
| `fintech` | **deep** | pci-reviewer · regulated-reviewer | pci-dss · sox · kyc-aml · gdpr · lgpd · dora · pix |
| `healthcare` | **deep** | regulated-reviewer | hipaa · hitech · gdpr · lgpd |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr · lgpd |
| `cli-tool` | baseline | cli-reviewer | — |
| `library` | baseline | library-reviewer | openssf · sbom |
| `browser-extension` | standard | web-store-reviewer | csp · mv3-security · gdpr |
| `game` | standard | game-reviewer | coppa · age-rating · accessibility |
| `web3` | **deep** | oracle-reviewer | soc2 · audit-prep |
| `iot-embedded` | standard | firmware-reviewer | iso27001 · etsi-en-303-645 · cra |
| `data-platform` | standard | data-platform-reviewer | gdpr · data-residency · lineage |
| `streaming` | standard | streaming-reviewer | gdpr · soc2-cc7 |
| `devtools` | standard | devtools-reviewer | openssf · soc2-type-2 · slsa-l3 |
| `infra` | standard | infra-reviewer · db-migration-reviewer | soc2 · cis-benchmarks |
| `cms` | standard | cms-reviewer | dmca · wcag-2.2-aa · dsa-eu · gdpr |
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa · lgpd |
| `regulated` | **deep** | regulated-reviewer | soc2 · hipaa · sox · dora · nis2 · iso27001 · lgpd |
| `edtech` | **deep** | edtech-reviewer | coppa · ferpa · gdpr-k · wcag-2.2-aa · section-508 · sopipa-ca · lgpd |
| `gov-public` | **deep** | gov-reviewer | fedramp · nist-800-53 · fisma · section-508 · pia · ato · cjis · stateramp |
| `insurance` | **deep** | insurance-reviewer | naic · solvency-ii · ifrs-17 · gdpr · ccpa · lgpd · anti-discrimination-pricing · actuarial-asops |

Sobrescreva a qualquer momento: `npx great-cto init --archetype <name>` ou edite `.great_cto/PROJECT.md`. O CLI também oferece segunda opinião do Anthropic Haiku (~$0.001) quando a confiança heurística é baixa — defina `ANTHROPIC_API_KEY` para ativar, opt-out com `--no-llm`.

## O que torna isso diferente?

Não somos um editor — nós orquestramos o processo ao redor do seu editor. Use Cursor, Copilot ou Claude Code dentro do loop se quiser.

| | great_cto | Cursor | Copilot Workspace | Claude Projects |
|---|---|---|---|---|
| Pipeline SDLC multi-agente | ✓ 33 especialistas | ✕ | ✕ | ✕ |
| Auto-detecção de arquétipo | ✓ 25 tipos | ✕ | ✕ | ✕ |
| Gates de compliance (PCI / HIPAA / SOX / EU AI Act / LGPD) | ✓ | ✕ | ✕ | ✕ |
| Memória persistente | ✓ decisions.md + verdicts | ⚠ só chat | ✕ | ✓ escopo do chat |
| Visão multi-projeto | ✓ | ✕ | ✕ | ⚠ |
| Code review de 12 ângulos | ✓ | ⚠ pass único | ⚠ pass único | ✕ |
| Relatórios públicos compartilháveis | ✓ | ✕ | ✕ | ✕ |
| Open source | ✓ MIT | ✕ | ✕ | ✕ |
| Roda localmente | ✓ | ⚠ parcial | ✕ | ✕ |
| Você paga sua própria API | ✓ | ✕ | ✕ | ✕ |
| **Preço** | **$0 + sua API** | $20/mês | $39/mês | $20/mês |

## Custo

```
~$34/mês para um time de produto típico — 20 execuções de pipeline/mês, indicativo.
```

| Pipeline | Custo/execução | Execuções/mês | Total |
|----------|----------------|---------------|-------|
| quick (config / typo) | $0.10 | 10 | $1 |
| quick (novo endpoint) | $1 | 6 | $6 |
| standard (feature) | $5 | 3 | $15 |
| deep (cross-cutting) | $12 | 1 | $12 |
| | | | **~$34** |

Você paga seus próprios tokens da Anthropic API. **Sem taxa por seat. Sem lock-in SaaS.** Triagem rotineira é auto-roteada para Kimi K2 (equivalente Sonnet a ~5× menor custo) → 60–80% redução de custo em clustering de logs e stack traces ruidosos.

## FAQ

**Funciona sem conexão de internet?**
Os agentes rodam localmente como sub-agentes do Claude Code. Apenas chamadas Claude API chegam à Anthropic. Nenhum código, telemetria ou memória é enviado a outro lugar.

**Meu código fonte é usado para treinar modelos?**
Não. Claude API é zero-retention por padrão para clientes pagos. great_cto não adiciona nada — seu código continua seu.

**E se eu já tenho CI/CD?**
great_cto roda *antes* do CI. Pega problemas em arquitetura, review e pre-merge. Use os dois — são complementares, não competidores.

**Suporte para Cursor / Copilot / Aider?**
Atualmente só Claude Code. Suporte cross-harness (baseado em `AGENTS.md`) está no roadmap v2.x.

**Posso desativar hooks se atrapalharem?**
Todo hook respeita variáveis de ambiente `GREAT_CTO_DISABLE_<NAME>=1` (ex: `GREAT_CTO_DISABLE_SECRET_SCAN=1`). Opt-out por arquivo via `// great_cto:allow-secrets` para o hook secret-scan.

**Como mantém custos de tokens baixos?**
Três camadas — (1) Haiku por padrão para agentes baratos, (2) [Kimi K2 router](https://github.com/avelikiy/great_cto/blob/main/agents/llm-router.md) para triagem (60-80% economia), (3) hook `cost-guard` avisa antes de prompts caros. Veja `/cost` para gasto ao vivo.

**O que acontece com meus dados ao desinstalar?**
O estado do plugin vive em `~/.great_cto/` (decisões globais) e `.great_cto/` (por projeto). Ambos são markdown puro — `rm -rf` limpa tudo. Sem serviços externos para desautorizar.

**Por que não auto-pilot? Por que "duas decisões por feature"?**
LLMs são poderosos mas perdem julgamento de produto em specs ambíguos. Manter um humano em gate:plan e gate:ship pega os 5% de decisões ruins que respondem por 95% do custo. Veja [ADR-015 — Arquitetura do loop de aprendizado](../architecture/ADR-015-learning-loop-architecture.md).

## Autor

[avelikiy](https://github.com/avelikiy) — Chief AI & Technology Officer / Founder. CTO construindo plataformas AI-native de trading e fintech (0→1, 1→N). Especializado em sistemas financeiros de alta carga onde a tecnologia impacta diretamente PnL, risco e unit economics.

## ⭐ Dê uma estrela ao repo

Se great_cto economizou seu tempo num projeto, dê uma estrela ao repo — ajuda outros founders solos e times pequenos a encontrar.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

## 💬 Comunidade & suporte

| Canal | Conteúdo |
|-------|----------|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, requests de feature, propostas de arquétipo |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Perguntas, padrões compartilhados, show & tell |
| 📝 [Blog](https://velikiy.hashnode.dev) | Análises profundas de arquitetura, loop de aprendizado, calibração de custo |
| 🐦 [@Greatcto no Hashnode](https://hashnode.com/@Greatcto) | Notas de release, artigos, série AI-CTO |
| 📦 [npm](https://www.npmjs.com/package/great-cto) · [JSR](https://jsr.io/@avelikiy/great-cto) | Registries de pacote |
| 🔒 [Security](../../SECURITY.md) | Disclosure responsável de CVEs em hooks/scanner |

## Roadmap

- **v2.2** — telemetria de qualidade de lições
- **v2.3** — auto-promoção: decisões de alto impacto → skills reutilizáveis
- **v3.0** — suporte cross-harness (`AGENTS.md` para Cursor / Codex / OpenCode / Gemini)

## Licença

MIT — veja [LICENSE](../../LICENSE).

---

<div align="center">

**Construído por [@avelikiy](https://github.com/avelikiy) · [@Greatcto on Hashnode](https://hashnode.com/@Greatcto)**
*Descreva seu projeto e onde ele opera. GreatCTO compila o pipeline SDLC correto automaticamente.*

</div>
