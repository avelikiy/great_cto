# Commands

great_cto has 21 slash commands. Five of them carry a normal day; the rest wait until
you need them. Type them in Claude Code. On Codex there are no slash commands — the
skills, the MCP server and the guards carry over; the role pipeline runs through
`npx great-cto codex-host` ([Codex host guide](HOST-CODEX.md)).

Every command has a one-screen card: `/help`. Old names from before 3.40 still map:
`/help renamed`, or [the table below](#renamed-in-340).

## Every day

| Command | When | What you get |
|---|---|---|
| [`/start "…"`](#start) | You have an idea, or a codebase great_cto has not seen | A brief, a plan and working code. Three decisions stay yours: what to build, how, and whether it ships |
| [`/save`](#save) | You are done for now | A session note: what was done, how each "done" was verified, where the work stands, the next step |
| [`/resume`](#resume) | You come back | Where you left off — and a warning if the code moved since the note |
| [`/inbox`](#inbox) | Something may be waiting on you | Only the decisions that need you: open gates, blockers, P0s |
| [`/digest`](#digest) | Friday, or before a review | What shipped, what broke, what it cost — per feature |

### /start

Describe the product; the pipeline does the rest and stops three times for you:
**what** gets built (`gate:product`), **how** (`gate:arch`), and **whether it ships**
(`gate:ship`). One line in `PROJECT.md` — `approval-level: ship-only` — keeps only the last.

| Use | Does |
|---|---|
| `/start "a booking app for a dental practice"` | Brief → architecture → plan → build with tests → review → security → deploy |
| `/start` in a repo with code but no great_cto config | Takes the audit path first: detected stack, gaps with `file:line` evidence, a task per gap, `PROJECT.md` — then offers to start on your description |
| `/start audit [focus]` · `/audit` | The audit path on its own, any time (`/audit` is the same command) |

### /save

Writes `.great_cto/logs/session-<date>-<slug>.md`: what was done, a `Verify:` command for
each done item, decisions, what is pending, and the run state (branch@sha, dirty files,
servers still listening). `/save commit` also commits and pushes the note.

### /resume

Reads the latest notes, open tasks, decisions and git state, and tells you where you
left off in one screen. If commits landed since the note, it says so at the top and
re-runs only cheap read-only proofs before acting.

### /inbox

Open gates, blocked tasks, P0s and pending approvals from the last 24 hours
(`/inbox 72` for three days) — the list of things that need a human, nothing else.

### /digest

| Use | Does |
|---|---|
| `/digest` · `/digest 30` | Weekly engineering digest: velocity, incidents, tech debt, decisions, open gates, one recommendation |
| `/digest board` | The same as a board report |
| `/digest cost [7 \| feature <slug> \| agent <name>]` | LLM spend: run-rate, cost per deploy and per shipped feature, router savings |
| `/digest sessions [30]` | How your own sessions spend: long sessions, cache rebuilds, which habits cost most |
| `/digest slo [service]` | SLO burn rate, multi-window — budget exhaustion before it happens |
| `/digest gov [--since 30d]` | Whether the gates work: block rate, overrides, time in gate |

## When you need it

| Command | What you get |
|---|---|
| [`/review`](#review) | A code review of a branch with evidence for every finding — or a domain compliance review |
| [`/spec`](#spec) | Discovery → PRD → build spec, before any code |
| [`/poc`](#poc) | A timeboxed yes/no on a risky idea; `promote` takes a winner through the audits it skipped |
| [`/release`](#release) | Store notes, a user-facing changelog, stale docs and landing copy flagged |
| [`/trace`](#trace) | Requirement → task → test chain for one item or a whole feature |
| [`/crystallize`](#crystallize) | This session's lessons, incident patterns and repeated procedures turned into reusable knowledge |
| [`/recall`](#recall) | What this project already knows about a word — sessions and documents |
| [`/sec`](#sec) | Security posture, threat model, SBOM, incident workflow, secret rotation |
| [`/ownership`](#ownership) | Who owns a path and who is on call |
| [`/rfc`](#rfc) | A cross-team decision proposed, discussed and closed — accepted ones become ADRs |
| [`/exception`](#exception) | A signed, expiring record for a deliberate gate bypass, instead of `--no-verify` |
| [`/doctor`](#doctor) | A health check of great_cto itself; `--fix` applies the safe fixes |
| [`/board`](#board) | The local board at `localhost:3141`: decisions, ledger, fleet, harness |
| [`/agent`](#agent) | An agent managed like an employee: review, evals, prompt evolution, retirement |
| [`/help`](#help) | The command card |

### /review

| Use | Does |
|---|---|
| `/review [branch]` | 12 review angles, then skeptical triage (three rounds and an arbiter) so every finding has evidence; opens or closes `gate:code` |
| `/review --deep` | Triages every P0/P1 angle, not just security and reliability |
| `/review --domain <name>` | The matching compliance reviewer writes a threat model and raises its gate: `tax` · `legal` · `hr-ai` · `api` · `accounting` · `rcm` · `msp` · `procurement` · `voice` |

### /spec

`/spec discover` → `/spec prd` → `/spec` (build): a discovery plan, then a PRD, then
`requirements.md` + `design.md` + `tasks.md`. `/spec retrofit` writes the spec for code
that already exists.

### /poc

`/poc "hypothesis"` starts a timeboxed proof of concept that skips most of the production
pipeline and forces ship / pivot / kill at expiry. `/poc decide`, `/poc extend <days>`,
`/poc status`; `/poc promote <slug>` runs the audits the POC skipped before it can reach
production.

### /release

`/release notes [version]` (App Store / Play notes) · `changelog [from..to]` (user-facing)
· `docs` (stale docs) · `sync` (landing copy that no longer matches).

### /trace

`/trace <task-id>` shows why a task exists (upstream) and what it affects (downstream);
`/trace feature <slug>` audits a whole feature's chain for gaps.

### /crystallize

| Use | Does |
|---|---|
| `/crystallize learn [focus]` | Extracts this session's lessons into `.great_cto/lessons.md` |
| `/crystallize` · `status` | Incident patterns ready to promote |
| `/crystallize approve GP-NNNN` · `reject` · `rollback` · `prune` | Promote a pattern into agent improvements — with an eval — or undo it |
| `/crystallize skill [name]` | A procedure you keep walking agents through, captured as a skill |

### /recall

`/recall <word>` searches session history and the project's documents. `/recall ccr:<id>`
brings back the full original of context that compression left out.

### /sec

`/sec` (posture) · `threat <slug>` (threat model) · `sbom` · `incident "<what>"` ·
`rotate` (secret rotation).

### /ownership

`/ownership map | show | set <path> <team> | verify` — the ownership matrix, detected from
git, with CODEOWNERS generated. `/ownership oncall [who | handoff | schedule | escalate]`
— rotations, shift handoffs, escalation paths.

### /rfc

`/rfc new "<title>"` · `list` · `show <id>` · `comment <id> "<text>"` ·
`close <id> accept|reject` — an accepted RFC becomes an ADR.

### /exception

`/exception create --gate <gate> --reason "<why>" [--days N]` · `list` · `check <gate>`.
The guards refuse `--no-verify`, `--admin` and weakened checks; this is the audited way
to make a deliberate exception.

### /doctor

Pipeline state, missing artefacts, hooks, the last run per agent, permission denials,
an outdated `PROJECT.md` schema — and on Codex, whether great_cto's hooks are installed
and reviewed. `/doctor --fix` applies the safe fixes.

### /board

Opens `http://localhost:3141` (starts it if needed): **Decisions** — every gate waiting on
you, **Ledger** — cost and budgets, **Fleet** — agents, **Harness** — reviewer scores.

### /agent

`/agent review [<name>|all]` · `evals <name>` · `evolve <name> [--lesson "…"]` (a candidate
prompt must beat the current one on held-out evals) · `retire <name>`.

### /help

`/help` — the card · `/help renamed` — old names · `/help <old-name>` — where it went.

## In the terminal

| Command | Does |
|---|---|
| `npx great-cto init` | Installs great_cto for Claude Code (`--host codex` for Codex) |
| `great-cto board` | The local board |
| `great-cto upgrade` | Companion plugins and great_cto in Codex; `upgrade --self` updates the CLI |
| `great-cto uninstall` | Shows what an install wrote; `--yes` removes it, your data stays |

## Renamed in 3.40

| Old | Now |
|---|---|
| `/audit` | `/start audit` (still works) |
| `/discover` · `/prd` | `/spec discover` · `/spec prd` |
| `/migrate` | `/doctor --fix` |
| `/promote` | `/poc promote` |
| `/oncall` | `/ownership oncall` |
| `/learn` · `/skillify` | `/crystallize learn` · `/crystallize skill` |
| `/ccr <id>` | `/recall ccr:<id>` |
| `/cost` · `/burn` · `/gov-metrics` | `/digest cost` · `/digest slo` · `/digest gov` |
| `/agent-review` · `/gen-evals` · `/prompt-evolve` · `/agent-retire` | `/agent review` · `evals` · `evolve` · `retire` |
| `/tax-review` `/upl-check` `/aedt-bias-audit` `/api-contract-review` `/close-review` `/coding-audit` `/msp-review` `/procurement-review` `/voice-compliance` | `/review --domain tax` · `legal` · `hr-ai` · `api` · `accounting` · `rcm` · `msp` · `procurement` · `voice` |

The generated, exhaustive reference — every mode and flag, read from the command files —
is [reference/commands.md](reference/commands.md).
