# great_cto · v{{VERSION}}

Describe the task. Get a checked result. Decide when your judgment is needed.

## Everyday use

| Action | In Claude Code | In a terminal |
|---|---|---|
| Build, fix or investigate | `/start "describe the task"` | `great-cto run "describe the task"` |
| Progress and decisions | `/inbox` | `great-cto status` |
| Continue authorized work | `/resume` | `great-cto resume` |

The terminal defaults to interactive Claude Code with the plugin loaded.
For the controlled Codex runtime, add `--host codex`; a new run also needs
`--allow src,tests,docs`. Status/resume select runs in the current project.
Several unfinished runs require an explicit UUID. Resume never approves gates.

## Decisions

The project approval policy determines when work waits for you. Automated
checks still run. A decision explains the recommendation and consequences.
Deployment, spending and destructive actions retain their existing controls.

## Details when needed

`/help renamed` old names · `/help commands` advanced commands · `/help agents` specialists · `/help board` dashboard

Board: `great-cto board` → http://localhost:3141
Docs: https://github.com/avelikiy/great_cto

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

