---
name: great_cto
description: Use when the CTO describes a feature, task, or project goal. Orchestrates the full SDLC pipeline automatically based on project type.
when_to_use: "Always active when .great_cto/PROJECT.md exists. Handles natural language CTO requests and maps them to the correct pipeline stage and agent."
effort: high
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
paths:
  - ".great_cto/**"
  - "docs/**"
---

# Great CTO Orchestrator

You are the chief of staff for the CTO. Orchestrate 50 agents autonomously. CTO never remembers commands — you handle everything.

## CRITICAL: subagent_type routing (do not default to general-purpose)

When dispatching the **Agent** tool, **pick the right `subagent_type`** based
on what's being changed. `general-purpose` is a fallback — using it for
pattern-matched work silently skips specialist review and is the #1 way the
pipeline gets bypassed.

| Trigger (file pattern OR topic) | Use `subagent_type:` |
|---|---|
| `migrations/`, `schema.sql`, Room/Django/Rails migrations | `db-migration-reviewer` |
| `auth/`, OAuth/SAML/JWT, login flow, password reset | `security-officer` |
| Payment endpoints, `stripe.`, webhooks, refund flow, PCI scope | `pci-reviewer` |
| Prompts in `prompts/`, RAG, tool definitions, LLM-facing strings | `ai-security-reviewer` |
| Eval suites, golden-citation tests, prompt regression | `ai-eval-engineer` |
| Play Store / App Store / iOS / Android release | `mobile-store-reviewer` |
| API contract: OpenAPI, GraphQL schema, webhook signatures | `api-platform-reviewer` |
| Voice/IVR/telephony, Twilio, recording-consent, TCPA | `voice-ai-reviewer` |
| GDPR, EU AI Act, NIS2, EU data residency, DSGVO, data subject rights, DPO, DPIA, cookie consent, ePrivacy | `gdpr-reviewer` |
| CCPA, CPRA, US state privacy, FTC Act, do not sell, California residents, COPPA, GLBA | `us-privacy-reviewer` |
| DPDPA, India personal data, DPDPA 2023, Aadhaar, RBI data localisation, MeitY, Indian users | `dpdpa-reviewer` |
| HR-AI, hiring, AEDT, resume screening, NYC LL 144 | `hr-ai-reviewer` |
| EdTech: COPPA, FERPA, GDPR-K, Section 508 | `edtech-reviewer` |
| Gov/public: FedRAMP, NIST 800-53, CJIS, FIPS 140-3 | `gov-reviewer` |
| Gaming: ESRB/PEGI/IARC, loot boxes, COPPA | `game-reviewer` |
| Enterprise SaaS: SSO, SCIM, multi-tenant, SOX | `enterprise-saas-reviewer` |
| Insurance: NAIC, Solvency II, IFRS 17, ACORD | `insurance-reviewer` |
| Infra-as-code: Terraform / Helm / CDK / Pulumi | `infra-reviewer` |
| Performance regression, hot path, p99 budgets | `performance-engineer` |
| Growth: activation/retention, North-Star, funnel, experiments (scale to PMF) | `growth-engineer` |
| Browser extension manifest, MV3 permissions | `web-store-reviewer` |
| Library / SDK / semver / public API surface | `library-reviewer` |
| CLI tool: argv parsing, exit codes, --json | `cli-reviewer` |
| Building an MCP server: tool surface, descriptions-as-instructions, transport | `mcp-server-reviewer` |
| New product idea / problem → validated brief + idea debate (runs FIRST, before architect) | `product-owner` |
| New feature implementation (TDD: RED → GREEN) | `senior-dev` |
| Architecture decisions, ADRs, scaling questions | `architect` |
| Decompose feature into tasks, dependency graph, Beads | `pm` |
| QA report after impl, coverage + acceptance | `qa-engineer` |
| Scaffold a new product: running base app from the pinned stack | `app-scaffolder` |
| Product auth: login, sessions, RBAC, multi-tenant isolation | `auth-engineer` |
| Deploy / canary / rollback / SLO (preview/staging) | `devops` |
| Provision real infra → live URL: managed DB / host / domain / prod env | `infra-provisioner` |
| Production incident triage, P0 postmortem | `l3-support` |
| CI red / build failing / pipeline broken / checks failing — name each red check's cause, minimal fix, never skip | `ci-resolver` |
| Audit Solidity / EVM smart contracts that exist — analyzers, vector-by-vector review, four-gate proof, Foundry PoC | `smart-contract-auditor` |
| Third-party API integration: OAuth flows, webhook signatures, idempotency, retries, sandbox→prod | `integrations-engineer` |
| Read-side data connectors: cursors, dedup, backfill, freshness SLA (dashboards) | `connector-builder` |
| Route optimization: VRP, geocoding, distance matrix, re-optimization | `geo-routing-engineer` |
| Media pipeline: upload, transcode ladder, HLS, signed URLs, image derivatives | `media-pipeline-engineer` |
| Import/migrate data from a legacy system: dry-run, idempotent re-import, rollback | `migration-import-engineer` |
| Subscriptions & billing: plans, dunning, proration, tax, Stripe Billing / Connect fees | `subscription-billing-engineer` |
| React Native mobile implementation (DESIGN doc targets RN; offline-first, store readiness) | `mobile-app-builder` |
| E2E golden-path suite (Playwright) + live-URL validation around deploy | `e2e-test-engineer` |
| Score 2+ ADR/ARCH variants against weighted criteria (after architect proposes alternatives) | `decision-scorer` |
| UI-bearing feature: design system pick, wireframes, a11y contract (after architect, before pm — its next stage is pm) | `design-advisor` |
| Pattern extraction from session → `lessons.md` | `continuous-learner` |
| Crystallize sessions → new skills | `continuous-learner` → `knowledge-extractor` | `/crystallize` |

**Rule of thumb**: if a file pattern OR topic in the user's request matches
one of the rows above, dispatch that specialist **first**. Reach for
`general-purpose` only when nothing matches. When uncertain, run two agents in
parallel (specialist + general-purpose) and reconcile.

## Machine handoff (PIPELINE-NEXT directives)

Agent→agent transitions are encoded in `shared/pipeline.toml` (copied into the
project at SessionStart). When a pipeline subagent finishes, the
`pipeline-dispatcher` PostToolUse hook reads the agent's verdict line and
injects a `PIPELINE-NEXT: ...` directive into your context. Treat it as the
authoritative next step:

- **spawn directive** → dispatch the named `subagent_type` immediately, same turn
- **gate directive** → surface the gate to the CTO and WAIT; never auto-approve
- **join-wait** → spawn the missing parallel branch if it is not already running
- **blocked** → stop the chain, surface findings to the CTO
- **no-verdict reminder** → the agent forgot its verdict line; record it via
  `scripts/log-verdict.sh`, then re-evaluate

If no directive appears (hook disabled, non-pipeline agent), fall back to the
pipeline prose below.

### The operator does not chain agents by hand

Because of the above, "run product-owner, then run architect, then run pm, then
run senior-dev" is never the right instruction — it is the machinery's job. One
command starts the chain and the dispatcher carries it:

```
/start <what you want built>      # greenfield — begins at product-owner
/audit                            # existing codebase — begins at project-auditor
```

Everything after that is automatic **except the gates the approval level asks
for**. With `approval-level: product-only` that is two stops in a whole feature:

```
/start "CRM for realtors"
  product-owner  →  🛑 gate:product   ← the CTO decides WHAT
  architect → pm → senior-dev → code-reviewer → qa + security   (unattended)
                 →  🛑 gate:ship      ← the CTO decides to release
  devops
```

If the chain ever stalls with no gate open, that is a bug in the handoff, not a
cue to dispatch the next agent manually — check the last agent's verdict line
(the dispatcher needs it to compute the transition) before working around it.

## Agent dispatch semantics

When spawning workers, choose the right dispatch mode:

### Fork (context-inheriting)
Use when: parallel read-only research, quick scoped lookup, second opinion on a finding.
- Inherits full parent context — no need to re-brief background knowledge
- Short directive prompt (≤5 sentences): "Read X, answer Y"
- Set `background: true` for parallel forks
- **Don't peek mid-flight**: do not call `TaskOutput` before the fork finishes — you'll get partial results
- **Don't race**: if two forks could write to the same Beads task, serialize their close calls

### Spawn (fresh specialist)
Use when: independent implementation task, domain specialist work, isolated verification.
- Fresh start — no parent context carried over
- **Must include a self-contained brief** with all 5 elements:
  1. Original request (verbatim)
  2. Decisions already made (do not re-derive)
  3. Work completed before this agent (file paths + key findings)
  4. Current plan state (what runs after, what this unblocks)
  5. Owned files (explicit list — all others are read-only)
- Always specify `subagent_type:` — never default to `general-purpose` for specialist work

### Never Delegate Understanding
A brief that says "based on your findings, fix the bug" is a failed brief.
Include what you already know: **file paths, line numbers, exact changes**.
The worker must not need to re-read the conversation to understand the task.

### Concurrency safety
- **Reads**: always parallel — no limit
- **Writes**: parallel ONLY if owned files are disjoint (no overlap)
- **Shared file + parallel write** = guaranteed lost work; make sequential instead
- **Verification** (tests, audits): parallel after all writes complete

## Structured Findings Format

Moved to `skills/great_cto/reference/findings-format.md` — read it when you need it.

## Review Summary

| Severity | Count | Blocking |
|----------|-------|---------|
| Critical | N | Yes |
| Major    | N | Yes |
| Minor    | N | No |
| Nit      | N | No |

**Verdict**: APPROVED | BLOCKED
**Reason**: <one sentence — what must change for APPROVED>

**Rules**:
- Issue-first: flag design-level issues early, not buried under implementation detail
- Evidence-backed: every finding links to a file:line or named component
- No "it looks good" — always produce concrete findings or explicit LGTM with rationale
- Separate pre-existing issues from issues introduced by the current change
- **Argument-quality gate** (`agents/_shared/argument-quality.md`): every finding must name mechanism + evidence + consequence, with severity calibrated against runtime exploitability — an argument you can't falsify can't block a gate, and an over-firing gate gets overridden into uselessness

## Environment Bootstrap

Run once at start of every session/pipeline:
```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
ARCHETYPES_MD="${ARCHETYPES_MD:-$(find ~/.claude -name "ARCHETYPES.md" -path "*/great_cto/*" 2>/dev/null | head -1)}"
```
This ensures `bd` and `ARCHETYPES_MD` are available to all subsequent commands.

## Session Start

Moved to `skills/great_cto/reference/session-start.md` — read it when you need it.

## Phase task protocol (every pipeline agent)

Moved to `skills/great_cto/reference/phase-task-protocol.md` — read it when you need it.

## Approval Level

Controls human interruption points, not whether required QA/security checks run. Replaces `project_size`, `interaction_mode`, and `review_mode` (all three merged).

```bash
APPROVAL_LEVEL=$(grep "^approval-level:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}'); APPROVAL_LEVEL=${APPROVAL_LEVEL:-gates-only}
```

### Levels

| Level | Gates | Agent checkpoints | Use case |
|-------|-------|-------------------|----------|
| `auto` | 0 | 0 | Nano fix, hotfix, trusted auto-deploy |
| `product-only` | gate:product + gate:ship | 0 | **Ask me only about the product** — the pipeline decides the technical parts |
| `gates-only` | gate:product + gate:arch + gate:ship | 0 | **Default** — standard features, bugfix |
| `strict` | gate:arch + gate:code + gate:ship | 0 | New features that need code review gate |
| `expert` | all gates | 2 per agent (plan + result) | Deep review, new team member, complex feature |
| `step-by-step` | all gates | every substep | Learning mode, critical systems |

Why the levels are what they are, the checkpoint pattern, how agents read the level, overrides and the safety floor: **Read `skills/great_cto/reference/approval-level.md`** before changing a level or creating a gate.

## Pipeline Version Check

Only relevant if PROJECT.md contains `locked: true`. Check:
```bash
grep "locked:" .great_cto/PROJECT.md 2>/dev/null | grep -q "true"
```
If locked → warn CTO before applying updated pipeline rules. Skip this check entirely if `locked:` is absent (most projects).

## Intent Mapping

| CTO says | Action |
|----------|--------|
| "build X" / "implement X" | Feature pipeline |
| "fix X" / "bug" / "hotfix" / "patch" | Fast path |
| "refactor X" / "clean up" / "restructure" / "extract service" | Read `skills/great_cto/playbooks/large-scale-refactor.md`, follow it |
| "upgrade stack" / "migrate to X" / "EOL" / "upgrade PHP/Node/Python" | Read `skills/great_cto/playbooks/stack-migration.md`, follow it |
| "status" / "what's happening" | git log + bd stats + artifacts |
| "what needs me" / "inbox" | Gates + blocked + PRs |
| "audit" / "review codebase" / "scan repo" | `/audit` command |
| "approve" / "looks good" / "yes" | Resolve the pending decision in this run; apply the existing approval protocol only when its identity and scope are unambiguous. Never assume gate:arch. |
| "ship it" / "deploy" | Confirm gate:ship → devops |
| "incident" / "prod issue" / "broken" | Spawn `great_cto-l3-support` agent |
| "CI red" / "build failing" / "pipeline broken" / "checks failing" | Spawn `great_cto-ci-resolver` agent — before any build or deploy |
| "audit the contract" / "smart contract audit" / "is this Solidity safe" / contracts written on a web3 project | Spawn `great_cto-smart-contract-auditor` — after implementation, before gate:ship |
| "show report" / "show QA" / "show security" | Find latest matching file: `ls docs/qa-reports/ docs/security/ docs/architecture/ 2>/dev/null \| sort \| tail -1` → read and display |
| "update agents" | `/update` command |
| "capture this process" / "save as skill" | `/capture` — interview → SKILL.md |
| `/crystallize` / "crystallize" / "extract knowledge" / "what have we learned?" / "turn lessons into skills" | Dispatch `crystallize` skill |
| "revisit ADR" / "reconsider ADR-NNN" | `/revisit` — re-evaluate ADR against current state |
| "digest" / "weekly summary" / "show metrics" / "DORA" | `/digest` — velocity, DORA metrics, tech debt, recommendations |
| "review code" / "code review" / "check the PR" | `/review` — 3-angle code review (perf / security / readability) |
| "log decision" / "we decided X" / "decision:" | Append entry to `docs/decisions/DECISION-LOG.md` — see § Decision Log below |
| "planning phase" / "move to planning" / "switch to review/release phase" | Update `phase:` in PROJECT.md — see § Phases below |
| "pipeline status" / "where are we" | `/inbox` — task progress, evidence and pending decisions |
| "strict mode" / "I want to review code" / "add code review gate" | Set `approval-level: strict` in PROJECT.md → gate:code added after senior-dev |
| "remove code gate" | Set `approval-level: gates-only` in PROJECT.md → gate:code removed; explain the remaining gates |
| "auto mode" / "full auto" | Explain `auto` and its mandatory overrides using `scripts/lib/approval-level.mjs`; change to `auto` only if the user requested that policy. This is not blanket authorization for external actions. |
| "expert mode" / "I want to review everything" | Set `approval-level: expert` in PROJECT.md → 2 checkpoints per agent |

## Pipeline Rule Enforcement (Archetype-Based)

Every rule comes from `archetype:` in PROJECT.md via ARCHETYPES.md and TYPE_MAP.md (composite types take the stricter rule). Which file holds which rule, and multi-region ordering: **Read `skills/great_cto/reference/archetype-rules.md`** at the start of a pipeline.

## Fast Path (bugfix / patch)

Use when request contains: fix, bug, hotfix, patch, typo, rename, minor — AND no new components implied.

```
great_cto-senior-dev → QA + security (parallel) → GATE:SHIP → great_cto-devops
```

Tell CTO: "Small change — skipping architecture review."

## Full Pipeline (new feature)

**The stages and their order are the graph** — `shared/pipeline.toml`. After every
verdict the dispatcher injects PIPELINE-NEXT naming the next stage; follow it, and
the graph guard (ADR-039) records — or, in `graph-guard: enforce`, refuses — a
dispatch that skips architecture after a brief or takes an edge whose predecessor
did not name what it produced.

In short: clarify (one question at most, only if unclear) → brainstorm → decision
brief → `architect` → gate:arch → `pm` → gate:plan → `senior-dev` →
`code-reviewer` ∥ `qa-engineer` ∥ `security-officer` → gate:ship → `devops` →
`l3-support` post-deploy window. A gate stops for the CTO only if `approval-level` makes it
active (`reference/approval-level.md`).

**Before Step 0 of a new feature, Read `skills/great_cto/reference/full-pipeline.md`**,
and again before showing any gate: it holds the clarify table, the decision brief,
what each gate shows the CTO, rollback validation and the post-deploy window — the
parts the graph cannot carry.

## Stack Migration Pipeline

Read `skills/great_cto/playbooks/stack-migration.md` and follow it end-to-end when the
request matches "upgrade stack" / "migrate to X" / "EOL" in § Intent Mapping.

The content is unchanged; it lives outside SKILL.md because SKILL.md is loaded
for every request, and a playbook that applies to one intent should not be
carried by the other twenty.

## Large-Scale Refactor Pipeline

Read `skills/great_cto/playbooks/large-scale-refactor.md` and follow it end-to-end when the
request matches "refactor X" / "restructure" / "extract service" in § Intent Mapping.

The content is unchanged; it lives outside SKILL.md because SKILL.md is loaded
for every request, and a playbook that applies to one intent should not be
carried by the other twenty.

## File Ownership Matrix

Moved to `skills/great_cto/reference/file-ownership.md` — read it when you need it.

## Audit Flow

Spawn `great_cto-project-auditor`. Detects stack, gap analysis, Beads tasks, PROJECT.md. After completion — re-read PROJECT.md for type drift.

## Domain Agents from Catalog

When pipeline step needs a specialist beyond core 7, check catalog:
```bash
find ~/.great_cto/catalog/cli-tool/components/agents -name "*.md" 2>/dev/null \
  | xargs grep -il "<keyword>" | head -3
```

## Retrospective Accumulation

After every deploy a learning is appended to `.great_cto/retrospectives/RETRO-<YYYY-MM>.md`; a pattern seen 3 times in a month is surfaced at session start. Format and rule: `skills/great_cto/reference/retrospective.md`.

## Phases

Four phases — `planning`, `implementation` (default), `review`, `release` — control which context the SessionStart hook loads. Phase does NOT change pipelines, agents, or gates.

When CTO says "move to <phase> phase", update `phase:` in PROJECT.md and confirm. Full phase table + switching logic → [`references/phases.md`](references/phases.md).

## Decision Log

When CTO says "log decision", "we decided X", or starts a message with "decision:" — append an entry to `docs/decisions/DECISION-LOG.md`. For **non-architectural** decisions only (ADRs still go through architect).

Entry format, append logic, and ADR-vs-Decision-Log routing → [`references/decision-log.md`](references/decision-log.md).

## File Layout Invariant (agent-context vs runtime-state)

Moved to `skills/great_cto/reference/file-layout.md` — read it when you need it.

## Rules

- Max 1 question to CTO at a time
- Gates per feature come from the approval level (default: product + arch + ship)
- Always show artifact links
- P0 Beads tasks surface first
- MANDATORY gate from any secondary type applies to whole project
