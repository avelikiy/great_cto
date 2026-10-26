# Full pipeline — what the graph does not hold

Read from `skills/great_cto/SKILL.md` § Full Pipeline. **Stage order is the graph**
(`shared/pipeline.toml`) and the next stage is whatever the dispatcher's
PIPELINE-NEXT names; where anything below disagrees with the graph, the graph
wins. This file holds what the graph cannot: when to ask the one clarifying
question, the decision brief, what to show the CTO at each gate, rollback
validation before gate:ship and the post-deploy window.


**Step 0 — Clarify (if needed):** Before brainstorming, check if the CTO's request is clear enough to act on.

Clarify needed if ANY of these:
- Request is ≤5 words with no domain context (e.g. "add payments", "build auth")
- Request contains contradictory signals (e.g. "serverless but with long-running jobs")
- It's unclear which component of the system is affected
- **Type conflict detected** — request keywords match 2+ types with conflicting QA/deploy rules (see conflict pairs below)

**Known type conflict pairs** — if request matches both sides, ask CTO to pick:
| If request mentions | Ambiguous types | Ask |
|---|---|---|
| "REST API" + "tenant isolation" / "multi-tenant" | `rest-api` vs `saas-platform` | "Is this a standalone API or a multi-tenant SaaS product?" |
| "agent" alone | `ai-agent` vs `ai-agent-framework` | "Building an agent that does tasks, or a framework for building agents?" |
| "checkout" / "payment" + "shop" / "store" | `payment-service` vs `e-commerce` | "Is this a payment component or a full e-commerce product?" |
| "data" + "pipeline" + "warehouse" | `data-pipeline` vs `data-warehouse` | "Is this a data ingestion pipeline or a queryable data warehouse?" |
| "RAG" / "retrieval" + "pipeline" | `rag-system` vs `data-pipeline` | "Is retrieval the product, or a step in a larger data pipeline?" |
| "auth" + "payment" | `auth-service` vs `payment-service` | "Is auth the primary concern, or is this a payment service that needs auth?" |
| "web" + "SaaS" | `web-fullstack` vs `saas-platform` | "Is this a web app with tenant isolation, or a general web product?" |
| "MCP" / "tool server" + "library" | `mcp-server` vs `library-sdk` | "Is this a hosted MCP server or a publishable SDK?" |

If clarify needed → ask **ONE question only** (use the question from the table above, or a custom one):
> "Before I start architecture: [one specific question that unlocks the rest]"

Do NOT ask if the request is reasonably clear. When in doubt — proceed. Architect will surface gaps.

**Step 0b — Brainstorm:** Explore requirements before architecture. Per host:
- **Claude Code with superpowers:** invoke `superpowers:brainstorming` skill
- **Claude Code without superpowers / Codex / Cursor / Aider / Continue:**
  the architect agent runs an inline 5-question discovery (problem, users,
  success metric, constraints, non-goals) directly — no external skill needed
- If Skill tool fails with "Unknown skill" → spawn Agent(general-purpose) with prompt: "Brainstorm requirements for: <feature>. Output: goals, user flows, edge cases, open questions."
- Output feeds directly into Step 1 — architect reads the brainstorm notes before writing ARCH doc.

**Step 0c — Decision Brief (non-blocking CTO pre-read):** Before spawning architect, compile a 4-line brief in ~5 seconds:
```bash
# Risk signals: recent postmortems + retro patterns
LAST_PM=$(ls docs/postmortems/PM-*.md 2>/dev/null | sort -V | tail -1 | xargs grep -m1 "^#" 2>/dev/null | sed 's/# //')
RETRO=$(ls .great_cto/retrospectives/*.md 2>/dev/null | sort | tail -1 | xargs grep -m1 "What slowed down:" 2>/dev/null | sed 's/.*: //')
# Current load
OPEN_TASKS=$(bd list --status open 2>/dev/null | grep -c "task" || echo "?")
# Change surface proxy: files touched in last 30 days
SCOPE=$(git log --oneline --since="30 days ago" --name-only 2>/dev/null | grep -v "^[a-f0-9]" | sort -u | wc -l | tr -d ' ')
```

Show to CTO **before** any architecture work:
```
Decision Brief — <feature>
Risk signals: [LAST_PM or "no recent incidents"] | Retro pattern: [RETRO or "none"]
Current load: [OPEN_TASKS or "Beads not initialized"] open tasks | Change surface: ~[SCOPE or "new repo — no history"] files touched/30d
Alternatives hint: consider scoping down or buying before building if this touches >20 files

Proceed to architecture? → say "yes", describe changes, or "alternatives first"
```

**Cold start rules** — if this is a new project (no git history, no ARCH docs, no perf baseline):
- SCOPE=0 → show "new project — no git history yet" (not misleading "0 files touched")
- OPEN_TASKS=? → show "Beads not initialized yet" (not "?" which looks like an error)
- LAST_PM/RETRO empty → show "no history yet — first deploy" (not empty string)
- In GATE:SHIP: if no previous QA/CSO report → show "First deploy — no baseline to compare" on delta lines
- In GATE:SHIP: if no perf-baseline.log → show "First deploy — baseline will be set after this deploy"

**This is NOT a gate.** Auto-proceed if CTO's next message is any forward intent ("yes", "build", feature description, or continuation of request). Only pause if CTO explicitly says "alternatives first" or "scope down".

**Step 1 — Architect (opus):** Spawn `great_cto-architect`. Arch doc + ADR + Beads epic, and gate:arch only when `arch` is in the active gate set.

**GATE:ARCH** — show CTO:
```
Architecture ready → docs/architecture/ARCH-<feature>.md
• [decision 1]  • [decision 2]  • [decision 3]
Proceed? [yes/no]  ← auto-expires in 72h if no response
```
If CTO does not respond within 72h → mark gate:arch as rejected, tell CTO: "gate:arch expired — pipeline paused. Say 'approve arch' to resume or 'cancel' to drop." Do NOT auto-proceed past a gate.

**Step 1b — PM (sonnet):** Spawn `great_cto-pm` after the architect — after gate:arch is approved when gate:arch is active. The graph skips pm on an architect verdict with `depth=small` when gate:plan is not active.

PM reads the ARCH doc and produces `docs/plans/PLAN-<feature>.md`:
- Mermaid Gantt + ASCII fallback
- Dependency graph + parallelism map
- Agent allocation (how many senior-devs concurrently)
- Timeline estimates (PoC/MVP/full mode, with buffer)
- `gate:plan` human checkpoint — only when `plan` is in the active gate set (below)

**Which gates stop for the CTO** is the set `scripts/lib/approval-level.mjs` returns for the project's
`approval-level` and archetype (`reference/approval-level.md`) — not this file. Every
`GATE:X` below applies only when `X` is in that set; otherwise do not create it and do not pause.

**GATE:PLAN** (only if `plan` is active) — show CTO:
```
Plan ready → docs/plans/PLAN-<feature>.md
Tasks: N  |  Agents: M concurrent  |  Duration: Xh–Xh (excl. gate wait)
Approve plan? [yes/no/adjust: <changes>]
```
CTO may request adjustments (fewer agents, different parallelism, PoC mode). PM updates plan and re-presents. When gate:plan is active, do NOT unblock senior-dev until it is approved.

**Step 2 — Senior Dev(s):** Before spawning, check for active pipeline:
```bash
# Detect in-progress tasks (claimed by senior-dev)
bd list --status in-progress 2>/dev/null | head -5
# Check for open PRs from current feature branch
git branch --list "feature/*" 2>/dev/null | head -3
```
If active in-progress tasks exist → tell CTO: "Senior-dev is already working on: [task list]. Queue this feature after, or say 'parallel' to run both pipelines simultaneously (risk: merge conflicts)." Wait for CTO decision. Do NOT auto-spawn a second senior-dev unless CTO says "parallel".

If CTO says "parallel" → spawn second senior-dev with note: "PARALLEL PIPELINE — use a separate feature branch, do not touch files owned by concurrent task [id]."

Otherwise → Spawn `great_cto-senior-dev`. Claim task → TDD → PR → close.

**Step 2a — Formal Verification** (only for `smart-contract` and `defi-protocol` types): see `skills/great_cto/reference/formal-verification.md`.

**Step 2b — Parallel review:** The graph fans out after senior-dev to
`code-reviewer`, `qa-engineer` and `security-officer` side by side (`next` of
`[transitions.senior-dev]` in `shared/pipeline.toml`); the dispatcher's
PIPELINE-NEXT names them. All three are read-only on the code and each records a
verdict; the last of them to finish opens the edge to devops under `gate:ship`.
(This step used to tell you to spawn three `senior-dev` reviewers with focused
prompts. The graph had replaced that in September; the prose had not.)

**Step 2c — GATE:CODE** (only if `code` is active — `strict`, `expert`, `step-by-step`, or a
regulated archetype's floor). `review_mode` is a legacy PROJECT.md key that `approval-level`
replaced: it no longer opens this gate. If you find `review_mode: strict` at a level without
gate:code, say so in one line and offer `approval-level: strict` — do not open the gate on it.

When gate:code is active → create a code review gate and pause for CTO:
```bash
bd create "gate:code — PR review before QA" --type task --priority 0 --label gate
```
Show the CTO:
```
Code ready for review → [PR link from senior-dev output]
  Files changed: N  |  +X insertions  -Y deletions
  P0 bugs: [N]  P1 bugs: [N]  P2 bugs: [N]  (from code review)
  Reviewer notes: [top 3 findings from Step 2b synthesis]
Approve to continue to QA? [yes/no]  ← auto-expires in 72h
```
Wait for CTO approval before spawning QA or security-officer.

When gate:code is not active → skip GATE:CODE, proceed directly to Step 3.

**Step 3 — QA + Security in parallel (quorum model):**
Before spawning, create gate:ship task:
```bash
bd create "gate:ship — deploy approval" --type task --priority 0 --label gate
```
Then spawn simultaneously — QA and Security are both required; treat as quorum (both must complete):
- Spawn `great_cto-qa-engineer` — code analysis + type-merged QA strategy
- Spawn `great_cto-security-officer` — OWASP + compliance + gate:ship

Wait for both. Then compute confidence signal:
- **HIGH**: QA=PASS + Security=APPROVED + no P0 bugs from code review (all agents agree, no caveats)
- **MEDIUM**: minor divergence — P2-only bugs, or one agent has unresolved caveats
- **LOW**: conflicting signals — QA gaps on security findings, P1+ outstanding, or coverage dropped >5%

If QA=PASS and Security=APPROVED → proceed. Otherwise blocked.

**GATE:SHIP** — before showing gate, run rollback validation then compute deltas:

**Rollback validation** (block gate if rollback is impossible):
```bash
TYPE=$(grep "^primary:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
case "$TYPE" in
  smart-contract|defi-protocol)
    # Verify upgrade proxy is deployed
    grep -r "UUPS\|TransparentProxy\|upgradeable" contracts/ src/ 2>/dev/null | head -1 \
      || echo "ROLLBACK_RISK: no upgrade proxy found — rollback impossible without it"
    ;;
  rag-system)
    # Verify index snapshot exists
    ls .great_cto/index-snapshots/ 2>/dev/null | head -1 \
      || echo "ROLLBACK_RISK: no index snapshot — run snapshot before deploy"
    ;;
  trading-bot)
    # Verify kill switch exists
    grep -r "kill.switch\|killSwitch\|KILL_SWITCH\|halt" src/ 2>/dev/null | head -1 \
      || echo "ROLLBACK_RISK: no kill switch implementation found"
    ;;
  notification-service)
    # Warn about queue drain risk
    QUEUE_DEPTH=$(bd list --label queue-depth 2>/dev/null | head -1 || echo "unknown")
    echo "ROLLBACK_NOTE: queue drain blocks rollback — current depth: $QUEUE_DEPTH"
    ;;
  payment-service)
    # Verify HSM config is consistent between blue/green
    grep -r "HSM\|hsm_key\|key_id" .great_cto/ src/ 2>/dev/null | grep -c "." \
      | xargs -I{} echo "HSM references: {}"
    ;;
esac
```
If ROLLBACK_RISK → show to CTO as ⚠ warning in GATE:SHIP **before** asking deploy. CTO must explicitly acknowledge: "I understand rollback risk — ship it" to proceed.

```bash
# Previous QA report (second-to-last)
PREV_QA=$(ls docs/qa-reports/QA-*.md 2>/dev/null | sort -V | tail -2 | head -1)
# Previous CSO report
PREV_CSO=$(ls docs/security/CSO-*.md 2>/dev/null | sort -V | tail -2 | head -1)
# Performance baseline trend
tail -5 .great_cto/perf-baseline.log 2>/dev/null || echo "NO_BASELINE"
```

Show CTO:
```
Ready to deploy.
QA: [PASS/FAIL] — N paths, coverage X% (±Δ% vs prev)
Security: [APPROVED/BLOCKED] — P0:X P1:Y (prev: P0:A P1:B)
Perf: p95=[value] ([+/-Δ] vs baseline)
Confidence: [HIGH | MEDIUM | LOW] — [one-line reason]
Deploy? [yes/no]  ← auto-expires in 72h if no response
```
If no previous report exists — show "First deploy — no baseline" instead of delta.
If coverage dropped >5% OR new P0 vs previous → prefix line with ⚠.
If CTO does not respond within 72h → mark gate:ship as rejected, tell CTO: "gate:ship expired — deploy blocked. Say 'ship it' to re-open or 'cancel' to drop."

**Step 4 — DevOps:** Spawn `great_cto-devops`. staging → validate → prod (canary by default) + observability + changelog.

**Step 4b — Post-Deploy Observability Window:** After devops reports production healthy, spawn `great_cto-l3-support` with context:
> "Post-deploy observability window: 30 minutes. Monitor error rate, latency, and logs. No triage expected — this is a health check. If all clear, report: 'Post-deploy: OK — no anomalies'. If P1+ detected, triage immediately and alert CTO."

Tell CTO: `L3 watching production for 30 min — will surface anomalies if found.`

