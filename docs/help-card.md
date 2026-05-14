# great_cto · v{{VERSION}}

Engineering process for solo founders and small teams. You make 2 decisions
per feature; agents do the rest.

## Commands

| Group | Commands |
|---|---|
| **Daily** | `/inbox` what needs attention · `/digest` weekly digest · `/doctor` health · `/resume` continue from HANDOFF.md · `/save` snapshot session |
| **Pipeline** | `/start` bootstrap project · `/audit` audit existing code · `/review` PR review · `/poc` proof of concept · `/promote` POC → prod |
| **Ops** | `/oncall` rotation · `/ownership` matrix · `/rfc` decisions · `/release` release notes · `/sec` security · `/cost` LLM spend · `/burn` SLO burn |
| **Memory** | `/learn` extract patterns · `/crystallize` promote to global · `/migrate` schema |
| **Agents** | `/agent-review` performance · `/agent-retire` retire |
| **Help** | `/help` this card · `/help commands` just the table · `/help board` admin URL |

Every command works standalone — no global state required.

## Agents

35 agents in 6 tiers: **architect → pm → senior-dev → qa-engineer →
security-officer → devops**, plus 18 archetype-specific reviewers
(pci, ai-security, edtech, gov, insurance, marketplace, …) that
sign off before senior-dev claims a task.

Inspect with `/agent-review` (run all) or `/agent-review <name>`.

## Admin board

```
great-cto board     # opens http://localhost:3141
```

Views: Inbox · Kanban · Metrics · Agents · Memory · Public report.
Live updates via SSE. Single-tenant by design (one developer).

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
