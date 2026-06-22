# great_cto · v{{VERSION}}

**AI Product Builder.** Describe a software product, approve the spec at one CTO
gate, and the pipeline ships it — architecture → build → test → deploy. Runs on
Claude Code or OpenAI Codex.

## Commands

| Group | Commands |
|---|---|
| **Build (pipeline)** | `/start` describe a product · `/audit` audit existing code · `/review` PR review · `/poc` proof of concept · `/promote` POC → prod · `/release` release notes |
| **Compliance reviewers** (build-time gate) | `/coding-audit` · `/fair-lending-audit` · `/part11-audit` · `/clinical-compliance` · `/voice-compliance` · `/api-contract-review` · … (fires on the code paths that carry the obligation) |
| **Daily** | `/inbox` attention · `/digest` weekly · `/doctor` health · `/resume` continue · `/save` snapshot |
| **Admin / ops** | `/oncall` · `/ownership` · `/rfc` · `/sec` · `/cost` · `/burn` · `/learn` · `/crystallize` · `/migrate` · `/agent-review` · `/agent-retire` |
| **Help** | `/help` this card · `/help commands` table · `/help board` admin URL |

Every command works standalone — no global state required.

## The one gate

`/start "describe the product"` → architect + design-advisor draft the spec,
data model and screens → **you approve the spec at `gate:plan`** → senior-dev
builds with TDD, reviewers fan out, QA runs the generated tests, devops deploys.
The pipeline is risk-tiered (`change_tier`): a maintenance fix opens no gate
(CI is the gate), a reversible feature opens only the plan gate, an irreversible
change forces the full set.

## Agents

Specialist pipeline: **architect → pm → senior-dev → qa-engineer →
security-officer → devops**, plus per-archetype compliance reviewers (PCI,
GDPR, HIPAA/clinical, lending, gov, AI-security, …) that sign off before
senior-dev claims a task. Inspect with `/agent-review`.

## Board

```
great-cto board     # http://localhost:3141  →  the build board
```

Inbox · Kanban · Metrics · Agents · Memory — the live pipeline with its
change_tier gate badge, per-agent cost, and 30-day LLM spend vs human-equivalent
baseline. Live updates via SSE.

API: `GET /api/projects`, `/api/tasks`, `/api/sse`. See
`docs/BOARD-API.md` for the full surface.

## First steps

1. `/start` — describe the product, get PROJECT.md + the agent pipeline
2. `great-cto board` — open the dashboard
3. `/inbox` — see what's open right now
4. Read `~/.great_cto/lessons.md` to see what previous sessions learned

## Repo & support

- Source: https://github.com/avelikiy/great_cto
- Issues: https://github.com/avelikiy/great_cto/issues
- Changelog: `CHANGELOG.md` in the plugin dir
