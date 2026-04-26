#!/usr/bin/env bash
#
# great_cto — silent background update check
#
# Called from SessionStart hook. Compares current plugin version against npm latest.
# - Caches result for 24h to avoid hammering npm registry
# - Silent on no-update / network failure / first run
# - Prints one-line banner with upgrade command when newer version exists
# - Never blocks SessionStart (timeout 3s, errors swallowed)
#
# Usage: check-update.sh <plugin.json path>

set +e  # never fail SessionStart

PLUGIN_JSON="${1:-}"
[ -z "$PLUGIN_JSON" ] && exit 0
[ ! -f "$PLUGIN_JSON" ] && exit 0

CACHE_DIR="$HOME/.great_cto"
CACHE_FILE="$CACHE_DIR/.last-version-check"
CHECK_INTERVAL=86400   # 24 hours

mkdir -p "$CACHE_DIR" 2>/dev/null

NOW=$(date +%s)
LAST_CHECK=$(cat "$CACHE_FILE" 2>/dev/null | awk '{print $1}' || echo 0)
LAST_CHECK=${LAST_CHECK:-0}
[ "$LAST_CHECK" -ge "$NOW" ] && exit 0  # clock skew safety

ELAPSED=$(( NOW - LAST_CHECK ))
[ "$ELAPSED" -lt "$CHECK_INTERVAL" ] && exit 0

# Read current plugin version
CURRENT_VER=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PLUGIN_JSON" 2>/dev/null \
  | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')
[ -z "$CURRENT_VER" ] && exit 0

# Fetch latest from npm (3s timeout, fail silently if offline)
LATEST_VER=$(curl -fsS --max-time 3 https://registry.npmjs.org/great-cto/latest 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('version',''))" 2>/dev/null)
[ -z "$LATEST_VER" ] && exit 0

# Record successful check (even if no update needed) — stops daily npm pings
echo "$NOW $CURRENT_VER $LATEST_VER" > "$CACHE_FILE" 2>/dev/null

# Compare semver — only banner if LATEST_VER > CURRENT_VER
NEWER=$(python3 -c "
import sys
def parse(v):
    return tuple(int(p) for p in v.replace('v','').split('.')[:3])
try:
    print('yes' if parse('$LATEST_VER') > parse('$CURRENT_VER') else 'no')
except Exception:
    print('no')
" 2>/dev/null)
[ "$NEWER" != "yes" ] && exit 0

# Compute version delta
DELTA=$(python3 -c "
def p(v): return [int(x) for x in v.replace('v','').split('.')[:3]]
c, l = p('$CURRENT_VER'), p('$LATEST_VER')
maj = l[0] - c[0]
min_ = l[1] - c[1]
pat = l[2] - c[2]
if maj > 0: print(f'{maj} major')
elif min_ > 0: print(f'{min_} minor')
else: print(f'{pat} patch')
" 2>/dev/null)

# Print banner — single line, easy to spot, easy to ignore
printf '\n'
printf '╭─────────────────────────────────────────────────────────────────╮\n'
printf '│  💡 great_cto %s is available (you have %s, +%s)\n' "$LATEST_VER" "$CURRENT_VER" "${DELTA:-update}"
printf '│     Upgrade:  npx great-cto init --force\n'
printf '│     Changelog: https://github.com/avelikiy/great_cto/blob/main/CHANGELOG.md\n'
printf '╰─────────────────────────────────────────────────────────────────╯\n'

exit 0
