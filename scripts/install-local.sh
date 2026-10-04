#!/usr/bin/env bash
# Install this Git working copy in the Claude local cache, without replacing
# an existing version's files or refreshing either host from a different source.
# Usage: install-local.sh [--no-agents] [--no-register] [--prune]
# --no-register implies --no-agents: publish cache only, no host activation.
# Bump plugin.json version when bytes differ. No force-overwrite mode exists.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Deliberately the local marketplace: this publishes that copy, not a lookup.
CACHE_ROOT="$HOME/.claude/plugins/cache/local/great_cto"
REG="$HOME/.claude/plugins/installed_plugins.json"
DO_AGENTS=1
DO_REGISTER=1
DO_PRUNE=0
for a in "$@"; do
  case "$a" in
    --no-agents) DO_AGENTS=0 ;;
    --no-register) DO_REGISTER=0 ;;
    --prune) DO_PRUNE=1 ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "unknown flag: $a"; exit 2 ;;
  esac
done
[ "$DO_REGISTER" -eq 1 ] || DO_AGENTS=0
die() { printf 'install-local FAILED: %s\n' "$1" >&2; exit 1; }
command -v node >/dev/null 2>&1 || die "node not found on PATH"
command -v git >/dev/null 2>&1 || die "git not found on PATH"

VERSION="$(node "$ROOT/scripts/lib/local-install-target.mjs" "$ROOT/.claude-plugin/plugin.json" "$CACHE_ROOT")" \
  || die "unsafe or unreadable local install target"
DEST="$CACHE_ROOT/$VERSION"
if [ "$DO_REGISTER" -eq 1 ]; then
  node "$ROOT/scripts/lib/local-install-registry.mjs" "$REG" --check \
    || die "registry preflight failed; use --no-register for cache-only publication"
fi

echo "install-local: great_cto v$VERSION → $DEST"
node "$ROOT/scripts/lib/local-install-cache.mjs" "$ROOT" "$CACHE_ROOT" \
  || die "cache publication failed; existing versions left unchanged"

# Verify the files before any managed-file or host-registration mutation.
PLUGIN_DIR="$DEST"
for f in .claude-plugin/plugin.json skills/great_cto/ARCHETYPES.md skills/great_cto/SKILL.md \
         agents/architect.md scripts/hooks/auto-attach-reviewers.mjs commands/start.md; do
  [ -f "$DEST/$f" ] || die "post-publication check: missing $f"
done

if [ "$DO_AGENTS" -eq 1 ]; then
  # SessionStart stays advisory; installation must propagate skipped/failed sync.
  node "$DEST/scripts/lib/sync-managed.mjs" --plugin-dir "$DEST" --report --strict \
    || die "managed-file refresh failed; host registration was not changed"
fi
if [ "$DO_REGISTER" -eq 1 ]; then
  node "$ROOT/scripts/lib/local-install-registry.mjs" "$REG" "$DEST" "$VERSION" \
    || die "registration failed; no install success claimed"
fi
if [ "$DO_PRUNE" -eq 1 ]; then
  # Retain newest three and all observed live roots. Helper validates each target.
  node "$ROOT/scripts/lib/prune-versions.mjs" --cache-root "$CACHE_ROOT" --keep "$DEST" --keep-newest 3 --apply \
    || die "prune failed; no install success claimed"
fi

printf 'INSTALL-LOCAL: DONE v%s (local cache%s only)\n' "$VERSION" \
  "$( [ "$DO_REGISTER" -eq 1 ] && printf ' + Claude registration' )"
echo "No board restart, marketplace refresh, Codex activation or release was performed."
echo "Restart Claude Code explicitly to load the selected local registration."
