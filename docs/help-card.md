# great_cto · v{{VERSION}}

AI autopilots for business. Two modes: **Build** an autopilot (the gated
engineering pipeline) · **Operate** one (the runtime — a human signs the
risky call). 19 verticals · 22 live connectors.

## Commands

| Group | Commands |
|---|---|
| **Operate (autopilots)** | `/flow <v>` inspect a flow · `/autopilot start <v>` run it · `/autopilot inbox` cases awaiting a signature · `/autopilot approve <id> --by "<name>"` sign · `/autopilot reject <id>` |
| **Build (pipeline)** | `/start` bootstrap · `/audit` audit code · `/review` PR review · `/poc` proof of concept · `/promote` POC → prod · `/release` release notes |
| **Compliance reviewers** (build-time gate) | `/coding-audit` · `/aml-review` · `/customs-review` · `/audit-review` · `/pharma-review` · `/upl-check` · … (one per vertical) |
| **Daily** | `/inbox` attention · `/digest` weekly · `/doctor` health · `/resume` continue · `/save` snapshot |
| **Admin / ops** | `/oncall` · `/ownership` · `/rfc` · `/sec` · `/cost` · `/burn` · `/learn` · `/crystallize` · `/migrate` · `/agent-review` · `/agent-retire` |
| **Help** | `/help` this card · `/help commands` table · `/help board` admin URL |

Every command works standalone — no global state required.

## The two modes

- **Build** — `/start` + a vertical's `/<vertical>-review` reviewer build & ship an autopilot through
  the gated pipeline (architect → reviewers → QA → security → deploy).
- **Operate** — `/autopilot` runs a vertical's flow to its human checkpoint, holds the case in an
  inbox for the licensed human (coder · BSA officer · broker · CPA · QPPV …), and executes the
  irreversible action *only after* they sign.

## Agents

74 agents: **architect → pm → senior-dev → qa-engineer → security-officer →
devops**, plus per-archetype + per-vertical compliance reviewers that sign
off before senior-dev claims a task. Inspect with `/agent-review`.

## Admin board

```
great-cto board     # http://localhost:3141  →  Autopilot console
```

**Operate** — the Autopilot console: the work-queue where the licensed human signs cases
(multi-tenant; 🔔 browser push when a case lands). **Build** — Inbox · Kanban · Metrics · Agents ·
Memory. Live updates via SSE.

API: `GET /api/projects`, `/api/tasks`, `/api/sse`. See
`docs/BOARD-API.md` for the full surface.

## First steps

1. `/start` — answer 4 questions, get PROJECT.md + agent pipeline
2. `great-cto board` — open the dashboard
3. `/inbox` — see what's open right now
4. Read `~/.great_cto/lessons.md` to see what previous sessions learned

## Repo & support

- Source: https://github.com/avelikiy/great_cto
- Issues: https://github.com/avelikiy/great_cto/issues
- Changelog: `CHANGELOG.md` in the plugin dir
