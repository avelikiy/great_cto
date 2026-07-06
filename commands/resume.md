---
description: "Resume a previous session. Reads recent session logs, open tasks, and last decisions — gives Claude full context without re-explaining the project."
argument-hint: "[project-path] — defaults to current directory"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
model: haiku
---

You are the great_cto `/resume` command. Your job is to restore full session context in under 60 seconds so the CTO can continue exactly where they left off — without re-explaining the project, stack, or pending work.

## Step 1 — Collect context (run all in parallel)

```bash
# Project identity
cat .great_cto/PROJECT.md 2>/dev/null || echo "NO_PROJECT"

# Recent session logs (last 3)
ls -t .great_cto/logs/session-*.md 2>/dev/null | head -3

# RELEVANT past sessions (BM25 ranked, not just recent) — query = current branch
# + open task titles, so resuming to work on X surfaces the X sessions even if
# they aren't the newest. Fail-open: silent if node/module unavailable.
MS="$HOME/.claude/plugins/cache/local/great_cto"; MS="$(ls -d $MS/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')/scripts/lib/memory-search.mjs"
if command -v node >/dev/null 2>&1 && [ -f "$MS" ]; then
  RQ="$(git branch --show-current 2>/dev/null) $(bd list --status open 2>/dev/null | head -5 | sed 's/^[^ ]* //' | tr '\n' ' ')"
  [ -n "$(echo "$RQ" | tr -d ' ')" ] && { echo "# Relevant past sessions (ranked):"; node "$MS" "$RQ" --source logs --limit 4 2>/dev/null; }
fi

# Open tasks (Beads or tasks.md)
cat .great_cto/tasks.md 2>/dev/null | grep -E "^\- \[ \]|^## " | head -20

# Recent decisions
tail -60 docs/decisions/DECISION-LOG.md 2>/dev/null || echo "NO_DECISION_LOG"

# Latest ADR
ls -t docs/decisions/ADR-*.md 2>/dev/null | head -1 | xargs head -20 2>/dev/null

# Open gates
find .great_cto/verdicts -name "*.md" 2>/dev/null | xargs grep -l "status: open\|OPEN\|pending" 2>/dev/null | head -5

# Git: last 5 commits
git log --oneline -5 2>/dev/null || echo "NO_GIT"

# Git: what's dirty / in progress
git status --short 2>/dev/null | head -10

# Open PRs
gh pr list --state open --limit 5 --json number,title,reviewDecision 2>/dev/null | python3 -c "import json,sys; prs=json.load(sys.stdin); [print(f'PR #{p[\"number\"]}: {p[\"title\"]} [{p.get(\"reviewDecision\") or \"pending\"}]') for p in prs]" 2>/dev/null || true

# Graphify graph (if present)
[ -f graphify-out/GRAPH_REPORT.md ] && head -20 graphify-out/GRAPH_REPORT.md || true
```

Read the 3 most recent session logs:
```bash
for LOG in $(ls -t .great_cto/logs/session-*.md 2>/dev/null | head -3); do
  echo "=== $LOG ==="
  cat "$LOG"
  echo ""
done
```

## Step 2 — Build the context snapshot

If `NO_PROJECT` — stop and say:
```
No .great_cto/PROJECT.md found in this directory.
Run `npx great-cto init` to set up this project, or `cd` into your project root.
```

Otherwise synthesize everything into a **single structured snapshot**:

---

### 📍 Project: `<name>` · `<archetype>` · `<phase>`

**Stack:** `<stack from PROJECT.md>`
**Team:** `<team-size>` · **Mode:** `<mode>`
**Compliance:** `<compliance>`

---

### 🔄 Last session (if logs exist)

> `<date of most recent log>`

**What was done:**
- `<bullet 1 from log>`
- `<bullet 2 from log>`

**Decisions made:**
- `<any decisions recorded>`

**Left pending:**
- `<pending items from log>`

*If no logs exist:* "No session logs found — this appears to be a fresh project."

---

### ✅ Open tasks

List up to 8 open tasks from `tasks.md` or Beads. If none: "No open tasks recorded."

---

### 📋 Recent decisions (last 3)

From `DECISION-LOG.md` and latest ADR. If none: "No decisions logged yet."

---

### 🚧 Git status

- Recent commits: `<last 5 oneline>`
- Dirty files: `<git status short>`
- Open PRs: `<list or "none">`

---

### 🔓 Open gates

List any verdicts with `status: open`. If none: "All gates clear."

---

### 🗺️ Context query order (3-Layer Rule)

```
1. THIS SNAPSHOT  — what was decided, what's pending
2. .great_cto/    — PROJECT.md, logs, verdicts for deeper context
3. Source code    — only when editing or snapshot doesn't answer
```

---

### ▶️ Ready to continue

End with exactly one of:

**If clear next step exists:**
```
Ready. Continuing from: <last pending item>.
Say "go" to start, or tell me what to work on first.
```

**If ambiguous:**
```
Ready. Last session ended without a clear next step.
What would you like to tackle?
  1. <most likely next thing based on context>
  2. <second option>
  3. Something else
```

## Step 3 — Save resume timestamp

```bash
mkdir -p .great_cto/logs
echo "resumed: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .great_cto/logs/.last-resume
```

---

## Notes

- Keep the snapshot **skimmable** — the CTO reads it in 10 seconds, not 2 minutes
- Do NOT dump raw file contents — synthesize
- If Graphify graph exists (`graphify-out/graph.json`), mention it: "Codebase graph available — Claude will query it before reading source files"
- Tone: confident, brief, ready to work
