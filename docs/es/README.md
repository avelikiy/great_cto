<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Constructor de Productos con IA — describe un producto, aprueba la especificación, entrega el software.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)](https://claude.com/plugins)
[![Codex](https://img.shields.io/badge/OpenAI_Codex-Supported-412991)](https://openai.com/codex)
[![Savings](https://img.shields.io/badge/one_real_run-1h26m_·_$3.40_vs_~$42K_traditional-darkgreen)](https://greatcto.systems/proof)

```bash
npx great-cto init
```

[Sitio web](https://greatcto.systems) · [Una ejecución real →](https://greatcto.systems/proof) · [Demo en vivo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Discusiones](https://github.com/avelikiy/great_cto/discussions) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](../es/README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

---

## Construye el producto, no solo el código

**Tú describes el producto. great_cto lo entrega.** No un fragmento, no un andamiaje — una aplicación real, desplegada, con un backend, un frontend, pruebas generadas y una URL en vivo. Tomas exactamente **una decisión: aprobar la especificación.** Todo lo posterior — arquitectura, modelo de datos, construcción, revisión, despliegue — corre sin supervisión.

Es un **Constructor de Productos con IA**, no otro bucle de agente de programación. La capa de orquestación *por encima* del agente de programación que ya usas: un equipo de agentes especialistas que planifican, construyen, revisan y ponen compuertas al trabajo — de modo que una sola persona entrega como una organización de ingeniería.

> **Una funcionalidad real: idea → PR fusionado en `1h 26m` por `$3.40` de coste en LLM.** La ruta tradicional para la misma funcionalidad fue ~6 semanas y ~$42K. [Ver la traza completa →](https://greatcto.systems/proof)

Construye a través de las principales industrias de servicios de EE. UU. — servicios para el hogar y de campo, servicios profesionales, hostelería, retail/e-commerce, proptech, fitness, marketing y creadores, RR. HH./reclutamiento, construcción, logística — que se colapsan en **6 pipelines de construcción reutilizables** (vertical-SaaS CRUD, reservas, CRM, dashboard, marketplace, contenido/medios). Un comando entrega cualquiera de **~40 productos**. Ver [docs/strategy/BUILD-PIPELINES.md](../strategy/BUILD-PIPELINES.md).

```
   describe un producto
        │
   síntesis de la especificación  ── arquitectura · modelo de datos · pantallas          (automático)
        ▼
   👤  compuerta del CTO — aprueba la especificación        ← el único punto de control humano
        │
   andamiaje → backend → frontend → integración → pruebas → despliegue        (automático)
        ▼
   producto entregado · repo · URL en vivo
```

CI y las pruebas generadas son la compuerta de calidad — tú firmas la **dirección**, no cada línea.

## Bajo el capó (para el CTO que lo opera)

→ *La historia de cara al constructor sobre esta superficie: [greatcto.systems/build](https://greatcto.systems/build)*

Cada producto se construye mediante una pipeline de agentes especialistas — arquitecto, design-advisor, senior-dev,
QA, security-officer, devops — que ejecuta especificación → andamiaje → backend → frontend → pruebas → despliegue.
**Tomas una sola decisión: aprobar la especificación.** Todo lo demás es automático. La pipeline está
escalonada por riesgo — una corrección de mantenimiento no abre compuerta (CI es la compuerta), una funcionalidad reversible abre solo la
compuerta de plan, y un cambio irreversible fuerza el conjunto completo — de modo que la ceremonia escala con el radio de impacto,
no con el papeleo. CI y las propias pruebas generadas de la construcción son la compuerta de calidad que hace seguro
dejar que la pipeline corra hasta el despliegue.

**Una compuerta, donde importa.** Los pasos de construcción están escalonados por riesgo: un cambio reversible se construye y entrega
detrás de CI; uno irreversible — un despliegue a producción, una migración de esquema, una nueva integración con capacidad de escritura —
escala a la compuerta del CTO y al modelo de frontera antes de ejecutarse. Tú firmas la especificación
y las llamadas de alto radio de impacto; el resto corre de principio a fin. `change-tier` + `effectiveGates`
imponen el invariante en el código.

## En cifras

| | |
|---|---|
| Una funcionalidad, de principio a fin (ejecución real, totalmente trazada) | **1h 26m · $3.40 de LLM** vs ~$42K / ~6 semanas tradicional |
| Una ejecución anterior de funcionalidad CLI, misma pipeline | $2.39 de LLM vs ~$5,460 de equivalente humano; seguridad detectó 2 defectos que QA había pasado |
| Coste mensual (20 ejecuciones de pipeline) | **~$34** |
| Industrias objetivo de EE. UU. | **10** (servicios para el hogar · retail · proptech · fitness · RR. HH. · …) |
| Productos construibles | **~40** entre las 10 industrias |
| Pipelines de construcción reutilizables | **6** (CRUD · reservas · CRM · dashboard · marketplace · contenido) |
| Agentes especialistas | **46** |

→ [Traza completa con todos los artefactos](https://greatcto.systems/proof) · [las 6 pipelines](https://greatcto.systems/pipelines)

## Cómo funciona

**`npx great-cto init`** — analiza tu stack y escribe `.great_cto/FLOW.md` con la pipeline para tu producto: los agentes, el arquetipo de construcción y la única compuerta del CTO.

**`/start "describe el producto"`** — arquitecto y design-advisor redactan la especificación, el modelo de datos y las pantallas. Tú lo revisas y apruebas en la **única compuerta** — `gate:plan`.

**La pipeline lo entrega** — senior-dev hace el andamiaje y construye con TDD, QA ejecuta las pruebas generadas, devops despliega. No se necesita más aprobación para una construcción reversible.

## Tres productos — una pipeline

El mismo comando, diferente producto. El arquetipo de construcción moldea el stack y las integraciones:

| | **App de despacho** | **App de reserva de clases** | **Dashboard de rentabilidad** |
|---|---|---|---|
| Arquetipo | vertical-SaaS CRUD | Reservas / agendamiento | Dashboard / analítica |
| Stack | Next.js · Postgres · shadcn | Next.js · Postgres · cal | Next.js · warehouse-lite · charts |
| Integraciones | Auth · RBAC | Stripe · Twilio | conectores de fuente |
| Compuertas humanas | `gate:plan` (la compuerta del CTO) | `gate:plan` | `gate:plan` |

→ Ver las 6 pipelines: [greatcto.systems/pipelines](https://greatcto.systems/pipelines)

## El dashboard que realmente vas a revisar

`great-cto board` se abre en `http://localhost:3141` — el board de construcción: SSE en tiempo real, la pipeline en vivo con su insignia de change_tier (una compuerta del CTO · juez económico), coste por agente, gasto de LLM de 30 días frente a la línea base de equivalente humano.

<p align="center">
  <img src="../screenshots/board.png" alt="The build board — live pipeline with the change_tier gate badge, inbox and cost" width="900" />
</p>

<table>
<tr>
<td width="50%"><a href="../screenshots/metrics.png"><img src="../screenshots/metrics.png" alt="Metrics — tasks shipped, AI spend, cost savings vs FTE" width="100%" /></a><br/><sub><b>Métricas</b> — tareas entregadas, gasto de IA, ahorro de coste frente a un equipo humano, consumo diario</sub></td>
<td width="50%"><a href="../screenshots/memory.png"><img src="../screenshots/memory.png" alt="Project memory — browsable layers: PROJECT.md, archetypes, lessons" width="100%" /></a><br/><sub><b>Memoria</b> — capas de memoria del proyecto navegables: PROJECT.md, arquetipos, skills, lecciones</sub></td>
</tr>
</table>

**Diseñado para la organización de ingeniería de una sola persona.** GreatCTO es para el indie hacker, fundador en solitario o CTO técnico que quiere entregar productos reales sin un equipo — ejecutando la pipeline en Claude Code u OpenAI Codex, aprobando una especificación y entregando a una URL en vivo. *No para equipos de ingeniería con múltiples desarrolladores* — ver [FAQ](../FAQ.md#is-great_cto-for-teams).

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
<summary>📖 Documentación completa — una compuerta del CTO · escalonamiento por riesgo · críticos · 46 agentes · arquetipos de construcción · board · coste · MCP</summary>

## Una decisión por funcionalidad

```
🤖 architect + design-advisor  →  especificación · modelo de datos · pantallas
   ↓
🟡 gate:plan   ←  tú decides aquí — aprueba la especificación (la única compuerta del CTO)
   ↓
🤖 senior-dev → revisión → qa-engineer → devops  →  construido · probado · desplegado
```

La pipeline está escalonada por riesgo (`change_tier`): una corrección de mantenimiento **no** abre compuerta (CI es la compuerta), una funcionalidad reversible abre **solo** `gate:plan`, y un cambio irreversible fuerza el conjunto completo + el modelo de frontera. Todo lo que hay entre la compuerta y el despliegue corre automáticamente. **La memoria persiste** entre sesiones: cada veredicto de compuerta se añade a `~/.great_cto/decisions.md`, cada retrospectiva al `lessons.md` por proyecto, y `/crystallize` promueve los patrones de alto impacto a una biblioteca global que los agentes consultan antes de volver a resolver.

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
| Agentes especialistas | **46** (arquitecto · design-advisor · senior-dev · QA · seguridad · devops · revisores de arquetipo) | 1 generalista | 1 generalista |
| Pipeline de construcción | especificación → compuerta del CTO → andamiaje → construcción → pruebas → despliegue | autonomía de un solo paso | bucle de edición |
| Compuertas humanas | ✅ una — tú apruebas la especificación (escalonada por riesgo) | ❌ ninguna | ❌ |
| Memoria entre sesiones | ✅ `decisions.md` + `lessons.md` + crystallize | ⚠️ solo hilo | ⚠️ solo hilo |
| Seguimiento de costes | ✅ por agente + historial de 30 días + savings_x | ❌ | ❌ |
| Diseño integrado | ✅ design-advisor + ui-ux-pro-max → Next.js/Tailwind/shadcn | ❌ | ❌ |
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
/start "build a dispatch & scheduling app for an HVAC business"
# → architect + design-advisor → spec, data model, screens
# → pm → Beads tasks → gate:plan (you approve the spec — the one gate)
# → senior-dev → review → qa → devops → built · tested · deployed

/inbox
# Pending gate · P0 incidents · blocked tasks · stale in-progress

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

## Arquetipos de construcción

Cada producto se asigna a un **arquetipo de construcción** que moldea su pipeline — la plantilla de stack,
la forma de los datos, la integración distintiva. Los 6 arquetipos del Constructor de Productos (los ~40 productos
se colapsan en estos):

| Arquetipo | Forma | Stack | Integración |
|---|---|---|---|
| `vertical-saas` | entidades · roles · workflow · UI de registros | Next.js · Postgres · shadcn | Auth · RBAC |
| `booking` | calendario · disponibilidad · recordatorios · pagos | Next.js · Postgres · cal | Stripe · Twilio |
| `crm` | contactos · pipeline · secuencias automatizadas | Next.js · Postgres · queue | email / SMS · webhooks |
| `dashboard` | ingesta · métricas · visualización · alertas | Next.js · warehouse-lite · charts | conectores de fuente |
| `marketplace` | listados de dos lados · emparejamiento · pagos | Next.js · Postgres · Stripe Connect | Stripe Connect / escrow |
| `content` | catálogo · niveles de acceso · entrega · monetización | Next.js · object storage · CDN | Stripe · pipeline de medios |

Más los arquetipos subyacentes por tipo de software (`web-service`, `mobile-app`, `cli-tool`,
`library`, …) que el motor detecta automáticamente para afinar la construcción. Ver [las 6 pipelines](https://greatcto.systems/pipelines).

Tabla completa (26 arquetipos) + cómo funciona la detección: [docs/ARCHETYPES.md](../ARCHETYPES.md).

**Cobertura profunda de EE. UU.** — más allá de GDPR/PCI/HIPAA, great_cto ahora revisa contra la divulgación cibernética de la SEC (8-K Item 1.05), CMMC 2.0 / NIST 800-171 para contratistas de defensa, gobernanza de IA de EE. UU. (NIST AI RMF · Colorado SB 205 · Utah/Texas AI), litigios sobre rastreo web (VPPA · CIPA · Washington MHMDA) y riesgo de modelos HMDA / SR 11-7 para préstamos.

## Overlays de dominio (opcional)

Más allá del arquetipo de construcción, el motor puede adjuntar automáticamente un **overlay de dominio** opcional cuando
detecta señales específicas del dominio (dependencias, términos del README) — añadiendo un revisor especialista y unas pocas
comprobaciones extra para cosas como voz/telefonía, privacidad (GDPR/CCPA) o gobernanza de IA. Son
opt-in y ortogonales a la pipeline de construcción; la mayoría de los productos no necesitan ninguno.

## Una ejecución real, totalmente trazada

El recibo canónico: **una funcionalidad real** entregada a través de la pipeline completa en **1h 26m
de reloj de pared por $3.40 de coste en LLM** — arquitecto → plan → implementación → revisión → compuerta humana →
PR fusionado. La ruta tradicional para la misma funcionalidad: ~170 horas y ~$42K. Cada etapa
con marca de tiempo, cada artefacto enlaza a un PR público de GitHub.

Una ejecución anterior sobre una funcionalidad de CLI en Python ($2.39 vs ~$5,460 de equivalente humano) mostró el modelo de revisión funcionando: seguridad detectó dos defectos reales que QA había aprobado (`list(stream_csv())` anuló el streaming → 14.5 MB de RSS pico sobre una entrada de 13 MB).

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

- **No para equipos de ingeniería con múltiples desarrolladores** — un solo constructor es el producto; 2+ ingenieros compartiendo la pipeline lo han superado.
- **No es un reemplazo para ingenieros senior** — codifica el proceso; no toma decisiones de criterio arquitectónico sin uno.
- **No es un sistema CI/CD** — las compuertas se ejecutan localmente / en sesión. Aún necesitas GitHub Actions para el merge real.
- **No está auditado para certificación** — los andamiajes de arquetipo PCI/HIPAA/SOC2 son puntos de partida, no certificaciones.
- **No es determinista** — salidas generadas por LLM. Cada veredicto de compuerta debería verificarse con sentido común.

## FAQ (top 5)

**¿Se usa mi código fuente para entrenar modelos?** No. La API de Claude tiene retención cero por defecto para clientes de pago. great_cto no añade nada.

**¿Cómo mantenéis bajos los costes de tokens?** Haiku por defecto + router Kimi K2 para triaje (60–80% de ahorro) + hook de cost-guard.

**¿Puedo desactivar los hooks?** Cada hook respeta `GREAT_CTO_DISABLE_<NAME>=1`. Opt-out de escaneo de secretos por archivo: `// great_cto:allow-secrets`.

**¿Qué pasa si no estoy en solitario?** La pipeline de construcción de GreatCTO está diseñada para un solo ingeniero — si tienes 2+ ingenieros que necesitan boards de constructor compartidos y pipelines concurrentes, lo has superado.

FAQ completa: [docs/FAQ.md](../FAQ.md).

## Documentación

📚 **[Centro de documentación completa →](../README.md)** — organizado por [Diátaxis](https://diataxis.fr/):
**[Primeros pasos](../tutorials/getting-started.md)** · Guías how-to ·
Referencia de [Agentes](../reference/agents.md) y [Comandos](../reference/commands.md) · [Arquitectura](../ARCHITECTURE.md) · [FAQ](../FAQ.md).

## Arquitectura

El plugin se ejecuta dentro de Claude Code (o cualquier host con capacidad MCP); 46 agentes son especificaciones en markdown; las tareas viven en Beads (dolt, git-native); la memoria es markdown plano (sin almacén de vectores). Diagrama + tabla de stack: [docs/ARCHITECTURE.md](../ARCHITECTURE.md).

## Novedades

**v2.74+** (junio 2026) — **El pivote al Constructor de Productos**: GreatCTO se convierte en un *Constructor de Productos con IA* — describe un producto de software, aprueba la especificación en una sola compuerta del CTO, y la pipeline lo entrega (especificación → construcción → pruebas → despliegue). 10 industrias de EE. UU., ~40 productos, 6 pipelines reutilizables. Las compuertas de construcción están escalonadas por riesgo (`change_tier`); la superficie de runtime regulado se movió fuera a [avelikiy/operate](https://github.com/avelikiy/operate). Historia: [la estrategia](../strategy/PRODUCT-BUILDER-DIRECTION.md) · [las 6 pipelines](https://greatcto.systems/pipelines)

**v2.40–v2.62** (junio 2026) — **El pivote a autopilotos**: GreatCTO se convierte en *autopilotos de IA para empresas* — 25 verticales de autopiloto de servicios, cada uno un flujo con un scorecard de calidad medido, un dueño responsable, y el invariante de runtime de que **una acción irreversible nunca se ejecuta sin una firma humana**. 22 conectores en vivo ejecutan cada vertical con datos reales. Historia: [Pivotamos →](https://greatcto.systems/blog/autopilots-pivot-25-verticals)

**v2.46–v2.63** (junio 2026) — **La consola de operador**: las ejecuciones duraderas se pausan en la compuerta humana y esperan en una bandeja de entrada a un humano licenciado y nombrado; firmar ejecuta la escritura. Acceso basado en roles, invitaciones con alcance limitado, determinaciones redactadas por IA con evidencia, muestreo de QA, relojes de SLA, pestaña Ops (medición · salud de conectores · reencolado de dead-letter), WCAG 2.2 AA, claro/oscuro. Historia: [La consola de operador →](https://greatcto.systems/blog/operator-console)

**v2.37–v2.65** (junio 2026) — **Bajo el capó**: el dev board se convierte en un *pult* — aprobar una compuerta puede lanzar una ejecución de agente transmitida en vivo; automejora de prompts con compuerta sobre evals reservadas (inspirado en SIA); compresión de contexto a $0 (log de CI 31,475 → 155 caracteres con el FATAL preservado); soporte de Fable 5. Historia: [Junio bajo el capó →](https://greatcto.systems/blog/june-under-the-hood)

[Changelog completo →](../../CHANGELOG.md)

## Hoja de ruta

- **Detección de arquetipo de producto** — elegir el arquetipo de construcción a partir del brief del producto, no solo del stack
- **Plantillas de construcción por industria** — entregar un producto de referencia de principio a fin a través de cada una de las 6 pipelines
- **Juez consciente del nivel** — un juez económico afinado sobre evals T0/T1, frontera + humano en T2 (ADR-004)
- **Task-runner headless** — encolar construcciones de producto y ejecutarlas en un VPS, sin supervisión

[Vota la próxima funcionalidad →](https://github.com/avelikiy/great_cto/discussions/categories/ideas)

</details>

## Autor

[avelikiy](https://github.com/avelikiy) — CTO que construye plataformas de trading y fintech nativas de IA (0→1, 1→N). great_cto es el resultado de automatizar mis propios bucles, un agente a la vez. Cada regla apareció en respuesta a un problema real en un sistema de producción real.

## Comunidad

| Canal | Qué |
|---|---|
| 🐛 [Issues](https://github.com/avelikiy/great_cto/issues) | Bugs, solicitudes de funcionalidades, propuestas de arquetipos |
| 💡 [Discussions](https://github.com/avelikiy/great_cto/discussions) | Preguntas, patrones, muestra y cuenta |
| 📝 [Blog](https://greatcto.systems/blog/) | Recibos, desgloses de coste, análisis profundos de arquitectura |
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
