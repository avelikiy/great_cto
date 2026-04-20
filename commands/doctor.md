---
description: "Health check for great_cto. Shows pipeline state, missing artefacts, hook status, last run per agent, and permission-denied tail."
argument-hint: "[--fix] — optional, emits remediation commands"
user-invocable: true
allowed-tools: Read, Bash, Glob, Grep
model: haiku
---

You are the Doctor. Produce a concise, actionable health report for the great_cto pipeline in this project. Do NOT fix — only diagnose and point. Reports go to stdout; no files written.

## Setup

```bash
source .great_cto/env.sh 2>/dev/null || export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
FIX_MODE=false
[ "${1:-}" = "--fix" ] && FIX_MODE=true
TODAY=$(date +%Y-%m-%d)
NOW_EPOCH=$(date +%s)
```

## Check 1 — Required files

```bash
REQ_FILES=(.great_cto/PROJECT.md)
MISS=0
for f in "${REQ_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "MISSING: $f — run /start (new) or /audit (existing repo)"
    MISS=$((MISS+1))
  fi
done
```

Exit early with summary if PROJECT.md missing — no point checking the rest.

## Check 2 — PROJECT.md format (v1.0.76+ contract)

```bash
# Use bash -c to avoid zsh nomatch + grep-c "0 || echo 0" doubling quirks.
if [ -f .great_cto/PROJECT.md ]; then
  HAS_STACK=$(grep -c "^Stack:" .great_cto/PROJECT.md 2>/dev/null); HAS_STACK=${HAS_STACK:-0}
  HAS_TYPE=$(grep -c "^Type:" .great_cto/PROJECT.md 2>/dev/null); HAS_TYPE=${HAS_TYPE:-0}
  HAS_ARCHETYPE=$(grep -c "archetype:" .great_cto/PROJECT.md 2>/dev/null); HAS_ARCHETYPE=${HAS_ARCHETYPE:-0}
  echo "PROJECT.md format:"
  [ "${HAS_STACK}" -gt 0 ] && echo "  ✓ Stack: line present" || echo "  ⚠ Stack: line missing — old format, run /audit to migrate"
  [ "${HAS_TYPE}" -gt 0 ] && echo "  ✓ Type: line present" || echo "  ⚠ Type: line missing — old format, run /audit to migrate"
  [ "${HAS_ARCHETYPE}" -gt 0 ] && echo "  ✓ archetype: present" || echo "  ⚠ archetype: missing"
fi
```

## Check 3 — Output artefacts per phase

```bash
echo ""
echo "Pipeline artefacts:"
# Use find instead of globs so zsh without nullglob doesn't error on no-match.
find_latest() { find "$1" -maxdepth 1 -name "$2" 2>/dev/null | sort | tail -1; }
LAST_AUDIT=$(find_latest docs/audit          'AUDIT-*.md')
LAST_ARCH=$(find_latest  docs/architecture   'ARCH-*.md')
LAST_QA=$(find_latest    docs/qa-reports     'QA-*.md')
LAST_CSO=$(find_latest   docs/security       'CSO-*.md')
LAST_ADR=$(find_latest   docs/decisions      'ADR-*.md')
LAST_DIGEST=$( [ -f .great_cto/digest-latest.md ] && echo .great_cto/digest-latest.md )

age_days() {
  local f="$1"
  [ -z "$f" ] || [ ! -f "$f" ] && { echo "-"; return; }
  local mtime
  mtime=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
  echo $(( (NOW_EPOCH - mtime) / 86400 ))
}

report_artefact() {
  local label="$1"; local path="$2"; local max_age="$3"
  if [ -z "$path" ]; then
    echo "  ✗ $label: NEVER — run the relevant command"
    return
  fi
  local age; age=$(age_days "$path")
  if [ "$age" -gt "$max_age" ]; then
    echo "  ⚠ $label: $age days old (max $max_age) — $(basename "$path")"
  else
    echo "  ✓ $label: $age days old — $(basename "$path")"
  fi
}

report_artefact "audit"        "$LAST_AUDIT"  30
report_artefact "architecture" "$LAST_ARCH"   90
report_artefact "qa report"    "$LAST_QA"     14
report_artefact "security"     "$LAST_CSO"    30
report_artefact "ADR (latest)" "$LAST_ADR"    90
report_artefact "digest"       "$LAST_DIGEST"  7
```

## Check 4 — Beads health

```bash
echo ""
echo "Beads backlog:"
if command -v bd >/dev/null 2>&1; then
  P0_OPEN=$(bd list --status open 2>/dev/null | grep -c "P0"); P0_OPEN=${P0_OPEN:-0}
  P1_OPEN=$(bd list --status open 2>/dev/null | grep -c "P1"); P1_OPEN=${P1_OPEN:-0}
  IN_PROG=$(bd list --status in_progress 2>/dev/null | wc -l | tr -d ' ')
  TOTAL_OPEN=$(bd list --status open 2>/dev/null | wc -l | tr -d ' ')
  echo "  total open: $TOTAL_OPEN | in_progress: $IN_PROG | P0: $P0_OPEN | P1: $P1_OPEN"
  [ "$P0_OPEN" -gt 0 ] && echo "  ⚠⚠⚠ P0 OPEN — run /inbox"
  [ "$IN_PROG" = "0" ] && [ "$TOTAL_OPEN" -gt 0 ] && echo "  ⚠ backlog stalled (nothing in_progress) — run /backlog or /start"
else
  echo "  ✗ bd not installed"
fi
```

## Check 5 — Verdict log (agent activity)

```bash
echo ""
echo "Agent activity (.great_cto/verdicts/):"
VERDICT_DIR=".great_cto/verdicts"
if [ -d "$VERDICT_DIR" ]; then
  LAST_LOG=$(find "$VERDICT_DIR" -maxdepth 1 -name "*.log" 2>/dev/null | sort | tail -1)
  if [ -n "$LAST_LOG" ]; then
    echo "  last log: $(basename "$LAST_LOG") ($(age_days "$LAST_LOG") days ago)"
    echo "  last 5 entries:"
    tail -5 "$LAST_LOG" 2>/dev/null | sed 's/^/    /'
  else
    echo "  ✗ no verdicts logged — agents have not run (or pre-v1.0.79)"
  fi
else
  echo "  ✗ $VERDICT_DIR missing — agents never ran on this project"
fi
```

## Check 6 — Hooks + permission denials

```bash
echo ""
echo "Permission denials:"
DENY_LOG=".great_cto/permission-denied.log"
if [ -f "$DENY_LOG" ]; then
  DENIES=$(wc -l < "$DENY_LOG" | tr -d ' ')
  echo "  $DENIES total denials logged"
  if [ "$DENIES" -gt 0 ]; then
    echo "  last 3:"
    tail -3 "$DENY_LOG" | sed 's/^/    /'
    echo "  → likely plan-mode. Exit plan mode (Shift+Tab) and retry."
  fi
else
  echo "  ✓ no denials (or log absent)"
fi
```

## Check 7 — Scheduled tasks (digest, audit refresh)

```bash
echo ""
echo "Scheduled runs:"
if [ -n "$LAST_DIGEST" ]; then
  DIGEST_AGE=$(age_days "$LAST_DIGEST")
  [ "$DIGEST_AGE" -gt 8 ] && echo "  ⚠ digest $DIGEST_AGE days old (Mon 09:00 scheduler may be broken)" || echo "  ✓ digest fresh ($DIGEST_AGE days)"
else
  echo "  ✗ digest never run — check scheduled-tasks MCP or run /digest manually"
fi
if [ -n "$LAST_AUDIT" ]; then
  AUDIT_AGE=$(age_days "$LAST_AUDIT")
  [ "$AUDIT_AGE" -gt 90 ] && echo "  ⚠ audit $AUDIT_AGE days old (Sun scheduler may be broken)" || echo "  ✓ audit fresh ($AUDIT_AGE days)"
fi
```

## Check 8 — SessionStart hook prime

```bash
echo ""
echo "Plugin install:"
PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')
if [ -n "$PLUGIN_DIR" ]; then
  VER=$(grep '"version"' "$PLUGIN_DIR/.claude-plugin/plugin.json" 2>/dev/null | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')
  echo "  ✓ plugin cached at $PLUGIN_DIR (v$VER)"
else
  echo "  ✗ plugin cache dir missing — SessionStart hook will fail"
fi
[ -f .great_cto/env.sh ] && echo "  ✓ .great_cto/env.sh present" || echo "  ⚠ .great_cto/env.sh missing — SessionStart did not prime"
```

## Summary

```bash
echo ""
echo "─────────────────────────"
echo "Next actions (priority order):"
```

Emit in order (skip section if nothing to say):
1. If P0 open → `→ /inbox` (block everything else until triaged)
2. If PROJECT.md old format → `→ /audit` (migration)
3. If audit > 30d → `→ /audit` (refresh)
4. If QA > 14d and there's an in_progress task → `→ /review`
5. If digest > 8d → `→ /digest 7` (manual, scheduler broken)
6. If backlog stalled → `→ /backlog` or `/start backlog`
7. If permission-denied.log > 0 → `→ exit plan mode, retry`

End with:
```
Run /doctor --fix to emit shell commands for above (v1.0.80+).
```
