# Aprendizaje continuo (Continuous Learning)

> **Idioma:** [English](../LEARNING.md) · [Русский](../ru/LEARNING.md) · [简体中文](../zh-CN/LEARNING.md) · [日本語](../ja/LEARNING.md) · [한국어](../ko/LEARNING.md) · **Español**
>
> ⚠️ Resumen traducido por máquina. Para detalles completos y enlaces a ADRs, ver [English original](../LEARNING.md).

great_cto v1.2.0 agregó un **bucle de aprendizaje de dos niveles** que extrae automáticamente patrones de cada sesión y los reusa en sesiones futuras.

## Pipeline

```
Sesión termina → hook SessionEnd captura snapshot + registra proyecto
              → agente continuous-learner lee transcript + git + verdicts
              → Extrae ≤3 lecciones por sesión → .great_cto/lessons.md (LOCAL DEL PROYECTO)
              → lessons-merge.mjs: patrón en ≥3 proyectos → ~/.great_cto/decisions.md (CROSS-PROYECTO)
              → Próxima sesión: architect, pm, senior-dev LEEN ambos archivos al inicio
```

## Memoria de dos niveles

| Archivo | Alcance | Criterio de promoción | Quién lee |
|---|---|---|---|
| `.great_cto/lessons.md` | Local del proyecto | Filtros de calidad en continuous-learner | architect, pm, senior-dev |
| `~/.great_cto/decisions.md` | Todos los proyectos en esta máquina | Patrón en ≥3 proyectos distintos | architect, pm, senior-dev |

## Qué se captura

5 formas de patrones, cada una con filtros de calidad estrictos:

| Forma | Señal fuente | Ejemplo |
|---|---|---|
| **A. Reviewer detectó X** | Hallazgo Critical/High en agent-verdicts | "PCI reviewer detectó firma de webhook faltante en 3 proyectos fintech" |
| **B. Costo atípico** | Invocación de agente 2x+ sobre su media | "Architect cuesta 3x más en proyectos solo fintech — pre-asignar $8" |
| **C. Error repetido** | Mismo fix en ≥2 commits | "Refactorizado cleanup de `useEffect` en 3 componentes" |
| **D. Discovery faltante** | Suposición del architect anulada durante implementación | "Asumió US-only; era EU-required" |
| **E. Decisión de tool/lib** | ADR con resultado medible | "Eligió Drizzle sobre Prisma para mlops — 40% reducción de bundle" |

continuous-learner **rechaza** cualquier cosa que no coincida con estas formas — silencio > ruido.

## Filtros de calidad

Una lección candidata es **rechazada** si alguna de estas es verdad:
- Aplica solo a un archivo específico de un proyecto (demasiado estrecho)
- Captura preferencia del usuario, no patrón transferible
- Reafirma una buena práctica obvia
- Sin evidencia concreta (sha, file:line, número de costo)
- Contiene PII, secretos, o términos confidenciales del negocio
- Pattern slug ya está en lessons.md (de-dup)
- Subjetivo sin resultado medible

## Privacidad

**Local por defecto, global opt-in.** El learner corre en tu máquina; lessons.md y decisions.md nunca dejan tu disco.

Lo que el learner NO DEBE capturar (forzado vía agent prompt):
- API keys, tokens, contraseñas, JWTs
- Emails, teléfonos, nombres
- Codenames internos, terminología confidencial del negocio
- IDs de cliente/usuario o datos `.env*`
- Contenido de código fuente (solo referencias file:line)

Reglas completas de privacidad en **ADR-016**.

## Configuración

```bash
# Desactivar captura session-end completamente
export GREAT_CTO_DISABLE_SESSION_LEARNING=1

# Trigger manual
/learn              # extraer lecciones de esta sesión
/learn cost         # foco en patrones de costo atípico (shape B)
/learn security     # foco en hallazgos de reviewer (shape A)
/learn architecture # foco en decisiones de tool/lib (shape E)

# Inspeccionar estado
cat .great_cto/lessons.md
cat ~/.great_cto/decisions.md
ls ~/.great_cto/projects/

# Forzar re-agregación
node scripts/lessons-merge.mjs
node scripts/lessons-merge.mjs --dry-run
node scripts/lessons-merge.mjs --force

# Reset
rm .great_cto/lessons.md
rm -rf ~/.great_cto/{decisions.md,projects/}
```

## Cómo los agentes usan las lecciones

3 agentes leen lessons.md + decisions.md al inicio de sesión:
- **Architect** — consulta lecciones pasadas antes de cualquier decisión arquitectónica; filtra por arquetipo actual
- **PM** — antes de estimar, calibra contra lecciones de costo atípico (shape B)
- **Senior-dev** — antes de claim de tarea, escanea anti-patrones conocidos; cita en commit

## Roadmap

- **v1.2.0** — continuous-learner + lessons-merge + integración de agentes
- **v1.3.0** — Telemetría: rastrear qué lecciones los agentes citan vs ignoran
- **v1.4.0** — Auto-promoción: decisiones de alto impacto → skills reutilizables

## Referencia

- **ADR-015** — arquitectura del bucle de aprendizaje
- **ADR-016** — protección de privacidad
- **ADR-017** — criterio de promoción a skill
- `agents/continuous-learner.md` — el agente
- `scripts/lessons-merge.mjs` — script de promoción cross-proyecto
- `commands/learn.md` — trigger manual

Documentación completa en [English LEARNING.md](../LEARNING.md).
