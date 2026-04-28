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
SKILLS_DETAIL=false
SKILLS_REFRESH=false
for arg in "$@"; do
  case "$arg" in
    --fix) FIX_MODE=true ;;
    --skills) SKILLS_DETAIL=true ;;
    --skills-refresh) SKILLS_REFRESH=true; SKILLS_DETAIL=true ;;
  esac
done
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

## Check 2c — Archetype confidence

```bash
if [ -f .great_cto/PROJECT.md ]; then
  CONFIDENCE=$(grep "^archetype_confidence:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
  ALTERNATIVES=$(grep "^archetype_alternatives:" .great_cto/PROJECT.md 2>/dev/null | sed 's/.*\[//;s/\]//')
  echo "Archetype confidence:"
  case "${CONFIDENCE:-}" in
    high)
      echo "  ✓ archetype_confidence: high — detector is certain"
      ;;
    medium|low)
      echo "  ⚠ archetype_confidence: ${CONFIDENCE} — consider reviewing alternatives: ${ALTERNATIVES:-none}"
      echo "    Run /audit to re-detect, or set archetype: manually in .great_cto/PROJECT.md"
      ;;
    user-specified)
      echo "  ✓ archetype_confidence: user-specified — manually confirmed"
      ;;
    "")
      echo "  ⚠ archetype_confidence: missing — upgrade to v1.0.146+ and re-run bootstrap"
      echo "    Quick fix: run \`npx great-cto\` in the project directory"
      ;;
    *)
      echo "  ⚠ archetype_confidence: unknown value '${CONFIDENCE}' — expected high | medium | low | user-specified"
      ;;
  esac
fi
```

## Check 3 — Output artefacts per phase

```bash
echo ""
echo "Pipeline artefacts:"
# Use find instead of globs so zsh without nullglob doesn't error on no-match.
find_latest() { find "$1" -maxdepth 1 -name "$2" 2>/dev/null | sort -V | tail -1; }
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

## Check 3b — ADR health (lifecycle + supersession)

```bash
echo ""
echo "ADR health:"
ADR_DIR="docs/decisions"
if [ -d "$ADR_DIR" ] && ls "$ADR_DIR"/ADR-*.md >/dev/null 2>&1; then
  TOTAL=$(ls "$ADR_DIR"/ADR-*.md 2>/dev/null | wc -l | tr -d ' ')
  SUPERSEDED=$(grep -l "^Status: SUPERSEDED" "$ADR_DIR"/ADR-*.md 2>/dev/null | wc -l | tr -d ' ')
  ACTIVE=$((TOTAL - SUPERSEDED))
  STALE_COUNT=0
  BROKEN_LINK=0

  # Pick code roots that are actually present; fall back to repo root if none
  CODE_ROOTS=""
  for R in src app lib packages services apps internal pkg cmd; do
    if [ -d "$R" ]; then
      [ -z "$CODE_ROOTS" ] && CODE_ROOTS="$R" || CODE_ROOTS="$CODE_ROOTS $R"
    fi
  done
  [ -z "$CODE_ROOTS" ] && CODE_ROOTS="."

  STALE_OUT=""
  for F in "$ADR_DIR"/ADR-*.md; do
    [ -f "$F" ] || continue
    # Skip superseded — they've already been reviewed
    grep -q "^Status: SUPERSEDED" "$F" 2>/dev/null && continue
    ADR_ID=$(basename "$F" | grep -oE 'ADR-[0-9]+' | head -1)
    [ -z "$ADR_ID" ] && continue
    AGE=$(age_days "$F")
    # Only flag ADRs older than 180d
    [ "$AGE" -lt 180 ] && continue
    # Count code references (excluding the ADR file itself + docs/)
    REFS=$(grep -rIl --exclude-dir=docs --exclude-dir=.git --exclude-dir=node_modules \
             --exclude-dir=.great_cto "$ADR_ID" $CODE_ROOTS 2>/dev/null | wc -l | tr -d ' ')
    if [ "${REFS:-0}" = "0" ]; then
      STALE_OUT="${STALE_OUT}  ⚠ ${ADR_ID} (${AGE}d old, 0 code refs) — run /rfc new \"revisit ${ADR_ID}\" or mark superseded\n"
      STALE_COUNT=$((STALE_COUNT+1))
    fi
  done

  # Validate supersession links are bidirectional
  if [ -d docs/rfcs ] && ls docs/rfcs/RFC-*.md >/dev/null 2>&1; then
    for R in docs/rfcs/RFC-*.md; do
      [ -f "$R" ] || continue
      SUP=$(grep -iE "^Supersedes:" "$R" 2>/dev/null | sed 's/.*://' | tr -d '[:space:]')
      [ -z "$SUP" ] || [ "$SUP" = "—" ] && continue
      # Split comma list (ADR-003,ADR-007)
      OLD_IFS=$IFS; IFS=','
      for TARGET in $SUP; do
        TARGET=$(echo "$TARGET" | tr -d '[:space:]')
        [ -z "$TARGET" ] && continue
        ADR_FILE=$(ls "$ADR_DIR"/${TARGET}-*.md 2>/dev/null | head -1)
        if [ -z "$ADR_FILE" ]; then
          echo "  ⚠ $(basename "$R") supersedes $TARGET but ADR file not found"
          BROKEN_LINK=$((BROKEN_LINK+1))
        elif ! grep -qiE "^Superseded-by:" "$ADR_FILE" 2>/dev/null; then
          echo "  ⚠ ${TARGET} missing reciprocal 'Superseded-by:' header → run /doctor --fix"
          BROKEN_LINK=$((BROKEN_LINK+1))
        fi
      done
      IFS=$OLD_IFS
    done
  fi

  echo "  total: $TOTAL | active: $ACTIVE | superseded: $SUPERSEDED | stale (review candidate): $STALE_COUNT"
  [ "$STALE_COUNT" -gt 0 ] && printf "$STALE_OUT"
  [ "$STALE_COUNT" = "0" ] && [ "$BROKEN_LINK" = "0" ] && echo "  ✓ no stale ADRs, all supersession links intact"
else
  echo "  (no ADRs yet — docs/decisions/ADR-*.md absent)"
fi
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

## Check 8 — SessionStart hook prime + version freshness

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

# Check freshness vs npm registry — force a fresh check (bypass 24h cache)
if [ -n "$VER" ]; then
  rm -f ~/.great_cto/.last-version-check 2>/dev/null
  LATEST=$(curl -fsS --max-time 3 https://registry.npmjs.org/great-cto/latest 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('version',''))" 2>/dev/null)
  if [ -n "$LATEST" ] && [ "$VER" != "$LATEST" ]; then
    NEWER=$(python3 -c "
def p(v): return tuple(int(x) for x in v.split('.')[:3])
print('yes' if p('$LATEST') > p('$VER') else 'no')" 2>/dev/null)
    if [ "$NEWER" = "yes" ]; then
      echo "  ⚠ outdated: latest is v$LATEST — upgrade with: npx great-cto init --force"
    else
      echo "  ✓ on latest (npm: v$LATEST)"
    fi
  elif [ "$VER" = "$LATEST" ]; then
    echo "  ✓ on latest (npm: v$LATEST)"
  fi
fi
```

## Check 8b — LLM router (optional cost saver)

```bash
echo ""
echo "LLM router (OpenRouter / Kimi K2):"
ROUTER_KEY=""
# Layered lookup: env > .env.local > ~/.great_cto/secrets.env
if [ -n "$OPENROUTER_API_KEY" ]; then
  ROUTER_KEY="$OPENROUTER_API_KEY"
  SRC="env"
elif [ -f .env.local ] && grep -q '^OPENROUTER_API_KEY=' .env.local 2>/dev/null; then
  ROUTER_KEY=$(grep '^OPENROUTER_API_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"'')
  SRC=".env.local"
elif [ -f ~/.great_cto/secrets.env ] && grep -q '^OPENROUTER_API_KEY=' ~/.great_cto/secrets.env 2>/dev/null; then
  ROUTER_KEY=$(grep '^OPENROUTER_API_KEY=' ~/.great_cto/secrets.env | head -1 | cut -d= -f2- | tr -d '"'"'"'')
  SRC="~/.great_cto/secrets.env"
fi

if [ -z "$ROUTER_KEY" ]; then
  echo "  ℹ not configured — all tasks on Anthropic (fine, just pricier)"
  echo "    To enable: echo 'OPENROUTER_API_KEY=sk-or-v1-...' >> .env.local (and restart session)"
else
  # Quick ping to verify key is live + get usage
  USAGE_JSON=$(curl -s -m 5 -H "Authorization: Bearer $ROUTER_KEY" https://openrouter.ai/api/v1/auth/key 2>/dev/null)
  if echo "$USAGE_JSON" | grep -q '"usage"'; then
    USAGE=$(echo "$USAGE_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); print(f\"spent=\${d.get('usage',0):.2f} limit=\${d.get('limit') or 'none'}\")" 2>/dev/null)
    echo "  ✓ key live (source: $SRC) — $USAGE"
    # Usage log stats
    if [ -f .great_cto/llm-router-usage.log ]; then
      CALLS=$(wc -l < .great_cto/llm-router-usage.log | tr -d ' ')
      echo "    calls this project: $CALLS"
    fi
  else
    echo "  ✗ key present (source: $SRC) but OpenRouter rejected it — check key at https://openrouter.ai/keys"
  fi
fi

# .env.local must be git-ignored
if [ -f .env.local ]; then
  if git check-ignore .env.local >/dev/null 2>&1; then
    echo "  ✓ .env.local is git-ignored"
  else
    echo "  ✗ .env.local exists but is NOT git-ignored — SECURITY RISK. Add to .gitignore immediately."
  fi
fi
```

## Check 8c — Skills registry (v1.0.139+)

Display the 4-tier skills inventory and flag missing pieces. With `--skills-refresh` flag, force re-scan.

```bash
echo ""
echo "Skills registry:"
REGISTRY="$HOME/.great_cto/skills-registry.json"

# Refresh if requested OR registry missing/stale
if [ "${SKILLS_REFRESH:-false}" = "true" ] || [ ! -f "$REGISTRY" ]; then
  if [ -x "${PLUGIN_DIR}/scripts/skill-discover.sh" ]; then
    bash "${PLUGIN_DIR}/scripts/skill-discover.sh" 2>&1 | sed 's/^/  /'
  else
    echo "  ✗ scripts/skill-discover.sh not found in plugin"
  fi
fi

if [ -f "$REGISTRY" ]; then
  AGE_HOURS=$(( ($(date +%s) - $(stat -f %m "$REGISTRY" 2>/dev/null || stat -c %Y "$REGISTRY")) / 3600 ))
  echo "  Last refresh: ${AGE_HOURS}h ago (24h cache)"

  T1=$(python3 -c "import json; d=json.load(open('$REGISTRY')); print(len(d.get('tier1_great_cto', [])))" 2>/dev/null)
  T2=$(python3 -c "import json; d=json.load(open('$REGISTRY')); print(len(d.get('tier2_external', [])))" 2>/dev/null)
  T3=$(python3 -c "import json; d=json.load(open('$REGISTRY')); print(len(d.get('tier3_personal', [])))" 2>/dev/null)
  echo "  Tier 1 (great_cto built-in):     $T1 skills"
  echo "  Tier 2 (external dependencies):  $T2 skills"
  echo "  Tier 3 (personal repo):          $T3 skills"

  # Check tier 2 sources presence
  [ -d "$HOME/.great_cto/anthropic-skills" ] && \
    echo "  ✓ anthropic-skills cloned ($(cd $HOME/.great_cto/anthropic-skills && git log -1 --pretty=%cr 2>/dev/null))" || \
    echo "  ⚠ anthropic-skills not cloned — SessionStart will pull it next session"

  [ -d "$HOME/.great_cto/personal-skills" ] && \
    echo "  ✓ personal-skills cloned ($(cd $HOME/.great_cto/personal-skills && git log -1 --pretty=%cr 2>/dev/null))" || \
    echo "  ⚠ personal-skills not configured — set up: gh repo create avelikiy/ai-agent-skills"

  # If invoked with --skills, show archetype-relevant skills
  if [ "${SKILLS_DETAIL:-false}" = "true" ]; then
    ARCHETYPE=$(grep "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
    if [ -n "$ARCHETYPE" ]; then
      echo ""
      echo "  Skills auto-loaded for archetype '$ARCHETYPE':"
      python3 -c "
import json
d = json.load(open('$REGISTRY'))
packs = d.get('archetype_packs', {}).get('$ARCHETYPE', [])
for p in packs:
    print(f'    ✓ {p}')
" 2>/dev/null
    fi
  fi
else
  echo "  ⚠ skills-registry.json not yet generated"
  echo "    Run: /doctor --skills-refresh"
fi
```

**Flags**:
- `/doctor --skills` → show registry summary + archetype-relevant skills
- `/doctor --skills-refresh` → force re-scan all 4 tiers
- (default) → show summary only as part of Check 8c

## Check 9 — Auto-remediation (--fix mode)

If `FIX_MODE=true`, perform safe, non-destructive fixes. Skip silently otherwise.

```bash
if [ "$FIX_MODE" = "true" ]; then
  echo ""
  echo "─────────────────────────"
  echo "Applying fixes (safe, non-destructive):"
  FIXED=0

  # Fix 1 — Create missing artefact directories
  for D in .great_cto/verdicts docs/audit docs/architecture docs/qa-reports docs/security docs/decisions; do
    if [ ! -d "$D" ]; then
      mkdir -p "$D" && echo "  ✓ created $D" && FIXED=$((FIXED+1))
    fi
  done

  # Fix 2 — Re-prime env.sh if missing but plugin cache exists
  if [ ! -f .great_cto/env.sh ] && [ -n "$PLUGIN_DIR" ]; then
    mkdir -p .great_cto
    printf "export PATH=/opt/homebrew/bin:\$HOME/.local/bin:/usr/local/bin:\$PATH\nexport ARCHETYPES_MD=.great_cto/ARCHETYPES.md\n" > .great_cto/env.sh
    echo "  ✓ regenerated .great_cto/env.sh"
    FIXED=$((FIXED+1))
  fi

  # Fix 3 — Copy missing ARCHETYPES.md / SKILL.md from plugin cache
  if [ -n "$PLUGIN_DIR" ]; then
    for F in ARCHETYPES.md SKILL.md; do
      if [ ! -f ".great_cto/$F" ] && [ -f "$PLUGIN_DIR/skills/great_cto/$F" ]; then
        cp "$PLUGIN_DIR/skills/great_cto/$F" ".great_cto/$F"
        echo "  ✓ restored .great_cto/$F"
        FIXED=$((FIXED+1))
      fi
    done
  fi

  # Fix 4 — Migrate old PROJECT.md (no Stack:/Type: lines)
  if [ -f .great_cto/PROJECT.md ]; then
    HAS_STACK=$(grep -c "^Stack:" .great_cto/PROJECT.md 2>/dev/null); HAS_STACK=${HAS_STACK:-0}
    HAS_TYPE=$(grep -c "^Type:" .great_cto/PROJECT.md 2>/dev/null); HAS_TYPE=${HAS_TYPE:-0}
    if [ "$HAS_STACK" = "0" ] || [ "$HAS_TYPE" = "0" ]; then
      # Append migration stubs (agents fill real values on next /audit)
      {
        echo ""
        echo "<!-- migrated by /doctor --fix on $TODAY — run /audit to populate -->"
        [ "$HAS_STACK" = "0" ] && echo "Stack: (run /audit to detect)"
        [ "$HAS_TYPE" = "0" ]  && echo "Type: (run /audit to detect)"
      } >> .great_cto/PROJECT.md
      echo "  ✓ added Stack:/Type: migration stubs to PROJECT.md (run /audit to fill)"
      FIXED=$((FIXED+1))
    fi
  fi

  # Fix 5 — Rotate permission-denied.log if stale (> 1000 lines or older than 30d)
  if [ -f "$DENY_LOG" ]; then
    LINES=$(wc -l < "$DENY_LOG" | tr -d ' ')
    LOG_AGE=$(age_days "$DENY_LOG")
    if [ "$LINES" -gt 1000 ] || [ "$LOG_AGE" -gt 30 ]; then
      mv "$DENY_LOG" "${DENY_LOG}.$(date +%Y%m%d)"
      echo "  ✓ rotated stale $DENY_LOG"
      FIXED=$((FIXED+1))
    fi
  fi

  # Fix 6 — ADR supersession reciprocal links
  if [ -d docs/rfcs ] && [ -d docs/decisions ]; then
    for R in docs/rfcs/RFC-*.md; do
      [ -f "$R" ] || continue
      SUP=$(grep -iE "^Supersedes:" "$R" 2>/dev/null | sed 's/.*://' | tr -d '[:space:]')
      [ -z "$SUP" ] || [ "$SUP" = "—" ] && continue
      RFC_ID=$(basename "$R" | grep -oE 'RFC-[0-9]+' | head -1)
      OLD_IFS=$IFS; IFS=','
      for TARGET in $SUP; do
        TARGET=$(echo "$TARGET" | tr -d '[:space:]')
        ADR_FILE=$(ls docs/decisions/${TARGET}-*.md 2>/dev/null | head -1)
        [ -z "$ADR_FILE" ] && continue
        if ! grep -qiE "^Superseded-by:" "$ADR_FILE" 2>/dev/null; then
          # Insert Superseded-by line right after the first Status: line
          python3 - "$ADR_FILE" "$RFC_ID" <<'PY'
import sys, re
path, rfc = sys.argv[1], sys.argv[2]
with open(path) as f: text = f.read()
if re.search(r'^Superseded-by:', text, re.M|re.I): sys.exit(0)
text = re.sub(r'^(Status:[^\n]*)', rf'\1\nSuperseded-by: {rfc}', text, count=1, flags=re.M|re.I)
with open(path, 'w') as f: f.write(text)
PY
          echo "  ✓ added 'Superseded-by: $RFC_ID' to $(basename "$ADR_FILE")"
          FIXED=$((FIXED+1))
        fi
      done
      IFS=$OLD_IFS
    done
  fi

  # Fix 7 — bd init if backlog absent but .beads dir missing
  if command -v bd >/dev/null 2>&1 && [ ! -d .beads ]; then
    bd init 2>/dev/null && echo "  ✓ initialised bd backlog" && FIXED=$((FIXED+1))
  fi

  echo ""
  if [ "$FIXED" = "0" ]; then
    echo "Nothing to fix — environment is healthy."
  else
    echo "$FIXED fix(es) applied. Re-run /doctor to verify."
  fi
  echo ""
  echo "Not fixed automatically (requires your input):"
  echo "  • P0 Beads — triage via /inbox"
  echo "  • Stale audit (>30d) — run /audit"
  echo "  • Stalled backlog — run /start or /audit"
  echo "  • Missing scheduler — set up a weekly cron for /digest (Mon 9:00 is the default)"
fi
```

## Summary (diagnosis mode, when --fix not passed)

```bash
if [ "$FIX_MODE" != "true" ]; then
  echo ""
  echo "─────────────────────────"
  echo "Next actions (priority order):"
fi
```

Emit in order (skip section if nothing to say):
1. If P0 open → `→ /inbox` (block everything else until triaged)
2. If PROJECT.md old format → `→ /doctor --fix` then `/audit`
3. If audit > 30d → `→ /audit`
4. If QA > 14d and there's an in_progress task → `→ /review`
5. If digest > 8d → `→ /digest 7`
6. If backlog stalled → `→ /start` or `/audit`
7. If permission-denied.log > 0 → `→ exit plan mode, retry`
8. If missing dirs / env.sh / migration needed → `→ /doctor --fix`

End with:
```
Run /doctor --fix to auto-remediate safe issues (dirs, env.sh, PROJECT.md stubs).
```
