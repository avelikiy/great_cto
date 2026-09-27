# great_cto · v{{VERSION}}

**AI Product Builder.** Describe a product; three decisions stay yours — what
gets built, how, and whether it ships — and the pipeline does the rest:
architecture → build → test → deploy. Runs on Claude Code or OpenAI Codex.

## Commands

| When | Command | What you get |
|---|---|---|
| You have an idea, or an existing codebase | `/start "…"` | a brief, a plan and working code (`/start audit` maps existing code first) |
| You're done for now | `/save` | what was done, how it was verified, what's next |
| You come back | `/resume` | where you left off — and a warning if the code moved |
| Something needs you | `/inbox` | only the decisions waiting on you |
| Friday | `/digest` | what shipped, what broke, what it cost (`cost` · `slo` · `gov` · `sessions`) |

**When you need it**

| Group | Commands |
|---|---|
| **Build** | `/review` a branch (`--domain tax\|legal\|hr-ai\|api\|accounting\|rcm\|msp\|procurement\|voice`) · `/spec` discover → prd → build · `/poc` timeboxed idea (`promote` to prod) · `/release` notes · `/trace` requirement → test |
| **Knowledge** | `/crystallize` (`learn` · `skill` · `review` · `approve`) · `/recall` what the project knows (`ccr:<id>`) |
| **Ops** | `/sec` security posture · `/ownership` who owns what (`oncall`) · `/rfc` cross-team decisions · `/exception` signed gate bypass · `/doctor` health (`--fix` migrates PROJECT.md) · `/board` |
| **Agents** | `/agent review\|evals\|evolve\|retire <name>` |
| **Help** | `/help` this card · `/help commands` · `/help renamed` · `/help board` |

## Renamed in 3.40

| Old | Now |
|---|---|
| `/audit` | `/start audit` (the alias still works) |
| `/discover` · `/prd` | `/spec discover` · `/spec prd` |
| `/migrate` | `/doctor --fix` |
| `/promote` | `/poc promote` |
| `/oncall` | `/ownership oncall` |
| `/learn` · `/skillify` | `/crystallize learn` · `/crystallize skill` |
| `/ccr <id>` | `/recall ccr:<id>` |
| `/cost` · `/burn` · `/gov-metrics` | `/digest cost` · `/digest slo` · `/digest gov` |
| `/agent-review` · `/gen-evals` · `/prompt-evolve` · `/agent-retire` | `/agent review` · `evals` · `evolve` · `retire` |
| `/tax-review` `/upl-check` `/aedt-bias-audit` `/api-contract-review` `/close-review` `/coding-audit` `/msp-review` `/procurement-review` `/voice-compliance` | `/review --domain tax` · `legal` · `hr-ai` · `api` · `accounting` · `rcm` · `msp` · `procurement` · `voice` |
| `/review trace <id>` | `/trace <id>` |

## Three decisions

`/start "describe the product"` → product-owner writes the brief → **you approve
what gets built (`gate:product`)** → architect + design-advisor draft the
architecture, data model and screens → **you approve how (`gate:arch`)** →
senior-dev builds with TDD, reviewers fan out, QA runs the generated tests →
**you approve the deploy (`gate:ship`)**. Three is the default, not the floor:
`approval-level: ship-only` in PROJECT.md keeps only the deploy. The pipeline
is also risk-tiered (`change_tier`): a maintenance fix opens no gate (CI is the
gate), an irreversible change forces the full set.

## Agents

Specialist pipeline: **product-owner → architect → pm → senior-dev →
qa-engineer → security-officer → devops**, plus per-archetype compliance
reviewers (PCI, GDPR, HIPAA/clinical, lending, gov, AI-security, …) that sign
off before senior-dev claims a task. Inspect with `/agent review`.

## Board

```
great-cto board     # http://localhost:3141  →  the build board
```

Inbox · Kanban · Metrics · Agents · Memory — the live pipeline with its
change_tier gate badge, per-agent cost, and 30-day LLM spend. Live updates via SSE.
API: `GET /api/projects`, `/api/tasks`, `/api/sse`. See `docs/BOARD-API.md`.

## Repo & support

- Source: https://github.com/avelikiy/great_cto
- Issues: https://github.com/avelikiy/great_cto/issues
- Changelog: `CHANGELOG.md` in the plugin dir
