#!/usr/bin/env bash
# scripts/hooks/welcome.sh
#
# Print a one-time welcome banner after great_cto installs or upgrades to a
# new major/minor version. Marker file lives in ~/.great_cto/.welcomed-<MAJ.MIN>
# so a fresh install (or first session after a minor bump) re-prints.
#
# Silent on every subsequent session.

set -o pipefail

PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')
[ -z "$PLUGIN_DIR" ] && exit 0

VERSION=$(grep '"version"' "${PLUGIN_DIR}/.claude-plugin/plugin.json" 2>/dev/null \
  | head -1 \
  | sed 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/')
[ -z "$VERSION" ] && exit 0

# Marker is per MAJOR.MINOR — patch bumps stay quiet.
MAJ_MIN=$(echo "$VERSION" | awk -F. '{print $1"."$2}')
mkdir -p "$HOME/.great_cto"
MARKER="$HOME/.great_cto/.welcomed-${MAJ_MIN}"
[ -f "$MARKER" ] && exit 0

cat <<EOF

=== great_cto v${VERSION} — welcome ===

You make 2 decisions per feature; agents do the rest.

Daily        /inbox · /digest · /doctor · /resume · /save
Pipeline     /start · /audit · /review · /poc · /promote
Ops          /oncall · /ownership · /rfc · /release · /sec · /cost · /burn
Help         /help                    full command reference

Admin board  great-cto board     →    http://localhost:3141
Docs         https://github.com/avelikiy/great_cto

First time? Run /start in a new project, then /help.

EOF

touch "$MARKER"
exit 0
