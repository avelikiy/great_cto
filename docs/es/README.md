<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Ejecuta flujos de programación. Revisa la evidencia. Decide qué se publica.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<img src="../screenshots/board.png" alt="Proyecto de ejemplo con datos sintéticos, no un benchmark de modelos en vivo." width="900" />

*Proyecto de ejemplo con datos sintéticos, no un benchmark de modelos en vivo. 3.69.0.*

```bash
npx great-cto init
```

[Web](https://greatcto.systems) · [Una ejecución real →](https://greatcto.systems/proof) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> Traducción del [README](../../README.md) en inglés, versión **v3.69.0** (2026-10-23).
> Si hay discrepancias, prevalece la versión en inglés.

---

great_cto coordina flujos nativos de Claude Code y ejecuciones controladas experimentales de Codex mediante etapas, revisiones y gates explícitos. El panel local conecta tareas, ejecución registrada, documentos y consumo. El catálogo público contiene **72** agentes; figurar en él no demuestra ejecución ni experiencia. La evidencia ausente sigue siendo desconocida. Merge, release y despliegue requieren sus propias pruebas y autorizaciones. Pagas a tu proveedor; great_cto usa MIT y no cobra.

## Inicio rápido

```bash
npx great-cto init
```

Reinicia Claude Code. En el día a día hay tres cosas:

| | En Claude Code | En la terminal |
|---|---|---|
| **Empezar a trabajar** | `/start "add Google login"` | `great-cto run "add Google login"` |
| **Qué te espera** | `/inbox` | `great-cto status` |
| **Continuar** | `/resume` | `great-cto resume` |

`/start` acepta un producto nuevo o una tarea en un proyecto existente y elige el
flujo por sí mismo. `/resume` continúa solo lo que ya aprobaste; una decisión
pendiente sigue esperándote. Todo lo demás — `/review`, `/spec`, `/save`, `/digest`
y el resto — está ahí cuando lo necesites: [todos los comandos](../COMMANDS.md).

## Un proyecto, cinco vistas

Ejecuta `great-cto board` para abrir el panel local, normalmente en `localhost:3141`.

| Vista | Qué puedes inspeccionar |
|---|---|
| **Work** | Tareas, criterios de aceptación, siguiente acción compatible y pestañas Overview, Execution y Evidence |
| **Decisions** | Decisiones pendientes y controles de gates existentes, sin ampliar su autoridad |
| **Knowledge** | Markdown del proyecto, ADR y visor limitado de diagramas con alternativa de código Mermaid, solo lectura |
| **Insights** | Resultados registrados, tokens por proyecto, estimaciones y presupuestos separados |
| **Settings** | Executors, Runtime, Capabilities y General |

`unverifiable`, `unmeasured` y `unavailable` no equivalen a una comprobación aprobada.

Execution muestra intentos registrados, no un grafo causal ni un terminal en vivo. Los diagramas describen arquitectura declarada. Los tokens y el coste no miden calidad. Los documentos conservan su idioma; la interfaz está en inglés.

<details>
<summary>Ver ejecución, evidencia, conocimiento del proyecto y resultados</summary>

![Execution: Proyecto de ejemplo con datos sintéticos, no un benchmark de modelos en vivo.](../screenshots/execution.png)

![Evidence: Proyecto de ejemplo con datos sintéticos, no un benchmark de modelos en vivo.](../screenshots/evidence.png)

![Knowledge: Proyecto de ejemplo con datos sintéticos, no un benchmark de modelos en vivo.](../screenshots/knowledge.png)

![Insights: Proyecto de ejemplo con datos sintéticos, no un benchmark de modelos en vivo.](../screenshots/insights.png)

[Contrato de capturas](../reference/public-showcase.md).

</details>

## En OpenAI Codex

| Modo | Ejecución y autoridad |
|---|---|
| Claude Code native | Comandos, roles especializados y hooks nativos; las decisiones permanecen en el host correspondiente |
| Controlled Codex / mixed-host (experimental) | El controlador gestiona rutas, propuestas de texto, verificador y gates explícitos |
| Codex plugin session | Skills, MCP y hooks de seguridad; instalar el plugin no inicia automáticamente la pipeline controlada |

`npx great-cto init --host codex` da a Codex los skills, el servidor MCP y seis hooks
de seguridad (apruébalos una vez: ejecuta `codex` en una terminal y elige
**Trust all and continue**). Codex no tiene una superficie nativa de plugins para
comandos slash ni agentes de rol, así que el pipeline se ejecuta con la CLI:

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

La actualización es explícita por defecto (`great-cto upgrade codex`). En macOS, `sh scripts/codex-auto-update.sh enable` activa un temporizador opcional cada seis horas; `status` consulta su estado y `disable` lo elimina. Cada ejecución valida el origen Git. Sigue la referencia Git configurada, no las versiones npm; los hooks modificados siguen requiriendo aprobación del host en una sesión nueva. Detalles y ejecuciones mixtas:
[guía del host Codex](../HOST-CODEX.md).

## Cuándo te detiene

Una línea en `.great_cto/PROJECT.md`:

| `approval-level` | Te detiene en | Paradas |
|---|---|---|
| **`ship-only`** | **el despliegue — y te informa de qué se construye** | **1** |
| `product-only` | qué construimos · si se publica | 2 |
| `gates-only` *(por defecto)* | qué construimos · el diseño · el despliegue | 3 |
| `strict` | el diseño · la revisión de código · el despliegue | 3 |
| `auto` | nada en el pipeline | 0 |

Los productos regulados — fintech, salud, gobierno — mantienen sus gates de
seguridad, cumplimiento y publicación en todos los niveles. [Cómo funcionan los gates](../GATES.md).

## Números, medidos

| | |
|---|---|
| Una funcionalidad completa, totalmente trazada | **1h 26m · $3.40** — [los recibos](https://greatcto.systems/proof) |
| Un producto entero — 7 construidos en el benchmark abierto | mediana **$171** · **70/100**, **2026-07-10** — [reprodúcelo](../benchmarks/BENCH-2026-07-batch1.md) |

Son observaciones históricas, no un benchmark de la pipeline actual de dos hosts ni de los domain packs. No hay un porcentaje demostrado de mejora de calidad. Los domain packs siguen siendo opt-in; su presencia no demuestra experiencia ni mejores resultados.

## Limitaciones

Para una sola persona, no para un equipo; no es un constructor de apps alojado —
necesita tu agente de código; no es un sistema de CI/CD; las plantillas de
cumplimiento son un punto de partida, no certificaciones; la salida de un LLM no es
determinista. La versión honesta de cada punto y lo que se niega a afirmar:
[docs/DETAILS.md](../DETAILS.md).

## Más información

[Documentación](../README.md) · [Primeros pasos](../tutorials/getting-started.md) ·
[Comandos](../COMMANDS.md) · [Gates](../GATES.md) · [Agentes](../reference/agents.md) ·
[FAQ](../FAQ.md) · [Todo lo demás](../DETAILS.md) ·
[Issues](https://github.com/avelikiy/great_cto/issues) · [Seguridad](../../SECURITY.md) ·
[Contribuir](../../CONTRIBUTING.md) · [Privacidad — la telemetría está desactivada por defecto](../PRIVACY.md)

MIT — [LICENSE](../../LICENSE). Creado por [@avelikiy](https://github.com/avelikiy).
Si te ahorró tiempo, una estrella ayuda a otros desarrolladores en solitario a encontrarlo.
