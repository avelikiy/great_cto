#!/usr/bin/env bash
# apply-model-override.sh — pin a single Claude model across every great_cto
# agent and command.
#
# WHY THIS EXISTS
# ---------------
# Claude Code reads each agent/command's `model:` from static YAML
# frontmatter — it cannot be a runtime variable. great_cto ships per-agent
# model tiers on purpose (opus for architecture, sonnet/haiku for cheaper
# work). But when the Claude Code *session* runs a 1M-context model, Claude
# Code 2.1.76's skill-model promotion upgrades a `model: sonnet` agent to
# `sonnet[1m]`, which the API rejects with HTTP 429 unless the account has
# long-context billing entitlement (anthropics/claude-code issue #34296).
#
# This script lets the CTO pin ONE model for everything via a single
# setting, sidestepping that promotion. It runs from the SessionStart hook
# AFTER the agents/commands are copied into ~/.claude, and rewrites the
# COPIES only — the plugin source stays pristine, so upstream updates and
# any future PR of this feature remain clean.
#
# SETTING (optional) — ~/.great_cto/config
#     agent-model: opus        # one of: opus | sonnet | haiku | fable
#
# An absent file or absent key is a no-op: stock per-agent tiers are kept.
set -u

CONFIG="${HOME}/.great_cto/config"
[ -f "$CONFIG" ] || exit 0

# Parse `agent-model:` — tolerate leading space and trailing `# comment`.
MODEL=$(grep -E '^[[:space:]]*agent-model:' "$CONFIG" 2>/dev/null \
  | head -1 \
  | sed -E 's/^[[:space:]]*agent-model:[[:space:]]*//; s/[[:space:]]*#.*$//' \
  | tr -d '[:space:]')
[ -n "$MODEL" ] || exit 0

case "$MODEL" in
  opus | sonnet | haiku | fable) ;;
  *)
    echo "great_cto: ignoring invalid agent-model '${MODEL}' (expected opus|sonnet|haiku|fable)" >&2
    exit 0
    ;;
esac

applied=0
for f in "${HOME}"/.claude/agents/great_cto-*.md "${HOME}"/.claude/commands/*.md; do
  [ -f "$f" ] || continue
  # Only touch files great_cto itself manages.
  grep -q 'great_cto-managed' "$f" 2>/dev/null || continue
  # Skip files with no frontmatter `model:` — they already inherit the session.
  grep -qE '^model:[[:space:]]' "$f" 2>/dev/null || continue
  current=$(grep -E '^model:[[:space:]]' "$f" | head -1 | sed -E 's/^model:[[:space:]]*//')
  [ "$current" = "$MODEL" ] && continue
  tmp="$(mktemp)" || continue
  # Rewrite ONLY the first frontmatter `model:` line — `advisor-model:` and
  # any prose are left untouched.
  awk -v m="$MODEL" '
    !done && /^model:[[:space:]]/ { print "model: " m; done = 1; next }
    { print }
  ' "$f" > "$tmp" && mv "$tmp" "$f" && applied=$((applied + 1)) || rm -f "$tmp"
done

[ "$applied" -gt 0 ] && echo "great_cto: agent-model override → ${MODEL} (${applied} file(s) repinned)"
exit 0
