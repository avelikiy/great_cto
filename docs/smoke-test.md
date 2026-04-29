# Production Smoke Test

> Runbook for verifying that great_cto actually works on a real project.
> Run this after a major release (v1.0.x bump) or when adopting on a new repo.
> Each step has explicit pass/fail criteria — no hand-waving.

## Prerequisites

- Claude Code installed and great_cto plugin active (verify: `/help` shows `/start`, `/audit`, `/crystallize`)
- A real project to test against — git repo with at least 50 commits and some production traffic
- Optional: Grafana credentials if testing `l3-support` (set `GRAFANA_URL` + `GRAFANA_API_KEY` in env)
- Optional: OpenRouter key for LLM router savings test (`OPENROUTER_API_KEY`)

---

## Phase 1 — Bootstrap (5 min)

**Goal:** verify installer + SessionStart hook + agent file copy.

```bash
cd /path/to/your/real/project
npx great-cto init -y
```

**PASS criteria:**
- `.great_cto/PROJECT.md` created
- Detected archetype matches expectation (e.g. web-service for an Express app, data-platform for an ETL repo)
- Installer prints "5 / 5 bootstrapping" without error
- After Claude Code restart, `/start`, `/audit`, `/crystallize` appear in slash command list

**FAIL signals:**
- "git not found" — installer prerequisite missing
- "could not detect latest version" — network issue, fallback to main works but log a Beads task
- Wrong archetype detected — fix by editing `primary:` in `PROJECT.md` directly

---

## Phase 2 — Existing-repo audit (15 min)

**Goal:** verify `/audit` runs end-to-end and produces a useful report.

```
/audit
```

**PASS criteria:**
- Stack fingerprint matches your `package.json` / `requirements.txt` / `go.mod`
- Vulnerability scan completes (npm audit, pip-audit, etc.)
- Architectural debt section flags real issues (god nodes, deprecated deps, missing tests)
- Beads tasks created: priority 0 / 1 / 2 distribution looks reasonable (not all 0, not all 2)
- Audit artefact written to `docs/audit/AUDIT-<date>.md`

**FAIL signals:**
- Audit completes in < 30 seconds → likely surface-level only, missed depth
- Zero Beads tasks created → either repo is impossibly clean or audit didn't run
- All tasks at priority 0 → noise floor too low, add filters
- All tasks at priority 2 → audit too gentle, missed real risks

---

## Phase 3 — Discovery flow (Phase 0 in /start) (10 min)

**Goal:** verify the discovery skill fires when input is sparse.

```
/start "ai stuff"
```

**PASS criteria:**
- Phase 0 trigger fires (because input < 8 words and vague)
- Asks 2–3 questions via `AskUserQuestion` (not all 8 at once)
- After answers, proposes 2–3 options (A / B / C with tradeoffs)
- Option C is "don't build it / use vendor X" or "use /poc instead"
- Waits for user choice — does NOT auto-create PROJECT.md

**Compare with sparse-but-clear input:**
```
/start "Build a JWT auth service with refresh tokens"
```

Should NOT fire Phase 0 (12 words, clear deliverable). Goes straight to Step 1 type detection.

**FAIL signals:**
- All 8 questions asked at once → skill not following "stop early when archetype clear" rule
- No Option C ("don't build it") proposed → skill not honoring its synthesis rule
- PROJECT.md auto-created without choice → skill not waiting for user

---

## Phase 4 — Pipeline run on a real feature (45 min)

**Goal:** verify the standard 5-agent pipeline actually ships code.

Pick a feature small enough to land in 1 hour:

```
/start "Add a /healthz endpoint that returns DB connection status as JSON"
```

**PASS criteria** (each must be checked):
- [ ] architect writes `docs/architecture/ARCH-<slug>.md`
- [ ] DECISION 1 gate fires asking for architecture approval
- [ ] After approve: senior-dev implements, tests pass
- [ ] qa-engineer report flags any test gaps
- [ ] security-officer report — at minimum confirms no new CVEs introduced
- [ ] devops smoke-tests the change before final approval
- [ ] DECISION 2 gate fires asking for ship approval
- [ ] After approve: changes deployed via your project's deploy method (or written into a commit ready for manual deploy)
- [ ] All artefacts persisted: ARCH doc, QA report (`docs/qa-reports/QA-*.md`), CSO report (`docs/security/CSO-*.md`)

**FAIL signals:**
- Any agent skips its verdict log (`.great_cto/verdicts/<agent>.log` should grow)
- DECISION 1 or DECISION 2 not asked → gate not enforced
- Pipeline takes > 2 hours for a simple endpoint → likely model selection wrong (cost mode escalated when not needed)

---

## Phase 5 — Self-improving loop (`/crystallize`) (15 min, conditional)

**Goal:** verify pattern extraction works after a real P0.

This phase is **conditional** — only run after a real production incident with iterations > 3.

After resolving an incident:

```bash
ls ~/.great_cto/extractions/
```

**PASS criteria:**
- A `KE-<date>-<slug>.yaml` file exists
- Privacy scan passes (no project names, URLs, or credentials in the KE)
- Iteration count, breakthrough_tool, false_negatives_observed are all populated

Then:
```
/crystallize
```

**PASS criteria:**
- Lists the pending KE
- Generates a `~/.great_cto/proposals/PROPOSAL-GP-NNNN.md`
- Proposal contains: target agent or skill, proposed change, evidence (MTTR reduction, iterations), risk assessment

```
/crystallize approve GP-NNNN
```

**PASS criteria:**
- Pattern stored in `~/.great_cto/global-patterns/GP-NNNN-<slug>.md`
- Agent file or skill file updated (visible in `git status` or skill file diff)
- Commit made to plugin repo
- `~/.claude/agents/great_cto-<agent>.md` synced

In the **next session** (after Claude Code restart):
- `=== PATTERNS ===` section in SessionStart output mentions the new pattern
- `Step 0: Pattern Lookup` in the target agent surfaces it before Step 1

**FAIL signals:**
- KE missing — agent didn't write it (check trigger: P0 OR iterations > 3)
- KE contains project name → privacy scan should have blocked
- Pattern not surfaced next session → SessionStart hook not finding global-patterns dir

---

## Phase 6 — LLM router savings (5 min, conditional)

**Goal:** verify the README "60–80% LLM cost down" claim has data backing.

Requires `OPENROUTER_API_KEY` set and `l3-support` or `qa-engineer` triggered at least once.

```
/cost 30
```

**PASS criteria:**
- Output starts with `─── LLM ROUTER SAVINGS ───`
- Shows: calls, tokens, Kimi spend, Sonnet equivalent, saved $, %
- Saved % ≥ 60% → ✓ backs the README claim
- Saved % between 40–60% → warn that mostly running Sonnet path
- Saved % < 40% → router under-utilised

If `llm-router-usage.log` is empty: `/cost` suppresses the section (no false claim). The README badge is still defensible because it describes what *would* happen if the router is enabled.

---

## Phase 7 — Discovery + memory across sessions (10 min)

**Goal:** verify cross-session memory holds.

In session 1:
```
/digest
```
Should write `.great_cto/brain.md` and `.great_cto/digest-latest.md`.

End the session. Start a new one.

**PASS criteria** (no manual action needed):
- SessionStart prints `=== PROJECT ===`, `=== BRAIN ===`, `=== HANDOFF ===`, `=== STATUS ===`
- The BRAIN section shows current synthesis (what failed, current tech debt, recurring patterns)
- The HANDOFF section reflects the previous session's last state if context was compacted
- `=== PATTERNS ===` lists active global patterns matching this project's archetype

**FAIL signals:**
- BRAIN section empty → `/digest` Dream Cycle didn't synthesize
- HANDOFF section reads "fresh session" when previous session had work in flight → PreCompact hook didn't fire
- PATTERNS section reads "no global patterns yet" but `~/.great_cto/global-patterns/` has files → SessionStart hook bug

---

## Smoke test verdict

After running Phase 1 + 2 + 3 + 4 (the mandatory four):

**GREEN — all four phases PASS:**
> System works. Adopt for daily use. File any quirks as Beads tasks for v1.0.x+1.

**YELLOW — 3 of 4 PASS:**
> System works for happy path. Document the one failing phase as a known limitation. Investigate before next release.

**RED — 2 or fewer PASS:**
> Block release. The plugin is not ready for production use on this project shape. Open a `bd` task with priority 0 describing what failed and why.

---

## Reporting back

If you run this and find issues, file them via:

```
bd create "smoke-test: <phase>: <what failed>" --type bug --priority 1
```

Or open an issue at https://github.com/avelikiy/great_cto/issues with the smoke-test phase number.
