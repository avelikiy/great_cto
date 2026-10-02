<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Lanza productos con el agente de código que ya tienes.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-controlled_host_·_skills_·_MCP-blueviolet)](https://github.com/openai/codex)

<a href="https://greatcto.systems/proof"><img src="https://greatcto.systems/assets/one-real-run.gif" alt="One real run, end to end: prompt, architect, human gate, parallel implementers, a reviewer's PARTIAL and the fix, 47 passing assertions, the ship gate, the merged PR — 1h 26m, $3.40" width="720" /></a>

```bash
npx great-cto init
```

[Web](https://greatcto.systems) · [Una ejecución real →](https://greatcto.systems/proof) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> Traducción del [README](../../README.md) en inglés, versión **v3.48.0** (2026-10-02).
> Si hay discrepancias, prevalece la versión en inglés.

---

**Tu agente de código entrega código. Esto es lo que lo revisa.**

Describe un producto o una funcionalidad. **71 agentes** con tareas acotadas lo llevan
por brief, arquitectura, construcción, revisión y seguridad; un segundo modelo de otra
familia lee el mismo diff. Tres decisiones siguen siendo tuyas — qué se construye,
cómo y si se publica — y lo que queda es un **repositorio tuyo** y una **URL que
funciona**. Pagas a tu propio proveedor de LLM; great_cto es MIT y no cobra nada.

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

<p align="center">
  <img src="../screenshots/board.png" alt="great_cto board" width="900" />
</p>

El panel en `localhost:3141` abre en **Work** — tus tareas, las decisiones que te
esperan y lo que ya se publicó. Costes, agentes y revisores están en **Tools**. Nada
ahí presenta una ausencia como un éxito: una comprobación que no pudo decidir muestra
`unverifiable`, un coste que nadie midió `unmeasured`, un revisor que no pudo
ejecutarse `unavailable`.

## En OpenAI Codex

`npx great-cto init --host codex` da a Codex los skills, el servidor MCP y seis hooks
de seguridad (apruébalos una vez: ejecuta `codex` en una terminal y elige
**Trust all and continue**). Codex no tiene una superficie nativa de plugins para
comandos slash ni agentes de rol, así que el pipeline se ejecuta con la CLI:

```bash
great-cto run "add Google login" --host codex --allow src,tests,docs
great-cto status --host codex
great-cto resume --host codex
```

Codex nunca actualiza el plugin por sí solo — lo hace `great-cto upgrade`. Detalles,
ejecuciones mixtas Claude + Codex y Codex como segundo revisor:
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
| Un producto entero — 7 construidos en el benchmark abierto | **$171** · **70/100**, **2026-07-10** — [reprodúcelo](../benchmarks/BENCH-2026-07-batch1.md) |
| Mes típico, 20 ejecuciones | **~$34** — pagas a tu propio proveedor de LLM, nada más |

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
