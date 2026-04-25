# Changelog

All notable changes to great_cto are documented here.

---

## v1.0.115 — 2026-04-25

### Fixed — `/crystallize` wired into SessionStart + documented in README

- **`plugin.json` SessionStart CMD loop**: added `crystallize` to the loop that copies command
  files to `~/.claude/commands/` on every session start. Previously the command file existed in
  the repo but was never installed for users — `/crystallize` would fail with "command not found".
- **`README.md`**:
  - Added `/crystallize` row to the advanced commands table with a one-line description
  - Extended "The brain" section with a cross-project learning paragraph explaining the
    KE → `/crystallize` → GP → Step 0 loop in plain language
  - Updated "Fully automatic" table: session start now shows global patterns loaded;
    added P0 trigger row; `/digest` line updated to mention pattern library stats

---

## v1.0.114 — 2026-04-25

### Added — Step 0 Pattern Lookup in all 6 remaining agents

Completes the self-improving loop: every agent now opens a session by surfacing known patterns
from `~/.great_cto/global-patterns/` before starting its standard workflow.

- **`agents/tech-lead.md`**: Step 0 before ARCH design — surfaces `arch-rework` patterns as
  architecture constraints so past decisions aren't repeated. Architecture decisions blocked by
  a pattern are documented in the new ARCH doc.
- **`agents/senior-dev.md`**: Step 0 before implementation — surfaces known stack pitfalls with
  `fix` field so the developer applies proven fixes immediately. KE trigger added: if advisor
  called AND root cause absent from ARCH doc, write KE before DONE.
- **`agents/qa-engineer.md`**: Step 0 before test plan — surfaces `why_standard_checks_missed_it`
  per matched pattern so those exact failure modes become Priority 0 test cases. KE trigger:
  escaped bug or advisor called more than once.
- **`agents/security-officer.md`**: Step 0 before security checklist — surfaces `security-gap`
  patterns with their verification first-step. KE trigger: new vulnerability class not in
  existing checklist.
- **`agents/devops.md`**: Step 0 before deploy sequence — surfaces deployment failure patterns
  so pre-deploy verification of known failure modes runs before gate:ship check.
- **`agents/project-auditor.md`**: Step 0 before Phase 1 stack fingerprinting — surfaces
  `audit-recurrence` patterns (same debt found in two consecutive audits) and flags them as
  RECURRING in the report, requiring structural remediation not just a finding. KE trigger:
  same debt category appears in this and prior audit.

---

## v1.0.113 — 2026-04-25

### Added — Self-improving agent system (`/crystallize` + Knowledge Extraction)

Every resolved incident, blocked QA run, or completed audit now feeds a structured learning loop:
agent extracts knowledge → `/crystallize` promotes it to a global pattern → next session,
agents surface matching patterns before starting standard diagnostics.

- **`skills/great_cto/references/knowledge-extraction.md`** (NEW): KE schema and extraction protocol.
  Defines when extraction is mandatory (P0 incidents, iterations > 3, new vulnerability class, etc.),
  full YAML schema for `~/.great_cto/extractions/KE-*.yaml` (symptom, dead_ends, breakthrough_tool,
  detection_order_next_time, why_standard_checks_missed_it), anonymized canonical example
  (Grafana jsonData.database null — visible only in Playwright browser console, 8 iterations, 4h),
  and a privacy scan bash script (no project names, URLs, credentials in KE files — plugin is public).
- **`commands/crystallize.md`** (NEW): CTO-approval workflow for promoting KE files to global patterns.
  Subcommands: `status` (pending KEs + proposals + active pattern stats), `review` (KE→GP promotion
  with noise filter: high=auto-promote, medium≥5 iterations, low≥8 iterations, plus dedup check),
  `approve GP-NNNN` (applies proposal to agent file + git commit + copies to `~/.claude/agents/`),
  `reject GP-NNNN reason`, `rollback GP-NNNN` (git revert), `prune` (archive zero-hit patterns
  older than 90 days). MTTR reduction tracked in `~/.great_cto/metrics/crystallize.log`.
- **`agents/l3-support.md`**: new **Step 0 Pattern Lookup** block runs before all diagnostics.
  Reads `~/.great_cto/global-patterns/`, filters by project archetype + stack fingerprint,
  surfaces matching patterns with `detection_order[0]` as Priority 0 diagnostic.
  Canonical: "No data in Grafana" → GP match → Playwright browser console first → saves 4h.
  New **Knowledge Extraction** block at end of workflow: mandatory when P0 or iterations > 3;
  guides agent to write `~/.great_cto/extractions/KE-*.yaml` with privacy-safe content.
- **`plugin.json` SessionStart hook**: injects active global patterns matching current project archetype
  at session start. Each matched pattern surfaces symptom + first detection step so agents apply
  proven shortcuts before re-discovering known root causes.
- **`commands/digest.md`**: new `PATTERN LIBRARY` section in format output and data gather block.
  Shows: active pattern count, total hits, avg MTTR reduction, top 3 patterns by hits.

Pattern files live in `~/.great_cto/global-patterns/` (local machine only — never committed to repo).
KE files live in `~/.great_cto/extractions/` (local machine only). Public repo contains schemas only.

---

## v1.0.112 — 2026-04-25

### Added — Grafana-native monitoring in `l3-support`

Upgrades `l3-support` incident detection from grep/tail/Docker logs to Grafana MCP
(`query_loki`, `search_alerts`, `query_tempo`, `get_panel`, `list_dashboards`) with
graceful file-based fallback for projects without Grafana configured.

- **`agents/l3-support.md`**: frontmatter `tools:` adds 5 Grafana MCP tool names;
  new `## Grafana Setup` block detects `grafana-url` / `grafana-api-key-env` from PROJECT.md
  and sets `$GRAFANA_OK` / `$GCX_OK` flags at startup; Step 2 (Check logs) becomes
  Grafana-first — `search_alerts` + `query_loki` as Priority 0, full file/Docker/journalctl
  chain preserved as Priority 1–4 fallback; Step 3 (Quick diagnostics) adds
  `gcx alerts list --state firing` and `gcx correlate --commit HEAD` when gcx is present;
  new `## Proactive Alert Polling` section enables pre-P0 alert detection from Grafana before
  users notice; P0 Response Angle 4 gains Tempo trace lookup via `query_tempo` to pinpoint
  the slow span in a distributed system failure.
- **`mcp-servers/grafana.md`** (NEW): setup guide for `grafana/mcp-grafana`, `loki-mcp`,
  and `gcx` CLI — install commands, Claude Code `settings.json` snippet, required Grafana
  API key scopes, PROJECT.md fields, tool-to-workflow-step mapping, and verification commands.
- **`skills/great_cto/references/grafana-ops.md`** (NEW): ops reference — 6 LogQL patterns
  (error spike, latency, OOM, panic, auth failure, dependency timeout), PromQL SLI queries
  (availability, p95 latency, error budget burn rate, anomaly band), gcx command reference,
  proactive alert classification table, and the full alert correlation workflow
  (firing alert → Loki → Tempo → gcx correlate → root-cause statement).
- **`commands/start.md`**: `## L3` section in PROJECT.md template now documents 4 optional
  Grafana fields (`grafana-url`, `grafana-api-key-env`, `loki-datasource`, `tempo-datasource`).

---

## v1.0.111 — 2026-04-25

### Added — `agent-product` archetype

New archetype for user-facing autonomous agents built on Claude Agent SDK, LangGraph, CrewAI, AutoGen, and similar frameworks. Differentiated from `ai-system` (which covers internal ML/LLM infrastructure).

- **`skills/great_cto/ARCHETYPES.md`**: added `agent-product` to all three tables — definition,
  QA strategy, and deploy method. Security tier: `deep` always (user input controls tool execution).
  Compliance: OWASP LLM Top 10 + EU AI Act + GDPR if storing memory.
- **`skills/great_cto/packs/agent-pack.md`** (NEW): full AI agent stack reference — orchestration
  framework decision tree, memory tier selection (L1–L4), tool sandboxing (E2B vs Docker),
  observability setup (Langfuse + OTel), agent constitution template, per-user isolation pattern,
  budget cap enforcement, loop bounds, OWASP LLM Top 10 compliance checklist.
- **`skills/great_cto/references/agent-security.md`** (NEW): security officer audit reference —
  OWASP LLM Top 10 audit mapping with thresholds, prompt injection test patterns, per-user
  isolation audit procedure, tool permission matrix template, loop bounds audit commands,
  supply chain audit for agent deps, observability gate, EU AI Act checklist.
- **`skills/great_cto/TYPE_MAP.md`**: added detection keywords for `agent-product` type
  (Claude Agent SDK, user-facing agent, LangGraph agent, CrewAI, AutoGen, agent app, AI copilot).
- **`agents/security-officer.md`**: added `agent-product` to mandatory archetype list and
  tier-computation case statement (deep). Added dedicated Agent Security Audit section with
  6 checks: injection resistance, per-user isolation, loop bounds/budget, observability,
  tool permission matrix, OWASP LLM Top 10 checklist.
- **Landing page + README**: updated archetype count 10 → 11, added `agent-product` card to
  both the hero grid and archetypes page, added `agent-pack` to domain packs list.

---

## v1.0.110 — 2026-04-25

### Improved — visibility + ecosystem positioning

Based on KDnuggets "10 repos to master Claude Code" competitive analysis:

- **README hero keywords**: added `hooks · skills · MCP · subagents · SDLC pipeline · approval gates`
  code pill row — the terms developers search for when evaluating Claude Code extensions.
- **Comparison table**: added `affaan-m/everything-claude-code` (hackathon winner, closest scope
  competitor) and `gsd-build/get-shit-done` (same pipeline philosophy, different depth) with honest
  positioning notes.
- **Landing page badge**: updated hero pill to `hooks · skills · MCP · subagents`.
- **PRs submitted to ecosystem catalogs**:
  - `hesreallyhim/awesome-claude-code` → Tooling › Orchestrators section
  - `VoltAgent/awesome-claude-code-subagents` → Meta & Orchestration category
    (includes `categories/09-meta-orchestration/great-cto-pipeline.md` agent definition)

---

## v1.0.109 — 2026-04-25

### Improved — DORA depth sprint (`/digest`)

Inspired by Habr "DORA-метрики: как собирать, интерпретировать и не переусердствовать, ч.2"
and AI-Zoo 2026 (Hermes memory-cap pattern):

- **Rework Rate (5th DORA metric)**: counts Beads tasks labelled `hotfix`, `rework`, or
  `unplanned` in the digest window, expressed as % of deploys. Appears alongside
  Change Failure Rate in the DORA block.
- **Delta arrows**: each DORA metric now shows `↑N worse` / `↓N better` / `— same`
  vs the previous `/digest` run. Values persisted to `.great_cto/dora-baseline.log`
  (already gitignored) after every run; last 10 snapshots kept.
- **Context disclaimer**: one-line warning at the top of every digest output —
  "These numbers describe this service only. Context determines what 'good' looks like."
  Prevents the common anti-pattern of ranking teams by raw DORA numbers.
- **SPACE capsule**: three lightweight developer-experience signals added after the
  DORA block: on-call burden (incidents/engineer), CI predictability (success%),
  and review pressure (P1/P2 count from last `/review`).
- **brain.md size guard**: Dream Cycle now enforces a 4000-char cap on `.great_cto/brain.md`.
  When exceeded, oldest Evidence Timeline entries are trimmed first; Current Synthesis
  (the useful half) is always preserved. Mirrors the Hermes MEMORY.md pattern.
- **RECOMMENDATION examples**: added Rework Rate and SPACE-signal example recommendations.

---

## v1.0.108 — 2026-04-24

### Added — browseable web UI

- **`site/archetypes.html`** — 10-archetype grid with default tier badges (baseline / standard / deep).
- **`site/agents.html`** — 7-agent grid with model tier (Haiku / Sonnet / Opus) and role description.
- **`site/commands.html`** — 15 commands grouped by usage: Primary (3) / Project lifecycle (5) / Security (5 `/sec` subcommands) / Team & governance (6).
- **Shared stylesheet** — inline `<style>` block (426 lines) in `site/index.html` extracted to `site/assets/site.css`; all four pages share it.
- **Cross-page nav** with current page highlighted.
- **`site/sitemap.xml`** updated with three new URLs.

### Fixed

- **Hero scale metrics**: landing now reads "7 agents · 10 archetypes · 15 commands · 12-angle review · 13 compliance frameworks" — the real counts (was "9 agents · 13 archetypes").
- **`site/assets/demo.tape`**: output lines were being executed as shell commands, producing `syntax error near unexpected token '('` throughout the GIF. Rewrote every output line as `echo '...'` and replaced the ANSI-escape PS1 (which VHS's bracket parser mangled into `clear114m\]`) with a neutral `export PS1='> '`. GIF re-rendered cleanly.
- **Nav menu wrapping**: long labels ("How it works", "12-angle review") wrapped to 2–3 lines and pushed the Install button off-screen. Trimmed to 6 nowrap items.
- **Footer version pin**: was still `v1.0.101`; now reads `v1.0.108`.

### Cleanup

- **`.gitignore`** tightened from `.claude/settings.local.json` to `.claude/` (covers runtime artefacts like `scheduled_tasks.lock` that accidentally got committed in v1.0.107).
- **`.claude/scheduled_tasks.lock`** removed from the tree.

---

## v1.0.107 — 2026-04-24

### Added — launch polish sprint (README + landing)

Closed competitive gaps against top Claude-Code adjacent projects
(`anthropics/claude-code`, `obra/superpowers`, `davila7/claude-code-templates`,
`ruvnet/claude-flow`, `conductor.build`):

- **Demo GIF** (`site/assets/demo.gif`, rendered via `site/assets/demo.tape`
  using charmbracelet/vhs). 45-second terminal recording: `/start "add Stripe
  subscriptions"` → tech-lead architecture → approval → senior-dev TDD →
  12-angle review → QA → CSO → devops canary → ship. Embedded in README
  header and landing hero.
- **Logo in README header** — centered SVG + badge row aligned under it
  (previously text-only H1).
- **Scale metric row**: "9 agents · 13 archetypes · 12-angle review · 13
  compliance frameworks" in both README and landing hero. Concrete numbers
  readers can verify.
- **Release-velocity signal**: "shipped 5 releases in 24h" pill in hero.
- **GitHub Discussions enabled** (`gh api -X PATCH /repos/... -F
  has_discussions=true`). Linked from README, nav, and Links section. Free
  community channel — no Discord setup overhead.
- **Comparison table extended** (README): rows for `obra/superpowers`
  (skills library we integrate on top of, not replace) and
  `davila7/claude-code-templates` (registry we consume via `template-broker`,
  not duplicate). Stops the two most-frequent "how is this different from
  X?" questions at the door.

No agent / pipeline behavior changes in this release.

---

## v1.0.106 — 2026-04-24

### Added — prose-style rules for agent output

Adopted a 7-rule subset from [yzhao062/agent-style](https://github.com/yzhao062/agent-style)
v0.3.1 (CC-BY-4.0 / MIT) to raise the bar on agent-written prose:
audit findings, CSO reports, QA reports, CHANGELOG entries.

- **New:** `skills/great_cto/prose-style.md` — RULE-01 (curse of knowledge),
  RULE-03 (abstract → concrete), RULE-04 (filler words), RULE-05 (dying
  metaphors), RULE-08 (claim calibration), RULE-A (bullet overuse), RULE-H
  (citation discipline — critical). One BAD/GOOD pair per rule; upstream
  carries the full 5-example blocks.
- **New:** `enforcement/prose-deny.txt` — reference-only deny-list (~40
  phrases) covering RULE-04/05/H. Not mechanically loaded; the warn-only
  grep in `agents/qa-engineer.md` inlines a smaller curated pattern.
- **New:** `NOTICE.md` — third-party attribution (CC-BY-4.0 + MIT).
- **Wired in 3 agents** (`security-officer`, `qa-engineer`, `project-auditor`):
  `skills:` frontmatter + one-paragraph "Writing discipline" reminder. QA
  report now runs a warn-only prose grep before emitting DONE — catches
  "in order to", "state-of-the-art", "push the boundaries" and similar
  filler/clichés in agent output without blocking the pipeline.
- **`commands/audit.md`:** finding format pinned — severity + one-line
  evidence with file:line or metric; no adjectives-as-findings.

Not wired in `senior-dev` and `tech-lead`: the skill is loaded via their
SessionStart context when needed; no explicit reminder required (avoiding
the "5 dup reminders" anti-pattern).

---

## v1.0.105 — 2026-04-24

### Fixed (P2) — `great-cto init` scaffolded PROJECT.md that agents couldn't parse

The installer CLI wrote `primary: <archetype>` without the `archetype:` key
agents read. It nested `size:` under `## Team` instead of writing `team-size:`
at root (the key `/rfc` actually greps for), and used a non-existent
`frameworks:` key instead of `compliance:`. Fresh installs scaffolded a
PROJECT.md that silently failed the v1.0.104 tier/guard logic. Fixed: CLI now
writes `archetype:`, `project_size:`, `team-size:` at root, and `compliance:`.

### Fixed (P2) — pre-1.0.104 legacy commands stuck in `~/.claude/commands/`

Users upgrading from < 1.0.104 have unmarked command files the SessionStart
cleanup loop can't touch (it only deletes marked files, for safety). Those
stale commands keep showing up in Claude Code forever. Fixed: `great-cto init`
now runs a one-shot cleanup on upgrade detection — removes files in
`~/.claude/commands/` matching our known legacy names **and** referencing
great_cto **and** lacking the 1.0.104 marker. Hand-written user files with
the same names are preserved (they won't match the great_cto reference test).

---

## v1.0.104 — 2026-04-24

### Fixed (P0) — devops still used v1.0.101 binary `IS_MANDATORY` model

`devops.md` gated pre-deploy on `archetype ∈ {ai-system, commerce, web3, iot-embedded, regulated}`
and required a full `docs/security/CSO-*.md` for any `medium+` project. After
v1.0.102 the tier model explicitly says **baseline tier writes no CSO file**, so
every `medium+` library / web-service / mobile-app / data-platform would **block
at deploy** on "No CSO security report." Fixed: devops now computes the same
effective tier as `security-officer` and accepts the one-line baseline verdict
from `.great_cto/verdicts/security-officer.log` when tier=baseline; CSO file
required only at `standard` / `deep`.

### Fixed (P0) — SessionStart hook deleted user files

The SessionStart hook in `plugin.json` ran `rm -f ~/.claude/commands/{update,status,dora,...}.md`
unconditionally. Command names in that list (`update`, `status`, `dora`) are
generic — if a user had another plugin or a hand-written command with the same
name, great_cto silently deleted it on every session start. Fixed: copied
commands are now tagged with a `<!-- great_cto-managed -->` marker, and the
stale-cleanup loop only removes files that contain that marker.

### Fixed (P1) — `security-gate:` left in TYPE_MAP.md after v1.0.102

v1.0.102 replaced per-type `security-gate: mandatory` overrides with the tier
model but left 20+ stale rows in TYPE_MAP.md. The migration doc said "ignored"
but new types copy-pasted the pattern. Scrubbed all `security-gate:` entries
from TYPE_MAP.md; ARCHETYPES.md example PROJECT.md snippet now shows
`default-tier:` + `tier-override-reason:` instead.

### Fixed (P2) — `/rfc` team-size guard silently bypassed on malformed input

`team-size: many` (or any non-numeric value) was stripped to `""` by
`tr -d '[:alpha:]'`, defaulted to 1, and the guard passed with `1 -lt 10`.
Looked like guard fired correctly but allowed any malformed value through.
Fixed: validate with regex `^[0-9]+$`; warn on malformed input.

### Fixed (P2) — E2E test harness false-positive success on skipped runs

`tests/e2e/run_pipeline.sh --assert-only` with `CLAUDE_CLI_AVAILABLE` unset
printed "✓ all assertions passed" and exited 0, so CI saw green without the
pipeline ever running. Fixed: exits 77 (Autotools SKIPPED convention) when
bootstrap-only. Set `GREAT_CTO_E2E_ALLOW_SKIP=1` to opt back into lenient
behaviour for fixture smoke tests.

### New — additional tier-test coverage

`tests/structural/test_security_tiers.sh` now also asserts that:
- valid waivers emit `SEC_WAIVER: dep=<name> owner=<@x> expires=<date>`
- expired and owner-less waivers emit `WARN_WAIVER_REJECTED: ...`

11 cases total; runs in ~1s.

---

## v1.0.103 — 2026-04-24

### New — Allowlist waiver parser (`.great_cto/security-allowlist.yml`)

v1.0.102 documented the waiver format in `security-tiers.md` but the agent
couldn't read it. Now it can.

`security-officer` parses `.great_cto/security-allowlist.yml` during tier
computation. A waiver suppresses its matching signal only if **all three** are
valid:

- `reason:` non-empty (documented intent)
- `approved-by:` starts with `@` (named owner — not a blank line or "team")
- `expires:` a real ISO date, in the future, ≤ 90 days out

Invalid, expired, or owner-less entries are **rejected** — the signal stays
active and a `WARN_WAIVER_REJECTED` line is logged. Valid suppressions emit
`SEC_WAIVER: <target> owner=<@x> expires=<date>` to the audit log for
traceability.

When every pending `*-dep-introduced` signal is covered by a valid waiver,
the tier is recomputed — a correctly-waived pci-dep signal drops a
web-service back from `standard` to `baseline`.

### New — Structural test `tests/structural/test_security_tiers.sh`

Eight fixture scenarios pinning the tier-computation contract:

- archetype defaults (library→baseline, web3→deep, web-service→baseline)
- signal-driven upgrade (auth-path-changed lifts baseline→standard)
- explicit `default-tier` override
- valid waiver suppresses the upgrade
- expired waiver rejected (stays upgraded)
- waiver missing `@owner` rejected
- waiver for unrelated package doesn't suppress

Runs in ~1s. Mirrors the bash in `agents/security-officer.md` — edits there
should bump this test in lockstep.

### Deferred

- **HTTPS enforcement for greatcto.systems** — cert still provisioning at
  Let's Encrypt (24h SLA from CNAME setup). Will enforce via
  `gh api -X PUT /pages -F https_enforced=true` once state flips from `none`.

---

## v1.0.102 — 2026-04-24

### Changed — Risk-based security tiers replace binary mandatory/conditional gate

The previous `mandatory | conditional | none` model had three systemic holes:

1. **`library → none`** was a supply-chain default. In 2026 npm/PyPI supply
   chain attacks are the #1 vector; zero gate is never right.
2. **"conditional" read as "off by default"** on archetypes that actually own
   the blast radius (web-service with auth, infra with IAM).
3. **Archetype is a proxy for risk, not risk itself** — a web-service handling
   auth for 10M users is more security-critical than a commerce demo, but the
   old model said the opposite.

### New — Three tier model

| Tier | Runs | Time | Skippable? |
|---|---|---|---|
| `baseline` | CVE scan + secret scan + dep freshness | ~2 min | **never** — floor |
| `standard` | baseline + STRIDE threat model + OWASP checklist + compliance map | ~15–25 min | requires explicit waiver with owner + expiry |
| `deep` | standard + penetration-style review + external-dep supply-chain audit + formal dataflow + kill-chain analysis | ~45–90 min | never on deep-tier archetypes |

### New — Signal-driven tier upgrades

`senior-dev` emits `SECURITY_SIGNAL:` lines to `.great_cto/security-signals.log`
when it detects risky changes in the diff. `security-officer` reads these and
upgrades the tier for the pipeline run. Signals only upgrade — never downgrade.

| Signal | Detected on |
|---|---|
| `pci-dep-introduced` | new dep in stripe/plaid/square/braintree/adyen |
| `crypto-dep-introduced` | new dep in jose/jsonwebtoken/bcrypt/argon2/libsodium |
| `auth-path-changed` | file changes in `auth/**`, `iam/**`, `middleware/auth*` |
| `pii-field-added` | migration adds ssn/dob/passport/medical_*/health_* column |
| `iac-perimeter-changed` | Terraform diff touching security_group/iam/public bucket |
| `high-cve-in-dep` | `npm audit` / `pip-audit` / `cargo audit` reports ≥ High |

### Archetype → default tier mapping

| Archetype | Default tier |
|---|---|
| `web3` · `iot-embedded` · `regulated` | **deep** |
| `ai-system` · `commerce` · `infra` | **standard** |
| `web-service` · `mobile-app` · `data-platform` · `library` | **baseline** |

**`library` now runs baseline** (was: no gate). Supply-chain attacks made the
old default indefensible. Two minutes of CVE + secret scan closes the hole.

### New / updated

- **`skills/great_cto/references/security-tiers.md`** — single source of truth for tier model, archetype mapping, signal matrix, waiver rules.
- **`agents/security-officer.md`** — tier-aware execution; baseline runs without CSO report file.
- **`agents/senior-dev.md`** — emits signals during implementation.
- **`/sec status`** — reports current tier + fired signals in every run.
- **`ARCHETYPES.md` / `README.md` / site landing** — tier column replaces binary gate.

### Migration

If PROJECT.md has the old `security-gate: mandatory|conditional|none`, it is
now ignored (tier derives from archetype + signals). Most projects need zero
config change — new defaults are strictly more secure without adding review
burden where it wasn't needed.

To pin a tier explicitly:

```
## Security
default-tier: standard
tier-override-reason: "internal service but handles auth tokens for 10M users"
```

---

## v1.0.101 — 2026-04-24

### Changed — Pareto cut: 22 commands → 15 (7 primary + 8 conditional)

After 100 releases the surface area had drifted past useful. Most of the
extra commands duplicated data that `/inbox` or `/digest` already compute,
or were specialist playbooks that fit naturally under a single security
umbrella.

**Deleted (4 — zero functionality loss):**
- `/triage` — backlog hygiene (duplicates, stale tasks, unowned P0/P1) is
  now a section in `/inbox` that fires only when thresholds trip.
- `/gates` — gate health + drift detection was already in `/inbox`; the
  dedicated command only repeated the same numbers.
- `/dora` — the 4 DORA metrics are already computed and emitted by
  `/digest` on its weekly cadence.
- `/investigate` — use Superpowers' `systematic-debugging` skill, or
  spawn the `l3-support` agent with the question. `/inbox` references
  updated to name the agent directly.

**Merged under `/sec`:**
- `/threat-model` → `/sec threat [arch-slug]`
- `/sbom` → `/sec sbom [version]`
- `/security-incident` → `/sec incident "<desc>"`

`/sec` is now a dispatcher:
```
/sec                         # posture metrics (default = status)
/sec status [days]           # same, explicit
/sec threat [arch-slug]      # STRIDE threat model
/sec sbom [version]          # CycloneDX SBOM
/sec incident "<desc>"       # DORA/GDPR workflow
/sec rotate                  # overdue secret rotations only
```

The three playbook files (threat-model, sbom, security-incident) moved
to `skills/great_cto/playbooks/` — same content, accessed through the
dispatcher. No behaviour change, just one less mental anchor.

**SessionStart hook now cleans up stale commands** from earlier versions
(`~/.claude/commands/{triage,gates,dora,investigate,threat-model,sbom,security-incident,update,status,capture,revisit,board-report}.md`).
Users upgrading from any past version get a clean command list.

### Numbers

| | v1.0.100 | v1.0.101 | Δ |
|---|---|---|---|
| Commands total | 22 | 15 | −32% |
| Commands in README primary | 3 | 3 | — |
| Lines in `commands/` | 6915 | ~5200 | −25% |
| Cognitive load (commands to remember) | 22 | 7 (primary + /sec family) | **−68%** |

### What stayed

All 7 agents, all scheduled automation, gate system, PROJECT.md contract,
LLM router. None of the cuts touched the core pipeline — pure surface-area
reduction.

### Migration

Run `/doctor` after upgrading to confirm old commands are cleaned from
`~/.claude/commands/`. Old muscle memory:

- `/triage` → `/inbox` (hygiene section fires automatically)
- `/gates` → `/inbox` (already shows gate health)
- `/dora` → `/digest`
- `/investigate "<q>"` → spawn `l3-support` with the question
- `/threat-model foo` → `/sec threat foo`
- `/sbom 1.2.3` → `/sec sbom 1.2.3`
- `/security-incident "creds leaked"` → `/sec incident "creds leaked"`

---

## v1.0.100 — 2026-04-24

### Added — LLM router (OpenRouter / Kimi K2) as cost saver

Anthropic tokens are the single largest cost of running great_cto on an
active project. Most agent calls genuinely need Sonnet — architecture, TDD,
security review — but ~20–30% is grunt work (log triage, summarization,
POC smoke tests) that Kimi K2 handles fine at ~5× lower cost.

v1.0.100 adds an optional MCP server `great_cto_llm_router` that exposes a
single tool, `ask_kimi`, to specific agents. Opt-in, zero-config when
disabled, zero external dependencies.

**New files:**
- `mcp-servers/llm-router/server.py` — stdlib-only MCP server (Python 3.9+).
  Implements MCP 2024-11-05 over stdio. Exposes `ask_kimi` + `router_status`.
  Appends usage JSONL to `.great_cto/llm-router-usage.log` for later cost
  reporting. Graceful fallback: if `OPENROUTER_API_KEY` is unset, the tool
  returns a structured `fallback` signal instead of erroring — agents are
  instructed to do the task natively.
- `skills/great_cto/references/llm-router.md` — setup, config, which
  agents use it and when, security caveats, troubleshooting.

**Config (env vars, layered lookup `env > .env.local > ~/.great_cto/secrets.env`):**
- `OPENROUTER_API_KEY` — required to enable
- `GREAT_CTO_ROUTER_MODEL` — default `moonshotai/kimi-k2`; any OpenRouter slug
- `GREAT_CTO_ROUTER_MAX_TOKENS` — default 4096
- `GREAT_CTO_ROUTER_TIMEOUT` — default 60s

**Wired agents:**
- `l3-support` — routine log triage, error clustering, stack-trace
  summarization. P0/P1 reasoning + postmortem writing stay on Claude.
- `senior-dev` — POC mode only: smoke tests and boilerplate scaffolding.
  MVP / production code stays on Claude.
- `qa-engineer` — POC mode only: smoke test generation. Production QA
  stays on Claude.

**Never delegates**: tech-lead, security-officer, devops, /audit. Critical
reasoning stays on native Claude by design.

**Onboarding:**
- `/start` now enforces `.env.local` in `.gitignore`, mentions the router
  as a one-time optional cost saver (with setup hint), and shows router
  status in the confirmation line when active.
- `/doctor` has a new Check 8b that pings OpenRouter `/auth/key` to show
  live quota, verifies `.env.local` is git-ignored, and warns if not.

**Cost reporting:**
- `/digest` reads the usage log and emits an `LLM ROUTER` section with
  calls, tokens, Kimi spend, Sonnet-equivalent cost, and savings.

**Security:**
- `senior-dev` credential-scan updated to recognize OpenRouter key shape
  (`sk-or-v1-[a-f0-9]{32,}`) — blocks accidental commits.
- `.env.local` git-ignore enforced in `/start`, verified in `/doctor`.
- Doc warns against sending PII / secrets through the router.

**Expected savings**: 20–30% on total LLM spend for active projects.
Zero overhead for users who don't configure the key — pipeline is
unchanged.

### Files modified
- `.claude-plugin/plugin.json` — `mcpServers` block added.
- `commands/start.md` — Step 5b (gitignore + optional router setup hint).
- `commands/doctor.md` — Check 8b (router health + key-leak guard).
- `commands/digest.md` — LLM ROUTER cost report.
- `agents/l3-support.md` — `ask_kimi` wired for routine triage.
- `agents/senior-dev.md` — POC-mode delegation + OpenRouter key pattern in
  credential scan.
- `agents/qa-engineer.md` — POC-mode delegation.

### When to skip
- Solo project shipping one feature / week — savings rounding error.
- Strict-compliance env (HIPAA, PCI) without an OpenRouter BAA.
- Offline / air-gapped.

---

## v1.0.99 — 2026-04-24

### Added — POC mode (hypothesis-driven pipeline extension)

CTOs often need to validate a risky assumption before committing to production
rigor — ship a prototype in 3 days, see if users care, keep it or throw it
away. Full SDLC (ARCH → threat-model → SBOM → CSO → QA) is expensive overhead
when the code will be deleted by Friday.

v1.0.99 adds **POC mode**: a lightweight path with forced timebox and
forced ship/pivot/kill decision. Not a parallel pipeline — a mode flag that
agents read and adjust rigor accordingly.

**New commands:**
- `/poc <hypothesis>` — start a POC. Writes `docs/poc/POC-<slug>.md` with
  hypothesis, success criteria, hard timebox (default 7d, max 14d), and
  explicit out-of-scope list. Flips `mode: poc` + `poc_slug:` +
  `poc_expires:` in PROJECT.md.
- `/poc decide` — forced ritual at expiry. Ship / Pivot / Kill.
  Evidence required. Always writes `docs/poc/POC-<slug>-learnings.md`.
- `/poc extend <days>` — max 1×7d. Burns reputation.
- `/promote` — all-or-nothing gate from POC → production. Runs full
  ARCH, threat-model (if archetype requires), SBOM, cost-model, security
  CSO, QA. Flips mode back. Partial promotion is prevented by design.

**Agent skip matrix (see `skills/great_cto/references/poc-mode.md`):**
- **tech-lead**: 1-pager ARCH (Problem / Decision / Risks only). Skip
  full Requirements / Non-functional / Alternatives sections.
- **senior-dev**: one smoke test per hypothesis criterion. Skip
  coverage target, skip edge-case tests. **Credential-scan still runs.**
- **qa-engineer**: smoke tests only. Binary PASS / FAIL verdict. QA
  report headed "POC QA — not production QA".
- **security-officer**: skip CSO entirely. Run credential-scan only.
  One-line verdict.
- **devops**: refuse production deploys. Preview / dev / local /
  ephemeral staging only.

**One rule that never relaxes:** credential-scan. In all modes, agents
grep the diff for `sk-[A-Z]`, `AKIA[0-9A-Z]{16}`,
`-----BEGIN * PRIVATE KEY-----`, `.env` tokens. Match → abort and
move to `.env.local` / env var.

**/inbox banner:** when `mode=poc`, /inbox emits POC_ACTIVE /
POC_URGENT (≤2 days) / POC_EXPIRED signals at the top.

**Principles:**
1. One POC at a time (enforced via PROJECT.md flag).
2. Hard expiry — no silent slippage.
3. Observable success criteria (not "users like it").
4. Forced decision at expiry — no limbo.
5. Learnings always captured, even on kill.
6. Promotion requires full rigor — no sneak-through.

### Files added

- `commands/poc.md`
- `commands/promote.md`
- `skills/great_cto/references/poc-mode.md`

### Files modified

- `commands/inbox.md` — POC banner at top of Gather Data.
- `agents/tech-lead.md` — MODE read + POC-mode behaviour.
- `agents/senior-dev.md` — MODE read + POC-mode behaviour + credential-scan exception.
- `agents/qa-engineer.md` — MODE read + POC-mode behaviour.
- `agents/security-officer.md` — MODE read + POC-mode behaviour.
- `agents/devops.md` — MODE read + POC-mode behaviour.
- `.claude-plugin/plugin.json` — CMD loop adds `poc promote`.

### When NOT to use POC mode

- Anything that touches money, PII, or production user data.
- Core architecture decisions (use ADR + full ARCH instead).
- "I just want to skip the boring parts" — that's production code
  with less rigor, not a POC. /promote requires full audit, not
  retroactive rubber-stamp.

---

## v1.0.98 — 2026-04-24

### Added — Cross-doc link rot lint (L1–L4)

Docs reference each other — ARCH → ADR, PM → ARCH, TM → ARCH,
RELEASE → SBOM. Links rot silently when files are renamed or
deleted. Inspired by the ghost-link lint pattern from
cablate/llm-atomic-wiki (Karpathy-style atomic wiki, but the idea
we borrowed is the cheap deterministic lint, not the compile
pipeline).

- **New rules L1–L4** in `skills/great_cto/references/anti-patterns.md`:
  - **L1** — relative markdown link to a non-existent `.md` file
  - **L2** — inline artefact reference (`ARCH-<slug>.md`,
    `PM-<date>.md`, `ADR-NNNN.md`, etc.) without a matching file
  - **L3** — orphan ADR / RFC (no incoming links from any other doc)
  - **L4** — expired temporal markers (`current version`, `latest
    release`, `TBD`) in docs older than 90 days
- **`/audit lint` extended** — scans all `docs/**/*.md` against
  L1–L4. Skips fenced code blocks and template placeholders
  (`<slug>`, `<feature>`, `NNNN`, `foo/bar/baz`) to avoid false
  positives on example snippets.
- **Waiver syntax respected** — add
  `<!-- anti-pattern-waiver: L2 reason:<why> -->` on the offending
  line to suppress.

### Why
Link rot is the definitive boring problem. A deterministic grep-level
scan finds 90% of it in seconds without an LLM in the loop. Anything
subtler (semantic contradictions across docs, drift in claims) stays
in the "too expensive for every run" bucket — that's what the
security-officer / project-auditor agents are for.

### Non-goals
- Not a semantic linter (doesn't read meaning, only names and links)
- Not a docs-system generator (we don't compile a wiki from scratch —
  we trust the folder layout the pipeline already produces)
- Not a replacement for human review — findings are advisory

---

## v1.0.97 — 2026-04-24

### Added — Anti-pattern blocklist + `/audit lint`

Negative rules are sharper than positive guidance. This release adds a
curated blocklist of shapes engineering artefacts take when they're
theatrical rather than useful, plus a mechanical lint pass that detects
them. Inspired by the anti-cliché blocklist pattern
(ConardLi/web-design-skill), applied here to architecture, threat
models, SBOMs, postmortems, and gate verdicts.

- **`skills/great_cto/references/anti-patterns.md`** — 5 categories,
  28 rules with grep-able **tells** and "do instead" guidance:
  - **ARCH** (A1–A8): no `## Non-goals`, marketing adjectives
    (scalable/reliable/performant) without numbers, unnamed
    infrastructure ("a database"), deferred observability, one-line
    `## Security`, greenfield rewrites without migration
  - **Threat models** (T1–T6): mitigation = "input validation" alone,
    accepted risks without owner+expiry, missing dataflow, STRIDE
    boilerplate left unchanged
  - **SBOM** (S1–S4): <5 components (tool didn't run), missing
    integrity hashes, unpinned versions
  - **Postmortems** (P1–P6): root cause = "human error", action items
    without owner+date, same lessons as prior PMs, skipped 5-whys,
    PM-SEC without notification log
  - **Gate verdicts** (G1–G4): PASS without evidence, batch
    rubber-stamping (3+ verdicts in 60s), self-approval
- **`/audit lint`** — scans all artefacts against the blocklist,
  reports findings with rule ID + file:line + offending snippet.
  Advisory, not blocking. Respects waivers via
  `<!-- anti-pattern-waiver: <rule-id> reason:<why> -->`.
- **Agent prompts reference the blocklist** — `tech-lead` (when
  writing ARCH), `commands/threat-model` (when writing TM),
  `l3-support` (when writing PMs) now cite the relevant rule range
  inline so authors avoid the patterns at drafting time, not at
  review time.

### Why
One well-placed "never" beats ten "try to"s. Positive guidance
("write good architecture") lets mediocre docs through; negative
constraints with detectable tells stop specific failure modes. The
cheap win is that most of these patterns are **grep-detectable** — so
a linter catches them without a model-in-the-loop review.

### Non-goals
- Not a style guide (no prose quality opinions)
- Not a code linter (artefact-level only)
- Not a gate blocker (findings are advisory; waive if intentional)

---

## v1.0.96 — 2026-04-24 🛡

### Added — `/sec` (five security metrics, DORA-style)

DORA gives us four delivery-health numbers. Nothing equivalent existed
for security posture trend. This release adds a fifth number-set —
**five metrics computed entirely from artefacts great_cto already
produces**, no external scanners required, no new telemetry. They
trend the same way DORA metrics do: up-and-right or down-and-right.

- **`/sec [period_days]`** (default 30) — computes the snapshot:
  - **CVE MTTR** — median days from public advisory to our resolution
    in the window. Healthy < 14d; critical < 7d. Source: append-only
    `docs/cve-log.md`.
  - **Dependency freshness** — % of direct deps whose latest release
    is ≤ 180 days old. Healthy ≥ 70%. Source: latest `SBOM-*.json` +
    registry timestamp cache (`.great_cto/dep-freshness-cache.jsonl`).
  - **Threat-model coverage** — % of ARCH docs in window that have a
    `## Security` section AND a matching `TM-<slug>.md`. Healthy ≥ 90%
    for security-critical archetypes (ai-system / commerce / web3 /
    iot-embedded / regulated / fintech).
  - **Pentest burn-down** — severity-weighted `open / (open + closed)`
    ratio from `docs/security/PENTEST-*.md` finding tables. Trended,
    not alerted — slow burn-down is a team-culture conversation.
  - **Secret rotation overdue** — count of secrets past `rotation_due`
    in `.great_cto/secrets.md`. The only binary metric in the set.
- **`skills/great_cto/references/sec-metrics.md`** — explains why
  these five, why not SAST counts / coverage / bug-bounty intake,
  and documents gaming guards (finding reopen rate, selective dep
  updates on low-import crates).
- **`/inbox` signals** — four new triggers fire when thresholds trip:
  `SEC_CVE_ALERT` (≥1 critical CVE open > 14d), `SEC_ROTATION` (any
  secret overdue), `SEC_TM_GAP` (< 60% TM coverage on
  security-critical archetypes), `SEC_FRESHNESS` (reserved for when
  freshness cache lands). Pentest burn-down is intentionally
  **not** alerted.
- **`.great_cto/sec-baseline.log`** — append-only snapshot history,
  same pattern as `.great_cto/perf-baseline.log`. Used by `/digest`
  for weekly security trend.

### Why
**CVE MTTR** is what a CISO asks about first. **Freshness** is the
leading indicator; MTTR is lagging. **TM coverage** is the proxy for
"is the team doing design-time security" (SSDF PW.1). **Pentest
burn-down** tells you whether the team treats findings as real work
or theatre. **Rotation overdue** is the binary one — you either did
or you didn't. Five numbers, one snapshot, no new infrastructure.

### Next
Dependency-freshness cache populator — currently `/sec` reports `-`
when the cache is absent. A cron-able fetcher that warms
`.great_cto/dep-freshness-cache.jsonl` from npm / PyPI / crates.io
closes the last data gap.

---

## v1.0.95 — 2026-04-24 🛡

### Added — `/security-incident` (DORA Art. 17-23 workflow)

Security incidents have different mechanics than ops incidents:
regulatory clocks start at detection, the classification axes are
C/I/A rather than P0/P1/P2, and the paper-trail requirements are
larger by an order of magnitude. v1.0.94 added the **preventive**
side of secure SDLC (threat models, SBOMs). This release adds the
**response** side.

- **`/security-incident "<description>"`** — walks the operator from
  detection to sign-off. Classifies C/I/A impact + DORA class (major
  / significant / non-significant). Computes notification deadlines
  from T+0 (DORA 24h / 72h / 1 month; GDPR Art. 33 72h). Drafts
  `PM-SEC-<id>.md` with a separate template (meta, timeline,
  evidence, scope assessment, notification log, regulatory analysis,
  Agent Verdict Audit). Generates **drafts** of DPA / competent-
  authority / customer notifications — never sends them. Regulatory
  filing stays a human legal act, forever out of scope for this tool.
- **PM-SEC-*.md template** — separate from ops PMs. Fields include
  Classification block (C/I/A + DORA class + affected subjects),
  Evidence (attach, don't paraphrase), Scope assessment with
  confidence level, Notification log (every external comm logged by
  timestamp + recipient), Regulatory analysis (GDPR 33/34, DORA 19,
  PCI DSS, HIPAA if applicable), and the same Agent Verdict Audit
  pattern used in ops PMs — applied to security-officer, threat
  model (tech-lead/TM), QA, red team, and SBOM review.
- **`l3-support` routes security events** before ops triage. A new
  "Security classification gate" step (3b) lists seven signals that
  indicate a security event (auth bypass, data exfiltration,
  credential exposure, etc.) and hands off to `/security-incident`
  immediately. Combined events (compromised service that is also
  DOWN) run `/security-incident` for the regulatory clock, then
  continue ops triage for service restoration.

### Principles baked into the workflow

- **Speed first, paperwork second.** First 60 min of any incident is
  containment, not classification. The command is used once
  containment is underway.
- **Never auto-notify.** Every notification is a legal act; the
  command drafts, a human reviews, a human sends.
- **Preserve evidence.** Every log query, screenshot, and timestamp
  goes into the PM. No paraphrasing of logs.
- **Classify before escalating.** Wrong class costs more than a
  30-minute delay in notification.

### Commands catalogue is now 18

Added to the CMD loop: `security-incident`. Full list: `start audit
inbox digest review ownership oncall rfc release triage doctor dora
burn gates cost investigate threat-model sbom security-incident`.

### Next

- v1.0.96 — `/sec` security-DORA metrics (CVE-MTTR, dep freshness,
  % features with threat model, pentest burn-down, secret rotation)
  + signals in `/inbox`.

---

## v1.0.94 — 2026-04-24 🛡

### Added — Secure SDLC foundation (NIST SSDF + SLSA L1 + DORA Art. 28)

Security was not missing from great_cto — it was diffused across agents
with no authoritative mapping. v1.0.94 introduces the **Secure SDLC
layer**: one reference that says "here's what practice X looks like in
this framework, and here's the great_cto component that implements it."
No new certification claims, no new telemetry — just honest scaffolding
that an auditor or CTO can follow.

Scope of this release is deliberately narrow: **threat modeling +
supply chain + third-party risk**. These are the three gaps most
external audits of engineering-process frameworks flag first.

- **`skills/great_cto/references/secure-sdlc.md`** — authoritative
  mapping of great_cto components to NIST SSDF (SP 800-218), SLSA
  (v1.0), and EU DORA (Reg. 2022/2554). Includes explicit
  out-of-scope declarations so auditors can see what great_cto does
  *not* promise.
- **`/threat-model [slug]`** — generates a STRIDE-based threat model
  from the latest (or named) ARCH doc. Writes
  `docs/threat-models/TM-<slug>.md` with dataflow, asset table,
  threat matrix, mitigation map, and accepted risks. Auto-appends a
  `## Security` section to the ARCH doc pointing at the TM. Closes
  SSDF practice PW.1 (design for security).
- **`/sbom [version]`** — generates a CycloneDX 1.5 SBOM for the
  current release. Uses ecosystem-native tools when available
  (`npm sbom`, `cyclonedx-py`, `cyclonedx-gomod`, `cargo-cyclonedx`),
  falls back to a minimal hand-built SBOM when they aren't. Writes
  `docs/releases/SBOM-<version>.json` and cross-references it in the
  RELEASE doc. Closes SSDF PS.2 / SLSA L1.
- **`devops` agent invokes `/sbom` on every production deploy**
  (step 9c), before generating the CHANGELOG entry. If CI already
  emits a signed SBOM (cosign + OIDC → SLSA L2), the agent references
  the CI artefact instead of generating locally.
- **`tech-lead` enforces `## Security` section** in every ARCH-*.md
  for archetypes `ai-system`, `commerce`, `web3`, `iot-embedded`,
  `regulated`, `fintech`. Missing section blocks the ARCH gate.
- **VENDOR schema extended** with DORA Art. 28 fields: ICT-3P
  register flag, critical-or-important-function classification, data
  categories shared, data location, sub-processors, concentration
  risk, and a mandatory **exit strategy** section (trigger, migration
  path, alternatives, estimated time, data portability, tested?).
  Fields are marked "n/a" for non-financial projects so the structure
  survives a future audit without forcing EU-regulatory ceremony on
  every team.

### What this does *not* do

`secure-sdlc.md` is explicit about the scope limits:

- great_cto does not claim certification readiness for any framework.
- Regulatory notifications (DORA Art. 19, GDPR Art. 33) remain legal
  acts that a human must perform — out of scope.
- SLSA L3+ requires external build infrastructure and is out of scope;
  L1-L2 is achievable with the patterns this release establishes.
- Dedicated security teams for regulated-sector entities are still
  needed for entities in scope for DORA proper.

### Commands catalogue is now 17

Added to the CMD loop: `threat-model`, `sbom`. Full list:
`start audit inbox digest review ownership oncall rfc release triage doctor dora burn gates cost investigate threat-model sbom`

### Next (not in this release)

- v1.0.95 — `/security-incident` with DORA Art. 17-23 notification
  timeline (24h → 72h → 1 month) + `PM-SEC-*.md` template.
- v1.0.96 — `/sec` command: security DORA (CVE-MTTR, dependency
  freshness, % features with threat model, pentest-findings burn-down,
  secret-rotation overdue count).

---

## v1.0.93 — 2026-04-24

### Added — `/investigate` (AI SRE command)

Inspired by Gouthamve Venkatasubramanyam's _"I built an AI SRE in 60
minutes"_ (2024). The core observation: an investigation agent is
useless on day one and invaluable after five incidents — because
pattern recognition compounds. The knowledge base, not the model, is
the moat.

great_cto already produces that knowledge base (postmortems,
crystallised lessons, DORA baseline) — it was missing the command that
reads it.

- **`/investigate "<alert>"`** — given an alert description, loads
  prior postmortems, lessons, the curated pattern library, recent
  deploys, active risks, and the last 48h of commits, then produces
  **three ranked hypotheses** with the cheapest diagnostic for each.
  Ranks by `likelihood × cheapness_of_test`, not by "interestingness."
  Never writes fixes — hands off to `l3-support` or `senior-dev` with
  a concrete proof plan.
- **`skills/great_cto/references/incident-patterns.md`** — curated
  pattern library. Append-only. Format: `P-<num>` with `Tell`,
  `Hypothesis`, `Confirm with`, `Fix`, `Seen in`, `Applies to`.
  `l3-support` adds entries after each postmortem where the root cause
  generalises beyond the specific service.
- **Wired into `/inbox`.** BURN_ALERT and DORA_TRIGGER now both suggest
  `/investigate` as the next step, so an on-call engineer can go from
  "something's wrong" to "three ranked hypotheses" in one command.
- **`l3-support` pattern-extraction step** — after each PM, the agent
  computes the next `P-<num>` and prompts whether to append a new
  entry. Skipped for one-off business-logic bugs.

### Why now

The five-command health dashboard (`/dora /burn /gates /cost`) answers
"is something wrong?" — it did not answer "what's wrong and what should
I check first?" `/investigate` closes that gap using artefacts we were
already producing. No new infrastructure, no new integrations.

---

## v1.0.92 — 2026-04-24

### Added — Deployment Rework Rate (5th DORA metric, 2024)

The classic four DORA metrics measure **what went out and how reliably** —
they don't tell you whether a deploy delivered value or just cleaned up
yesterday's mess. A team doing ten deploys a week, six of them hotfixes,
looks great on DF and MTTR but is burning capacity. The 2024 DORA report
flagged Rework Rate as the single best predictor of "feels fast but isn't
shipping." great_cto now tracks it.

- **New `kind` column in `.great_cto/deploys.log`** — `devops` agent tags
  each deploy as `feature` / `hotfix` / `rollback` / `patch`. Branch-name
  heuristic (`hotfix/*`, `fix/*`) + revert-commit detection picks the
  right label automatically; legacy rows without `kind` are treated as
  `feature` for backwards compatibility.
- **`/dora` reports Rework Rate** — 5th line in the snapshot, with delta
  vs previous window and verdict marker. Elite threshold: < 10%.
- **Rework signal in `/inbox`** — fires when 7-day Rework Rate > 10% and
  there are ≥3 deploys in the window (to avoid noise from tiny samples).
- **CFR thresholds tightened** per 2024 DORA: elite < 5%, high 5–15%,
  concerning > 15%. `/inbox` now emits `level=warn` at 5–15% and
  `level=alert` at > 15%, so growing teams see the signal before it's
  already a fire.

### Added — Gaming guards in `/dora`

Metrics become lies when teams optimize the **number** instead of the
process. `/dora` now runs two automated anti-manipulation checks after
computing the snapshot:

- **Guard 1**: DF and Rework both rising > 10% — flags possible empty /
  technical deploys being counted to inflate DF.
- **Guard 2**: CFR dropped > 30% in a single window — flags possible
  incident-definition narrowing.

Two more manipulations (task fragmentation, rework hidden in features)
aren't mechanically detectable but are documented for tech-lead in
`skills/great_cto/references/dora.md` with detection heuristics.

### Baseline schema

`.great_cto/dora-baseline.log` gained a `rework_rate` column. Existing
baselines stay readable (extra column at the end, ignored by older
tooling).

---

## v1.0.91 — 2026-04-24 🛡

### Trust-signal pass — addressing external audit findings

A pass over the parts of the repo that shape first impressions for new
users and potential contributors. No behavioural changes — just trust
signals and honesty.

- **`SECURITY.md` rewritten.** Replaced the default GitHub template
  placeholder with a real policy: threat surface, supported-versions
  table, private reporting channel (email + GitHub security advisory),
  response SLA (72h ack / 7d triage / 30d fix for High/Critical),
  coordinated disclosure window, and a threat model distinguishing
  out-of-scope (LLM-layer issues) from in-scope (hook bypass,
  over-broad agent `tools:` frontmatter, shell injection in command
  skills, CLI installer bugs).
- **Versioning unified.** `packages/cli/package.json` was drifting at
  `0.1.4` while the plugin was at `1.0.90`, creating ambiguity about
  what's versioned. CLI and plugin now ship on the same track.
  `scripts/bump-version.sh` updates both in lockstep going forward.
- **Economic claims softened in README.** The old "$400/yr vs $1.07M/yr"
  framing replaced by an honest statement: great_cto is process, not a
  team, and the numbers are indicative Anthropic-API spend (varies with
  context size and model).
- **Limitations & non-goals section added to README.** Explicit list of
  what great_cto does *not* do: it's not an IDE, not a CI/CD system,
  not a secrets manager, not deterministic, and not audited against any
  compliance framework. Archetype scaffolds are starting points, not
  certifications.

---

## v1.0.90 — 2026-04-21

### Added — Cost & capacity (the third axis after reliability and delivery)

A feature that ships on time with 99.99% uptime but doubles the cloud
bill per 1k users is still a failed feature. Cost is a silent SLO — no
pager fires when you cross a threshold, so the discipline has to come
from the release process itself.

- **`/cost [days]`** — monthly run-rate (aggregated across services),
  cost-per-deploy, WoW/MoM delta, top movers (≥20% change MoM), and
  headroom vs `monthly-budget` in PROJECT.md. Flags cost-added spikes,
  near-budget conditions, and rising cost-per-deploy.
- **Devops appends cost estimates automatically** to
  `.great_cto/cost-history.log` after every production deploy, pulled
  from the latest ARCH doc's "Total estimated addition" line.
  Structured format: `ISO8601 | service | estimated | actual | source |
  feature`. Actuals fill in via monthly cloud-console reconcile (15 min
  per month — see `cost-discipline.md`).
- **Cost alert in `/inbox`.** Fires on run-rate ≥ `budget-alert-threshold`
  (default 80%) or on any service +30% MoM spike. Points at `/cost` for
  the full breakdown and action items.
- **Budget config in PROJECT.md.** Two optional fields —
  `monthly-budget: <usd>` and `budget-alert-threshold: <pct>`. Omit
  both to disable headroom signals (estimate-only mode still works).
- **`skills/great_cto/references/cost-discipline.md`** — why cost is an
  engineering signal, how to run the monthly reconcile, anti-patterns
  to refuse ("optimize later", "reserved instances will fix it",
  "ignore the one-off"), and workflows for top-mover and near-budget
  alerts.

With this release, `/dora` + `/burn` + `/gates` + `/cost` cover the four
CTO health axes: delivery, reliability, process, economics — each
visible at-a-glance from `/inbox` and drill-down on demand.

`.great_cto/cost-history.log` is gitignored (may contain contract values).

---

## v1.0.89 — 2026-04-20

### Added — Quality gate health (catch gates that have started rubber-stamping)

A gate that always passes is not a gate — it's theater. The only way to
know whether a gate is real is to compare its verdicts against subsequent
reality (incidents, postmortem agent-verdict audits). This release makes
that comparison a single command.

- **`/gates [days]`** — per-agent pass rate, drift vs prior window,
  time-to-verdict, and effectiveness (% of audited PMs where the agent's
  PASS was actually correct). Healthy window: 70–90% pass rate. Outside
  that, flag. Drift +10pp upward while already at >85% triggers
  "rubber-stamping?" warning. Effectiveness <70% triggers "missed too
  many incidents."
- **Two verdict log formats supported.** Per-agent files
  (`qa-engineer.log`, space-delimited) and per-day files
  (`2026-04-20.log`, pipe-delimited) are both parsed automatically.
- **Postmortem audit cross-reference.** `/gates` parses the
  "Agent Verdict Audit" tables from every PM in the window and counts
  per-agent "Correct? = no" rows to compute effectiveness.
- **Gate drift signal in `/inbox`.** Cheap version of the same check
  surfaces a warning when any agent crosses the rubber-stamping
  threshold, with a pointer to `/gates` for the breakdown.
- **`skills/great_cto/references/gate-health.md`** — calibration table,
  the 70–90% window rationale, anti-patterns to refuse ("disable noisy
  gate", "auto-approve when busy"), and workflows for both
  rubber-stamping and low-effectiveness flags.

No new data input required — `/gates` reads the existing
`.great_cto/verdicts/*.log` and `docs/postmortems/PM-*.md` artefacts.
Effectiveness scoring activates as soon as your PMs include the
"Agent Verdict Audit" section.

---

## v1.0.88 — 2026-04-21

### Added — SLO burn rate (catch exhaustion before it happens)

A point-in-time SLO check tells you "78% consumed" but not whether you got
there gradually (fine) or in the last 6 hours (not fine). Burn rate is
the derivative — and multi-window burn rate catches both fast incidents
and slow regressions days before the budget runs out.

- **`/burn [service]`** — multi-window burn rate (24h / 7d / 30d) per
  service+SLI, with projected exhaustion in days at the current 7d pace.
  Thresholds match the Google SRE multi-window pattern: 14.4× normal in
  24h pages on-call, 6× in 7d files a ticket, 1× in 30d goes on the
  review pile.
- **Burn alert in `/inbox`.** When any service crosses fast (24h) or
  slow (7d) burn threshold, `/inbox` surfaces it with the multiplier
  and a pointer to `/burn` for the breakdown — proactive rather than
  reactive.
- **`/digest` writes a snapshot per run** to `.great_cto/slo-burn-history.log`.
  Burn rate needs at least 2 snapshots; weekly digest cadence gives 7d
  resolution. Run `/digest 1` daily to make 24h burn meaningful.
- **`skills/great_cto/references/burn-rate.md`** — multi-window pattern,
  the four numbers and what they mean, anti-patterns to refuse
  ("just lower the SLO" is not the answer), and the workflow split
  between fast-burn (incident response) and slow-burn (planning).

`.great_cto/slo-burn-history.log` is gitignored. Snapshots are derived
from `slo-budget-current.md` so no new data input is required — only
the cadence at which `/digest` runs determines burn-rate resolution.

---

## v1.0.87 — 2026-04-21

### Added — DORA aggregator (the loop, not the dashboard)

Four numbers that tell you whether the engineering system is healthy,
computed from artefacts you already produce.

- **`/dora [period]`** — snapshot of Deployment Frequency, Lead Time for
  Changes, Change Failure Rate, and MTTR for the last N days (default 30),
  with week-over-week deltas. Reads `.great_cto/deploys.log`,
  `docs/postmortems/PM-*.md`, and `bd` closed tasks; no new services.
- **CFR signal in `/inbox`.** When 7-day CFR exceeds 15%, `/inbox` flags
  it with the latest 3 incidents — so the metric becomes an actionable
  prompt in the daily workflow, not a dashboard nobody opens.
- **Weekly DORA snapshot in `/digest`.** Existing DORA section now reads
  `deploys.log` first (fallback: `perf-baseline.log`), so the weekly
  Monday digest carries real numbers instead of placeholders.
- **`devops` writes a single line per production deploy** to
  `.great_cto/deploys.log` (timestamp, service, version, status,
  MR-merge-time). This is the only new data input the feature requires.
- **`skills/great_cto/references/dora.md`** — reference for `tech-lead`
  and `qa-engineer`. Encodes the Ostrovok pattern: when CFR rises, look
  at Lead Time first; "stricter QA" is rarely the right answer.

`.great_cto/dora-baseline.log` accumulates one row per `/dora` run for
local trend-over-time without re-computation. Gitignored.

---

## v1.0.86 — 2026-04-20

### Added — ADR lifecycle + incident lesson crystallization

Decisions don't rot silently anymore, and incidents leave durable traces
that tech-lead reads on every new feature.

- **ADR review candidates.** `/doctor` now surfaces decisions older than
  180 days with zero references in the code (`src/`, `app/`, `lib/`, …).
  Old ADRs that still drive live code stay quiet; truly forgotten ones
  get flagged as candidates to revisit or mark superseded.
- **Supersession tracked both ways.** `/rfc new` accepts an optional
  `Supersedes: ADR-003, ADR-007` header. On `/rfc close accept`, the
  listed ADRs are auto-marked `Status: SUPERSEDED` with a reciprocal
  `Superseded-by:` link back to the new RFC/ADR. `/doctor --fix` repairs
  any one-way links.
- **Incidents crystallize into lessons.** When `l3-support` finishes a
  P0 postmortem, it appends a single actionable line to
  `.great_cto/lessons.md` (date | service | root cause | prevention).
  `tech-lead` now reads this log at the start of every new feature —
  recurring failure patterns become architecture constraints before the
  next ship, not after the next incident.

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

- **`tests/fixtures/trading-system-rust/`** — reproduces the Copytrader_Rust failure mode: committed API keys (`render.yaml` with `OPENROUTER_API_KEY`, `GEMINI_API_KEY`), `unwrap()` panic on hot path, no kill-switch, no risk tests, outdated `reqwest 0.11`. Manifest asserts `security-officer | BLOCKED` verdict — validates the v1.0.79 hard rule (P0 + SEC label must BLOCK).
- **`tests/fixtures/web-fullstack-node/`** — covers `web-fullstack` primary / `web-service` archetype. Next.js 13 with unauthenticated `/api/admin`, committed `.env.local`, green-lie tests (`echo no tests && exit 0`). Manifest asserts CSO BLOCKs on unauthenticated admin endpoint.

### Changed

- `tests/e2e/assert_manifest.py`: added optional `after_cso` block processing and `cso_ran()` detection; bootstrap existence check now accepts `pyproject.toml | package.json | Cargo.toml | go.mod | pom.xml` (previously Python-only).
- `.github/workflows/plugin-ci.yml`: e2e matrix expanded from `[cli-tool-python]` to all three fixtures.

---

## v1.0.81 — 2026-04-20

### Fixed — zsh compatibility in /doctor and SessionStart

Dogfooding `/doctor` on Copytrader_Rust on macOS (default shell: zsh) surfaced two shell incompatibilities that produced noisy stderr output and broken branches:

1. **`grep -c PATTERN 2>/dev/null || echo 0`** — when grep finds zero matches it still prints `0` AND exits 1, so `|| echo 0` runs, producing `"0\n0"`. The captured value then fails `[ "$X" -gt 0 ]` integer tests with "integer expression expected".
2. **`ls docs/audit/AUDIT-*.md 2>/dev/null`** — zsh without `setopt nomatch` prints "no matches found" to stderr *before* the command runs, so `2>/dev/null` inside the command can't suppress it.

**Fixes:**

- `commands/doctor.md`: replaced `|| echo 0` with `VAR=${VAR:-0}` guard; replaced `ls PATTERN` with `find <dir> -maxdepth 1 -name <pat>` in all artefact and verdict-log lookups.
- `.claude-plugin/plugin.json` SessionStart hook: same two fixes in the inline P0 banner + audit-staleness detection.

**Dogfood result on Copytrader_Rust** (previously failing, now clean):
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

The audit of great_cto's own behaviour on real projects (Copytrader_Rust, Minctrl) revealed a systemic failure mode: **agents run, then fail silently**. Beyond PROJECT.md and Beads, no pipeline artefacts ever landed on disk — no audit reports, no ARCH docs, no QA reports, no CSO reports. Silent Write/Bash denials (v1.0.78 diagnosed the cause — plan mode inheritance) produced partial work without alerting the user.

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

**Rationale: without these three layers (post-conditions + verdicts + banner), a pipeline that silently produces nothing is indistinguishable from a pipeline that was never run. The audit of Copytrader_Rust — 6 months of activity, 12 Beads issues, P0 leaked API keys open for 6 days — showed exactly that failure mode.**

---

## v1.0.78 — 2026-04-20

### Fixed — Spawned sub-agent reliability (bugs found during Minctrl pipeline run)

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
