<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

# great_cto

**Deja de ser la única persona que puede hacer release.**

Eres el CTO. También eres el cuello de botella. **GreatCTO son 30 agentes especialistas** que se encargan de la arquitectura, revisión, QA, seguridad y deploy — mientras tú tomas **dos decisiones por feature**.

> **v2.7.0** · 34 agentes · 25 arquetipos · 24 reglas de seguridad · 9 hooks · funciona en **Claude Code · Cursor · Codex · Aider · Continue** · servidor MCP · webhooks · CI gate · ~$34/mes por proyecto · MIT

> ⚠️ Esta traducción es automática. Necesita revisión por hablante nativo. Si encuentras errores, abre un PR. [English original](../../README.md).

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![JSR](https://jsr.io/badges/@avelikiy/great-cto)](https://jsr.io/@avelikiy/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)

[Sitio web](https://greatcto.systems) · [Demo en vivo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discusiones](https://github.com/avelikiy/great_cto/discussions) · [Blog](https://velikiy.hashnode.dev)

**Idioma:** [English](../../README.md) · [Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · **Español** · [Português (BR)](../pt-BR/README.md)

</div>

## Novedades

### v2.7.0 — consistencia cross-prompt + política de tier de modelo (mayo 2026)
- 3 nuevas reglas de linter: `CONS-MODEL` (modelo del agente coincide con el rol) · `CONS-OUTPUT` (los reviewers declaran archivo de salida) · `CONS-SIGNOFF` (semántica de sign-off / gate)
- ADR-002 — política unificada de selección de tier de modelo (architect → opus|sonnet, continuous-learner → haiku, *-reviewer → sonnet)
- Bug fix: los logs de auto-captura de SessionEnd ahora se renderizan correctamente en el admin del board
- Baseline del linter: 34 agentes · 0 errores · 0 warnings

### v2.6.0 — linter estructural de prompts de agentes (mayo 2026)
- `scripts/agent-prompt-lint.mjs` — 14 reglas para todos los 34 archivos markdown en `agents/`
- Detecta: drift de frontmatter (model/tools), secciones phase-task ausentes, paths de memoria obsoletos, blowup de tamaño de archivo
- Se ejecuta en los tests L1 del pipeline: 0 errores antes del release

### v2.5.x patch series — production hardening (mayo 2026)
- **v2.5.10**: cierre de phase-task vía `bd close --force` para tasks dependientes
- **v2.5.9**: economía honesta — $0.30/AI-hr · $150/human-hr · ratio 500× (corregido bug que mostraba 7638×)
- **v2.5.8**: QA pass — 10 bugs cerrados; pipeline de costo refleja spend real del LLM
- **v2.5.7**: ciclo de vida per-stage de Beads tasks — cada agente crea+cierra sus propias tasks vía `scripts/phase-task.sh`
- **v2.5.6**: 6 fixes de UX tras dogfooding en Cursor
- **v2.5.5**: fix crítico — `/inbox` y `/digest` "Prompt is too long"
- **v2.5.4**: detección env-var-first del host (`$CLAUDECODE` / `$CODEX_SESSION` / `$CURSOR_TRACE_ID` / …)
- **v2.5.1**: fix crítico — `scan`/`ci` perdían findings en paths relativos

### v2.5.0 — webhooks de producción + MCP SSE + reportes + Cursor extension (mayo 2026)
- Receiver de webhook verificado por HMAC: GitHub / Sentry / generic (`great-cto serve`)
- Dispatcher outbound con backoff exponencial + DLQ → Slack / Discord / PagerDuty
- Modo MCP SSE para uso multi-cliente / remoto
- Reportes HTML/JSON de costo+compliance (`great-cto report cost --period 30d`)
- Scaffold de Cursor extension en `packages/cursor-ext/` — vsce-ready

### v2.4.0 — soporte multi-plataforma: Codex, Cursor, Aider, Continue (mayo 2026)
- `great-cto adapt --platform [claude|codex|cursor|aider|continue|all]` — fuente única de verdad → configs nativos de la plataforma
- `great-cto mcp` — servidor MCP (stdio + SSE) que expone 5 herramientas a cualquier host MCP
- `great-cto ci` — CI gate de comando único (scan + archetype check + GitHub Actions annotations + SARIF + JUnit XML)
- `great-cto serve` — scaffolding de webhook receiver

### v2.3.0 — gestión de workforce de agentes (mayo 2026)
- `/agent-review [name]` — scorecard de rendimiento para agentes LLM (verdicts, cost, failure modes, sugerencias de tuning de prompt)
- `/agent-retire <name>` — descontinuación elegante de agente (archiva prompt, elimina de la sync list, preserva verdicts para auditoría)
- `/cost feature <slug>` — ROI por feature entregada (breakdown per-agent + comparación con humano)
- Nuevo posicionamiento: GreatCTO es la capa de gestión entre tú y tu flota de agentes IA

### v2.2.0 — 3 nuevos arquetipos: edtech, gov-public, insurance (mayo 2026)
- `edtech` + `edtech-reviewer` — COPPA/FERPA/GDPR-K + WCAG 2.2 AA + leyes estatales de privacidad estudiantil de EE.UU.
- `gov-public` + `gov-reviewer` — FedRAMP, NIST 800-53, Section 508, PIA, CJIS, StateRAMP
- `insurance` + `insurance-reviewer` — NAIC 50-state filing, Solvency II, IFRS 17, ACORD, ASOP 41/56

### v2.1.0 — escáner de seguridad integrado (mayo 2026)
- `npx great-cto scan ./` — OWASP LLM Top 10 + 24 reglas + SARIF para GitHub Code Scanning
- 5 escáneres: prompt-injection · secrets-in-prompts · SSRF-in-tools · RAG poisoning · cost-runaway
- Fusionado desde el paquete independiente `@great-cto/agentshield` — una instalación, una versión

### v1.2.0 — bucle de aprendizaje continuo (mayo 2026)
- Nuevo agente `continuous-learner` (Haiku, ~$0.05/ejecución) extrae patrones de sesión automáticamente
- Memoria de dos niveles: `lessons.md` local del proyecto → `~/.great_cto/decisions.md` entre proyectos
- Filtros de calidad: máx 3 lecciones por sesión, etiquetadas por arquetipo, promoción por umbral (≥3 proyectos distintos)

### v1.1.0 — hooks de Claude Code (mayo 2026)
- 4 nuevos hooks: `secret-scan` (PreToolUse) · `format-check` (PostToolUse) · `cost-guard` (UserPromptSubmit) · `session-end`
- Catálogo de 13 patrones para detección de secretos (AWS, Stripe, GitHub, OpenAI, Anthropic, PEM, JWT)
- Todos los hooks soportan opt-out vía `GREAT_CTO_DISABLE_<NAME>=1`

[Changelog completo →](../../CHANGELOG.md)

## ¿Qué es great_cto?

great_cto es un [plugin de Claude Code](https://claude.com/plugins) que ejecuta el pipeline completo SDLC como **30 agentes especialistas** — arquitecto, planificación, implementación, revisión de 12 ángulos, QA, seguridad, deploy, soporte — coordinados a través de un board que realmente revisas. Tomas dos decisiones por feature; todo lo demás es automático.

| Capa | Qué hace |
|------|----------|
| **33 especialistas** | architect · pm · senior-dev · code-reviewer · qa-engineer · security-officer · devops · l3-support · performance-engineer · ai-prompt-architect · ai-eval-engineer · ai-security-reviewer · pci-reviewer · regulated-reviewer · oracle-reviewer · firmware-reviewer · web-store-reviewer · db-migration-reviewer · mobile-store-reviewer · library-reviewer · infra-reviewer · cli-reviewer · game-reviewer · data-platform-reviewer · devtools-reviewer · enterprise-saas-reviewer · mlops-reviewer · streaming-reviewer · marketplace-reviewer · cms-reviewer · edtech-reviewer · gov-reviewer · insurance-reviewer · continuous-learner |
| **25 arquetipos** | web-service · agent-product · ai-system · mlops · commerce · marketplace · fintech · healthcare · mobile-app · cli-tool · library · browser-extension · game · web3 · iot-embedded · data-platform · streaming · devtools · infra · cms · enterprise-saas · regulated · edtech · gov-public · insurance |
| **Auto-detectado** | Escanea `package.json`, `pyproject.toml`, `Cargo.toml`, README, estructura de código → elige arquetipo + gates de compliance en 2 seg. Segunda opinión de Anthropic Haiku (~$0.001) cuando la confianza es baja. |
| **Compliance** | EU AI Act · OWASP LLM Top 10 · PCI-DSS · SOX · KYC/AML · HIPAA · HITECH · GDPR · ISO27001 · ETSI EN 303 645 · COPPA · SOC2 — adjuntado automáticamente por arquetipo. |
| **Memoria** | 4 capas — `PROJECT.md` (arquetipo) · `lessons.md` (retros por proyecto) · `~/.great_cto/decisions.md` (cada aprobación de gate, consultable entre proyectos) · `verdicts/` (cada veredicto de agente). |
| **Board** | `great-cto board` abre 6 vistas en `localhost:3141` — Inbox · Kanban · Metrics · Agents · Memory · Reporte público. Updates en vivo vía SSE. |

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto kanban — 5 columnas, aprobación de gates inline, SSE en vivo" width="900" />
</p>

## Dos decisiones por feature

```
Tú:  /start "agregar suscripciones de Stripe — planes mensuales y anuales"

great_cto:
  → arquetipo: commerce | escala: standard | ~45min
  → compliance: pci-dss + gdpr (auto-adjuntado)
  → ARCH-stripe-subscriptions.md listo  →  DECISIÓN 1: ¿apruebas la arquitectura?

Tú: "aprobado"

  → senior-dev → revisión de 12 ángulos → qa-engineer → security-officer → devops
  → 412 tests verdes · 0 highs · canary listo
  → DECISIÓN 2: ¿hacer ship?

Tú: "ship it"  →  canary 5% → 20% → 100%  →  doc RELEASE escrito
```

## Instalación rápida

```bash
npx great-cto init
```

El CLI escanea tu repo, elige el arquetipo correcto, conecta gates de compliance automáticamente. Funciona en proyectos nuevos o existentes. Reinicia Claude Code después.

**Requiere:** [Claude Code](https://claude.com/claude-code) · Node 18.17+ · [Beads](https://github.com/steveyegge/beads) · [Superpowers](https://github.com/obra/superpowers)

## El board que realmente revisarás

```bash
great-cto board   # localhost:3141
```

Seis vistas, capturas reales — ver [greatcto.systems#board](https://greatcto.systems#board).

| Vista | Qué hay |
|-------|---------|
| **Inbox** | Tarjeta de retomar · Decisiones pendientes · P0 abiertas · Bloqueadas · Estancadas (en progreso > 48h) |
| **Kanban** | 5 columnas · aprobar/rechazar gates inline · barra de filtro · búsqueda ⌘K · navegación `j`/`k` |
| **Metrics** | Tarjetas hero (velocidad, costo, MTTR) · gráfica de gasto LLM 30 días con alertas de presupuesto |
| **Agents** | Tiempo por agente, costo LLM, equivalente humano a $150/h · feed de actividad |
| **Memory** | Browser de 4 capas: PROJECT.md · lessons.md · decisions.md · verdicts/ |
| **Reporte público** | Toggle → URL no-adivinable con tareas enviadas, comparación de costo AI vs humano. Sin código, sin credenciales. |

Selector multi-proyecto — un board, todos los clientes. El log de decisiones entre proyectos encuentra *"¿hemos resuelto esto antes?"* en todos tus repos.

## Tres comandos que usas todos los días

| Comando | Qué hace |
|---------|----------|
| `/start "descripción"` | Ejecuta el pipeline SDLC completo — detecta arquetipo, genera doc de arquitectura, implementa con TDD, revisa, QA, seguridad, deploya |
| `/review` | 12 ángulos independientes de code-review en la rama actual |
| `/inbox` | Gates abiertos, tareas bloqueadas, incidentes P0, alertas de seguridad — todo lo que necesita tu decisión ahora |

Todo lo demás (`/audit` · `/digest` · `/sec` · `/cost` · `/release` · `/crystallize`) corre automáticamente o solo cuando lo necesitas. Ver [`docs/COMMANDS.md`](../COMMANDS.md) para referencia completa.

## 25 arquetipos auto-detectados

Cada arquetipo activa sus propios agentes especialistas y checklists de compliance.

| Arquetipo | Tier por defecto | Especialistas auto-cargados | Compliance |
|-----------|------------------|------------------------------|------------|
| `web-service` | baseline | — | gdpr · owasp-api-top-10 |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act · owasp-llm-top-10 |
| `ai-system` | **standard** | ai-prompt-architect · ai-eval-engineer · ai-security-reviewer | eu-ai-act |
| `mlops` | **deep** | mlops-reviewer · ai-eval-engineer | eu-ai-act · nist-ai-rmf · iso42001 |
| `commerce` | standard | pci-reviewer | pci-dss · gdpr · sca-psd2 |
| `marketplace` | **deep** | marketplace-reviewer · pci-reviewer | pci-dss · kyc-aml · dsa-eu · 1099-k · ofac |
| `fintech` | **deep** | pci-reviewer · regulated-reviewer | pci-dss · sox · kyc-aml · gdpr · dora |
| `healthcare` | **deep** | regulated-reviewer | hipaa · hitech · gdpr |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
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
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `regulated` | **deep** | regulated-reviewer | soc2 · hipaa · sox · dora · nis2 · iso27001 |
| `edtech` | **deep** | edtech-reviewer | coppa · ferpa · gdpr-k · wcag-2.2-aa · section-508 · sopipa-ca |
| `gov-public` | **deep** | gov-reviewer | fedramp · nist-800-53 · fisma · section-508 · pia · ato · cjis · stateramp |
| `insurance` | **deep** | insurance-reviewer | naic · solvency-ii · ifrs-17 · gdpr · ccpa · anti-discrimination-pricing · actuarial-asops |

Override en cualquier momento: `npx great-cto init --archetype <name>` o edita `.great_cto/PROJECT.md`. El CLI también ofrece segunda opinión de Anthropic Haiku (~$0.001) cuando la confianza heurística es baja — configura `ANTHROPIC_API_KEY` para activar, opt-out con `--no-llm`.

## ¿Qué lo hace diferente?

No somos un editor — orquestamos el proceso alrededor de tu editor. Usa Cursor, Copilot o Claude Code dentro del loop si quieres.

| | great_cto | Cursor | Copilot Workspace | Claude Projects |
|---|---|---|---|---|
| Pipeline SDLC multi-agente | ✓ 33 especialistas | ✕ | ✕ | ✕ |
| Auto-detección de arquetipo | ✓ 25 tipos | ✕ | ✕ | ✕ |
| Gates de compliance (PCI / HIPAA / SOX / EU AI Act) | ✓ | ✕ | ✕ | ✕ |
| Memoria persistente | ✓ decisions.md + verdicts | ⚠ solo chat | ✕ | ✓ scope chat |
| Vista multi-proyecto | ✓ | ✕ | ✕ | ⚠ |
| Code-review de 12 ángulos | ✓ | ⚠ una pasada | ⚠ una pasada | ✕ |
| Reportes públicos compartibles | ✓ | ✕ | ✕ | ✕ |
| Open source | ✓ MIT | ✕ | ✕ | ✕ |
| Corre localmente | ✓ | ⚠ parcial | ✕ | ✕ |
| Pagas tu propia API | ✓ | ✕ | ✕ | ✕ |
| **Precio** | **$0 + tu API** | $20/mes | $39/mes | $20/mes |

## Costo

```
~$34/mes para un equipo de producto típico — 20 ejecuciones de pipeline/mes, indicativo.
```

| Pipeline | Costo/ejecución | Ejecuciones/mes | Total |
|----------|-----------------|-----------------|-------|
| quick (config / typo) | $0.10 | 10 | $1 |
| quick (nuevo endpoint) | $1 | 6 | $6 |
| standard (feature) | $5 | 3 | $15 |
| deep (cross-cutting) | $12 | 1 | $12 |
| | | | **~$34** |

Pagas tus propios tokens de Anthropic API. **Sin tarifa por asiento. Sin lock-in SaaS.** El triage rutinario se rutea automáticamente a Kimi K2 (equivalente a Sonnet a ~5× menor costo) → 60–80% reducción de costo en clustering de logs y stack traces ruidosos.

## FAQ

**¿Funciona sin conexión a internet?**
Los agentes corren localmente como sub-agentes de Claude Code. Solo las llamadas a Claude API llegan a Anthropic. Ningún código, telemetría o memoria se envía a ningún otro lado.

**¿Mi código fuente se usa para entrenar modelos?**
No. Claude API es zero-retention por defecto para clientes de pago. great_cto no agrega nada — tu código sigue siendo tuyo.

**¿Y si ya tengo CI/CD?**
great_cto corre *antes* de CI. Detecta problemas en arquitectura, revisión y pre-merge. Usa ambos — son complementarios, no competidores.

**¿Soporte para Cursor / Copilot / Aider?**
Actualmente solo Claude Code. El soporte cross-harness (basado en `AGENTS.md`) está en el roadmap de v2.x.

**¿Puedo desactivar los hooks si me estorban?**
Cada hook respeta variables de entorno `GREAT_CTO_DISABLE_<NAME>=1` (ej. `GREAT_CTO_DISABLE_SECRET_SCAN=1`). Opt-out por archivo vía `// agentshield:ignore` para escaneos de seguridad.

**¿Cómo mantienen los costos de tokens bajos?**
Tres capas — (1) Haiku por defecto para agentes baratos, (2) [Kimi K2 router](https://github.com/avelikiy/great_cto/blob/main/agents/llm-router.md) para triage (60-80% ahorros), (3) hook `cost-guard` advierte antes de prompts caros. Ver `/cost` para gasto en vivo.

**¿Qué pasa con mis datos al desinstalar?**
El estado del plugin vive en `~/.great_cto/` (decisiones globales) y `.great_cto/` (por proyecto). Ambos son markdown plano — `rm -rf` limpia todo. Sin servicios externos que desautorizar.

**¿Por qué no auto-pilot? ¿Por qué "dos decisiones por feature"?**
Los LLMs son potentes pero pierden criterio de producto en specs ambiguos. Mantener un humano en gate:plan y gate:ship atrapa el 5% de malas decisiones que cuentan por el 95% del costo. Ver [ADR-015 — Arquitectura del bucle de aprendizaje](../architecture/ADR-015-learning-loop-architecture.md).

## Autor

[avelikiy](https://github.com/avelikiy) — Chief AI & Technology Officer / Founder. CTO construyendo plataformas AI-native de trading y fintech (0→1, 1→N). Especializado en sistemas financieros de alta carga donde la tecnología impacta directamente PnL, riesgo y unit economics.

## ⭐ Dale star a este repo

Si great_cto te ahorró tiempo en algún proyecto, dale star — ayuda a otros founders solos y equipos pequeños a encontrarlo.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

## 💬 Comunidad y soporte

| Canal | Qué |
|-------|-----|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, requests de features, propuestas de arquetipos |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Preguntas, compartir patrones, show & tell |
| 📝 [Blog](https://velikiy.hashnode.dev) | Análisis profundos de arquitectura, bucle de aprendizaje, calibración de costo |
| 🐦 [@Greatcto on Hashnode](https://hashnode.com/@Greatcto) | Notas de release, artículos, serie AI-CTO |
| 📦 [npm](https://www.npmjs.com/package/great-cto) · [JSR](https://jsr.io/@avelikiy/great-cto) | Registries de paquetes |
| 🔒 [Security](../../SECURITY.md) | Disclosure responsable de CVEs en hooks/scanner |

## Roadmap

- **v2.2** — telemetría de calidad de lecciones
- **v2.3** — auto-promoción: decisiones de alto impacto → skills reutilizables
- **v3.0** — soporte cross-harness (`AGENTS.md` para Cursor / Codex / OpenCode / Gemini)

## Licencia

MIT — ver [LICENSE](../../LICENSE).

---

<div align="center">

**Construido por [@avelikiy](https://github.com/avelikiy) · [@Greatcto on Hashnode](https://hashnode.com/@Greatcto)**
*Deja de ser la única persona que puede hacer release.*

</div>
