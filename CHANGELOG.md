# Changelog

All notable changes to great_cto are documented here.

---

## v1.0.85 — 2026-04-20

### Removed

- **11 orphan files** across `docs/qa-reports/`, `docs/demo/`, `docs/plans/`,
  and `CONTRIBUTING.md`. These were historical artefacts from closed releases
  (QA reports for v1.0.2, planning docs for shipped features, an unused demo
  gif) that no command, README link, or skill referenced. Repo is ~1500 lines
  lighter and easier to navigate.

---

## v1.0.84 — 2026-04-20

### Fixed

- **Stale gates now surface on macOS.** `/inbox` and the great_cto skill no
  longer silently report every gate as fresh under zsh — the age calculation
  correctly detects gates older than 24h regardless of shell.
- **Force-push protection closed a gap.** The PreToolUse guard now blocks
  `git push --force-with-lease` (previously only `--force` / `-f` were caught),
  matching the policy intent.
- **Write audit covers bulk edits.** Multi-file edits are now logged to
  `permission-denied.log` the same way single-file writes are.

### Added

- **`scripts/bump-version.sh`** — single command to bump `plugin.json` and
  sync the README badge + "actively maintained" line, removing the drift
  that let version references go out of sync in earlier releases.

---

## v1.0.83 — 2026-04-20

### Added

- **`/doctor --fix`** — one-shot remediation. Creates missing artefact
  directories (`docs/audit`, `docs/security`, `.great_cto/verdicts`, …),
  regenerates `.great_cto/env.sh`, migrates old PROJECT.md to the v1.0.76
  format with stub `Stack:`/`Type:` lines, rotates stale
  `permission-denied.log`, initialises `bd` if absent.
- **`docs/validation/README.md`** — documents the three-tier test strategy
  (L1 structural, L2 e2e assert-only, L3 manual dogfood) and when to run each.
- **`docs/scheduling/README.md`** — how to set up recurring `/digest` (Mon
  09:00) and `/audit` (monthly) via Claude scheduler, cron, or Actions.
- **`docs/postmortem/SILENT-PIPELINE-FAILURE.md`** — write-up of the
  six-month-silent-failure that motivated v1.0.78–v1.0.82 hardening.

### Changed

- README now lists `/doctor` in the advanced commands table.

---

## v1.0.82 — 2026-04-20

### Added — two more e2e fixtures

Extended the test harness with two new fixtures that cover the most common archetypes and reproduce known failure modes:

- **`tests/fixtures/trading-system-rust/`** — reproduces the <private-project> failure mode: committed API keys (`render.yaml` with `OPENROUTER_API_KEY`, `GEMINI_API_KEY`), `unwrap()` panic on hot path, no kill-switch, no risk tests, outdated `reqwest 0.11`. Manifest asserts `security-officer | BLOCKED` verdict — validates the v1.0.79 hard rule (P0 + SEC label must BLOCK).
- **`tests/fixtures/web-fullstack-node/`** — covers `web-fullstack` primary / `web-service` archetype. Next.js 13 with unauthenticated `/api/admin`, committed `.env.local`, green-lie tests (`echo no tests && exit 0`). Manifest asserts CSO BLOCKs on unauthenticated admin endpoint.

### Changed

- `tests/e2e/assert_manifest.py`: added optional `after_cso` block processing and `cso_ran()` detection; bootstrap existence check now accepts `pyproject.toml | package.json | Cargo.toml | go.mod | pom.xml` (previously Python-only).
- `.github/workflows/plugin-ci.yml`: e2e matrix expanded from `[cli-tool-python]` to all three fixtures.

---

## v1.0.81 — 2026-04-20

### Fixed — zsh compatibility in /doctor and SessionStart

Dogfooding `/doctor` on <private-project> on macOS (default shell: zsh) surfaced two shell incompatibilities that produced noisy stderr output and broken branches:

1. **`grep -c PATTERN 2>/dev/null || echo 0`** — when grep finds zero matches it still prints `0` AND exits 1, so `|| echo 0` runs, producing `"0\n0"`. The captured value then fails `[ "$X" -gt 0 ]` integer tests with "integer expression expected".
2. **`ls docs/audit/AUDIT-*.md 2>/dev/null`** — zsh without `setopt nomatch` prints "no matches found" to stderr *before* the command runs, so `2>/dev/null` inside the command can't suppress it.

**Fixes:**

- `commands/doctor.md`: replaced `|| echo 0` with `VAR=${VAR:-0}` guard; replaced `ls PATTERN` with `find <dir> -maxdepth 1 -name <pat>` in all artefact and verdict-log lookups.
- `.claude-plugin/plugin.json` SessionStart hook: same two fixes in the inline P0 banner + audit-staleness detection.

**Dogfood result on <private-project>** (previously failing, now clean):
```
✓ PROJECT.md present, old format (no Stack:/Type: — will migrate)
✗ 6/6 pipeline phases — no artefacts ever written
17 Beads open, 1 in_progress, P0 SEC (leaked API keys) pinpointed
0 verdicts, 0 permission denials
```

---

## v1.0.80 — 2026-04-20

### Added — Test harness foundation

Until now, the only way to test the plugin was "run /audit on a real project and eyeball the output". Slow, non-reproducible, hides silent failures. v1.0.80 introduces three layers of automated tests.

**Layers:**

- **Structural** — `tests/structural/validate.py` verifies `plugin.json` is valid semver JSON with required keys; every `commands/*.md` and `agents/*.md` has a parseable YAML frontmatter with required fields; the SessionStart CMD-copy loop references only files that exist (and vice versa — no orphan commands); `TYPE_MAP.md` has well-formed rows with backticked slugs. Fast (< 1s). Catches contract drift before any runtime.
- **E2E harness** — `tests/e2e/run_pipeline.sh <fixture>` copies a fixture to a tmpdir, `git init`s it, optionally invokes `claude -p "/audit"` when `CLAUDE_CLI_AVAILABLE=1`, then runs `assert_manifest.py` against the fixture's `expected/manifest.json`. Supports `--assert-only` for CI runs without the Claude CLI.
- **Fixtures** — `tests/fixtures/<name>/` each carry deliberately seeded problems an agent should detect, plus a golden `expected/manifest.json` describing the required post-audit state (artefact paths, PROJECT.md format lines, verdict-log patterns, Beads coverage topics, min/max issue counts).

**First fixture:** `cli-tool-python` — 6 seeded problems (committed fake token, CVE-2023-32681 in pinned requests, bare except, missing tests, TODO on entry point, type detection). Small enough to iterate on quickly.

**CI:** `.github/workflows/plugin-ci.yml` runs structural + e2e-assert-only on every push/PR that touches `commands/`, `agents/`, `skills/`, `.claude-plugin/`, or `tests/`. The full e2e path (actual `/audit` via `claude -p`) is wired but gated on `CLAUDE_CLI_AVAILABLE=1` and will run nightly once the Anthropic key is configured as a GitHub secret.

**Why this matters: the v1.0.79 observability work only helps if someone looks. CI with real fixtures turns "did the pipeline write its artefacts" from a human check into an automated gate.**

Next fixtures (v1.0.81): `web-fullstack-node`, `trading-system-rust`.

---

## v1.0.79 — 2026-04-20

### Added — Observability foundation

The audit of great_cto's own behaviour on real projects (<private-project>, <private-project>) revealed a systemic failure mode: **agents run, then fail silently**. Beyond PROJECT.md and Beads, no pipeline artefacts ever landed on disk — no audit reports, no ARCH docs, no QA reports, no CSO reports. Silent Write/Bash denials (v1.0.78 diagnosed the cause — plan mode inheritance) produced partial work without alerting the user.

v1.0.79 makes failure visible.

**New:**

- `/doctor` command — health check that reports: required-file presence, PROJECT.md format version (v1.0.76+ Stack/Type contract), artefact freshness per phase (audit/arch/qa/cso/ADR/digest with configurable max-age), Beads backlog (P0/P1/in_progress counts, stall detection), verdict log tail, PermissionDenied tail, scheduled-task health, plugin install integrity. No writes — diagnosis only. Ends with a prioritised "Next actions" list.
- `.great_cto/verdicts/YYYY-MM-DD.log` — one-line verdict each time a pipeline agent terminates. Format: `ISO_TS | agent | DONE|BLOCKED | artefacts=N | <domain_metric>`. Enables audit trail and powers `/doctor`.
- **Mandatory artefact post-condition** in `project-auditor`, `qa-engineer`, `security-officer`, `tech-lead`: before emitting DONE, each agent verifies its expected artefact file exists on disk. Missing file → `BLOCKED: <agent> post-condition failed — <path> not written` rather than a vacuous DONE.
- **SessionStart banner** (plugin.json hook):
  - Red P0 banner with top-3 P0 titles when any P0 is open.
  - Audit staleness warning when `docs/audit/AUDIT-*.md` is > 30 days old or absent.
  - Digest staleness warning when `.great_cto/digest-latest.md` is > 8 days old (catches broken Mon 09:00 scheduler).
- `doctor` added to the plugin's SessionStart CMD copy loop — `/doctor` is now available out of the box.

**Rationale: without these three layers (post-conditions + verdicts + banner), a pipeline that silently produces nothing is indistinguishable from a pipeline that was never run. The audit of <private-project> — 6 months of activity, 12 Beads issues, P0 leaked API keys open for 6 days — showed exactly that failure mode.**

---

## v1.0.78 — 2026-04-20

### Fixed — Spawned sub-agent reliability (bugs found during <private-project> pipeline run)

Three issues observed when spawning `project-auditor`, `qa-engineer`, and `security-officer` via the `Agent` tool from a parent session:

1. **`qa-engineer` returned "I need bash access"** despite `Bash` being in frontmatter `tools:`. Root cause: spawned sub-agents inherit the parent session's `permissionMode`. If the parent was in plan mode (or any restrictive mode), `Bash`/`Write` are blocked at the session layer regardless of what the agent declares.
2. **`security-officer` cut off mid-sentence** with no summary. Root cause: `maxTurns: 25` / `timeout: 600` was too tight for HIGH-effort security scans with CVE lookups.
3. **`project-auditor` / `qa-engineer` could not write artefacts** even when their analysis completed — same `PermissionDenied` cause as (1).

**Fixes:**

- `agents/security-officer.md` — bumped `maxTurns: 25 → 40`, `timeout: 600 → 900`, added `Edit` to `tools:`.
- `agents/qa-engineer.md` — bumped `maxTurns: 35 → 40`, `timeout: 600 → 900`, added `Edit` to `tools:`.
- **Pre-flight probe** in all three agents (`project-auditor`, `qa-engineer`, `security-officer`): before any real work, the agent attempts `mkdir -p .great_cto && touch .great_cto/.<name>-probe`. On `PermissionDenied`, it emits a clear `BLOCKED: permission denied (Bash/Write)` message with remediation (exit plan mode, or `/permissions` allow-list), rather than silently producing useless partial output.
- `README.md` — FAQ entry documenting the plan-mode inheritance issue and pointing users at `.great_cto/permission-denied.log`.

**Not fixed (by design):** the permission inheritance itself is a Claude Code platform behaviour, not something a plugin can override. The plugin's `PermissionDenied` hook (v1.0.x) already logs each denial to `.great_cto/permission-denied.log` for forensics.

---

## v1.0.77 — 2026-04-20

### Fixed — Docs + command-reference hygiene

Trivia release caught by a full command smoke test. Three user-facing hints still pointed at `/update` — a command removed in v1.0.52 — and the README version badge had been frozen at 1.0.70 for six releases. Zero behaviour changes, zero cache impact, zero agents touched.

**1. Stale `/update` references replaced:**
- `commands/digest.md:244` — "Consider /update to audit agent coverage" → "Consider /audit to scan agent/tooling coverage"
- `commands/start.md:260` — "sections (added later via `/update`)" → "sections (added later via `/audit` refresh or edited by hand as the project matures)"
- `commands/start.md:377` — "catalog unavailable — run /update when online" → "catalog unavailable — SessionStart hook will retry on the next session"

**2. README version badge + text** — 1.0.70 → 1.0.77 (line 6 badge, line 267 "actively maintained" line).

**Integration summary:**
- `commands/digest.md` (1 line): stale-command hint
- `commands/start.md` (2 lines): stale-command hints
- `README.md` (2 lines): version badge + maintenance copy

**Cache discipline.** Zero agent edits. SessionStart hook byte-identical with v1.0.76. Pure copy-fix release.

**Verification.** Full smoke test of all 10 commands and 7 agents: bash syntax OK (known `<placeholder>` false-positives preserved), SessionStart hook CMD/AGENT loops match filesystem (10 + 7), every `skills/great_cto/references/*.md` (12 files) exists, no orphaned subagent_type references, `/digest` board + architecture modes wired, `/rfc` team-size guard in place, `/start` three scheduled tasks (Mon digest + Sun audit + Q1 arch-review) for medium+ projects.

---

## v1.0.76 — 2026-04-19

### Fixed — Audit reliability: stop hallucinated types, surface Stack/Type in every report

Patch release driven by a real-world audit run on an AI-orchestrator project that produced two silent failures: a secondary type (`neobroker`) that does not exist in TYPE_MAP.md, and a chat summary with no Stack or Type line for the CTO to verify. Three narrow fixes close both holes without touching agents unrelated to audit.

**1. TYPE_MAP.md — new keyword row for AI orchestrators.**
Added `AI orchestrator, agent orchestrator, multi-agent orchestration, agent router, workflow orchestrator, agent coordinator → ai-agent-framework`. Projects that describe themselves as "orchestrator" now resolve deterministically instead of being forced into `ai-agent` + invented secondary.

**2. project-auditor Phase 7 — mandatory type validation.**
Before writing `.great_cto/PROJECT.md`, the detected primary and secondary types are validated against the canonical list of backticked tokens in TYPE_MAP.md. Invalid primary → **BLOCKED** with the 10 nearest valid types printed. Invalid secondary → dropped with a warning. No more silent inventions of vertical labels (`neobroker`, `fintech`, `crypto`) as types — those belong in a `## Domain` section, not `## Type`.

**3. project-auditor Phase 9 — Stack/Type lines are now mandatory, not optional.**
Reporting Contract upgraded: every DONE or BLOCKED summary MUST include two verbatim lines before the DONE/BLOCKED terminator:
```
Stack: <language> <major-version> / <primary framework> / <database> / <deploy target>
Type:  <primary> [+ <secondary>]   archetype: <archetype>
```
Detection-failure path is explicit (`Stack: detection failed (<reason>)`) rather than silent omission. Type-preservation path is explicit (`Type: <primary> (preserved, PROJECT.md < 7d old)`). Rationale: without these two lines the CTO cannot spot misdetection until it has already polluted the Beads backlog.

**Integration summary:**
- `skills/great_cto/TYPE_MAP.md` (+1 row): orchestrator keyword mapping
- `agents/project-auditor.md` (+45 lines): type validation block in Phase 7; mandatory summary block in Reporting Contract

**Cache discipline.** One agent edit (project-auditor only). Other six agents untouched. SessionStart hook byte-identical with v1.0.75 — full prefix cache survives.

**Backward-compat.** Strictly additive. Existing PROJECT.md files with valid types pass validation unchanged. The only "breaking" path is intentional: a future audit that would have hallucinated a type now blocks and asks for a canonical choice — this is the desired behaviour, not a regression.

---

## v1.0.75 — 2026-04-19

### Added — Synthesis consumers: executive narrative + quarterly architecture review

Fifth and final release in the arc (v1.0.71 → v1.0.75). **Zero agents touched.** Just `/digest` and `/start` — yet this is the largest functional delta of the arc. Q-review and the board narrative consume every artifact the four prior releases produced.

**Why last and why agents-free.** The v1.0.71–v1.0.74 releases added writing surfaces: risks, waivers, deprecations, SLOs, incident-log, pre-mortems, vendors, cost models, onboarding. This release adds the **reading surfaces** that turn those files into decisions. Keeping it agents-free preserves the prompt cache prefix exactly as it stood after v1.0.74 — CTOs who never invoke the synthesis modes pay zero cache cost.

**Two new synthesis modes in `/digest`:**

**1. Executive narrative** (extends `board` mode, auto-triggered). Appends a connected-story section to the board report: **What we shipped** (one-liner per ARCH-*.md / RFC-*.md from the period, each cited by artifact slug), **Why it matters** (synthesized from ARCH "Business context" + ADR rationale — no inventions), **Metrics that tell the story** (existing DORA numbers + trend interpretation), **Risks on the horizon** (top-3 H×H / H×M from RISK-REGISTER + any EXHAUSTED SLO row), **Next quarter focus** (Beads tasks tagged `epic:q<N+1>`). Synthesizer rule: every line traces to a file. Fallbacks for first-quarter / zero-risk / small-project.

**2. Architecture review** (new `architecture` mode: `/digest Q2 architecture`). Generates `docs/architecture/ARCH-REVIEW-<YEAR>-Q<N>.md` in **draft status** — CTO reviews and removes the `> Draft` marker to finalize. Subsequent runs refuse to overwrite finalized reviews. Sections: Decisions Landscape, Drift Analysis, God Nodes Evolution, Aged Tech Debt, Active Risks Summary, Unresolved Waivers, Pre-mortem Post-Reviews Due, Reliability Summary, Cost Drift, Deprecations on the Horizon, Recommendations for Q+1. Every recommendation cites its evidence. First run of each quarter snapshots `.great_cto/brain.md` as `brain-<Y>-Q<N>-snapshot.md` for the next review's diff base.

**Scheduled automation for Q-review.** `/start` registers a third scheduled task for `project_size: medium` or larger: `0 10 1 1,4,7,10 *` (1st of Jan/Apr/Jul/Oct at 10:00). Skipped for nano/small projects where Q-review is overkill.

**Integration summary:**
- `/digest` (+160): executive narrative builder extending board mode; full architecture review mode with draft-status protection + brain.md snapshotting
- `/start` (+15): third scheduled task (quarterly review) for medium+ projects

**Two new references** in `skills/great_cto/references/`: `board-narrative.md` (source mapping, synthesizer rules, fallback behaviors) and `quarterly-review.md` (input inventory from v1.0.71–v1.0.74, output schema, draft/final lifecycle, massive-review summarization rule, small-project skip).

**Backward-compat**: pure additive. Projects that never invoke `/digest architecture` see zero change (all existing modes unchanged). Projects that invoke `board` get the narrative section appended to their existing board report — original DORA table stays intact below. Every access guarded — missing sources produce explicit fallback text, never fabricated data.

**Cache discipline — the important one**: **zero agent edits this release**. The agents/*.md prompt surface is byte-identical to v1.0.74. SessionStart hook byte-identical (verified). `/digest` and `/start` are user-invocable commands — their output is outside the agent's prompt cache path entirely. Maximum feature delta, minimum prefix disruption.

**Behavioral change worth flagging**: `/digest board` now produces a longer output (narrative + DORA instead of DORA alone). `/digest architecture` is a new capability entirely. Neither changes any existing agent's behavior.

Files: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `commands/{digest,start}.md`, `skills/great_cto/references/{board-narrative,quarterly-review}.md` (2 new). **No agent files edited.**

### Arc summary (v1.0.71 → v1.0.75)

Five releases closed the gap between "Great CTO does X" and "plugin captures X":

| Release | Artifacts introduced | Files |
|---------|---------------------|-------|
| v1.0.71 | Risk register, waivers, deprecations | 3 new refs, 3 agent edits |
| v1.0.72 | SLO + INCIDENT-LOG + error budgets | 1 new ref, 3 agent edits |
| v1.0.73 | Pre-mortem + vendor register | 2 new refs, 2 agent edits |
| v1.0.74 | Cost attribution + onboarding | 2 new refs, 2 agent edits |
| v1.0.75 | Executive narrative + Q-review | 2 new refs, **0 agent edits** |

Total: **10 new references, 15 file edits, 5 new artifact families**, ~1000 LOC across 5 commits. Every release backward-compatible; every release preserved SessionStart hook byte-identical; every release additive with `[ -f ... ]` guards on every access.

---

## v1.0.74 — 2026-04-19

### Added — Cost attribution + auto-generated onboarding

Fourth release in the arc (v1.0.71 → v1.0.75). Addresses the "features ship, cost compounds, nobody tracks" problem and the "new engineer needs 2 weeks to ramp" problem — both by making previously-tribal knowledge into greppable files.

**Two new artifact patterns:**

**1. Cost Model section — inside each qualifying ARCH-*.md.** Not a separate file; kept coupled to the decision it justifies. Required for `project_size ≥ medium` OR archetype `ai-system`/`commerce`/`regulated`. Schema: runtime cost table (compute, database, data transfer, external APIs with vendor-register cross-reference), unit economics (per-DAU, per-transaction, break-even), cost controls (caps, rate limits, cache, scheduled scale-down), quarterly review cadence. For teams, the estimate mirrors into `OWNERSHIP.md` "Expected cost/mo" column so per-team cost attribution is answerable without re-parsing every ARCH.

**2. `docs/onboarding/README.md`** — synthesized single-file onboarding. project-auditor combines `.great_cto/brain.md`, `DECISION-LOG.md`, `CODEBASE.md` god-nodes, `OWNERSHIP.md`, runbooks, and top Beads tasks into a linear read. Regenerated monthly by `/digest`; first-created by `/audit` if `team-size ≥ 2`. Respects hand-edits (checks generated-date marker before overwriting).

**Actual-vs-estimate reconciliation** (optional). If the CTO wires a FinOps source to populate `.great_cto/cost-actual.log` via cron / GitHub Action, `/digest` flags any service > 20% over estimate at quarter start. No live billing integration inside the plugin — files only.

**Integration summary:**
- tech-lead (+21): Cost Model section injection in ARCH for qualifying projects; vendor-register cross-reference for external APIs
- project-auditor (+26): onboarding synthesis with conflict-flagging and hand-edit respect
- `/audit` (+26): cost-model coverage scan on IaC files; onboarding first-run generation
- `/digest` (+22): quarterly cost reconciliation; monthly onboarding refresh

**Two new references** in `skills/great_cto/references/`: `cost-model.md` (schema, data sources, OWNERSHIP.md coupling, actual-vs-estimate file format) and `onboarding.md` (schema, source mapping table, regeneration rules, conflict handling).

**Backward-compat**: pure additive. ARCH docs without Cost Model remain valid (retroactive enforcement absent). Projects without `docs/onboarding/` see zero change. Solo founders (team-size: 1) skip onboarding generation entirely. Every access guarded by `[ -f ... ]` / `[ -d ... ]`. Old `PROJECT.md` from v1.0.68–v1.0.73 works unchanged.

**Cache discipline**: tech-lead edited once more (4th consecutive release — each edit is an appended section, preserving stable prefix). project-auditor gets its first touch in this arc. security-officer, devops, l3-support all untouched this release. SessionStart hook byte-identical.

**Behavioral change worth flagging**: for `medium`+ ARCH docs, tech-lead now writes a Cost Model section as a mandatory part of output. CTO sees one more section in the ARCH doc (runtime cost + unit economics + cost controls). For smaller projects: zero change.

Files: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `agents/{tech-lead,project-auditor}.md`, `commands/{audit,digest}.md`, `skills/great_cto/references/{cost-model,onboarding}.md` (2 new).

---

## v1.0.73 — 2026-04-19

### Added — Forward-looking: pre-mortem + vendor register

Third release in the arc (v1.0.71 → v1.0.75). Moves risk thinking from reactive (postmortem after incidents) to proactive (pre-mortem before ship) and makes third-party vendor dependency a tracked artifact.

**Two new artifact families:**

**1. `docs/pre-mortems/PRE-<slug>.md`** — forward-looking failure analysis generated by tech-lead before finalizing ARCH. Triggered automatically when `project_size` is `large`/`enterprise`, or archetype is `web3`/`iot-embedded`/`regulated`, or CTO flags `risk: high`. Schema: scenario dated 6 months post-ship, ≥5 brainstormed failure modes, P×I ranking, early warning signs, mitigations mapped to gates, risks fed into the register. Distinct from ADR (decision record), postmortem (past incident), and threat model (adversarial security).

**2. `docs/vendors/VENDOR-<slug>.md`** — per-vendor register for paid SaaS / critical third-party services (Stripe, OpenAI, Twilio, etc.). Schema: role, criticality (critical/high/medium/low), SLA, incident history, fallback plan, compliance certs, contract/renewal, linked risks. Scope deliberately excludes npm libraries (those are deprecations.md) and low-criticality utilities (avoids register fatigue).

**Closing the learning loop.** Pre-mortems include an empty "Post-ship review" filled 90 days post-launch. `/digest` surfaces overdue reviews — scenarios that didn't happen teach what signal was noise; scenarios that happened but weren't brainstormed become future-pre-mortem prompts in `.great_cto/brain.md`.

**Integration summary:**
- tech-lead (+54): pre-mortem trigger+generation before ARCH finalizes; vendor check at ARCH time (block `critical` without fallback plan)
- security-officer (+38): pre-mortem mitigation-to-gate verification (unenforced H×H mitigations block gate:compliance); quarterly vendor review pass
- `/digest` (+28): overdue pre-mortem review reminder; quarterly vendor review trigger (month 1/4/7/10)
- `/audit` (+16): scan deps for known vendor SDKs, flag any without matching VENDOR-*.md

**Two new references** in `skills/great_cto/references/`: `pre-mortem.md` (triggers, brainstorming prompts, schema, post-ship loop) and `vendors.md` (criticality gate, review cadence, risk coupling).

**Backward-compat**: pure additive. Projects without `docs/pre-mortems/` or `docs/vendors/` see zero behavior change; every access guarded by `[ -f ... ]` / `[ -d ... ]`. Old `PROJECT.md` from v1.0.68–v1.0.72 works unchanged. `pre-mortem: skip` in PROJECT.md suppresses trigger for otherwise-qualifying repos.

**Cache discipline**: tech-lead + security-officer edited this release. tech-lead touched in v1.0.71, v1.0.72, v1.0.73 — each edit is additive/appended-section (prefix unchanged). security-officer untouched in v1.0.72; this is its second edit. `/audit` and `/digest` both touched again. SessionStart hook byte-identical.

**Behavioral change worth flagging**: for `large`/`enterprise` projects, ARCH now spawns a pre-mortem generation step before completing. CTO sees one additional artifact path ("Pre-mortem written → docs/pre-mortems/PRE-<slug>.md") and one optional step (approve/amend failure-mode brainstorm). For smaller projects: zero change.

Files: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `agents/{tech-lead,security-officer}.md`, `commands/{audit,digest}.md`, `skills/great_cto/references/{pre-mortem,vendors}.md` (2 new).

---

## v1.0.72 — 2026-04-19

### Added — Reliability layer: SLO, INCIDENT-LOG, error budgets

Second release in the arc (v1.0.71 → v1.0.75). Builds on the risk/waiver foundation from v1.0.71 to make reliability a **measured artifact** rather than tribal knowledge.

**Three new files managed by the plugin:**

**1. `docs/reliability/SLO.md`** — per-service SLO definitions + response policy. Seeded by tech-lead when a new network-facing service is introduced in ARCH (default: availability 99.9%, latency p95 < 200ms, error rate < 0.5%; 30d rolling window). CTO tightens or loosens based on product criticality. Tightening retroactively requires an ADR per the reference.

**2. `docs/reliability/INCIDENT-LOG.md`** — append-only, chronological, exact 4-line-per-entry format that `awk` can grep in one shot. Written by `l3-support` after every postmortem with SLI impact and by `devops` on canary failure (rollback triggered). Makes reality a first-class artifact alongside intent (SLO).

**3. `.great_cto/slo-budget-current.md`** — computed cache. `/digest` recomputes it from INCIDENT-LOG over the 30d rolling window. Statuses: `ok` / `warn` (50–80%) / `WARN` (80–100%) / `EXHAUSTED` (>100%). Read-only at runtime by `devops` (gate:ship blocks on EXHAUSTED, requires CTO approval on WARN) and `/inbox` (surfaces any WARN/EXHAUSTED row).

**Policy, not paging.** The layer is deliberately **manual reality log + computed budget** — no Datadog / Prometheus integration, no automated alerts, no per-endpoint SLOs. Alerts stay in the team's existing monitoring system; this is a **decision record** that makes "are we within budget?" answerable from files in the repo.

**Enforcement in the pipeline:**
- `ok` → proceed normally
- `warn` → log in RELEASE doc, proceed
- `WARN` (80%+) → devops pauses, requires CTO explicit approval
- `EXHAUSTED` (>100%) → **deploy blocked** except for hotfix with WAIVER per v1.0.71 enforcement
- Multiple SLIs burned simultaneously → tech-lead drafts `STABILITY-PLAN-<date>.md` within 24h; team executes a stability week before new features resume

**Integration summary:**
- tech-lead (+21): seed SLO.md entry when introducing new service in ARCH
- devops (+35): SLO budget check in gate:ship (block on EXHAUSTED, pause on WARN) + INCIDENT-LOG append on canary failure
- l3-support (+15): append INCIDENT-LOG on postmortems with SLI impact
- `/inbox` (+14): surface WARN/EXHAUSTED rows from budget cache
- `/digest` (+54): recompute SLO budgets from INCIDENT-LOG, write cache

**One new reference** in `skills/great_cto/references/`: `reliability.md` — canonical schemas for all three files, budget computation bash, entry format contract, source/consumer tables.

**Backward-compat**: pure additive. Projects without `docs/reliability/` see zero behavior change; every access guarded by `[ -f ... ]` / `[ -d ... ]`. Old `PROJECT.md` from v1.0.68–v1.0.71 works unchanged.

**Cache discipline**: three agent edits this release (tech-lead, devops, l3-support) — none of which were touched in v1.0.71's foundation release. Prompt prefix unchanged where possible.

Files: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `agents/{tech-lead,devops,l3-support}.md`, `commands/{inbox,digest}.md`, `skills/great_cto/references/reliability.md` (1 new).

---

## v1.0.71 — 2026-04-19

### Added — Foundation artifacts: risk register, waiver log, deprecation calendar

First release in a 5-part arc (v1.0.71 → v1.0.75) that closes the gaps between **"Great CTO does X"** and **"the plugin actually captures X"**. Release 1 lays three new artifact foundations that later releases consume.

**1. Risk register (`docs/risks/RISK-REGISTER.md`).** Persistent reality of active architectural, operational, and security risks. Different from backlog (tasks have done-state — risks don't) and from postmortems (past vs forward-looking). Scored by probability × impact over 6 months. Sources: tech-lead's ARCH "Risks" section, security-officer's CVE-pattern detection (3+ similar findings in 90d), recurring INCIDENT-LOG causes via `/digest`, deprecation EOLs approaching, manual CTO entries. Consumed by `/inbox` (top-5 H×H / H×M surfaces), `/audit` (pre-audit summary), and future pre-mortem synthesis.

**2. Waiver log (`docs/waivers/WAIVER-*.md`).** Makes "skip this gate" a **tracked artifact** instead of a silent shortcut. security-officer and devops now refuse to skip gates without a waiver containing: reason, follow-up action (Beads task created automatically), and expiry (max 14 days; 48h for emergency). `/inbox` surfaces expired waivers with open follow-ups; `/digest` detects repeat-skip patterns (same gate 3+ times in 90d) as a process-debt signal.

**3. Deprecation calendar (`docs/deprecations/DEPRECATION-CALENDAR.md`).** Explicit lifecycle for frameworks, APIs, runtimes, regions being sunset. tech-lead greps it before finalizing an ARCH stack — proposed use of a deprecated thing gets surfaced in the "Stack considerations" section. `/audit` auto-suggests entries for packages with > 24-month silent releases. `/inbox` shows EOLs within 90 days; `/digest` calls out EOLs within the next quarter. When an EOL < 6 months remaining has no active migration, `/audit` auto-creates a risk-register entry linking back.

**Integration summary:**
- tech-lead (+27 LOC): risk append from ARCH; deprecation consult before stack
- security-officer (+35): CVE-pattern → risk; waiver enforcement on gate:compliance skip
- devops (+15): waiver enforcement on gate:ship skip
- `/inbox` (+37): top risks, upcoming EOLs, waiver expiry
- `/digest` (+33): recurring-cause risk detection; waiver expiry + pattern; EOL calls
- `/audit` (+28): pre-audit risk summary; deprecation auto-suggest

**Three new references** in `skills/great_cto/references/`: `risk-register.md`, `waivers.md`, `deprecations.md` — canonical schemas with ID schemes, dedup rules, and lifecycle diagrams.

**Backward-compat**: pure additive release. Projects without the new artifacts see zero behavior change; agents check `[ -f ... ]` before every access. Old `PROJECT.md` from v1.0.68–v1.0.70 works unchanged.

**Cache discipline** (per v1.0.69): each agent edited exactly once in this release. `tech-lead.md` gets both risk and deprecation blocks in one delta; `security-officer.md` gets risk-pattern and waiver together; `devops.md` gets waiver only. Future v1.0.72–v1.0.75 will each touch different agents to keep prompt prefix stable across most releases.

**Behavioral change worth flagging**: gate skips are no longer silent. When CTO says "skip security this time", security-officer now demands reason + follow-up + expiry before proceeding. This is intentional — silent skips were the dominant source of tracked debt loss.

Files: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `agents/{tech-lead,security-officer,devops}.md`, `commands/{inbox,digest,audit}.md`, `skills/great_cto/references/{risk-register,waivers,deprecations}.md` (3 new).

---

## v1.0.70 — 2026-04-19

### Changed — Pareto simplification (UX surface shrunk; internals unchanged)

The 20% of the surface area that drives 80% of real usage now fits on one screen. Everything else is still present — just moved out of the first fold. Zero functionality removed; backward-compatible for every existing `PROJECT.md`.

**1. README rewrite.** Top fold is now four things: one-paragraph pitch, one `/start` example, one install command, three commands. Down from 430 to ~220 visible lines. Eight deep sections (`<details>`): ROI math, 10 archetypes, 13 compliance frameworks, 7 agents, artifacts, competitive compare. The first-time visitor reads in ~60 seconds instead of scrolling past 11 tables.

**2. Three primary commands, everything else demoted.** `/start`, `/review`, `/inbox` are the only commands on the first screen. `/audit`, `/rfc`, `/digest`, `/release`, `/ownership`, `/oncall`, `/triage` are still in `plugin.json` (nothing deleted from the plugin) but sit behind a collapsed "More commands" block.

**3. Pipeline sizes: 5 → 3 user-facing.** The CTO chats about `quick` / `standard` / `deep`. Internally the five canonical sizes (`nano` / `small` / `medium` / `large` / `enterprise`) still back the agents — `/start` maps user-facing to internal at write time. Agent files untouched (preserves the cache discipline from v1.0.69).

**4. Approval levels: 5 → 2 user-facing.** Default is `review` (the old `gates-only`); `auto` is unchanged. The three advanced levels (`strict`, `expert`, `step-by-step`) remain opt-in — written verbatim to PROJECT.md when the CTO asks for them. All seven agents continue to grep for the canonical names.

**5. "73 types" removed from user-facing docs.** `TYPE_MAP.md` is now marked **internal** in its header — it's an auto-detection dispatch table, not user configuration. `README.md` no longer surfaces the "73 types" count. The 10 archetypes stay; the CTO never picks a type manually.

**Backward compat**:
- Every existing `PROJECT.md` from v1.0.68/v1.0.69 keeps working without migration
- Agents read the same canonical values as before (`nano`…`enterprise`, `gates-only`…`step-by-step`)
- The simplification is purely a UX layer over unchanged internals

**What we did NOT change**:
- 12-angle `/review` (killer feature, untouched)
- brain.md, CODEBASE.md, HANDOFF.md hooks
- Advisor pattern (Opus escalation)
- Agent files (cache discipline preserved per v1.0.69)
- `plugin.json` command list (all 10 commands still dispatch)
- Compliance auto-detection, packs, archetypes

Files: `README.md`, `commands/start.md`, `skills/great_cto/ARCHETYPES.md`, `skills/great_cto/TYPE_MAP.md`, `.claude-plugin/plugin.json`, `docs/plans/PLAN-pareto-simplification.md` (new).

---

## v1.0.69 — 2026-04-19

### Changed — Cache discipline across SessionStart, /review, and file globs

Five surgical changes that make our prompt structure cache-friendly for the KV-cache in Claude Code's transport. Zero semantic change — same data, same agents, same gates. Just stable-prefix-first / volatile-suffix-last.

**1. SessionStart hook reorder** (`.claude-plugin/plugin.json`). `=== LOCAL ===` moved from the top (between PREFERENCES and PROJECT) to after CODEBASE and before HANDOFF. The stable prefix is now: `PREFERENCES → PROJECT → PHASE → BRAIN → CODEBASE`, followed by the volatile `LOCAL → HANDOFF → QA/CSO/PERF → STATUS`. A CTO edit to `.great_cto/local.md` no longer invalidates the cache for PROJECT/brain/codebase.

**2. Phase cache implication documented** in `skills/great_cto/references/phases.md`. Switching phase mid-pipeline is now flagged as a cache-invalidation event. Switch between pipelines (after gate:ship closes), not during one.

**3. Deterministic sort on every `ls *.md` / `find … *.md` that feeds context** — `commands/inbox.md`, `commands/digest.md`, `commands/release.md`, `commands/rfc.md`, `commands/oncall.md`, `commands/audit.md`, `commands/start.md`. Previously filesystem order leaked into prompts (different on macOS HFS+ vs APFS vs Linux ext4), producing different token prefixes across runs. Every list is now `| sort`-stable.

**4. Runtime-immutability rule for `agents/*.md` and `commands/*.md`** added to the File Layout Invariant in `skills/great_cto/SKILL.md`. Task-specific state flows through `$ARGUMENTS`, `bd`, or sibling files — never through mutation of an agent document. Preserves the largest cache-hot blocks we ship.

**5. `/review` cache-discipline note** (`commands/review.md`) after Setup, before Angle 1. The diff + archetype + design-system detection is the stable prefix across all 12 angles; re-reading or reordering it between angle evaluations forfeits prefix caching. Codified so future edits don't regress.

**Why this is the right ROI:**
- Zero-risk edits: every change is a one-line doc note, a one-argument `| sort`, or a single block reorder
- Total ~30 LOC across 10 files; each item independently reversible
- Biggest practical win on `/review` (12 angles × same diff) and on daily `/inbox` runs

**Source of principles:** prompt-caching works on exact-token-prefix match; any edit in the middle invalidates everything after. Our job is just to keep volatile content at the tail.

Files: `.claude-plugin/plugin.json`, `commands/{inbox,digest,release,rfc,oncall,audit,start,review}.md`, `skills/great_cto/SKILL.md`, `skills/great_cto/references/phases.md`, `docs/plans/PLAN-cache-discipline.md` (new).

---

## v1.0.68 — 2026-04-19

### Added — `/triage`, DONE/BLOCKED contract, file-layout invariant

**1. New command `/triage`** — cross-backlog reorganizer. Reads every open Beads task and analyzes along exactly four axes:
- **Duplicates** — same scope under different wording; keeps the better-scoped copy
- **Misplaced** — label/epic mismatch; verifies destination scope before moving
- **Priority inversions** — foundational/unblocking items buried under user-facing ones (ranks by unblock count, not visibility)
- **Cross-cutting gaps** — work referenced in ARCH docs or retros but not tracked

Presents a structured diff first and never writes until the CTO says `approve`. Self-critique pass covers false duplicates, priority-by-visibility, orphaning, and missing-evidence gaps. Caps the plan at 30 actions per invocation; backlogs > 200 items require a label filter.

**2. New skill `skills/done-blocked/SKILL.md`** — reporting contract. Terminal agent verdicts must be exactly one of:
- `DONE: <summary>` + `artifact` + `next`
- `BLOCKED: <obstacle>` + `tried` + `failed_because` + `need`

Hard rule: no third state, silence ≠ DONE, `failed_because` must be concrete (not "unclear"), `need` must name a specific unblock. Wired into all 7 agents (tech-lead, senior-dev, qa-engineer, security-officer, devops, l3-support, project-auditor) as a short "Reporting Contract" section at the end of each agent doc. Verdicts continue writing to `.great_cto/verdicts/*.log` — now with a defined shape so the digest can compute DONE:BLOCKED ratio per agent.

**3. File-layout invariant** added to `skills/great_cto/SKILL.md` (§ "File Layout Invariant") — distinguishes **agent-context** (curated markdown, committed, read on every turn) from **runtime-state** (side-effect logs, caches, gitignored). Decision heuristic: "would I want git blame on this line?" Yes → agent-context. No → runtime-state.

**Why this is the right ROI:**
- `/triage` replaces ad-hoc backlog grooming with a measurable, repeatable pattern; cold path so it doesn't cost tokens when unused
- DONE/BLOCKED is one paragraph per agent but makes the handoff pipeline machine-readable
- The invariant prevents future drift — new contributors won't accidentally commit `verdicts/*.log`

Files: `commands/triage.md` (new), `skills/done-blocked/SKILL.md` (new), `skills/great_cto/SKILL.md` (§ added), all 7 agent docs (+ skill ref + reporting contract section), `.claude-plugin/plugin.json` (CMD loop + version).

---

## v1.0.67 — 2026-04-19

### Changed — Coordinator + references split for `skills/great_cto/SKILL.md`

`skills/great_cto/SKILL.md` stays short and scannable; cold-path sections move to `references/` and are pulled only when the CTO says the triggering phrase.

**Extracted (cold path — loaded on demand):**
- `references/phases.md` — phase table (planning / implementation / review / release), switching logic, semantics. Triggered when CTO says *"move to X phase"*.
- `references/decision-log.md` — append logic, entry format, ADR-vs-Decision-Log routing. Triggered when CTO says *"log decision"* / *"we decided X"* / `decision:`.

**Kept inline (hot path — needed every CTO message):**
- Intent mapping, conventions, pipelines, CTO signals — all still in `SKILL.md`. Moving these to references would force a reference load on every turn, defeating the point.

**Why this split:** the Phases section (~30 lines) and Decision Log section (~40 lines) together accounted for ~70 lines of SKILL.md that were almost never needed in any given session. Extracting them trims the coordinator to the decisions Claude makes on every message, without losing any content — the references are one `Read` away when the triggering phrase fires.

Files: `skills/great_cto/SKILL.md` (sections replaced with link stubs), `skills/great_cto/references/phases.md` (new), `skills/great_cto/references/decision-log.md` (new).

---

## v1.0.66 — 2026-04-19

### Added — Skeptical-triage skill + `/review --deep` flag

The 3-round + arbiter pattern from v1.0.65 is now a reusable skill, available to any agent that needs to filter false positives before a gate decision.

**New skill:** `skills/skeptical-triage/SKILL.md` — the canonical definition of the pattern (Round 1 Reachability → Round 2 Verify Defenses → Round 3 Missed Angles → Arbiter + crux). Hard rules, confidence scoring, severity demotion table, and JSONL log schema all live in one place.

**New flag:** `/review --deep` — triage P0/P1 findings from **all** 12 angles (not just security/reliability 2/4/7/9). Use on high-stakes PRs or release candidates where the cost of a false-positive gate:code block is high. Default behavior unchanged.

**Wired into:**
- `commands/review.md` — now references the skill instead of duplicating rules. `--deep` expands triage scope.
- `agents/security-officer.md` — references the skill for CSO audit findings.
- `agents/qa-engineer.md` — can apply triage to flaky regression verdicts (real regression vs. test pollution).
- `agents/tech-lead.md` — can apply triage to contested ADR trade-offs.

**Log schema** (`.great_cto/triage-log.jsonl`, append-only):
```json
{"timestamp": "...", "caller": "review|security-officer|qa-engineer|tech-lead",
 "finding_id": "...", "original_severity": "P0", "rounds": [...],
 "arbiter": {"verdict": "VALID", "crux": "..."}, "confidence": 0.67,
 "final_severity": "P0"}
```

Use this to measure whether triage earns its keep: `jq 'select(.arbiter.verdict=="INVALID")' .great_cto/triage-log.jsonl | wc -l` gives the FP filter rate. If <10% — triage is filtering noise that wasn't there (tighten original prompts). If >40% — original angle rules are too trigger-happy.

**Why a skill instead of inline text:** four callers now need the same pattern. DRY. Single place to update rules, single place to measure effectiveness, single schema for the triage log.

Files: `skills/skeptical-triage/SKILL.md` (new), `commands/review.md`, `agents/security-officer.md`, `agents/qa-engineer.md`, `agents/tech-lead.md`.

---

## v1.0.65 — 2026-04-19

### Added — Skeptical triage for P0/P1 security findings

`/review` now runs a 3-round self-challenge + arbiter pass over P0/P1 findings from Angles 2 (Security), 4 (SQL Safety), 7 (Data Privacy), 9 (Concurrency) before creating `gate:code`. `security-officer` applies the same pattern to CSO audit findings before blocking `gate:ship`.

**How it works:**

1. **Round 1 — Reachability:** can an attacker actually reach this code with untrusted input?
2. **Round 2 — Verify defenses:** every cited defense must be grep-confirmed. Constant names are not verified bounds — resolved numeric values are.
3. **Round 3 — Missed angles:** error paths, integer edges, race windows — what did prior rounds not consider?
4. **Arbiter:** final VALID / INVALID + one-sentence `crux` (the single key fact the verdict turns on).

**Confidence** = `valid_rounds / 3`. Findings:
- `INVALID` → filtered from gate tally (recorded as `[FILTERED]` for audit)
- `VALID` + confidence < 50% → demoted P0→P1, P1→P2
- `VALID` + confidence ≥ 50% → keep severity

**Hard rules:**
- *Absence of defense → VALID, not UNCERTAIN* (don't hide behind "probably handled elsewhere")
- *Code quality issue ≠ security vulnerability* (data races on diagnostic state, NULL checks on internal-only APIs → INVALID)
- *Do not contradict your own conclusion in the same response*

**Hard findings skip triage** (always P0): secrets in source/git history, confirmed CVEs with exploit in installed version.

**Why:** single-pass 12-angle review produces ~30-50% false positives on P0/P1 security findings. Triage filters those before they turn into `gate:code` blocks that CTO has to manually override. Net cost: ~4 extra LLM turns per triaged finding; net savings: less CTO context-switching on noise.

Output example:
```
🔥 100% [VVV→V] auth.c:142 — stack overflow in parse_header
     CRUX: len comes from wire, memcpy into 64-byte buf, no bound check
🤔  33% [IIV→I] session.c:88  — (FILTERED — arbiter INVALID)
     CRUX: lookup_session only called from trusted internal path
```

Files: `commands/review.md`, `agents/security-officer.md`.

---

## v1.0.64 — 2026-04-18

### Added — Traceability graph via bd labels

Requirements → Implementation → Tests now form a queryable graph using Beads labels and deps — no new storage, no extra MCP servers.

**How it's built:**
- `tech-lead` creates one bd task per REQ-N after writing the Requirements Checklist, with labels `req` + `feature-<slug>`
- `senior-dev` wires `bd dep IMPL REQ` when claiming the impl task, and lists linked REQs in the PR body (`## Implements REQs`)
- `qa-engineer` creates a TEST task per COVERED REQ and wires `bd dep TEST IMPL`, closing immediately with the evidence reference

**Query it:**
```bash
/review trace R-042              # show tree rooted at REQ R-042
/review trace feature-checkout   # show full feature tree (REQ → IMPL → TEST, coverage)
/review trace I-087              # upstream (what I-087 depends on) + downstream
```

Answers questions like _"if I change R-042, what breaks?"_ via `bd deps R-042 --reverse`.

**Graceful degradation:** if `bd` is unavailable, the ARCH-*.md Requirements Checklist remains the fallback trace. The QA report's inline REQ → Evidence lines continue working.

Our version piggybacks on existing `bd` primitives instead of building a separate store.

Files: `agents/tech-lead.md`, `agents/senior-dev.md`, `agents/qa-engineer.md`, `commands/review.md`. Patch 3/3 of phases-traceability-decisions plan — completes the trio.

---

## v1.0.63 — 2026-04-18

### Added — Phase-filtered SessionStart

`.great_cto/PROJECT.md` now supports a `phase:` field that tells the SessionStart hook which context to load. Four phases — `planning`, `implementation` (default), `review`, `release` — each loads a different slice of context, saving tokens and reducing noise.

**Loaded per phase:**

| Phase | Loaded | Skipped |
|---|---|---|
| `planning` | PROJECT.md, brain.md, digest-latest | CODEBASE, HANDOFF, QA/CSO, perf |
| `implementation` | PROJECT.md, brain.md, CODEBASE, HANDOFF | digest, QA/CSO, perf |
| `review` | PROJECT.md, HANDOFF, latest QA, latest CSO | brain, CODEBASE, digest |
| `release` | PROJECT.md, HANDOFF, perf-baseline tail | brain, CODEBASE, QA/CSO |

**Switch in chat:** "move to review phase" / "planning phase" / "release phase" — orchestrator updates `phase:` in PROJECT.md. Pipeline rules (agents, gates) are unaffected — phase only controls hook context.

**Backward compatible:** missing `phase:` field falls back to `implementation`. Tested with 4-phase fixture matrix.

Files: `.claude-plugin/plugin.json`, `commands/start.md`, `skills/great_cto/SKILL.md`, `packages/cli/src/bootstrap.ts`. Patch 2/3 of phases-traceability-decisions plan.

---

## v1.0.62 — 2026-04-18

### Added — Decision Log

Non-architectural decisions (process changes, vendor picks, waivers, reversible calls) now have a first-class artifact: `docs/decisions/DECISION-LOG.md`. Complements existing ADR files in the same directory — ADRs stay for architecture trade-offs, the Decision Log captures everything else that used to be buried in Slack or `brain.md`.

**Trigger:** Say "log decision", "we decided X", or prefix a message with "decision:" in chat. The orchestrator appends a sequential `D-NNNN` entry with context, decision, alternatives, reversibility, and owner.

**Surfaced:** Last 3 entries shown in `/inbox` under a new `RECENT DECISIONS` section (only when the log has entries).

**Seeded:** `/start` scaffolds an empty `DECISION-LOG.md` alongside `brain.md` seeding.

Files: `commands/start.md`, `commands/inbox.md`, `skills/great_cto/SKILL.md`, `.claude-plugin/plugin.json`. ~35 LOC added.

---

## v1.0.61 — 2026-04-17

### Added — `npx great-cto init` one-command installer

Install friction reduced from 5 manual steps to 1 command. New `great-cto` npm package in `packages/cli/` (separate from plugin, published to npm).

```bash
npx great-cto init
```

**What it does:**
1. Scans the current directory — `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Chart.yaml`, `*.tf`, `hardhat.config.*`, `platformio.ini`, and more
2. Picks the matching archetype out of 11 (web-service, mobile-app, ai-system, commerce, web3, data-platform, infra, library, iot-embedded, regulated, greenfield)
3. Clones the latest plugin tag into `~/.claude/plugins/cache/local/great_cto/<version>/`
4. **Atomically** merges `enabledPlugins: { "great_cto@local": true }` into `~/.claude/settings.json` — timestamped backup, other keys preserved
5. Writes `.great_cto/PROJECT.md` pre-filled with archetype, stack, suggested compliance frameworks (GDPR, PCI-DSS, EU AI Act, etc.)

**Flags:**
- `--dry-run` — show what would happen, no changes
- `--force` — reinstall even if present
- `--archetype NAME` — override auto-detected archetype
- `--version-tag VER` — pin to a specific plugin version
- `-y, --yes` — non-interactive

**Detection coverage:** 50+ framework / library signals across TypeScript, Python, Go, Rust, Java/Kotlin, Swift, Solidity, and infrastructure files. Pure Node ≥22 with native TypeScript — zero runtime dependencies, MIT, lives under `packages/cli/`.

**README reorg:** `npx great-cto init` is now the primary install path on the README front page. Manual git-clone install demoted to a collapsible `<details>` block for advanced users.

---

## v1.0.60 — 2026-04-17

### Fixed — audit-driven corrections

Post-release audit of v1.0.59 surfaced inconsistencies between README claims and actual hook/frontmatter behavior. This release fixes all P0 findings.

**Fix #1 — `brain.md` now injected into subagents (was docs-only before)**
The README has always promised: *"SessionStart injects brain.md into every agent."* Reality was that SubagentStart only cat'd `PROJECT.md | head -15`. Agents started via Task/Agent tool never received the compiled knowledge base.

Updated SubagentStart hook now injects three blocks:
- `PROJECT.md` (first 15 lines) — unchanged
- `brain.md` Current Synthesis section (or first 30 lines) — **new**
- `HANDOFF.md` (first 20 lines) — **new** — previous session state carries forward

This closes the biggest behavioral gap in the plugin: *"agents that get smarter over time"* now actually works end-to-end.

**Fix #2 — `qa-engineer` skills declaration**
`agents/qa-engineer.md` calls `bd` (Beads CLI) 5 times in its body but was missing `skills: [beads]` in frontmatter — the only agent without it. Added. Prevents silent skill-load failures when qa-engineer runs standalone.

**Fix #3 — `tech-lead` model pinned**
`model: opus` (alias) → `model: claude-opus-4-7` (pinned). All other agents already pin API IDs. Now the convention is consistent across all 7 agents: pinned IDs, explicit at release time, guaranteed reproducibility.

**Fix #4 — stray test artifact removed from repo root**
Moved `QA-TEST-REPORT-stack-migration.md` (April 7 test run) from root to `docs/qa-reports/`.

**Fix #5 — README links demo/ and docs/eval/**
The `demo/` directory (saas-api, smart-contract, trading-bot) and `docs/eval/` (5 pipeline evals) existed in the repo but were never linked from README. Users couldn't find them. Added to Links section.

---

## v1.0.59 — 2026-04-16

### Changed — Opus 4.7 advisor upgrade

Anthropic released [Claude Opus 4.7](https://www.anthropic.com/news/claude-opus-4-7) on 2026-04-16 with +13% on SWE-bench and 3x more production tasks resolved on Rakuten-SWE-Bench vs Opus 4.6.

**Advisor model bumped `claude-opus-4-6` → `claude-opus-4-7`** in:
- `agents/senior-dev.md` — advisor for architectural trade-offs during TDD
- `agents/security-officer.md` — advisor for compliance + threat modeling
- `commands/review.md` — advisor for 12-angle code review (concurrency, LLM trust)

**tech-lead** uses `model: opus` alias — auto-resolves to Opus 4.7 with no change needed.

**Sonnet 4.6 + Haiku 4.5** unchanged (no new versions released).

**README updated**: agent table, /review mention, "Built with" list.

**No cost change** — Opus 4.7 is priced identically to 4.6 ($5 in / $25 out per MTok).

---

## v1.0.58 — 2026-04-16

### Added — CODEBASE.md: zero-dependency codebase map for existing repos

Inspired by graphify (knowledge graph tool), implemented with pure bash — no external dependencies.

**Codebase map generation in `tech-lead`** (`agents/tech-lead.md`):
- Activates only when `greenfield: false`
- Generated once, cached at `.great_cto/CODEBASE.md` — subsequent agents read the cache
- Generated with a single bash block, no pip/npm/cargo install required
- **5 sections:**
  1. **Entry points** — main.ts / app.py / cmd/main.go etc.
  2. **Module structure** — file count per directory (community detection by density)
  3. **God nodes** — most-imported modules across TS/JS/Python/Go (highest coupling = change carefully)
  4. **Public API surface** — exported functions, classes, interfaces (TS)
  5. **Routes / endpoints** — all HTTP handlers detected by pattern matching
  6. **Data models** — schema.prisma, models.py, .sql files (first 50 lines)
- ~30x token reduction for codebase orientation vs reading raw files

**`senior-dev` reads CODEBASE.md** before implementation (`agents/senior-dev.md`):
- Step 4 "Read context" now starts with `cat .great_cto/CODEBASE.md | head -40`
- God nodes flagged: highest-coupling modules require more careful changes

**SessionStart injects CODEBASE.md** (`.claude-plugin/plugin.json`):
- `head -20 .great_cto/CODEBASE.md` shown alongside PROJECT.md + brain.md at session start
- Every session starts with codebase orientation for existing repos

**Why vs graphify**: graphify gives 71.5x reduction with AST + embeddings but requires `pip install`. This gives ~30x with zero dependencies — works immediately on any project.

---

## v1.0.57 — 2026-04-16

### Added — Design System audit as Angle 12 in `/review`

Based on analysis of `material-3-skill` article (Habr #1023084).

**Angle 12 — Design System Reviewer** (`commands/review.md`):
- Activates only for `mobile-app` and `web-service` archetypes. Skipped for all others.
- Auto-detects design system from codebase: `material3`, `tailwind`, `swiftui`, `rn-custom`
- **8 check categories** with matching token vocabulary per system:
  - **Hardcoded colors** — hex/raw color values instead of design system tokens (breaks dark mode + theming)
  - **Hardcoded typography** — literal font sizes instead of type scale tokens
  - **Hardcoded spacing** — magic px/dp values instead of spacing scale
  - **Wrong components** — raw primitives when a design system component exists
  - **Accessibility (P0)** — missing `contentDescription`/`aria-label`, touch targets < 48dp/44pt, color-only information
  - **Elevation/shadow** — raw shadow values instead of design system elevation tokens
  - **Dark mode safety** — colors that break in dark mode
  - **Motion** — hardcoded animation durations instead of motion tokens
- P0 = accessibility violation blocking users, P1 = hardcoded value breaking theming/dark mode, P2 = inconsistency
- Verdict log now includes `archetype=` field
- Summary updated: 11 angles → 12 angles

**Why**: Material Design 3 article showed that design-system compliance is automatable the same way SQL safety is — specific patterns, specific fixes, no subjectivity needed.

---

## v1.0.56 — 2026-04-15

### Added — GBrain-inspired compiled truth system (brain.md)

Based on analysis of GBrain Skillpack (garrytan/gbrain).

**1. brain.md initialized on `/start`** (`commands/start.md`):
- Every new project seeds `.great_cto/brain.md` with structured template
- Sections: Current Synthesis (architecture patterns, failures, tech debt, team patterns) + Evidence Timeline
- Created once; never overwritten — subsequent runs are no-ops

**2. Brain-first lookup in `tech-lead`** (`agents/tech-lead.md`):
- Step 1 reads `.great_cto/brain.md` before designing architecture
- Extracts: patterns in use, known failures to avoid, tech debt context, team patterns
- First-feature projects get "NO_BRAIN" signal and skip lookup

**3. Brain write after ARCH doc** (`agents/tech-lead.md`):
- Appends to Evidence Timeline after each architecture decision
- Records: date, feature name, archetype, pipeline size, ADR count, key decisions
- Evidence is append-only; synthesis is recomputed by /digest dream cycle

**4. Dream Cycle in `/digest`** (`commands/digest.md`):
- Creates brain.md if missing (digest-only projects without /start)
- Appends to Evidence Timeline: velocity, postmortem count, security blocks, retro signals, P2 count
- Updates Current Synthesis sections when signals cross thresholds
- Uses advisor (Sonnet 4.6, max 1) for prose synthesis

**5. SessionStart injects brain.md** (`.claude-plugin/plugin.json`):
- `head -30 .great_cto/brain.md` injected into every session after PROJECT.md
- Agents start each session aware of accumulated project knowledge

**Why**: Each session was starting cold — no memory of past architectural decisions, known failures, or team patterns. Agents repeated past mistakes. Brain-first lookup + dream cycle creates a living knowledge base that improves with each feature shipped.

---

## v1.0.55 — 2026-04-15

### Added — Pipeline Triad improvements

**1. Discovery guard in `/start`** (`commands/start.md`):
- Detects vague/research/MVP-without-requirements descriptions before type detection
- Signals: "explore", "figure out", "not sure", "validate idea", "PoC", "experiment", etc.
- Shows warning with alternatives: discuss first / /audit / "I know what to build"
- Does NOT trigger for "prototype JWT auth" or "MVP for SaaS dashboard" (clear deliverables)

**2. Cost estimate in `tech-lead` Checkpoint A** (`agents/tech-lead.md`):
- Shows token/cost/time estimate before CTO approves architecture
- Table: nano ~$0.10 / small ~$1 / medium ~$4-6 / large ~$10-14 / enterprise ~$20-30
- Adds ~20% for MANDATORY security gate archetypes
- Notes advisor (Opus) call surcharge when applicable

**3. Eval Harness** (`docs/eval/`):
- 5 canonical test cases covering key pipeline behaviors
- EVAL-001: CRUD endpoint (baseline, web-service small)
- EVAL-002: JWT auth service (commerce mandatory security gate)
- EVAL-003: Discovery guard triggers correctly (positive + negative cases)
- EVAL-004: Hotfix nano — senior-dev only, no ARCH doc
- EVAL-005: Security officer blocks SQL injection, approves after fix

**4. `/audit eval` action** (`commands/audit.md`):
- `/audit eval` runs all EVAL-*.md assertions
- Reports PASS / FAIL / WARN per case
- Shows score: N/5 passing
- FAIL cases show specific missing artifact + remediation hint

**Why**: Pipeline Triad article identified that pipelines fail when fed discovery tasks.
Cost visibility before gate:arch prevents surprise spend. Eval harness catches
agent regressions after prompt changes.

---

## v1.0.54 — 2026-04-15

### Added — Advisor Tool, Memory Tool, Automatic Caching

Based on analysis of Anthropic API changelog (April 9 + February 19, 2026).

**#1 Advisor Tool (`advisor_20260301`) — public beta since April 9, 2026:**

Executor model calls advisor mid-generation when uncertain. Beta header: `advisor-tool-2026-03-01`.

| Agent / Command | Executor | Advisor | max_uses | When advisor activates |
|----------------|----------|---------|---------|----------------------|
| `qa-engineer` | haiku | sonnet | 2 | edge case test coverage decisions |
| `security-officer` | sonnet | opus | 2 | compliance edge cases (regulated/web3) |
| `senior-dev` | sonnet | opus | 1 | architectural trade-offs not in ARCH doc |
| `devops` | haiku | sonnet | 1 | deployment strategy questions |
| `/review` | sonnet | opus | 2 | subtle concurrency / LLM trust issues |
| `/digest` | haiku | sonnet | 1 | RECOMMENDATION quality |

`tech-lead` already uses Opus — no advisor needed.

**#2 Memory Tool (`memory_20250929`) — GA since February 17, 2026:**

Intra-session memory for architectural context propagation:
- `tech-lead` writes key decisions to memory after ARCH doc (pattern, stack, constraints, rejected alternatives)
- `senior-dev` reads tech-lead memory before implementation — no need to re-derive from full ARCH doc
- `qa-engineer` and `security-officer` get memory access for cross-agent context

**#3 Automatic Caching — GA since February 19, 2026:**

Reordered SessionStart hook output: stable content first → higher cache hit rate.
- Was: PREFERENCES → PROJECT → LOCAL → HANDOFF → STATUS
- Now: PREFERENCES → LOCAL → PROJECT → HANDOFF → STATUS
- LOCAL (rarely changes) now before PROJECT (changes per feature)

**#4 Haiku-3 deprecation check — CLEAN:**

No explicit `claude-3-haiku` IDs found in agents or commands. All aliases (`haiku`, `sonnet`, `opus`) resolve to 4.5/4.6 automatically. No action needed.

---

## v1.0.53 — 2026-04-14

### Added — `/release` command for frontend and mobile releases

**`commands/release.md`** — 4 actions:
- `notes [version]` — writes App Store (4000 chars), Google Play (500 chars), in-app modal text. Filters out internal/infra commits automatically.
- `changelog [from..to]` — translates git commits → user-facing `CHANGELOG-USER.md` (separate from technical CHANGELOG.md). Groups related commits, omits internal changes.
- `docs` — flags stale help center articles, landing page sections, and guides based on new features. Does not auto-edit — flags only.
- `sync` — checks version consistency across package.json, build.gradle, Info.plist, PROJECT.md + verifies all release artifacts exist.

Archetype-aware: proceeds for `mobile-app`, `web-service`, `commerce`, `ai-system`. Warns for `library`, `infra`, `data-platform`.

**Why**: devops agent writes technical CHANGELOG.md. Nobody writes the App Store notes, user changelog, or checks which help articles are stale. This does that.

---

## v1.0.52 — 2026-04-14

### Changed — Reduced from 13 commands to 5

**Deleted** (5 commands): `/status`, `/capture`, `/revisit`, `/board-report`, `/update`
- `/status` duplicated `/inbox` (>60% overlap)
- `/capture`, `/revisit` — rarely used, replaceable via chat
- `/board-report` → merged into `/digest` as flag: `/digest Q2 board`
- `/update` → SessionStart hook already handles file sync

**Demoted to extended** (still callable, not advertised): `/digest`, `/ownership`, `/oncall`

**Modified**:
- `commands/digest.md` — added `board` flag: `/digest Q2 board` generates board-report and saves to `docs/board-reports/`
- `commands/rfc.md` — added team-size guard: shows warning if team-size < 10
- `commands/start.md` — confirmation hint updated (no more /ownership and /oncall references)
- `plugin.json` — CMD loop reduced from 13 to 8 commands; version 1.0.51 → 1.0.52
- `README.md` — 5-command structure with extended section

**Why**: Solo founders and small teams shouldn't need to learn 13 commands. The 5 primary commands cover 95% of daily use. Everything else is either automatic or accessible when you need it.

---

## v1.0.51 — 2026-04-14

### Changed — Focused positioning: solo founders and teams up to 50 engineers

**README**:
- Tagline: "Replace your engineering bottleneck" → "The engineering process for solo founders and teams up to 50 engineers"
- Why this matters: removed corporate tone → concrete pain of solo/small team
- Use Cases table: "20-200 engineers" → "10-50 engineers", added solo founder row
- Team commands section: "20-200" → "10-50"
- Built with: "200-person" → "50-engineer"

**plugin.json description**: updated to match new positioning
- Was: "Automated SDLC framework for CTOs. One account = one project..."
- Now: "Engineering process for solo founders and teams up to 50 engineers. Agents do architecture, code review, QA, and security. You make two decisions per feature."

**commands/start.md**: confirmation message shows team setup hint when team-size ≥ 5

**Why**: 200-person teams have Jira, Engineering Managers, platform teams — great_cto can't compete there. The real value is 5-50 engineers who need process without overhead.

---

## v1.0.50 — 2026-04-14

### Fixed — 5 integration gaps

**`/digest` + `/inbox` + `/status`** → Team section:
- Shows on-call person, RFC overdue count, ownership gaps
- Hidden when team commands not configured (no noise for solo projects)
- RECOMMENDATION examples extended with RFC/oncall/ownership signals

**`l3-support`** → reads OWNERSHIP.md for P0 escalation:
- Finds affected service owner from OWNERSHIP.md before escalating
- Gets current on-call from oncall-schedule.md (fallback: PROJECT.md)
- Escalation path: on-call → team lead (from OWNERSHIP) → CTO
- Added `approval-level` read: `auto` → skip postmortem

**`/board-report`** → reuses `digest-latest.md` if <7 days old:
- Extracts COMMITS, DEPLOY_COUNT, OPEN_P0 from existing digest
- Falls back to raw data collection only if digest is stale

**`/start`** → team-size aware initialization:
- `team-size:` field added to PROJECT.md template
- If team-size ≥ 5 and no OWNERSHIP.md exists → auto-scaffolds ownership table from detected service roots
- Tells CTO: "OWNERSHIP.md scaffolded → fill in team details"

**README demo** → two scenarios (solo + growing team):
- Solo: feature pipeline with 11-angle review + two approvals
- Team 20+: /rfc cross-team decision → /oncall who → /board-report

---


## v1.0.49 — 2026-04-14

### Added — 4 commands for teams of 20-200

**`/ownership`** — service ownership matrix:
- `/ownership map` — auto-detect from git history + package.json/go.mod/Cargo.toml; proposes team→service→TL table
- `/ownership show` — current ownership table
- `/ownership set <path> <team>` — update a single entry
- `/ownership verify` — find unowned paths and stale owners (no commits in 90+ days)
- Generates CODEOWNERS from the table
- Read by: oncall (who is on-call per service), security-officer (who to escalate P0 to), rfc (affected teams)

**`/oncall`** — on-call rotations:
- `/oncall who` — who is on-call now, time remaining, contacts
- `/oncall schedule <team> <members>` — configure rotation (weekly/biweekly), generates 8-week schedule
- `/oncall handoff` — auto-generated shift handoff note: incidents during shift, open P0/P1, fragile areas, performance trend
- `/oncall escalate <service>` — escalation path for a specific service
- Reads OWNERSHIP.md → knows team and Slack channel per service

**`/rfc`** — RFC process for cross-team decisions:
- `/rfc new "title"` — creates RFC-NNN with template (problem, proposal, alternatives, impact, open questions)
- `/rfc list` — all open RFCs with deadlines; ⚠ flag for overdue
- `/rfc show <id>` — full RFC text
- `/rfc comment <id> "text"` — add a comment to an RFC
- `/rfc close <id> accept|reject "reason"` — close RFC; on accept → auto-creates ADR
- Statuses: DRAFT → REVIEW → ACCEPTED / REJECTED / WITHDRAWN
- Review deadline: 5 business days from creation

**`/board-report`** — quarterly report for CEO/investors:
- Reads: git history, DORA metrics, audit reports, verdict logs, open gates, RFC activity, compliance status
- Translates technical metrics into business language (no jargon)
- Sections: Executive Summary (3 bullets), Delivery, Reliability, Security & Compliance, Team, Risks (table), Investments, Next Quarter Focus
- Arguments: `/board-report` (current quarter) / `/board-report Q1` / `/board-report 30` (last N days)
- Saves to `docs/board-reports/BOARD-<YEAR>-<QN>.md`

### Impact
- 13 commands (was 9) — full coverage for teams of 20-200
- New artifacts: `docs/rfcs/`, `docs/board-reports/`, `docs/handoffs/`, `.great_cto/OWNERSHIP.md`, `.great_cto/oncall-schedule.md`, `CODEOWNERS`
- 0 changes to existing agents — integration via shared file reads

---

## v1.0.48 — 2026-04-14

### Added — Weekly automation + cleaner session status

**Weekly scheduled tasks** (set up automatically by `/start`):
- `/digest` — every Monday at 9:00 (DORA metrics for the week → `.great_cto/digest-latest.md`)
- `/audit` — every Sunday at 23:00 (dependency scan + secrets scan → `docs/audits/AUDIT-AUTO-*.md`)
- Created via `mcp__scheduled-tasks__create_scheduled_task` (Claude Code native scheduling)
- If tool unavailable — `/start` skips silently, outputs a reminder

**SessionStart: `=== STATUS ===` block** — at the end of each session start:
- `branch | gates=N | tasks=N | last_agent=<name>`
- If open gates exist → `→ run /inbox to see pending decisions`
- Top-5 lines of the latest `/digest` (if `.great_cto/digest-latest.md` exists)

**README** — updated for v1.0.48:
- Commands: `/review` now 11-angle (was 3)
- New "Automatic" section — what happens without commands
- "Approval Levels" section — auto/gates-only/strict/expert/step-by-step table
- Proof Loop, User Spec → Tech Spec, HANDOFF.md — mentioned in agents section

---

## v1.0.47 — 2026-04-14

### Changed — Auto-handoff replaces /handoff command

**Auto-handoff via PreCompact hook** — HANDOFF.md now written automatically:
- `PreCompact` hook extended: before context compaction, writes `.great_cto/HANDOFF.md` with a state snapshot (git, open gates, open tasks, last verdict, latest docs)
- `SessionStart` hook extended: on new session start, reads `HANDOFF.md` and shows it to CTO in `=== HANDOFF ===` block
- `/handoff` command removed — no longer needed, everything happens automatically

**Before**: CTO had to manually run `/handoff` before closing a session
**After**: PreCompact fires automatically on context compaction → next session sees the state without any CTO action

---

## v1.0.46 — 2026-04-13

### Added — 5 features from community research

**Proof Loop** — agents verify their own output before claiming done:
- `senior-dev`: re-checks every REQ-* item from ARCH doc before closing task; re-runs tests; max 2 self-fix attempts before escalating
- `qa-engineer`: new Step 3d verifies all QA plan items were actually executed before writing PASS
- `tech-lead`: new Step 5b checks 9 ARCH doc quality rules before creating gate:arch
- `security-officer`: new Step 5c verifies all mandatory security checks were run before verdict

**Session Handoff** (`/handoff` command) — structured context transfer between sessions:
- Captures: pipeline stage, git state, open gates, open tasks, latest docs, recent ADRs
- Writes `.great_cto/HANDOFF.md` with "resume from here" instructions
- Accepts optional CTO note: `/handoff "waiting for legal approval on PCI scope"`
- Next session starts: read HANDOFF.md → `/inbox` → continue

**Validator Auto-retry 3x** — qa-engineer and security-officer retry on soft failures:
- Soft failures (network timeout, missing optional tool, flaky test): retry up to 3x with 2-3s delay
- Hard failures (logic assertion, compile error, confirmed CVE): write FAIL immediately
- Flaky test protocol: PASS with P2 note if ≥1/3 runs pass; note `Reliability: N/3 runs` in report
- Security scanner unavailable after 3 attempts: P2 note "manual review required" (not a blocker)

**User Spec → Tech Spec separation** (tech-lead, `expert`/`step-by-step` only):
- Produces `docs/specs/USER-SPEC-<feature>.md` first (business language: what, who, why, success criteria)
- CTO approves USER-SPEC before ARCH doc is written
- ARCH doc links back to USER-SPEC; Requirements Checklist maps each USC to a REQ
- Skipped for `auto`/`gates-only`/`strict` (no overhead for standard workflow)

**11-angle code review** (`/review`):
- Was: 3 angles (performance, security, readability)
- Now: 11 angles — adds SQL safety, LLM trust boundaries (ai-system only), conditional side effects, data privacy, error handling, concurrency, dependency freshness, API contracts
- Angle 5 (LLM trust) auto-skips if `archetype ≠ ai-system`
- Summary now shows all 11 reviewers with individual P0/P1/P2 counts

### Fixed
- `plugin.json` SessionStart: removed stale `PIPELINES.md` and `notify.sh` copy (both deleted in v1.0.45)
- `plugin.json` SessionStart: added `handoff` to command copy list
- `plugin.json` PermissionDenied hook: removed Telegram call, now logs to `.great_cto/permission-denied.log`
- `/review` setup: reads `approval-level` (was `review_mode`, merged in v1.0.45)

---

## v1.0.45 — 2026-04-14

### Changed — Pure reduction: -1000 lines, 3 knobs → 1

**Deleted PIPELINES.md** (was 892 lines):
- Type Detection Keywords → moved to TYPE_MAP.md
- QA/Deploy/Threshold/Gate tables → already in ARCHETYPES.md (redundant since v1.0.37)
- Pipeline Size Selector → replaced by `approval-level`
- Special Rules + Conflict Matrix → simplified to archetype-based in SKILL.md (~100→15 lines)
- All agent/command `PIPELINES_MD` references → replaced with `ARCHETYPES_MD`

**Merged 3 knobs into 1 `approval-level`** (was: `project_size` + `interaction_mode` + `review_mode`):
- `auto` — 0 gates, 0 checkpoints (hotfix)
- `gates-only` — gate:arch + gate:ship (default)
- `strict` — + gate:code (code review required)
- `expert` — all gates + 2 checkpoints per agent (deep review)
- `step-by-step` — every substep (learning)
- Default changed from `verbose` (35 approvals/day) to `gates-only` (2 approvals/day)

**Removed unused PROJECT.md fields**:
- `availability-sla` — never read by any agent
- `architecture-framework` — niche, CTO writes in ARCH doc if needed
- `findings-refs` — orphaned by v1.0.44 `/audit --refresh` removal
- `audit-sha` → moved to `.great_cto/audit-state.json` (internal, not user-facing)

**Honest README**:
- "automates SDLC" → "AI-assisted SDLC orchestration. Agents diagnose, plan, and review. You decide and deploy."
- Removed PIPELINES.md from Links section

### Impact
- ~1000 lines deleted (30% of codebase)
- 1 PROJECT.md field to understand (`approval-level`) instead of 3 (`project_size` + `interaction_mode` + `review_mode`)
- Adding a new type: still 1 row in TYPE_MAP.md — nothing else
- Source of truth: ARCHETYPES.md + TYPE_MAP.md + domain packs. No legacy shadow document.

---

## v1.0.44 — 2026-04-13

### Removed — `/audit --refresh` mode

**Why**: v1.0.43 parallelization + CVE cache made full `/audit` fast (~1-1.5min). Separate refresh mode duplicates logic with marginal speedup. Simpler to just re-run `/audit`.

- Removed `--refresh` flag from `/audit` command
- Removed Mode Detection section from `project-auditor.md`
- Removed Phase 10 (Refresh Mode) from `project-auditor.md` (~80 lines)
- `security-officer` step 1c stale audit message now suggests `/audit` (not `--refresh`)

### Preserved
- `audit-sha:` field in PROJECT.md — still written by `/audit`, still read by security-officer for stale detection
- `findings-refs:` list — still useful for traceability (bd:ID → file:line)
- CVE cache 24h — makes re-running `/audit` nearly as fast as refresh was

### Impact
- Fewer commands to learn (one audit command, not two modes)
- ~80 lines less code to maintain in project-auditor.md
- Same speed in practice (CVE cache makes 2nd audit fast anyway)

---

## v1.0.43 — 2026-04-13

### Changed — Performance (parallelization + caching + lazy loading)

**Parallel execution:**
- `project-auditor`: Phases 1-4 (stack, CVE, age, architecture debt) now run in parallel via 4 Agent tool sub-agents — **~3-4x faster `/audit`**
- `security-officer`: compliance checklists parallelized when ≥2 values — one sub-agent per checklist (e.g. `[iso27001, sox, pci-dss]` runs 3 checklists in parallel) — **~2-3x faster for regulated projects**
- `qa-engineer`: test execution split into Group A (parallel — unit, perf, security, rollback) + Group B (sequential — integration, E2E with DB) — **~1.5-2x faster for medium+ projects**

**Lazy pack loading:**
- `qa-engineer` + `security-officer`: packs loaded only when a specific `qa-extras` or `compliance` value needs them — not eagerly
- No compliance values → skip pack load entirely (saves ~5-10k tokens per session)

**Caching** (new `.great_cto/cache/` directory, gitignored):
- CVE scan results cached for 24h (invalidated when `package-lock.json`, `Cargo.lock`, `poetry.lock`, `go.sum` change)
- Stack detection cached for 24h (invalidated when manifest files change)
- `/digest` output cached for 1h (digest-based on stable past data)

**Skip redundant checks:**
- `/audit --refresh`: already skips Phases 1-6 (no full scan), only runs Phase 10 refresh
- `/audit` type drift check: skipped if PROJECT.md < 7 days old (`SKIP_DRIFT=true`)

**Session init:**
- SKILL.md: auto-creates `.great_cto/cache/` + adds to `.gitignore` on first session

### Impact
- `/audit` on medium project: ~5min → ~1-1.5min
- `/audit --refresh`: already fast, unchanged
- `/digest` second run in hour: instant (cache hit)
- Security audit with 3 compliance frameworks: ~5min → ~2min
- QA for medium project: ~3min → ~1.5min

### Safety
- Parallelization only applied to read-only phases / independent tasks
- Cache invalidation automatic on manifest/lock file changes
- Fallback to sequential if Agent tool unavailable (no regression)

---

## v1.0.42 — 2026-04-13

### Added — Interactive checkpoints per agent (human-in-the-loop)

**Problem (from user feedback)**: agents run autonomously, CTO sees result only in `/inbox`. If agent errs on step 3, 4-5 steps are wasted before catch. No way to intervene mid-stream.

**Solution**: each agent pauses at **2 checkpoints** — plan (before action) + result (after action). CTO approves or comments. Comments → agent revises → re-checkpoint.

- **New field in PROJECT.md**: `interaction_mode: quiet | normal | verbose | step-by-step`
  - `quiet` = 0 checkpoints (autonomous, nano/hotfix)
  - `normal` = original gate:arch + gate:ship only
  - `verbose` = **default** — 2 per agent (plan + result)
  - `step-by-step` = checkpoint on every major substep

- **SKILL.md § Interaction Mode**: standard checkpoint pattern. Three options at each checkpoint: `[enter] approve`, `<text> comment to revise`, `cancel`. Comments trigger revision loop (max 3 rounds per checkpoint).

- **Agent checkpoints** added:
  - `tech-lead`: (A) before ARCH write — show options + trade-offs + cost; (B) after ARCH + ADR + Beads tasks — show summary
  - `senior-dev`: (A) before implementation — show plan + TDD cases; (B) after PR — show diff summary
  - `qa-engineer`: (A) before tests — show QA plan + tools + thresholds; (B) after report — show PASS/FAIL + bugs
  - `security-officer`: (A) before audit — show compliance scope + targets; (B) after CSO report — show APPROVED/BLOCKED + findings
  - `devops`: (A) before staging — show deploy plan; (B) before prod — show staging results; (C) after prod — show canary metrics

- **Safety mandates**: devops B+C checkpoints + security-officer (for MANDATORY archetypes) are always shown regardless of mode. Production deploys always require human approval.

### Impact
- Errors caught early: tech-lead wrong approach → caught at Checkpoint A, not after 5 agent runs
- Natural revision loop: "use sessions instead" → tech-lead re-plans → re-checkpoint
- Trade-off: +10 approvals/day in verbose mode. Switch to `normal` for routine work.

---

## v1.0.41 — 2026-04-13

### Added — `/audit --refresh` mode + stale findings detection

**Problem (from real user feedback)**: `/audit` finds P0 bugs → user commits fixes → PROJECT.md still shows `P0:2`. Next `/start` for mandatory archetype → security-officer blocks pipeline on stale findings.

**Solution**: audit writes commit SHA + Beads task refs per finding. `/audit --refresh` re-verifies only known findings against current code. Security-officer detects staleness and suggests refresh.

- **`project-auditor`**: Phase 7 now writes `audit-sha: <HEAD>` and `findings-refs:` list in PROJECT.md. Each entry links Beads task to file:line.
- **`project-auditor`**: Phase 10 added — Refresh Mode. Parses `findings-refs:`, checks each against current code per finding type (secrets, CVE, unpinned-dep, SQL-injection, god-file, missing-test). Closes Beads tasks verified fixed. Updates PROJECT.md counters.
- **`/audit --refresh`**: new mode flag. Skips full scan when no new audit needed. Falls back to full audit if no prior `audit-sha:` in PROJECT.md.
- **`security-officer`**: step 1c checks if PROJECT.md `audit-sha` ≠ current HEAD AND P0 > 0 → notes in CSO report + suggests `/audit --refresh`. Does NOT auto-close findings.

### Impact
- After commits that fix audit findings: `/audit --refresh` takes seconds (not minutes), closes fixed findings, updates counters
- Pipeline no longer blocks on stale findings once refresh run
- Audit gets better with use: each full audit → commit fixes → refresh → lean finding list

### Safety
- Refresh never auto-closes findings in Beads — only after pattern verification
- >30 commits since last audit OR lock-file changes → refresh suggests full re-audit instead

---

## v1.0.40 — 2026-04-10

### Fixed — 16 audit findings (2 P0, 4 P1, 10 P2)

**P0 (broken):**
- README: pack entry counts corrected (ai-pack: 16→20, web3-pack: 12→17, data-pack: 11→14)
- `/audit`: "57 types" → "73 types in TYPE_MAP.md"

**P1 (inconsistencies):**
- README: added `RELEASE-*.md` to artifact list
- ARCHETYPES.md: renamed "Compliance Parameter Values" → "Parameter Values" (togaf is architecture, not compliance)
- TYPE_MAP.md: split `Default params` and `Overrides` into separate columns (security-gate, min-size no longer mixed with compliance)
- ARCHETYPES.md: added single source of truth for MANDATORY security gate archetypes (`ai-system`, `commerce`, `web3`, `iot-embedded`, `regulated`)

**P2 (improvements):**
- qa-engineer + security-officer: pack loading path fallback (`find . .great_cto` if `~/.claude` path fails)
- `/start`: nano + MANDATORY type conflict → auto-upgrade to `medium` with warning
- `/start`: nano size definition now includes `<500 LOC` upper bound
- tech-lead: enforces `min-size:` from TYPE_MAP.md Overrides column; warns if upgrading
- `/start`: documented pack auto-detection for all 10 archetypes (5 get packs, 5 default to none)
- `/start`: override loop guard — max 2 rounds, then asks for explicit archetype
- README: added "Packs auto-load by archetype. Override in PROJECT.md" note
- SKILL.md: added `/digest`, `/review`, `/status` to intent mapping table
- SKILL.md: improved Beads unavailable message with fallback explanation + install link
- `/start`: consolidated file reading pattern (PIPELINES→keywords, TYPE_MAP→archetype, ARCHETYPES→rules)

---

## v1.0.39 — 2026-04-10

### Changed — Agent Simplification (Phase 3 of 3)

Replaced type-specific conditionals in agents with archetype-based logic:

- **`security-officer`**: Step 5 (compliance) rewritten — was 50+ lines of inline checklists (ISO 27001 Annex A, SOX ITGC, SOC2, HIPAA, GDPR, type-specific examples). Now: iterate `compliance:` params → delegate to domain pack checklists. Universal PII checks retained inline. ~50 lines removed.
- **`qa-engineer`**: Step 1 rewritten — was type-merge algorithm reading PIPELINES.md per-type QA strategies. Now: read ARCHETYPES.md for base QA strategy → extend with pack-defined `qa-extras` → apply `compliance:` QA checks. Threshold override from `performance-sla:` param.
- **`senior-dev`**: Step 5 (TDD) simplified — was 5 type-specific overrides (infra-iac, db-migration, data-visualization, llm-ops, data-warehouse). Now: 3 archetype-based branches (infra → Terratest, data-platform → dbt, ai-system → evals-first, all others → standard TDD).
- **`devops`**: Step 5 (staging deploy) simplified — was 4 type-category branches. Now: 8 archetype-based branches matching ARCHETYPES.md deploy method table.

### Impact — Before vs After

| Metric | Before (v1.0.36) | After (v1.0.39) |
|--------|------------------|------------------|
| PIPELINES.md | 800+ lines, sole source of truth | Legacy reference — ARCHETYPES.md (120 lines) is primary |
| security-officer compliance | 50+ lines inline, type-specific | 15 lines: loop over params → delegate to pack |
| qa-engineer strategy | Type-merge algorithm + PIPELINES.md lookup | Archetype base + pack extras |
| senior-dev TDD | 5 type-specific if-else | 3 archetype branches |
| devops deploy | 4 type-category branches | 8 archetype branches (matches ARCHETYPES.md) |
| Adding a new type | Edit 7 tables in PIPELINES.md + touch 4 agents | Add 1 row to TYPE_MAP.md (archetype + params) |

---

## v1.0.38 — 2026-04-10

### Added — Domain Packs (Phase 2 of 3)

4 domain packs extract type-specific depth from PIPELINES.md into standalone files:

- **`packs/ai-pack.md`** — 16 qa-extras definitions: `wer`, `ttfb`, `barge-in`, `dtmf-fallback`, `concurrent-calls`, `retrieval-quality`, `prompt-regression`, `cost-cap`, `per-modality-accuracy`, `hallucination`, `cross-modal`, `tool-injection`, `schema-enforcement`, `bias-audit`, `model-card`, `drift-monitoring`, `data-poisoning`. Compliance extras: `eu-ai-act`, `tcpa`, `gdpr-biometric`.
- **`packs/web3-pack.md`** — 12 qa-extras: `formal-verification`, `flash-loan-sim`, `economic-attack-sim`, `kill-switch`, `slither-audit`, `echidna-fuzz`, `reentrancy-guard`, `gas-optimization`, `key-ceremony`, `sanctions-screening`, `kyc-aml`, `order-matching`, `circuit-breaker`. Compliance: `fatf`, `ccss`, `ofac`, `kyc-aml-regs`.
- **`packs/enterprise-pack.md`** — 6 deep compliance checklists: `21cfr11` (IQ/OQ/PQ + ALCOA+ + e-signatures), `nis2` (10 Article 21 measures + Article 23 reporting), `dora` (ICT risk + third-party register + TLPT), `tisax` (VDA ISA + AL1/2/3 + OEM-specific), `iso27001` (93 Annex A controls + SoA + risk assessment), `sox` (ITGC: change management, logical access, computer ops, SoD).
- **`packs/data-pack.md`** — 11 qa-extras: `data-lineage`, `pii-classification`, `schema-diff`, `point-in-time`, `online-offline-consistency`, `freshness-sla`, `snapshot-regression`, `backtest-validation`, `rollback-dry-run`, `dbt-test`, `contract-validation`. Compliance: `data-lineage-compliance`, `retention-policy`, `data-residency`.

**Pack loading**:
- `/start` auto-detects packs from archetype: `ai-system` → `[ai-pack]`, `web3` → `[web3-pack]`, `regulated` → `[enterprise-pack]`, `data-platform` → `[data-pack]`
- `qa-engineer` reads pack files at runtime for qa-extras definitions (what/tool/threshold/edge inputs)
- `security-officer` reads pack files for deep compliance checklists (replaces inline checklists when pack is more detailed)

### Impact
- Each pack is self-contained: can be understood without reading PIPELINES.md
- Packs are additive: CTO adds `packs: [ai-pack, enterprise-pack]` for an AI system in a regulated industry
- Next: v1.0.39 = agent simplification (remove type-specific conditionals from agent files)

---

## v1.0.37 — 2026-04-10

### Added — Archetype-based pipeline architecture (Phase 1 of 3)

**Problem**: 75 specific types × 5 sizes × compliance frameworks = combinatorial explosion. PIPELINES.md at 800+ lines, each agent full of type-specific conditionals. 80% of users use ~10 types.

**Solution**: 10 archetypes + parameter-driven customization. Specific types become aliases.

- **`ARCHETYPES.md`** (NEW) — 10 archetype definitions with base rules:
  - `web-service`, `mobile-app`, `ai-system`, `data-platform`, `infra`, `library`, `commerce`, `web3`, `iot-embedded`, `regulated`
  - Each archetype: QA strategy, deploy method, thresholds, security gate default, gates-by-size matrix
  - Compliance driven by `compliance: [values]` parameter (13 values: gdpr, pci-dss, sox, iso27001, dora, nis2, 21cfr11, tisax, etc.)
  - `qa-extras: [values]` extends base QA (from domain packs in v1.0.38)
  - Parameter resolution order: archetype base → size adjustment → compliance → qa-extras → explicit overrides → domain pack

- **`TYPE_MAP.md`** (NEW) — 75 specific types → archetype + default params:
  - `voice-agent` → `ai-system` + compliance: [tcpa, gdpr-biometric] + qa-extras: [wer, ttfb, barge-in]
  - `payment-service` → `commerce` + compliance: [pci-dss, sox] + min-size: enterprise
  - `rest-api` → `web-service` + compliance: [owasp-api]
  - Unmapped types default to `web-service` with warning

- **`/start`** — now resolves type → archetype before writing PROJECT.md:
  - PROJECT.md gets `archetype:` field + `compliance:` + `qa-extras:` + `security-gate:` params
  - Confirmation shows archetype + pipeline: `ai-system (from voice-agent) | medium | 5 agents [~45min]`

- **`tech-lead`** — reads `archetype:` + params from PROJECT.md; uses ARCHETYPES.md for QA strategy and deploy constraints
- **`qa-engineer`** — reads `archetype:` for base QA plan, `qa-extras:` for additional checks, `compliance:` for compliance QA
- **`security-officer`** — reads `compliance:` param list; each value maps to a checklist; backwards compat with PIPELINES.md type-specific rules
- **`devops`** — reads `archetype:` for deploy method from ARCHETYPES.md

### Migration
- Backwards compatible: agents read `archetype:` first, fall back to `primary:` type + PIPELINES.md
- Existing PROJECT.md files work as-is (no archetype → agents use type-based logic)
- PIPELINES.md retained as legacy reference — domain-specific depth still available
- Next: v1.0.38 = domain packs, v1.0.39 = agent simplification

---

## v1.0.36 — 2026-04-10

### Added — Smart /start onboarding
- **`/start` Step 2b** — auto-detects `project_size` and `greenfield` from description + repo state:
  - Size inferred from description signals ("fix" → nano, "add feature" → small, "build service" → medium, etc.)
  - Regulated types → always `enterprise` override
  - Greenfield: checks `src_files > 10` in repo + description signals ("existing", "our codebase")
- **`/start` confirmation** — shows detected type + size + pipeline as one-liner before starting:
  ```
  Detected: type=rest-api | size=small | 3 agents
  Pipeline: tech-lead → senior-dev → qa [~20min]
  ```
- **`/start` override replies** — CTO can correct before PROJECT.md is written:
  - "go" / "yes" → proceed
  - "existing" → sets `greenfield: false`
  - "make it large" → upgrades size
  - "nano" → downgrades to nano
- **PROJECT.md** — now includes `project_size:` and `greenfield:` fields from setup
- **`tech-lead`** — reads `greenfield: false` → scans existing entry points, API contracts, schema before designing architecture (additive design, not redesign)
- Only asks ONE question if greenfield is ambiguous — never asks type/size/team directly

---

## v1.0.35 — 2026-04-10

### Added — Adaptive Pipeline Sizing
- **`project_size` field** in PROJECT.md: `nano | small | medium | large | enterprise`
- **PIPELINES.md** — new `## Pipeline Size Selector` section:
  - Size determination rules (file count + type signals)
  - Type overrides: regulated types always → `enterprise`; MANDATORY security gate types → min `medium`
  - Required-agents matrix: which agents run at each size
  - Lightweight QA mode for `small` (unit tests only, no load test, no rollback dry-run)
  - Direct deploy for `nano` (no QA agent, no security-officer, no devops agent)
- **`tech-lead`**: determines `project_size` as step 2, writes to PROJECT.md; nano → skips ARCH doc + gate entirely
- **`senior-dev`**: reads `project_size`; nano → skips gate:arch check, deploys directly after merge
- **`qa-engineer`**: reads `project_size`; nano → exits immediately; small → lightweight mode (no perf baseline, no rollback dry-run, abbreviated report)
- **`security-officer`**: reads `project_size` + checks MANDATORY type list; nano/small non-MANDATORY → exits immediately
- **`devops`**: CSO report required only for medium/large/enterprise OR small + MANDATORY type; nano bypasses devops entirely
- **`l3-support`**: reads `project_size`; nano/small → exits; medium → 15min window; large → 30min; enterprise → 60min+

### Impact
- `rest-api` + nano (single-function fix) → 1 agent, ~5min
- `rest-api` + small (new endpoint) → 3 agents (tech-lead + senior-dev + qa), ~20min
- `payment-service` any size → always full 7-agent pipeline (MANDATORY override)
- `saas-platform` + large → full pipeline, canary deploy, 30min L3 window

---

## v1.0.34 — 2026-04-10

### Added — 3 new project types (top trending 2026)
- **`voice-agent`** — VAPI / ElevenLabs / Retell AI / telephony AI
  - QA: WER ≤5%, TTFB ≤300ms, turn latency ≤800ms, barge-in ≥95%, 2× load test
  - Deploy: canary by call % (1%→5%→20%→100%), webhook swap rollback
  - Compliance: TCPA (US consent), GDPR Art.9 (voice as biometric), per-jurisdiction recording notice, CASL
  - Gate Prerequisites: voice quality test results + TCPA consent evidence + GDPR DPIA (if biometric use)
- **`edge-app`** — Cloudflare Workers / Deno Deploy / Vercel Edge / Fastly Compute
  - QA: cold start ≤50ms p95, bundle ≤1MB, 0 Node.js API violations, global p95 ≤100ms from ≥5 regions
  - Deploy: atomic global CDN deploy → multi-region smoke test, CDN version rollback
  - Compliance: OWASP API Top 10 at edge + CSP enforcement + credential-in-worker audit
  - Gate Prerequisites: bundle size report + multi-region latency results + Node.js API surface audit
- **`multimodal-app`** — GPT-4o / Claude vision / Gemini apps (text + image + audio)
  - QA: per-modality accuracy vs baseline, hallucination ≤2%, latency per modality (text ≤2s, vision ≤5s, audio ≤3s)
  - Deploy: shadow mode → A/B per modality → full traffic, per-model feature flags rollback
  - Compliance: EU AI Act Annex III high-risk check, model card (all modalities), GDPR Art.22 (no purely automated decisions), child safety audit
  - Gate Prerequisites: per-modality eval results + EU AI Act classification doc + model card + data subject rights procedure
  - `multimodal-app` added to MANDATORY security gate list
- All 3 types fully covered in: Type Detection Keywords, QA Strategy, Deploy Method, Threshold Cross-Reference, Gate Prerequisites, MANDATORY compliance check

---

## v1.0.33 — 2026-04-10

### Added
- PIPELINES.md: 5 new project types — `critical-infrastructure`, `financial-services`, `gxp-system`, `iso27001-scope`, `automotive-supplier`
- PIPELINES.md: NIS2 Article 21, DORA (EU 2022/2554), 21 CFR Part 11, ISO 27001:2022, TISAX VDA ISA compliance entries in all relevant tables (QA Strategy, Deploy Method, MANDATORY security gate, compliance check, Gate Prerequisites)
- PIPELINES.md: SOX ITGC entries for `payment-service`, `data-warehouse`, `saas-platform`
- `security-officer`: ISO 27001:2022 Annex A checklist (all 93 controls, SoA ≥90% required) — triggered by `compliance: iso27001` or type `iso27001-scope`
- `security-officer`: SOX ITGC checklist (Change Management, Logical Access, Computer Operations, Segregation of Duties) — triggered by `sox: true` or types `payment-service`, `data-warehouse`, `saas-platform`; any ITGC failure → P0
- `tech-lead`: Well-Architected Assessment section in ARCH doc (6 pillars, 1-3 score) — triggered by `cloud: aws|gcp|azure` in PROJECT.md; score=1 pillar → Beads task auto-created
- `tech-lead`: TOGAF ADM Phase mapping section in ARCH doc — triggered by `architecture-framework: togaf` in PROJECT.md
- `/digest`: DORA Metrics section — Deployment Frequency, Lead Time for Changes, MTTR, Change Failure Rate; computed from perf-baseline.log + git timestamps + postmortems; DORA band label (elite/high/medium/low) per metric

---

## v1.0.32 — 2026-04-10

### Added
- `/review` command — 3-angle GATE:CODE (Performance / Security / Readability reviewers); creates or closes `gate:code`; verdict logged to `.great_cto/verdicts/code-review.log`
- `/status` command — pipeline dashboard: current stage, open gates + age, per-agent verdicts, last deploy, open P0/P1 bugs, active L3 monitoring
- `l3-support`: retrospective entry appended to `.great_cto/retrospectives/RETRO-YYYY-MM.md` after every postmortem — feeds tech-lead's pattern reader on next feature

### Fixed
- `security-officer`: now reads PIPELINES.md `MANDATORY compliance check` for the project type and runs type-specific checklists (was running generic GDPR/SOC2/HIPAA for all types)
- `security-officer`: Telegram notify after APPROVED/BLOCKED decision
- `/digest`: Linux-compatible date arithmetic (python3 fallback → macOS → Linux); perf-baseline format updated to `p95:Nms` (matches v1.0.30 devops format); added GATES section + AGENT VERDICTS section
- `devops`: CHANGELOG entry now uses `printf` instead of `echo "\n"` (portable across bash/sh/zsh)
- `project-auditor`: explicit PROJECT.md format template when creating on first audit
- `senior-dev`: hints CTO to run `/review` after PR when `review_mode: strict`
- `tech-lead`: DECISIONS.md auto-updated immediately after writing each ADR (no longer requires manual step)
- `/revisit`: DECISIONS.md index auto-updated when superseding an ADR
- `plugin.json`: SessionStart now copies `review.md` and `status.md` to `~/.claude/commands/`

---

## v1.0.31 — 2026-04-09

### Improved — PIPELINES.md v1.8 → v2.0 (51→95+ quality score)

**Phase 1 — Gate Prerequisites (highest impact):**
- Added 22 missing gate prerequisite rows: `monorepo`, `k8s-operator`, `desktop-app`, `browser-extension`, `vscode-extension`, `electron-app`, `realtime-system`, `messaging-queue`, `video-streaming`, `cms-headless`, `search-service`, `cli-tool`, `compiler-lang`, `wordpress-plugin`, `data-warehouse`, `internal-tool`, `data-pipeline`, `data-visualization`, `platform-engineering`, `chrome-extension-mv3`, `ai-agent-framework`, `llm-ops`
- All 65 types now have gate prerequisites — CI enforcement possible without guessing

**Phase 2 — Numeric defaults for vague thresholds:**
- `computer-vision`: mAP ≥0.50 default (was "task-specific"); override with `qa-mAP-threshold:` in PROJECT.md
- `time-series-forecasting`: MAPE ≤20% default (was "task threshold"); override with `qa-MAPE-threshold:`
- `video-streaming`: 10 Mbps bitrate baseline; override with `qa-bitrate-baseline:`
- New section: "QA Threshold Overrides via PROJECT.md" — documents 5 override keys for qa-engineer and devops

**Phase 3 — Rollback-deploy pair hardening:**
- `rag-system` deploy: prerequisite to snapshot index before reindex
- `static-site` deploy: record deploy ID to `.great_cto/static-deploy.log` for rollback
- `video-streaming` deploy: export CDN origin config before deploy
- `ai-agent` deploy: prerequisite for bias/fairness audit artifacts when `ai-bias-risk: true`
- `infra-iac` deploy: warning about dependent stack cascade risk

**Phase 4 — Geographic compliance gaps:**
- `web-fullstack`: added CCPA (CA/US), LGPD (BR), APPI (JP), PDPA (SG/TH) per-region triggers
- `notification-service`: added CASL (Canadian recipients — express consent, 10-day unsubscribe SLA)
- `ai-agent`, `llm-ops`: added EU AI Act Annex III + China CAC algorithm registration
- `rag-system`: added EU AI Act Annex III high-risk check
- `data-warehouse`: GDPR → GDPR/CCPA/LGPD right-to-erasure
- `bridge-protocol`: added CFTC compliance check for US commodity derivatives
- `infra-iac`: CIS Benchmarks versioned → CIS Benchmarks v8 (2024)
- `web-fullstack`: OWASP Top 10 versioned → OWASP Top 10 2021

**Phase 5 — Threshold alignment across QA Strategy ↔ Threshold Cross-Reference ↔ Gate Prerequisites:**
- `rest-api`: Threshold Cross-Reference now includes IDOR findings + rate limit (were in QA Strategy but not cross-reference)
- `graphql-api`: Threshold Cross-Reference now includes max_depth ≤10, max_complexity ≤1000, injection + IDOR findings
- `payment-service`: Threshold Cross-Reference now includes TLS 1.2+, MFA, availability ≥99.9%
- Gate Prerequisites for `rest-api` + `graphql-api`: extended to include security test evidence

**Phase 6 — Housekeeping:**
- Removed duplicate `auth-service` row in Multi-Region Deploy Strategy
- PIPELINES.md version bumped from 1.8 to 2.0

---

## v1.0.30 — 2026-04-10

### Fixed — 15 issues from quality audit (58→75+ score)

**Critical — Gate state machine:**
- `qa-engineer`: creates `gate:ship` explicitly on PASS (was never created, security-officer had no gate to close)
- `security-officer`: finds and closes `gate:ship` by label lookup (was closing a hardcoded ID)
- `senior-dev`: verifies `gate:arch` is closed before claiming any task (was able to start without architecture approval)
- `devops`: verifies QA report exists AND result=PASS AND CSO result=APPROVED before deploying (was only checking gate:ship status)

**High — Reliability:**
- `notify.sh`: retry up to 3× with exponential backoff; 4096-char message truncation; never blocks pipeline
- `perf-baseline.log`: consistent format `p95:<val>ms error_rate:<val>% ts:<ISO> feature:<name>` written by devops, read consistently by qa-engineer
- `devops`: smoke test success criteria now numerical (all 5 return 2xx, error rate <0.5%, p95 within 20% of baseline)
- `devops`: baseline NOT written on rolled-back deploys (was corrupting baseline)
- `l3-support`: escalation SLA with exact time windows (T+15 L2, T+30 L3+Telegram, T+60 major incident)

**Medium — Consistency:**
- `tech-lead`: reads `review_mode` from PROJECT.md and applies strict/auto gate logic
- `tech-lead` + `qa-engineer` + `security-officer`: write agent verdict logs to `.great_cto/verdicts/` for postmortem traceability
- `devops`: triggers l3-support monitoring task after every deploy (30min standard, 72h regulated types)
- `inbox`: gate approval now explicit — confirms what happens next after CTO approves/rejects
- `inbox`: "clear" state shows backlog count + PR count (was just "clear")
- `plugin.json`: PermissionDenied hook sends Telegram alert when Bash/Write blocked (was log-only)

---

## v1.0.29 — 2026-04-09

### Fixed — Plugin file sync reliability

- **Root cause:** SessionStart hook used `$(dirname "$0")` to find plugin dir — `$0` in hook context is the shell binary, not a plugin path. Commands were never copied for users.
- **Fix:** Hook now uses `ls -d ~/.claude/plugins/cache/local/great_cto/*/` + `sort -V | tail -1` to find the highest installed version automatically.
- `/update` Phase 0 added: re-syncs all plugin files (commands, agents, skills, notify.sh) on every `/update` run — recovery mechanism for any future drift.

---

## v1.0.28 — 2026-04-09

### Added — Telegram notifications for CTO gates and incidents

- `skills/great_cto/notify.sh` — curl-based Telegram helper; silent no-op if unconfigured (never blocks pipeline)
- First-run Telegram setup in `/start` — asks CTO once for bot token + chat ID, stores in `~/.great_cto/preferences.md`
- `tech-lead`: notifies CTO on `gate:arch` creation (architecture review pending)
- `devops`: notifies CTO on deploy complete (method, error rate, p95)
- `l3-support`: notifies CTO on P0 incident (description + ETA)
- `plugin.json` SessionStart hook: auto-copies and `chmod +x` `notify.sh` on session start

---

## v1.0.27 — 2026-04-09

### Added — 45 gaps applied across remaining 43 project types (PIPELINES.md v1.7 → v1.8)

**Web/Frontend + API:**
- `web-fullstack`, `spa-frontend`, `ssr-app`: OWASP ZAP scan (A03/A05/A06/A09) + CSP audit + SBOM (CycloneDX) + Core Web Vitals (LCP <2.5s, INP <200ms)
- `web-fullstack`, `spa-frontend`: GDPR cookie consent + tracking opt-out test
- `web-fullstack`: Keyboard navigation + contrast ratio ≥4.5:1 (WCAG 2.1 AA)
- `rest-api`, `graphql-api`, `bff`: OWASP API Top 10 scan (API1 IDOR, API3 field-level auth, API4 rate limiting, API8 misconfiguration)
- Added to MANDATORY compliance: `web-fullstack`, `spa-frontend`, `ssr-app`, `rest-api`, `graphql-api`, `bff`

**Mobile + Desktop + Extensions:**
- `mobile`: OWASP MASVS v2 (certificate pinning + local storage encryption + jailbreak detection) + privacy manifest (iOS) + ATT compliance + data safety form (Android, target API ≥34) + touch target audit (WCAG 2.1 mobile)
- `electron-app`: Electron Security Checklist (nodeIntegration=false, contextIsolation=true, sandbox=true, webviewTag=false, CSP no eval)
- `library-sdk`: Artifact signing (cosign/GPG) + SBOM + vulnerability disclosure policy + reproducible build test (OpenSSF/SLSA)
- Added to MANDATORY compliance: `mobile`, `electron-app`, `library-sdk`

**Data + Infrastructure + DevOps:**
- `infra-iac`: Checkov/tfsec + CIS benchmark compliance (K8s/AWS/GCP) + container image scan (Trivy)
- `k8s-operator`: CIS K8s 1.8 (pod security + network policies + non-root runtime) + container image scan
- `devops-tool`: SLSA provenance + artifact signing (cosign) + container image scan
- `data-warehouse`, `data-pipeline`: Data lineage tracking (OpenLineage/Marquez) + GDPR right-to-erasure verification
- Added to MANDATORY compliance: `infra-iac`, `k8s-operator`, `data-warehouse`
- **New Special Rules**: Container image scanning (Trivy, 0 critical CVEs) + SLSA provenance levels

**Realtime + Content + Special:**
- `embedded-iot`: ETSI EN 303 645 checklist (no default credentials + credential storage + attack surface + OTA signing)
- `video-streaming`: WebRTC security (DTLS-SRTP + ICE mDNS + TURN auth) per RFC 8826/8827
- `notification-service`: GDPR consent management + suppression list + DPIA
- `internal-tool`: Privilege escalation test (unauthorized role transitions + cross-tenant access + permission boundaries)
- `mcp-server`: Per-caller rate limiting + sandbox isolation verification
- `game`: Accessibility audit (colorblind mode + subtitles + remappable controls, WCAG 2.1)
- Added to MANDATORY compliance: `embedded-iot`, `video-streaming`, `notification-service`, `mcp-server`

---

## v1.0.26 — 2026-04-09

### Added — 15 industry standard gaps applied (PIPELINES.md v1.6 → v1.7)

Research against CCSS, FATF, SWC Registry, MiCA, EU AI Act, NIST AI RMF, OWASP LLM Top 10, ISO 42001, PCI-DSS v4.0, OWASP WSTG, OWASP SAMM, DORA, SOC2 Type II, NIST SP 800-218.

**Crypto domain (CCSS / FATF / SWC / MiCA):**
- **SWC Registry checklist** added to `smart-contract` QA strategy, compliance check, and Gate Prerequisites (SWC-103,104,107,110,113,115,116,124,125 — reentrancy, tx.origin, floating pragma, etc.)
- **Flash loan + MEV/sandwich attack testing** added to `defi-protocol` QA strategy and Gate Prerequisites
- **CCSS Level classification** (Level 1/2/3 per component) added to `custody-wallet` compliance check and Gate Prerequisites
- **Sanctions screening** (OFAC/EU/UNSC, ≤24h update SLA) added to `custody-wallet` and `cex-exchange` compliance check and Gate Prerequisites
- **Fair order allocation + circuit breaker + PEP screening + 5-year data retention** added to `cex-exchange`
- **Backup/recovery SLA, key rotation, HSM vendor risk assessment** added to `custody-wallet`

**AI/ML domain (EU AI Act / NIST RMF / OWASP LLM Top 10 / ISO 42001):**
- **Risk Assessment document** (RISK-ASSESSMENT-*.md) mandatory before deploy for: `ml-training`, `ml-serving`, `ai-agent`, `rag-system`, `anomaly-detection`
- **Model Card** (MODEL-CARD-*.md: model details, intended use, training data, quantitative analysis, ethical considerations) mandatory for all AI/ML types
- **Bias/fairness audit** (disparate impact ≥0.8 per protected group) made mandatory (not conditional) for `ml-training`, `ml-serving`, `ai-agent`, `rag-system`, `computer-vision`
- **Training data poisoning check + data lineage audit** added to `ml-training`
- **Supply chain audit** (base model/embedding model provenance) added to `ai-agent`, `ml-serving`, `rag-system`
- **PII output detection** added to `ai-agent` and `rag-system` QA strategy
- **Production Monitoring SLA** — new section with 12 alert thresholds + incident runbook for AI/ML and financial types

**Payments domain (PCI-DSS v4.0 / OWASP WSTG / DORA / SOC2):**
- **API security test** (OWASP WSTG payment flows) added to `payment-service` QA strategy and Gate Prerequisites — mandatory per PCI-DSS v4.0
- **TLS 1.3 cipher audit** added to `payment-service` and `auth-service`
- **SBOM** (CycloneDX) added to `payment-service`, `auth-service`, `saas-platform`, `e-commerce`
- **STRIDE threat model** mandatory artifact added to `payment-service`, `auth-service`, `saas-platform`, `e-commerce`
- **Penetration test frequency** added to Special Rules: annual external + 6-month internal for all regulated types
- **Incident response drill** extended from `custody-wallet` to: `payment-service`, `auth-service`, `saas-platform`, `e-commerce`, `cex-exchange`
- **RTO/RPO validation** (RTO ≤4h, RPO ≤1h) added to `payment-service` and `saas-platform`
- **Availability SLA verification** (≥99.9% for payment/auth, ≥99.5% for SaaS) added to thresholds
- **Business logic attack tests** (race conditions, transaction replay, IDOR payment records) added to `payment-service`

---

## v1.0.25 — 2026-04-09

### Fixed — 16 issues from full pipeline test (all 65 types) — PIPELINES.md v1.5 → v1.6

#### P0 — Critical (13 types missing Gate Prerequisites)
- **Added to MANDATORY Gate Prerequisites**: `rest-api`, `graphql-api`, `grpc-service`, `serverless`, `microservices`, `web-fullstack`, `spa-frontend`, `ssr-app`, `static-site`, `docs-site`, `bff` — all 11 web/API/frontend types now have explicit artifact requirements before gate:ship
- **`feature-flags-service`**: Added to MANDATORY Gate Prerequisites (flag evaluation correctness report + p99 bench + state snapshot before deploy)
- **Regulated Stack Migration**: `custody-wallet`, `cex-exchange`, `bridge-protocol` now automatically inherit REGULATED_MIGRATION rules when migrating infrastructure — even without explicit `compliance:` field

#### P1 — High (QA gaps and missing coverage)
- **Added to MANDATORY Gate Prerequisites**: `mobile` (device farm results), `embedded-iot` (OTA rollback + power budget + QEMU), `hardware-driver` (syzkaller + valgrind), `game` (FPS profiling + play session)
- **QA Environment Requirements**: Added `trading-bot` (48h paper-trade simulation), `bridge-protocol` (formal verification toolchain), `custody-wallet` (staging HSM provisioning)
- **No Browser QA list**: Added `infra-iac` (plan + policy validation, not browser-testable)
- **Conflict Matrix**: Added 9 new pairs for crypto/AI composite types (`cex-exchange+payment-service`, `trading-bot+cex-exchange`, `bridge-protocol+infra-iac`, `custody-wallet+cex-exchange`, `computer-vision+web-fullstack`, `anomaly-detection+payment-service`, and 3 more)
- **Multi-region**: Added `custody-wallet` (primary-only, per-region key ceremony), `cex-exchange` (primary order book, standby reads-only), `bridge-protocol` (per-region relayers, globally distributed guardian HSMs)

#### P2 — Clarity
- **No classical TDD list**: Added `k8s-operator`, `devops-tool`, `monorepo` with explanations
- **`library-sdk` semver rule**: tech-lead must classify `patch|minor|major` in ARCH doc; major = migration guide required before publish
- **`smart-contract` Gate Prerequisites**: now explicitly states "0 Echidna violations, 0 Slither critical/high"
- **Threshold Cross-Reference**: `custody-wallet` and `bridge-protocol` thresholds now include travel rule (FATF) and economic attack simulation in staging validation method

---

## v1.0.24 — 2026-04-09

### Added — 5 AI/ML/DS project types (60 → 65)

- **`computer-vision`** — image classification, object detection, segmentation (YOLO, Detectron2, OpenCV). QA: mAP + IoU on holdout, latency on target hardware, ONNX/TFLite/CoreML export correctness, edge device smoke. Deploy: model registry → export → OTA (edge) or container (cloud). Rollback: previous model version.
- **`recommendation-engine`** — collaborative filtering, matrix factorization, two-tower models. QA: NDCG@K + coverage + novelty + cold start test + A/B infrastructure validation + popularity bias audit. Deploy: shadow mode → A/B (5%→20%→50%) → full traffic. Rollback: instant traffic shift to previous model.
- **`feature-store`** — Feast, Tecton, Hopsworks, point-in-time features. QA: point-in-time correctness (no future data leakage) + online/offline consistency + feature drift detection + backfill validation. Deploy: backfill → consistency validation → enable for new training runs. Rollback: disable feature in registry.
- **`time-series-forecasting`** — Prophet, N-BEATS, TFT, demand forecasting. QA: walk-forward backtesting (out-of-sample) + MAPE/RMSE/SMAPE + seasonal validation + data leakage check. Deploy: backtest → shadow scoring → gradual replacement. Rollback: restore previous model, check downstream pipelines.
- **`anomaly-detection`** — fraud detection, log anomaly, AIOps, isolation forest. QA: precision/recall on labeled dataset + FPR on normal traffic + threshold sensitivity + latency under load. Deploy: shadow (alert only) → dry-run (log, no action) → full enforcement. Rollback: disable enforcement, revert threshold config.

### Fixed — 10 P0 bugs in crypto types (from test results)

- **`custody-wallet`**: added withdrawal limit enforcement test, signing audit trail verification, incident response drill (key compromise scenario), cold wallet re-entry recovery test to QA strategy and Gate Prerequisites
- **`bridge-protocol`**: added Echidna fuzz (≥10k runs) + Slither (inherited from smart-contract), formal verification artifact (light client finality proof), validator collusion simulation; light client finality test added to Gate Prerequisites
- **`cex-exchange`**: p99 threshold corrected from <10ms → <50ms @5k orders/sec; added fee calculation audit, margin/liquidation engine test (for futures), open orders handling on rollback, race conditions and partial fill test cases

---

## v1.0.23 — 2026-04-09

### Added
- **3 new crypto project types** in `PIPELINES.md` (57 → 60 types, version 1.3 → 1.4):
  - `custody-wallet` — MPC/HSM key management, cold/hot wallet, Fireblocks-style. QA: key ceremony test + MPC threshold signing + cold-to-hot sweep + pen test. MANDATORY security gate. Rollback: freeze hot wallet instantly.
  - `bridge-protocol` — cross-chain lock-and-mint, relayers, light clients. QA: replay attack test + unauthorized mint test + economic attack simulation + TVL cap verification. MANDATORY security gate + formal verification required.
  - `cex-exchange` — spot/futures trading platform, order book. QA: order matching correctness + cross-account isolation + KYC/AML + regulatory reporting. MANDATORY security gate. Rollback: maintenance mode in <30s.
- All 3 types added to: Type Detection, QA Strategy, Deploy Method, Special Rules, Threshold Cross-Reference, MANDATORY Gate Prerequisites

---

## v1.0.22 — 2026-04-09

### Added
- **WebFetch** added to: `tech-lead`, `senior-dev`, `qa-engineer`, `security-officer`, `project-auditor`
- **WebSearch** added to: `tech-lead`, `security-officer`, `l3-support`, `project-auditor`
- **Write + Edit** added to `devops` — agent now writes CHANGELOG.md, RELEASE-*.md, STAKEHOLDER-*.md directly
- **Tool Usage sections** in all agent prompts — explicit instructions on when and why to use each web tool

### Fixed
- `tech-lead` WebSearch instruction now covers library comparison use case (e.g. `fastify-rate-limit` vs `@fastify/rate-limit`)
- `senior-dev` retains `disallowedTools: WebSearch` — WebFetch only (targeted docs, not general browsing)

---

## v1.0.21 — 2026-04-09

### Added
- **Regulated Stack Migration pipeline** in `PIPELINES.md`
  - Auto-detection via `compliance:` field or fintech/banking keywords
  - EOL Runtime Reference table: PHP 7.3/7.4, Node 10/12, Python 2.7, Angular 12, Ruby 2.x
  - 9 additional QA tests: CVE audit (old+new), data integrity checksums, PCI regression, TLS cipher audit, cryptography regression, audit log continuity, session continuity, third-party integration matrix
  - GATE:ARCH additions: strangler fig plan, maintenance window, rollback SLA, compliance risk statement
  - GATE:SHIP additions: 6 compliance artifact checks — all must be ✓ before deploy
  - Stricter canary abort threshold: 0.5% error rate (vs standard 1%)
  - OLD stack stays live 30 days after 100% cutover
  - Post-deploy L3 window extended to 72h (vs standard 30 min)
  - 7 artifact naming conventions documented

---

## v1.0.20 — 2026-04-09

### Changed
- **`/start`** — now new projects only. Guard added: if PROJECT.md exists → redirects CTO to existing pipeline. If no description → asks one question before proceeding.
- **`/audit`** — new command for existing repos. Spawns `great_cto-project-auditor` with structured task: stack detection → type classification → gap analysis → Beads tasks → PROJECT.md.

### Fixed
- `SessionStart` hook now installs `audit.md` to `~/.claude/commands/`
- SKILL.md intent mapping: `"audit"` now routes to `/audit` command

---

## v1.0.19 — 2026-04-09

### Added
- **Canary deploy by default** for all web/API types in `devops` agent
  - Types: `rest-api`, `web-fullstack`, `saas-platform`, `graphql-api`, `grpc-service`, `microservices`, `realtime-system`, `notification-service`, `auth-service`, `payment-service`, `e-commerce`
  - Rollout: 5% → 5 min hold → 20% → 5 min hold → 100%
  - Abort: error rate >1% OR p99 +50% vs baseline → auto-rollback + P0 Beads task
  - Direct deploy (no canary): library/IaC/embedded types
  - Proxy swap (manual CTO confirmation): `smart-contract`, `defi-protocol`
- **Post-Deploy L3 Observability Window** — Step 4b in full pipeline
  - `great_cto-l3-support` spawned after every production deploy
  - 30 min monitoring window
  - Reports `Post-deploy: OK` if clean, or triggers P1+ triage immediately

---

## v1.0.18 — 2026-04-09

### Added
- **`review_mode: strict | auto`** in PROJECT.md
  - `strict` — adds GATE:CODE checkpoint after code review, before QA
  - `auto` — skips GATE:CODE (default)
- **GATE:CODE** — shows CTO PR link, bug counts by severity, top 3 reviewer findings
- Intent mapping: "strict mode" / "auto mode" phrases update PROJECT.md automatically

---

## v1.0.17 — 2026-04-08

### Fixed
- `PreToolUse` Bash hook: hardened regex with POSIX anchors, empty input guard, added `rm -r/` and `git push -f` patterns
- `UserPromptSubmit` hook: replaced shell string interpolation with `python3 subprocess` JSON construction (prevents injection)
- `PostToolUse` hook: switched to `printf` for atomic log writes, removed unnecessary `path` fallback
- `senior-dev` timeout: 600s → 900s (was less than 50 turns × ~15s avg)

---

## v1.0.16 — 2026-04-08

### Added
- **4 new hooks** in `plugin.json`:
  - `PreToolUse(Bash)` — safety guard: blocks `rm -rf`, `git push --force`, `DROP TABLE`, `curl | python/bash`, `mkfs`, `dd`
  - `PostToolUse(Write|Edit)` — audit log: every file write logged to `.great_cto/agent-writes.log`
  - `UserPromptSubmit` — dynamic session title from PROJECT.md (`project (type)`)
  - `PermissionDenied` — logs denied tools to `.great_cto/permission-denied.log`
- **`disable-model-invocation: true`** on `digest`, `capture`, `revisit` commands (shell-only, no LLM cost)
- **Agent timeouts**: `tech-lead` 1200s, `senior-dev` 900s, `devops` 900s, `qa-engineer` 600s, `security-officer` 600s, `l3-support` 600s, `project-auditor` 1800s
- **`tech-lead` Bash patterns** expanded: added `source`, `awk`, `xargs`, `sort`, `tail`, `head`, `echo`, `export`, `mkdir`, `grep`, `wc`, `date`, `printf`
- `SessionStart` hook now installs: `digest`, `capture`, `revisit` commands + copies `SKILL.md` to `.great_cto/`
