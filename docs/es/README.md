> ⚠️ **This translation is being updated.** GreatCTO has repositioned to an **AI Product Builder** — describe a product, approve the spec, ship the software (one CTO gate, maximum automation). For the current positioning see the [English README](../../README.md). The text below reflects the previous "AI autopilots" direction.

<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Autopilotos de IA para empresas — consigue que el trabajo se haga, no solo el software.**

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

[Sitio web](https://greatcto.systems) · [Una ejecución real →](https://greatcto.systems/proof) · [Demo en vivo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discusiones](https://github.com/avelikiy/great_cto/discussions) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## Los servicios son el nuevo software

La próxima ola no son herramientas para especialistas, son **autopilotos que venden el resultado de un servicio**.
Un autopiloto ejecuta toda una función de negocio de principio a fin (recepción → procesamiento → decisión → entrega) y
escala solo las decisiones de criterio a un humano cualificado. Cada mejora del modelo hace que el servicio sea
más rápido y más barato.

GreatCTO entrega esos autopilotos — cada uno un **flujo de agentes + herramientas con un humano en los
pasos de riesgo**, un revisor de cumplimiento integrado y **conectores en vivo** que ejecutan cada flujo con datos reales.

## Los autopilotos

| Autopiloto | Qué hace | Mercado | Quién lo está construyendo |
|---|---|---|---|
| 🩺 **[Codificación médica](https://greatcto.systems/autopilots/rcm.html)** | Notas clínicas → reclamaciones limpias y conformes; un codificador certificado firma las arriesgadas | $50–80B | Anterior · CodaMetrix · Fathom |
| 🖥️ **[TI gestionada](https://greatcto.systems/autopilots/msp.html)** | Parches, configuraciones y accesos en toda la flota — escalonados, reversibles, con un humano en los cambios grandes | $100B+ | Serval · Edra · Electric AI |
| ⚖️ **[Documentos legales](https://greatcto.systems/autopilots/legaltech.html)** | Redacta y revisa contratos y NDAs; un abogado colegiado firma todo lo que sea asesoramiento | $20–25B | Crosby · Harvey · Robin AI |
| 📒 **[Contabilidad y cierre](https://greatcto.systems/autopilots/accounting.html)** | Registra, concilia y cierra el mes; un controller firma el cierre | $50–80B | Rillet · Basis · Digits |
| 🧾 **[Preparación de impuestos](https://greatcto.systems/autopilots/tax.html)** | Prepara declaraciones y clasifica posiciones; un preparador acreditado firma antes de presentar | $30–35B | Black Ore · April · Column Tax |
| 🛒 **[De la fuente al pago](https://greatcto.systems/autopilots/procurement.html)** | Incorpora proveedores, concilia facturas, libera pagos — filtrados contra sanciones y fraude | $200B+ | Tacto · Zip · AskLio |

→ [Todos los autopilotos](https://greatcto.systems/autopilots.html) · ejecuta `/flow <vertical>` para ver cualquier flujo en tu terminal

**Cada autopiloto mantiene a un humano en las decisiones de criterio** — un codificador certificado, un abogado colegiado, un
controller, un preparador acreditado. El autopiloto hace el volumen; el humano es dueño de la decisión que
conlleva responsabilidad. **9 conectores en vivo se ejecutan en los seis autopilotos** — FHIR, ICD-10 (NLM),
NCCI/MUE, X12 837P, DocuSign, Plaid, OFAC, despliegue escalonado y un motor fiscal federal de EE. UU. Son
keyless por defecto (fuente pública o generación real determinista) y hacen POST al proveedor real
en el momento en que añades credenciales.

## Bajo el capó (para el CTO que lo opera)

Cada autopiloto se construye y opera mediante una pipeline con compuertas de agentes especialistas — arquitecto, revisor
de 12 ángulos, QA, oficial de seguridad, devops — ajustados a tu stack y jurisdicción. **Tomas dos
decisiones por funcionalidad; todo lo demás se ejecuta automáticamente.** El revisor de cumplimiento, las compuertas humanas
firmadas, el registro de auditoría y los conectores en vivo son la capa de confianza que hace seguro dejar que el autopiloto
se ejecute.

## En cifras

| | |
|---|---|
| Coste de LLM (una funcionalidad real, trazada) | **$2.39** |
| Equivalente humano para el mismo trabajo | **~$5,460** |
| Defectos detectados que QA había pasado por alto | **2** |
| Coste mensual (20 ejecuciones de pipeline) | **~$34** |
| Agentes especialistas | **61** |
| Arquetipos detectados automáticamente | **26** |
| Jurisdicciones | **12** (GDPR · HIPAA · PCI-DSS · SOX · y más) |

→ [Traza completa con todos los artefactos](https://greatcto.systems/proof)

## Cómo funciona

**`npx great-cto init`** — analiza tu stack y README, detecta la jurisdicción (¿GDPR? ¿HIPAA? ¿PCI?), escribe `.great_cto/FLOW.md` con los agentes, compuertas y marcos de cumplimiento exactos para tu proyecto.

**`/start "describe la funcionalidad"`** — los críticos revisan la arquitectura y la especificación antes de escribir cualquier código. Tú revisas el plan en `gate:plan`.

**Los agentes se ejecutan automáticamente** — senior-dev implementa con TDD, revisión de 12 ángulos, QA, seguridad, devops. Tú apruebas el envío en `gate:ship`.

## Tres proyectos — tres pipelines diferentes

El mismo comando. La salida depende de qué estás construyendo y dónde se ejecuta:

| | **Startup fintech · UE** | **Portal sanitario · EE. UU.** | **Herramienta CLI** |
|---|---|---|---|
| Agentes especialistas | `pci-reviewer` · `gdpr-reviewer` · `regulated-reviewer` | `fda-reviewer` · `healthcare-reviewer` · `security-officer` | `cli-reviewer` |
| Compuertas humanas | `gate:gdpr-dpia` · `gate:plan` · `gate:ship` | `gate:clinical-validation` · `gate:plan` · `gate:ship` | `gate:plan` |
| Cumplimiento | GDPR · PCI-DSS · SOX | HIPAA · HITECH | — |
| Coste / ciclo | ~$8–18 | ~$8–18 | ~$0.5–3 |

→ Prueba el selector interactivo: [greatcto.systems/#flow-picker](https://greatcto.systems/#flow-picker)

## El dashboard que realmente vas a revisar

`great-cto board` se abre en `http://localhost:3141` — Kanban con SSE en tiempo real, mosaico de coste por agente, estado de la pipeline, gasto de LLM de 30 días frente a la línea base de equivalente humano.

<p align="center">
  <img src="../screenshots/board.png" alt="Kanban board with realtime SSE updates" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="../screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — cost, velocity, savings_x" width="100%" /></a><br/><sub><b>Métricas</b> — coste de LLM, línea base de equivalente humano, ratio savings_x</sub></td>
<td width="50%"><a href="../screenshots/inbox.png"><img src="../screenshots/inbox.png" alt="Inbox — gates, P0, blocked, stale" width="100%" /></a><br/><sub><b>Bandeja de entrada</b> — compuertas pendientes, incidentes P0, tareas bloqueadas, en progreso obsoletas</sub></td>
</tr>
<tr>
<td width="50%"><a href="../screenshots/agents.png"><img src="../screenshots/agents.png" alt="Agent fleet — 61 specialists with run counts" width="100%" /></a><br/><sub><b>Agentes</b> — 61 especialistas con último uso + recuento de ejecuciones</sub></td>
<td width="50%"><a href="../screenshots/memory.png"><img src="../screenshots/memory.png" alt="Memory layers and crystallized patterns" width="100%" /></a><br/><sub><b>Memoria</b> — 11 capas + patrones de incidentes cristalizados</sub></td>
</tr>
</table>

**Diseñado para la organización de ingeniería de una sola persona.** Indie hackers, fundadores en solitario, CTOs técnicos que lo gestionan todo ellos mismos — en Claude Code u OpenAI Codex. *No para equipos* — ver [FAQ](../FAQ.md#is-great_cto-for-teams).

## Instalación

```bash
npx great-cto init
```

Reinicia tu host de IA tras el init. **Requiere:** Node 18.17+ y uno de:

| Host | Flag de instalación | Estado |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) | _(por defecto)_ | ✅ soporte completo |
| [OpenAI Codex](https://openai.com/codex) | `--host codex` | ✅ hooks + MCP + agentes |

```bash
# Claude Code (por defecto)
npx great-cto init

# OpenAI Codex Desktop / CLI
npx great-cto init --host codex
```

Los plugins complementarios Superpowers y Beads se instalan automáticamente — no se necesita configuración manual.

---

<details>
<summary>📖 Documentación completa — dos compuertas · críticos · 61 agentes · 26 arquetipos · 12 jurisdicciones · 45+ marcos de cumplimiento · board · coste · MCP</summary>

## Dos decisiones por funcionalidad

```
🟡 gate:plan   ←  tú decides aquí (arquitectura + tareas + coste)
   ↓
🤖 senior-dev → revisión de 12 ángulos → qa-engineer → security-officer → devops
   ↓
🟢 gate:ship   ←  tú decides aquí (PR listo, seguridad aprobada)
```

Arquitectos, planificadores, revisores, QA, seguridad y DevOps se ejecutan automáticamente entre esos dos puntos de control humanos. **La memoria persiste** entre sesiones: cada veredicto de compuerta se añade a `~/.great_cto/decisions.md`, cada retrospectiva se añade al `lessons.md` por proyecto, y `/crystallize` promueve los patrones de alto impacto a una biblioteca global que los agentes consultan antes de volver a resolver.

## Críticos antes del plan

Los bugs más caros no están en el código — están en las decisiones tomadas antes de empezar a programar. Tres agentes críticos se ejecutan antes de la etapa de Plan, en las tres posiciones donde un error cuesta más:

| Crítico | Qué detecta |
|---|---|
| **Crítico de arquitectura** | Acoplamiento que descarta la multitenencia más adelante · O(n²) "obvio" sobre datos a escala real · dependencias circulares entre contextos delimitados |
| **Crítico de especificación** | "Resolvimos el problema equivocado" — la peor clase de bug, porque ninguna prueba unitaria lo detectará · criterios de aceptación desalineados · alcance que nunca se acordó |
| **Crítico de esquema** | `NOT NULL` sin un valor por defecto en una tabla de 50M filas (deadlock 10 min después del despliegue) · falta `CONCURRENTLY` en la creación de índices · migraciones irreversibles sin ruta de rollback |

Antes los críticos solo se activaban a partir de Plan. Ahora la pipeline detecta errores a nivel de arquitectura y especificación antes de que comience la implementación — cuando revertir cuesta horas, no días.

## Cómo se compara great_cto

|  | **great_cto** | Devin | Claude Code (solo) |
|---|---|---|---|
| Código abierto | ✅ MIT | ❌ cerrado | ❌ modelo de plugin cerrado |
| Self-host | ✅ se ejecuta localmente | ❌ nube de Cognition | ✅ |
| Host | ✅ Claude Code + Codex | ❌ nube de Cognition | ✅ Claude Code |
| BYOK / multimodelo | ✅ Claude Code · Codex | ❌ propietario | ❌ solo Anthropic |
| Agentes especialistas | **57** (arquitecto · PM · revisión de 12 ángulos · QA · seguridad · devops · 42 revisores entre arquetipos, packs y jurisdicciones) | 1 generalista | 1 generalista |
| Orquestación del SDLC | arquitecto → plan → impl → revisión → QA → seguridad → devops | autonomía de un solo paso | bucle de edición |
| Compuertas humanas | ✅ 2 por funcionalidad (plan + ship) | ❌ ninguna | ❌ |
| Memoria entre sesiones | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ solo hilo | ⚠️ solo hilo |
| Seguimiento de costes | ✅ por agente + historial de 30 días + savings_x | ❌ | ❌ |
| Marcos de cumplimiento | ✅ 33+ (PCI · HIPAA · SOX · GDPR · CCPA · DPDPA · EU AI Act · FDA SaMD · COPPA · FERPA · FedRAMP · NAIC · …) | ❌ | ❌ |
| Precio | gratis (pagas a tu proveedor de LLM) | $500/mes | $20/mes |
| Configuración | `npx great-cto init` | registrarse | instalar CLI |

great_cto **no** es otro bucle de agente de programación — es la **capa de orquestación por encima** del agente de programación que ya usas. Piénsalo como un "equipo de especialistas que revisa y pone compuertas al trabajo" en lugar de "otro asistente que escribe código".

## Detección de jurisdicción

`npx great-cto init` analiza tres fuentes de señales — palabras clave del README, cadenas de región de infraestructura (Terraform, `.env` `AWS_REGION=`, docker-compose `TZ=`) y el TLD del homepage de `package.json` — y detecta automáticamente cuáles de **12 jurisdicciones** aplican:

| Jurisdicción | Señales (README + infra) | Marcos | Revisor |
|---|---|---|---|
| `eu` | gdpr · eu users · nis2 · eu ai act · `eu-west-*` · TLD `.de` | GDPR · EU AI Act · NIS2 · ePrivacy | `gdpr-reviewer` |
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

La coincidencia por límites de palabra evita falsos positivos (`"india"` no coincide con `"indiana"`). La jurisdicción detectada se escribe en `PROJECT.md` como `jurisdiction: [eu, us-ca]` y activa la compuerta del revisor apropiado en cada funcionalidad. Sobrescribe manualmente:

```yaml
jurisdiction: [eu, us-ca]
```

## Tres comandos que usas cada día

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

Además: `/audit` (escaneo de código base existente), `/cost` (ahorros del router de LLM), `/sec` (paraguas de seguridad), `/oncall`, `/release`, `/rfc`. Lista completa: `~/.claude/commands/` tras la instalación.

## Coste

```
~$34/mes para un proyecto típico de un solo CTO — 20 ejecuciones de pipeline/mes, indicativo.
```

| Pipeline | Coste/ejecución | Ejecuciones/mes | Total |
|---|---|---|---|
| rápido (config / typo) | $0.10 | 10 | $1 |
| rápido (nuevo endpoint) | $1 | 6 | $6 |
| estándar (funcionalidad) | $5 | 3 | $15 |
| profundo (transversal) | $12 | 1 | $12 |
| | | | **~$34** |

Pagas tus propios tokens de la API de Anthropic. **Sin tarifa por puesto. Sin lock-in de SaaS.** El triaje rutinario se enruta automáticamente a Kimi K2 (equivalente a Sonnet a un coste ~5× menor) → reducción del 60–80% en la agrupación de logs.

## 26 arquetipos detectados automáticamente

Cada arquetipo activa sus propios agentes especialistas y listas de comprobación de cumplimiento. Los 7 principales:

| Arquetipo | Nivel | Agentes especialistas | Cumplimiento |
|---|---|---|---|
| `enterprise-saas` | **deep** | enterprise-saas-reviewer | soc2-type-2 · iso27001 · gdpr · ccpa |
| `agent-product` | **deep** | ai-prompt-architect · ai-eval · ai-security | eu-ai-act · owasp-llm-top-10 |
| `fintech` | **deep** | pci · regulated | pci-dss · sox · kyc-aml · gdpr · dora |
| `mlops` | **deep** | mlops-reviewer · ai-eval | eu-ai-act · nist-ai-rmf · iso42001 |
| `library` | baseline | library-reviewer | openssf · sbom |
| `cli-tool` | baseline | cli-reviewer | — |
| `mobile-app` | standard | mobile-store-reviewer | store-policy · gdpr |
| `defense-govcon` | **deep** | cmmc-reviewer · gov-reviewer | cmmc-2.0 · nist-800-171 · dfars · itar · section-889 |

Tabla completa (26 arquetipos) + cómo funciona la detección: [docs/ARCHETYPES.md](../ARCHETYPES.md).

**Cobertura profunda de EE. UU.** — más allá de GDPR/PCI/HIPAA, great_cto ahora revisa contra la divulgación cibernética de la SEC (8-K Item 1.05), CMMC 2.0 / NIST 800-171 para contratistas de defensa, gobernanza de IA de EE. UU. (NIST AI RMF · Colorado SB 205 · Utah/Texas AI), litigios sobre rastreo web (VPPA · CIPA · Washington MHMDA) y riesgo de modelos HMDA / SR 11-7 para préstamos.

## 14 packs de dominio — revisores superpuestos

Los packs de dominio se montan **encima de** los arquetipos. Se adjuntan automáticamente cuando la CLI detecta señales específicas del pack (dependencias, términos del README). Cada pack añade sus propios revisores, plantilla de modelo de amenazas, suite EVAL y compuertas humanas — independientemente del arquetipo base.

| Categoría | Packs |
|---|---|
| **Verticales de IA** | `voice-pack` · `clinical-pack` · `hr-ai-pack` · `drug-discovery-pack` |
| **Salud digital** | `digital-health-pack` _(telemetría de wearables · IA de salud mental · IA de nutrición · médico HITL)_ |
| **Fintech / regulado** | `lending-pack` · `em-fintech-pack` |
| **Alto cumplimiento** | `clinical-trials-pack` · `climate-pack` |
| **Ingeniería** | `api-platform-pack` · `robotics-pack` |
| **Mercado de EE. UU.** | `sec-cyber-pack` _(divulgación SEC 8-K)_ · `adtech-privacy-pack` _(VPPA · CIPA · MHMDA)_ · `us-ai-pack` _(NIST AI RMF · Colorado SB 205)_ |

→ **28 tipos de compuerta humana** + 53 suites EVAL de referencia + 15 plantillas TM. Explora los 14 packs con **visualización de recorrido de 4 capas** (arquetipo → pack → revisor → compuerta): [greatcto.systems/packs.html](https://greatcto.systems/packs.html).

## Una ejecución real, totalmente trazada

Una funcionalidad de CLI en Python enviada a través de la pipeline completa: **$2.39 de gasto en LLM** frente a ~$5,460 de equivalente humano. Seguridad detectó dos defectos reales que QA había aprobado (`list(stream_csv())` anuló el streaming → 14.5 MB de RSS pico sobre una entrada de 13 MB). El modelo multirrevisor detecta lo que los agentes individuales pasan por alto, antes del merge.

Traza completa + artefactos: [greatcto.systems/proof](https://greatcto.systems/proof) · raw: [`docs/qa/runs/2026-05-09/E2E-CLI-PIPELINE.md`](../qa/runs/2026-05-09/E2E-CLI-PIPELINE.md).

## Integración con CI

Incorpóralo a cualquier workflow de GitHub Actions:

```yaml
- run: npx great-cto@latest ci ./ --sarif results.sarif
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with: { sarif_file: results.sarif }
```

`great-cto ci` detecta automáticamente `$GITHUB_ACTIONS` y emite anotaciones `::error file=...,line=N::` directamente en los diffs de PR. Códigos de salida: 0 limpio / 1 hallazgos / 2 error de configuración.

## Pirámide de pruebas

Suite de pruebas por capas — **el nivel estructural + máquina de estados se ejecuta en <2 min por $0** (`node --test tests/*.test.mjs`); el nivel de LLM real (26 arquetipos × 4-8 etapas + 14 packs + 13 revisores) se ejecuta bajo demanda vía OpenRouter por ~$5–10. Desglose completo: [docs/testing/](../testing/).

## MCP

Servidor [MCP](https://modelcontextprotocol.io/) nativo — **7 herramientas** invocables desde Claude Desktop, Codex o cualquier host MCP. Local (sin necesidad de board): `detect_archetype` · `estimate_cost` · `query_decisions`. Respaldado por board: `project_status` · `cost_summary` · `pipeline_stages` · `recent_verdicts`.

```json
{ "mcpServers": { "great-cto": { "command": "npx", "args": ["-y", "great-cto@latest", "mcp"] } } }
```

Configuración completa + MCPs internos (Grafana, router de LLM, Beads): [docs/MCP.md](../MCP.md).

## Alertas por email (cero configuración)

Cinco cosas que requieren que actúes en <2h se envían por email automáticamente — incluso cuando estás lejos del board:

| Disparador | Cuándo |
|---|---|
| 🚨 **Incidente P0** | Se abre una tarea P0 en cualquier proyecto |
| ⏸️ **Compuerta obsoleta > 2h** | Un `gate:ship` lleva horas esperándote |
| 🛡️ **Seguridad BLOQUEADA** | `security-officer` rechazó un merge |
| 💸 **Alerta de presupuesto** | El gasto mensual de LLM supera el 80% / 100% del presupuesto |
| 📊 **Resumen semanal** | Viernes 09:00 — enviado, gastado, ahorros, QA |

**Configuración**: board → pestaña **Notifications** → introduce email → introduce el código de 6 dígitos que enviamos → elige disparadores. Sin registro en Resend, sin claves de API — la entrega se enruta a través de `greatcto.systems/notify` (gratis, 100 emails/24h por email verificado).

## Limitaciones y no-objetivos

- **No para equipos** — el CTO en solitario es el producto. ¿2+ ingenieros? Lo has superado.
- **No es un reemplazo para ingenieros senior** — codifica el proceso; no toma decisiones de criterio arquitectónico sin uno.
- **No es un sistema CI/CD** — las compuertas se ejecutan localmente / en sesión. Aún necesitas GitHub Actions para el merge real.
- **No está auditado para certificación** — los andamiajes de arquetipo PCI/HIPAA/SOC2 son puntos de partida, no certificaciones.
- **No es determinista** — salidas generadas por LLM. Cada veredicto de compuerta debería verificarse con sentido común.

## FAQ (top 5)

**¿Se usa mi código fuente para entrenar modelos?** No. La API de Claude tiene retención cero por defecto para clientes de pago. great_cto no añade nada.

**¿Cómo mantenéis bajos los costes de tokens?** Haiku por defecto + router Kimi K2 para triaje (60–80% de ahorro) + hook de cost-guard.

**¿Puedo desactivar los hooks?** Cada hook respeta `GREAT_CTO_DISABLE_<NAME>=1`. Opt-out de escaneo de secretos por archivo: `// great_cto:allow-secrets`.

**¿Qué pasa si no estoy en solitario?** great_cto está diseñado para la organización de ingeniería de una sola persona. Si tienes 2+ ingenieros y necesitas boards compartidos / auth multipuesto, lo has superado.

FAQ completa: [docs/FAQ.md](../FAQ.md).

## Documentación

📚 **[Centro de documentación completa →](../README.md)** — organizado por [Diátaxis](https://diataxis.fr/):
**[Primeros pasos](../tutorials/getting-started.md)** · Guías how-to ·
Referencia de [Agentes](../reference/agents.md) y [Comandos](../reference/commands.md) · [Arquitectura](../ARCHITECTURE.md) · [FAQ](../FAQ.md).

## Arquitectura

El plugin se ejecuta dentro de Claude Code (o cualquier host con capacidad MCP); 61 agentes son especificaciones en markdown; las tareas viven en Beads (dolt, git-native); la memoria es markdown plano (sin almacén de vectores). Diagrama + tabla de stack: [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Novedades

**v2.21.0** (mayo 2026) — **UX del Flow Compiler**: `npx great-cto init` ahora imprime un **flujo compilado** con agentes, compuertas, cumplimiento y estimación de coste por ciclo de funcionalidad. Escribe `.great_cto/FLOW.md` — los agentes lo leen para saber exactamente cómo orquestar tu SDLC.

**v2.20.0** (mayo 2026) — **Detección v2**: **cobertura de 12 jurisdicciones** (añadidas CA · JP · CN · KR con marco legal completo + compuertas humanas) · **detección por señales de infraestructura** (cadenas de región de Terraform, `.env` `AWS_REGION=`, docker-compose `TZ=`, TLD del homepage de `package.json`) · **coincidencia por límites de palabra** (no más falsos positivos "india" → "indiana") · **sugerencias de pack** para arquetipos de nicho (`suggestedPacks` muestra los packs robotics/climate/clinical-trials/hr-ai/em-fintech cuando la confianza es baja). Ahorro de tokens: –87.7% por ejecución de pipeline (rediseño de arquitectura de contexto de v2.19.0).

**v2.19.0** (mayo 2026) — **Economía de tokens Fase 1+2**: resúmenes de artefactos (≤250 tokens, autogenerados) + filtro de memoria consciente de la tarea (las top-k entradas relevantes por tarea). –87.7% de tokens por ejecución de pipeline.

**v2.17.0** (mayo 2026) — **los plugins complementarios se instalan automáticamente** · **críticos de Arquitectura / Especificación / Esquema** antes de la etapa de Plan.

[Changelog completo →](../../CHANGELOG.md)

## Hoja de ruta

- **Runner de evals en CI** — ejecutar suites de eval de conjunto dorado en cada PR, detectar regresiones de prompts automáticamente
- **Bucle de automejora** — agentes que aprenden de los veredictos y mejoran sus propios prompts con el tiempo
- **Puntuación de decisiones** — rastrear qué decisiones de compuerta resultaron acertadas; mostrar patrones
- **/crystallize** — promover lecciones de alto impacto a skills reutilizables que toda la pipeline pueda consultar

[Vota la próxima funcionalidad →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## Autor

[avelikiy](https://github.com/avelikiy) — CTO que construye plataformas de trading y fintech nativas de IA (0→1, 1→N). great_cto es el resultado de automatizar mis propios bucles, un agente a la vez. Cada regla apareció en respuesta a un problema real en un sistema de producción real.

## Comunidad

| Canal | Qué |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, solicitudes de funcionalidades, propuestas de arquetipos |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Preguntas, patrones, muestra y cuenta |
| 📝 [Blog](https://velikiy.hashnode.dev) | Análisis profundos de arquitectura |
| 🔒 [SECURITY.md](../../SECURITY.md) | Divulgación responsable |

## Contribuciones y licencia

Los pull requests son bienvenidos — ver [CONTRIBUTING.md](../../CONTRIBUTING.md). Buenos primeros issues: [`good-first-issue`](https://github.com/avelikiy/great_cto/issues?q=is%3Aopen+label%3Agood-first-issue).

MIT — ver [LICENSE](../../LICENSE).

Si great_cto te ahorró tiempo, por favor dale una estrella al repo — ayuda a que otros CTOs en solitario lo encuentren.

[![Star History Chart](https://api.star-history.com/svg?repos=avelikiy/great_cto&type=Date)](https://star-history.com/#avelikiy/great_cto&Date)

---

<div align="center">

**Construido por [@avelikiy](https://github.com/avelikiy)**
*Deja de ser la única persona que puede hacer envíos.*

</div>
