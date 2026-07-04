#!/usr/bin/env bash
# scripts/install-local.sh — install this working copy as the local great_cto
# plugin so Claude Code loads it (and the SessionStart hook can bootstrap).
#
# WHY THIS EXISTS
#   great_cto is developed from source. Claude Code loads it as a plugin from a
#   VERSIONED cache dir: ~/.claude/plugins/cache/local/great_cto/<version>/.
#   That dir is populated by rsync (this script), and the SessionStart hook keeps
#   only the 3 most recent versions — so after a few bumps, or a plugins-cache
#   reset, the cache can end up EMPTY for great_cto. When it does, PLUGIN_DIR
#   resolves to nothing and the SessionStart hook silently no-ops
#   ("plugin dir not found — run /update"): no ARCHETYPES.md/SKILL.md bootstrap,
#   no agents refreshed, docs/metrics look broken. This script re-populates it in
#   one idempotent command.
#
# USAGE
#   bash scripts/install-local.sh            # sync plugin + refresh global agents
#   bash scripts/install-local.sh --no-agents  # sync plugin only
#   bash scripts/install-local.sh --prune     # also remove OTHER cached versions
#
# Idempotent: re-running never duplicates; rsync --delete keeps the cache exact.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE_ROOT="$HOME/.claude/plugins/cache/local/great_cto"
AGENTS_DIR="$HOME/.claude/agents"

DO_AGENTS=1
DO_PRUNE=0
for a in "$@"; do
  case "$a" in
    --no-agents) DO_AGENTS=0 ;;
    --prune)     DO_PRUNE=1 ;;
    -h|--help)   sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown flag: $a (use --no-agents | --prune)"; exit 2 ;;
  esac
done

step()  { printf '\n\033[1m━━ %s\033[0m\n' "$1"; }
ok()    { printf '\033[32m  ✓ %s\033[0m\n' "$1"; }
die()   { printf '\033[31m  ✗ %s\033[0m\n' "$1"; exit 1; }

command -v rsync >/dev/null 2>&1 || die "rsync not found on PATH"
command -v node  >/dev/null 2>&1 || die "node not found on PATH"

VERSION="$(node -p "require('$ROOT/.claude-plugin/plugin.json').version" 2>/dev/null)" \
  || die "cannot read version from .claude-plugin/plugin.json"
DEST="$CACHE_ROOT/$VERSION"

echo "install-local: great_cto v$VERSION → $DEST"

# ── 1. Sync the plugin content into the versioned cache dir ──────────────────
step "Sync plugin → local cache"
mkdir -p "$DEST" || die "cannot create $DEST"
rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.claude/worktrees' \
  --exclude='packages/cli/node_modules' \
  --exclude='*.tgz' \
  --exclude='.great_cto/logs' \
  "$ROOT/" "$DEST/" || die "rsync failed"
ok "synced v$VERSION"

# Verify the files the SessionStart hook actually reads exist.
PLUGIN_DIR="$(ls -d "$CACHE_ROOT"/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')"
[ "$PLUGIN_DIR" = "$DEST" ] || die "newest cache dir is $PLUGIN_DIR, expected $DEST"
for f in .claude-plugin/plugin.json skills/great_cto/ARCHETYPES.md skills/great_cto/SKILL.md \
         agents/architect.md scripts/hooks/auto-attach-reviewers.mjs commands/start.md; do
  [ -f "$DEST/$f" ] || die "post-sync check: missing $f"
done
ok "PLUGIN_DIR resolves and required files present"

# ── 2. Refresh global agents (what SessionStart does on session start) ───────
if [ "$DO_AGENTS" -eq 1 ]; then
  step "Refresh global agents (~/.claude/agents)"
  mkdir -p "$AGENTS_DIR"
  n=0
  for AGENT_FILE in "$DEST"/agents/*.md; do
    base="$(basename "$AGENT_FILE")"
    case "$base" in _*) continue ;; esac   # skip _shared partials
    slug="${base%.md}"
    if cp "$AGENT_FILE" "$AGENTS_DIR/great_cto-${slug}.md" 2>/dev/null; then
      grep -q 'great_cto-managed' "$AGENTS_DIR/great_cto-${slug}.md" 2>/dev/null \
        || echo '<!-- great_cto-managed -->' >> "$AGENTS_DIR/great_cto-${slug}.md"
      n=$((n+1))
    fi
  done
  ok "refreshed $n agents"
fi

# ── 3. Optional prune of other cached versions ───────────────────────────────
if [ "$DO_PRUNE" -eq 1 ]; then
  step "Prune other cached versions"
  removed=0
  for d in "$CACHE_ROOT"/*/; do
    d="${d%/}"
    if [ "$d" != "$DEST" ]; then rm -rf "$d" && removed=$((removed+1)); fi
  done
  ok "pruned $removed other version(s) — only v$VERSION remains"
fi

printf '\n\033[42;30m INSTALL-LOCAL: DONE \033[0m  v%s\n' "$VERSION"
echo "  Restart your Claude Code session so the SessionStart hook picks it up."
