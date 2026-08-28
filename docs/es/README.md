<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Lanza productos con el agente de código que ya tienes.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code + Codex](https://img.shields.io/badge/Claude_Code_·_Codex-supported-blueviolet)](https://claude.com/claude-code)

```bash
npx great-cto init
```

[Web](https://greatcto.systems) · [Una ejecución real →](https://greatcto.systems/proof) · [Demo en vivo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

</div>

> Traducción del [README](../../README.md) inglés en la versión **v2.90.0** (2026-07-30). El número de aprobaciones se actualizó al valor por defecto actual (tres).
> Ante cualquier discrepancia, la versión inglesa es la canónica.

---

great_cto es la **capa de orquestación sobre el agente de código que ya usas**.
Un pipeline de **69 agentes especialistas** — architect, design-advisor,
senior-dev, code-reviewer, QA, security, devops — planifica, construye, revisa y
despliega una aplicación real: backend, frontend, tests generados, URL en vivo.

Te detiene exactamente dos veces: una en **qué se construye**, otra en **si se
despliega**. Todo lo demás corre sin ti.

```
   describe un producto
        │
   🤖  spec · arquitectura · modelo de datos · pantallas
        ▼
   👤  checkpoint 1 — aprobar QUÉ se construye
        │
   🤖  architecture · data model · screens
        ▼
   👤  checkpoint 2 — aprobar CÓMO se construye
        │
   🤖  scaffold → backend → frontend → tests → revisión → seguridad
        ▼
   👤  checkpoint 3 — aprobar el despliegue
        │
   🤖  desplegado · repositorio · URL en vivo
```

<p align="center">
  <img src="../screenshots/board.png" alt="El tablero de build — pipeline en vivo, gates, coste por agente" width="900" />
</p>

El tablero en `localhost:3141` se rellena solo — estado del pipeline, gates
pendientes, coste por agente, gasto de 30 días. No lo alimentas; lo consultas.

## Números medidos

| | |
|---|---|
| Una feature, de punta a punta, con traza completa | **1h 26m · $3.40** en tokens — [los recibos](https://greatcto.systems/proof) |
| Un producto entero — 7 construidos en el benchmark abierto | mediana **$171** en tokens · calidad **70/100** (58–86) — [reprodúcelo](../benchmarks/BENCH-2026-07-batch1.md) |
| Mes típico, 20 ejecuciones del pipeline | **~$34** — pagas a tu proveedor de LLM y a nadie más |
| Productos que sabe construir | **60**, en 15 industrias de EE. UU., mediante [6 pipelines reutilizables](https://greatcto.systems/pipelines) |

La puntuación de calidad se obtiene ejecutando los tests de cada producto, no
contando archivos — por eso dice 70 y no un número más redondo y bonito.

## Inicio rápido

```bash
npx great-cto init            # Claude Code (por defecto) · añade --host codex para OpenAI Codex
```

Reinicia tu host de IA y luego:

```bash
/start "construye una app de despacho y agenda para un negocio de HVAC"
```

El pipeline se encarga desde ahí. En el día a día tocas tres cosas:

| | |
|---|---|
| `/start "…"` | describe un producto o feature — el pipeline lo ejecuta |
| `/inbox` | lo que te espera: gates pendientes, P0, tareas bloqueadas |
| `/digest` | métricas DORA semanales + coste por feature |

Requiere Node ≥ 18.17. Los plugins compañeros (Superpowers, Beads) se instalan
solos. Tras el init, verifica que el host cargó el plugin de verdad:
`claude plugin list --json` no debe mostrar `errors` para `great_cto`.

## Cuándo te pregunta

Un ajuste en `.great_cto/PROJECT.md` decide dónde se detiene el pipeline:

| `approval-level` | Se detiene en | Por feature |
|---|---|---|
| `product-only` | qué construimos · si se despliega | 2 |
| `gates-only` *(por defecto)* | el diseño · el despliegue | 2 |
| `strict` | + revisión de código | 3 |
| `auto` | nada | 0 |

Un arquetipo regulado — fintech, salud, gobierno — conserva sus gates de
seguridad, cumplimiento y despliegue **en todos los niveles, incluido `auto`**.
Un nivel más ligero delega el juicio; nunca se salta el cumplimiento. Tabla
completa: [docs/GATES.md](../GATES.md).

## Qué lo hace distinto

- **Especialistas, no un generalista** — 69 agentes con trabajos acotados y sus
  propios gates de revisión, en vez de un asistente que teclea más rápido de lo
  que piensa. [La plantilla →](../reference/agents.md)
- **Críticos antes del código** — críticos de arquitectura, spec y esquema
  corren antes de planificar, cuando un error aún cuesta horas y no días.
- **Alcance forzado al escribir** — un agente físicamente no puede tocar
  archivos fuera de su encargo. No se marca en revisión; se rechaza al escribir.
- **Un QA que desconfía de sí mismo** — las rutas críticas se escriben en
  Gherkin antes del código de tests, y el mutation testing pregunta si la suite
  atraparía algo siquiera.
- **Memoria entre sesiones** — decisiones, lecciones y patrones promovidos
  persisten por proyecto y globalmente; una ejecución interrumpida se reanuda
  sabiendo qué etapas ya corrieron.
- **Coste visible** — gasto por agente, deriva estimado-contra-real y coste por
  cambio aceptado, en el tablero y no en una hoja de cálculo.

Todo corre en local, licencia MIT, con tus propias claves. Tu código se queda en
tu máquina; los prompts van a tu proveedor de LLM y a ningún otro sitio. La
telemetría está **desactivada por defecto** ([docs/PRIVACY.md](../PRIVACY.md)).

## Limitaciones

- **Para un solo constructor** — un fundador o CTO en solitario. Dos o más
  ingenieros compartiendo el pipeline ya lo han superado.
- **No es un CI/CD** — los gates corren en local; el merge sigue pasando por
  GitHub Actions.
- **No es una auditoría de certificación** — los andamios PCI/HIPAA/SOC2 son
  puntos de partida, no certificaciones.
- **No es determinista** — salida de LLM. Los veredictos de los gates merecen
  una comprobación humana.

## Documentación

**[Hub de documentación →](../README.md)** ·
[Primeros pasos](../tutorials/getting-started.md) ·
[Gates y niveles de aprobación](../GATES.md) ·
[Agentes](../reference/agents.md) · [Comandos](../reference/commands.md) ·
[Arquetipos](../ARCHETYPES.md) · [Arquitectura](../ARCHITECTURE.md) ·
[MCP](../MCP.md) · [FAQ](../FAQ.md) ·
[Todo lo demás](../DETAILS.md) — críticos, jurisdicciones, desglose de costes, CI, alertas

## Comunidad

[Issues](https://github.com/avelikiy/great_cto/issues) ·
[Discussions](https://github.com/avelikiy/great_cto/discussions) ·
[Blog](https://greatcto.systems/blog/) ·
[Política de seguridad](../../SECURITY.md) · [Contribuir](../../CONTRIBUTING.md)

MIT — [LICENSE](../../LICENSE). Creado por [@avelikiy](https://github.com/avelikiy):
CTO construyendo plataformas de trading y fintech AI-native; great_cto son mis
propios bucles, automatizados un agente a la vez.

Si te ahorró tiempo, una estrella ayuda a que otros constructores en solitario
lo encuentren.

<div align="center">

*Deja de ser la única persona capaz de desplegar.*

</div>
