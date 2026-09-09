<div align="center">

<img src="../screenshots/logo.svg" alt="great_cto" width="280" />

**Lanza productos con el agente de código que ya tienes.**

[![npm](https://img.shields.io/npm/v/great-cto?label=npx%20great-cto&color=cb3837)](https://www.npmjs.com/package/great-cto)
[![npm downloads](https://img.shields.io/npm/dm/great-cto?color=cb3837&label=downloads)](https://www.npmjs.com/package/great-cto)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-full_pipeline-blueviolet)](https://claude.com/claude-code) [![Codex](https://img.shields.io/badge/Codex-skills_·_MCP_·_second_opinion-blueviolet)](https://github.com/openai/codex)

```bash
npx great-cto init
```

[Web](https://greatcto.systems) · [Una ejecución real →](https://greatcto.systems/proof) · [Demo en vivo](https://greatcto.systems/r/CsqYVXs1Vibac5yp) · [Blog](https://greatcto.systems/blog/) · [Changelog](../../CHANGELOG.md)

[Русский](../ru/README.md) · [简体中文](../zh-CN/README.md) · [繁體中文](../zh-TW/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Español](README.md) · [Português](../pt-BR/README.md) · [Deutsch](../de/README.md) · [Français](../fr/README.md)

</div>

> Traducción del [README](../../README.md) inglés en la versión **v3.28.0** (2026-09-09).
> Ante cualquier discrepancia, la versión inglesa es la canónica.

---

great_cto es la capa **alrededor del agente de código que ya ejecutas**. Conduce
tu Claude Code a lo largo de una construcción entera y te entrega un
**repositorio que es tuyo** y una **URL que ya funciona**: arquitectura, modelo
de datos, backend, frontend, tests generados y el despliegue, terminados. No un
plan. No un prototipo.

Lo único que hace y que un paquete de prompts no hace: **te dice lo que el agente
no hizo.** Una etapa que se saltó, una revisión que nunca corrió, un coste que
nadie midió — cada uno se muestra como lo que es y nunca se cuenta como aprobado.
La prueba es una resta: v3.27.0 y v3.27.1 borraron los números favorables de este
mismo proyecto — «ahorro de coste frente a un FTE», una comparación de gasto
contra un equipo humano, un mes proyectado — porque de ninguno se pudo demostrar
que fuera cierto.

En Codex el pipeline no corre: lo que corre allí es el paquete de skills y un
servidor MCP. El otro trabajo de Codex es ser la **segunda opinión** — desde
dentro de Claude Code lee el mismo diff, y cada línea de revisión lleva el `sha`
del árbol que leyó, de modo que «revisado» se puede demostrar sobre *este* diff
en lugar de afirmarse. El log contiene **4 líneas hasta ahora, 1 con un sha**; de
ahí no se afirma ninguna tasa de detección, y no debería afirmarse ninguna.

No es un constructor de apps alojado y no sustituye a tu agente; sin uno no hay
nada que orquestar.

Siete productos construidos de punta a punta en el benchmark abierto costaron una
**mediana de $171** en tokens, medido en 2026-07. Pagas a tu propio proveedor de
LLM; great_cto no te cobra nada y es MIT.

Te detiene **tres veces** — en *qué* se construye, en *cómo*, y en *si se
despliega*. Todo lo que hay en medio corre sin ti, y es trabajo del pipeline
merecer que lo dejen solo: especialistas con encargos acotados (architect,
design-advisor, senior-dev, code-reviewer, QA, security, devops) y un modelo
independiente que comprueba el trabajo de cada etapa antes de que la siguiente
construya sobre él. La plantilla completa está en
[docs/reference/agents.md](../reference/agents.md).

```
   describe un producto
        │
   🤖  problema enmarcado · opciones sopesadas · brief escrito
        ▼
   👤  checkpoint 1 — aprobar QUÉ se construye
        │
   🤖  arquitectura · modelo de datos · pantallas · plan
        ▼
   👤  checkpoint 2 — aprobar CÓMO se construye
        │
   🤖  scaffold → backend → frontend → tests → revisión → seguridad
        ▼
   👤  checkpoint 3 — aprobar el despliegue
        │
   🤖  desplegado · repositorio · URL en vivo
```

Tres checkpoints es el **valor por defecto**, no el suelo. Una línea en
`PROJECT.md` lo baja a uno — apruebas el despliegue, y los checkpoints 1 y 2 se
convierten en una pantalla que lees en vez de un formulario que rellenas:

```
approval-level: ship-only
```

Ver [Cuándo te pregunta](#cuándo-te-pregunta).

<p align="center">
  <img src="../screenshots/board.png" alt="La pantalla Decisions del tablero — cada gate en espera como una fila: su coste de deshacer, los veredictos de ambos revisores, y un Approve que pide el nombre del gate cuando deshacer saldría caro" width="900" />
</p>

<p align="center">
  <img src="../tapes/ci.gif" alt="Terminal: npx great-cto register añade el proyecto al selector del tablero, luego npx great-cto ci comprueba el arquetipo declarado contra el código y contra el presupuesto mensual, y pasa" width="900" />
</p>

El tablero en `localhost:3141` se rellena solo — estado del pipeline, gates
pendientes, coste por agente, gasto de 30 días. No lo alimentas; lo consultas.
Cuatro pantallas, una pregunta cada una: **Decisions** (qué te necesita — cada
gate con los veredictos de ambos revisores, ordenados por coste de deshacer),
**Ledger** (qué costó y qué está corriendo), **Fleet** (en qué agente dejar de
confiar — sus permisos de herramientas, sus ejecuciones, su gasto), **Harness**
(quién es el host, quién da la segunda opinión, y qué hizo realmente). Settings
está detrás del engranaje; `⌘K` encuentra por nombre cualquier agente, documento,
sesión, memoria o decisión. Nada en él muestra una ausencia como un aprobado — un
escaneo que nunca corrió es `n/a`, nunca un cero verde.

## Números medidos

| | |
|---|---|
| Una feature, de punta a punta, con traza completa | **1h 26m · $3.40** en tokens — [los recibos](https://greatcto.systems/proof) |
| Un producto entero — 7 construidos en el benchmark abierto | mediana **$171** en tokens · calidad **70/100** (58–86), medido el **2026-07-10** — [reprodúcelo](../benchmarks/BENCH-2026-07-batch1.md) |
| Mes típico, 20 ejecuciones del pipeline | **~$34** — pagas a tu proveedor de LLM y a nadie más |
| Productos que sabe construir | **60**, en 15 industrias de EE. UU., mediante [6 pipelines reutilizables](https://greatcto.systems/pipelines) |

La puntuación de calidad se obtiene ejecutando los tests de cada producto, no
contando archivos — por eso dice 70 y no un número más redondo y bonito.

## Inicio rápido

```bash
npx great-cto init
```

Reinicia Claude Code y luego:

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
`claude plugin list --json` no debe mostrar `errors` para `great-cto`.

**En OpenAI Codex** (`npx great-cto init --host codex`) obtienes **las skills y
el servidor MCP** — no el pipeline de arriba. Codex no tiene superficie de plugin
para hooks, slash commands ni agentes con rol, así que `/start`, `/inbox`, la
cadena de gates y `secret-scan` no corren allí. Es un límite del host, no un
ajuste: `hooks` en un manifiesto de plugin nunca se lee
([openai/codex#16430](https://github.com/openai/codex/issues/16430),
[#39895](https://github.com/openai/codex/issues/39895)). El instalador imprime
esta misma separación antes de hacer nada.

**Dos harnesses, una revisión.** Desde 3.26.0 Codex *sí* participa en el
pipeline — desde dentro de Claude Code, como segundo revisor. Se declara una vez:

```yaml
# .great_cto/PROJECT.md
capabilities:
  second_opinion: codex      # or: openrouter · none
```

y en cada cambio de alto riesgo el `code-reviewer` de Claude y **`codex exec`**
(sandbox de solo lectura, tu login de Codex, sin API key) revisan el **mismo diff
al mismo tiempo**. Los hallazgos se fusionan; un P0 de cualquiera de los dos
bloquea; donde discrepan, ambos conjuntos llegan al humano en el gate — el más
estricto fija el veredicto, y nadie promedia. La pantalla **Harness** del tablero
detecta Codex, guarda la elección y muestra al lado qué *hizo* la segunda
opinión: cada ejecución, incluidas las saltadas, desde
`.great_cto/cross-review.log`. Cuatro estados, y el cuarto es el punto —
*declarado pero inalcanzable* nunca se muestra como *apagado*.

Cuánto ayuda se mide allí, no se afirma aquí. Lo que el log contiene hasta ahora:
la primera revisión real de Codex — la del commit que conectó Codex — encontró un
P1 que tanto el autor como la suite de tests habían pasado por alto; la revisión
del arreglo no encontró nada. Dos ejecuciones son evidencia del mecanismo, no una
tasa. La tasa es trabajo de la ficha.

## Cuándo te pregunta

Un ajuste en `.great_cto/PROJECT.md` decide dónde se detiene el pipeline:

| `approval-level` | Te detiene en | Paradas |
|---|---|---|
| **`ship-only`** | **el despliegue — y te informa de qué se va a construir** | **1** |
| `product-only` | qué construimos · si se despliega | 2 |
| `gates-only` *(por defecto)* | qué construimos · el diseño · el despliegue | 3 |
| `strict` | el diseño · revisión de código · el despliegue | 3 |
| `auto` | nada dentro del pipeline | 0 |

Las cuentas son paradas del pipeline. Cada nivel lleva además una guarda que no
es una elección de proceso: importar datos sobre registros existentes te detiene
en **todos** los niveles, `auto` incluido, porque eso destruye lo que había.

**`ship-only` es el mínimo que sigue siendo honesto.** Una parada — el
despliegue, la única decisión cuya consecuencia sale de tu máquina. La decisión
de *qué se construye* no desaparece, porque un pipeline que se pasa un día en lo
equivocado es el fallo caro: llega como una pantalla en tu consola, impresa una
vez, antes de que empiece la construcción.

```
ABOUT TO BUILD — say nothing and this proceeds, say something and it stops.

  What gets built:  the offline-first checkout; ship the queue before the UI
  Why:              reliability wins this segment, not features
  Stop if:          under 20% of orders are created offline after four weeks
  Left open:        which conflict rule for a re-submitted order

  Full brief: docs/product/BRIEF-checkout.md
```

El silencio es consentimiento, y la pantalla lo dice. Si el brief no se puede
leer, el gate vuelve — «no te lo pude mostrar» nunca se entrega como «se te
mostró y no dijiste nada».

`gates-only` ganó el gate de producto en v3.0.0. Antes se detenía en *cómo*
construir y en *si* publicar, y nunca en *qué* construir — la decisión que está
equivocada durante seis etapas antes de que nadie lo descubra. Cuesta una pausa
por **producto**, no por feature: `product-owner` es un punto de entrada y solo
corre desde `/start`.

Un arquetipo regulado — fintech, salud, gobierno — conserva sus gates de
seguridad, cumplimiento y despliegue **en todos los niveles, incluido `auto`**.
Un nivel más ligero delega el juicio; nunca se salta el cumplimiento. Tabla
completa: [docs/GATES.md](../GATES.md).

## Cuatro cosas que se niega a decir

La misma regla, en los cuatro sitios donde cuesta algo mantenerla: **algo que no
ocurrió nunca debe parecerse a algo que sí ocurrió.**

| Cuándo | Qué sería fácil mostrar | Qué muestra en su lugar |
|---|---|---|
| Hay una segunda opinión declarada pero falta su harness | *apagado* | **`unavailable`** — declarado e inalcanzable no es una elección que hayas hecho |
| Una comprobación corrió y no pudo decidir | *aprobado* | **`unverifiable`** — y la etapa no avanza con eso |
| El coste de una ejecución nunca se midió | **`$0.00`** | **`unmeasured`** — y los presupuestos no se disparan con eso |
| Una etapa la evaluó nadie | *0* | **`null`** — una tasa de aprobación divide entre lo que se evaluó de verdad |

Cada uno de estos es un sitio donde la respuesta honesta es más larga, más fea y
más difícil de construir que la segura. Eso es el producto entero.

## Las tres dudas que vale la pena tener

**«No puedo confiar en código que no vi escribirse.»**
Nosotros tampoco, así que nada se acepta por la palabra de un agente sobre sí
mismo. Cada etapa se comprueba contra lo que realmente produjo — existen los
archivos nombrados, pasan al ejecutarse los criterios de aceptación congelados, y
solo entonces se pregunta a un modelo distinto si cada requisito está atendido.
Donde esa comprobación no puede decidirlo, devuelve `unverifiable`, que **no** es
un aprobado.

**«Va a gastar dinero mientras duermo.»**
Los presupuestos por agente se niegan a despachar más allá de su tope y nombran
el número. Una ejecución cuyo coste no se pudo medir dice `unmeasured` y no
sostiene nada — un límite que se dispara con un número que nadie midió es peor
que no tener límite, y un `$0.00` seguro para trabajo no medido es como un gasto
pasa desapercibido.

**«Y luego quedo atrapado.»**
Un comando para instalar, MIT, corriendo en tu máquina contra tu propia cuenta de
LLM. Borra great_cto y el repositorio que construyó sigue siendo tuyo — Next.js,
Postgres y Stripe corrientes que cualquier ingeniero puede retomar.

## Qué lo hace distinto

- **Especialistas, no un generalista** — 70 agentes con trabajos acotados y sus
  propios gates de revisión, en vez de un asistente que teclea más rápido de lo
  que piensa. [La plantilla →](../reference/agents.md)
- **Críticos antes del código** — críticos de arquitectura, spec y esquema
  corren antes de planificar, cuando un error aún cuesta horas y no días.
- **Alcance forzado al escribir** — un agente físicamente no puede tocar
  archivos fuera de su encargo. No se marca en revisión; se rechaza al escribir.
- **Un QA que desconfía de sí mismo** — las rutas críticas se escriben en
  Gherkin antes del código de tests, y luego el mutation testing pregunta si la
  suite atraparía algo siquiera.
- **Memoria entre sesiones** — decisiones, lecciones y patrones promovidos
  persisten por proyecto y globalmente; una ejecución interrumpida se reanuda
  sabiendo qué etapas ya corrieron.
- **Coste visible** — gasto por agente, deriva estimado-contra-real y coste por
  cambio aceptado, en el tablero y no en una hoja de cálculo.
- **Topes de gasto que se niegan** — `agent-budgets:` en PROJECT.md limita lo
  que una etapa puede gastar; el pipeline se niega a despachar más allá y nombra
  el número. Una estimación nunca se niega — ver la tabla de arriba.
- **Una etapa se comprueba antes de que la siguiente construya sobre ella** —
  los archivos nombrados por el veredicto deben existir, los criterios
  `## ACCEPTANCE` congelados deben pasar al ejecutarse, y solo entonces se
  pregunta a un segundo modelo si cada requisito está atendido. Primero la
  pregunta más barata, y tres respuestas en vez de dos: `verified`, `rework` o
  `unverifiable`. Un agente que no afirma nada y no congela criterios se reporta
  — si no, la forma más barata de pasar es no afirmar nada.
- **El trabajo vuelve atrás, y la vuelta tiene techo** — una etapa fallida
  devuelve `REWORK` con los hallazgos citados y el mismo agente lo arregla;
  `BLOCKED` significa que debe decidir un humano. Tras tres pasadas se convierte
  en problema del humano, porque dos máquinas pasándose el trabajo no se aburren.
- **La calidad se mantiene aparte de lo que ocurrió** — el veredicto dice qué
  hizo una ejecución, un *score* dice cómo de bien, en su propio almacén de solo
  anexado, por un actor distinto y en un momento distinto. Los evaluadores pueden
  discrepar, y cada score nombra a quién lo puso.
- **El silencio queda registrado** — el dispatcher escribe lo que decidió en
  `.great_cto/pipeline-runs.jsonl`, *incluso cuando decidió no hacer nada* y por
  qué. Todos los defectos del pipeline encontrados este año se escondían en el
  hueco entre «no debería pasar nada» y «no pudo pasar nada».

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
- **El gasto se mide, la atribución todavía no es por agente** — el coste se lee
  del propio transcript de sesión del host y no del auto-reporte de un agente, así
  que los tokens son reales. Pero el transcript que recibe el hook cubre la
  sesión, no un subagente, así que el coste de una ejecución puede atribuirse a
  la etapa que terminó última — inflado en órdenes de magnitud. Trata las cifras
  por agente como un techo hasta que esto se arregle. Una etapa sin medición
  alguna sigue mostrando `unmeasured` y no un `$0.00` seguro, y los presupuestos
  no se disparan con ella.

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
