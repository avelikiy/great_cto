#!/usr/bin/env bash
# plugin-dir.sh - print the directory of the great_cto plugin this process is running as.
#
# ADR-050 decision 7 (docs/architecture/ARCH-plugin-activation.md, Q5 and Q6).
#
# Exit 0 and print exactly one absolute path, or exit 1, print nothing on stdout and say why on
# stderr. It never lists a plugin cache and never picks "the newest" of anything. The hooks used to
# resolve their plugin with `ls -d ~/.claude/plugins/cache/*/great_cto/*/ | sort -V | tail -1`: the
# highest version in ANY marketplace cache. On a machine that holds the admitted local copy beside
# the git-marketplace copy, a session registered to the admitted one could then run bytes the host
# had pulled from a mutable branch. A hook that cannot tell which bytes it is running does nothing
# and says so.
#
# Order:
#   1. CLAUDE_PLUGIN_ROOT, the directory the host loaded the plugin from. When it is set it is the
#      answer or the refusal: a bad value is never papered over by looking somewhere else.
#   2. The admitted registration: ~/.claude/plugins/installed_plugins.json, key great_cto@local,
#      the one user-scope entry `great-cto init` writes after it has verified the signed snapshot.
#      Its installPath must be a version directory directly under
#      ~/.claude/plugins/cache/local/great_cto/.
#
# Step 2 needs node, which every hook needs anyway. Written for bash 3.2, the one macOS ships.
set -u

refuse() {
  printf 'GREAT_CTO: plugin dir not resolved: %s\n' "$1" >&2
  exit 1
}

# An absolute path to a directory that holds the great-cto plugin manifest.
is_plugin_root() {
  case "$1" in /*) ;; *) return 1 ;; esac
  [ -f "$1/.claude-plugin/plugin.json" ] || return 1
  grep -q '"name"[[:space:]]*:[[:space:]]*"great-cto"' "$1/.claude-plugin/plugin.json" 2>/dev/null
}

# 1. what the host says
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  root=${CLAUDE_PLUGIN_ROOT%/}
  is_plugin_root "$root" || refuse "CLAUDE_PLUGIN_ROOT is not a great-cto plugin directory: $CLAUDE_PLUGIN_ROOT"
  printf '%s\n' "$root"
  exit 0
fi

# 2. the admitted registration
[ -n "${HOME:-}" ] || refuse "HOME is not set"
home=${HOME%/}
registry="$home/.claude/plugins/installed_plugins.json"
[ -f "$registry" ] || refuse "no admitted registration: $registry does not exist - run: npx great-cto init"
command -v node >/dev/null 2>&1 || refuse "node is required to read $registry"

# Same rules as the activation that wrote the file: schema 2, exactly one user-scope entry.
read_registration='
const fs = require("fs");
let data;
try { data = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch (error) { process.exit(2); }
if (!data || data.version !== 2 || typeof data.plugins !== "object" || data.plugins === null) process.exit(3);
const entries = data.plugins["great_cto@local"];
const users = Array.isArray(entries) ? entries.filter((entry) => entry && entry.scope === "user") : [];
if (users.length !== 1 || typeof users[0].installPath !== "string") process.exit(4);
process.stdout.write(users[0].installPath);
'
install_path=$(node -e "$read_registration" "$registry" 2>/dev/null)
case $? in
  0) ;;
  2) refuse "$registry is not valid JSON" ;;
  3) refuse "$registry is not a schema 2 plugin registry" ;;
  4) refuse "no single user-scope registration of great_cto@local in $registry - run: npx great-cto init" ;;
  *) refuse "could not read $registry" ;;
esac
install_path=${install_path%/}

cache_root="$home/.claude/plugins/cache/local/great_cto"
case "$install_path" in
  "$cache_root"/*) version=${install_path#"$cache_root"/} ;;
  *) refuse "the registered path is not under $cache_root: $install_path" ;;
esac
case "$version" in
  ''|.|..|*/*) refuse "the registered path is not a version directory directly under $cache_root: $install_path" ;;
esac
is_plugin_root "$install_path" || refuse "the registered path holds no great-cto plugin: $install_path"
printf '%s\n' "$install_path"
