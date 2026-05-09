#!/usr/bin/env bash
# scripts/phase-task.sh — pipeline-phase task lifecycle helper.
#
# Each pipeline agent (architect / pm / senior-dev / qa-engineer /
# security-officer / code-reviewer / devops / l3-support) calls this
# at the start AND end of its phase so the board UI sees real
# per-stage tasks instead of just gates.
#
# Why: Codex testing in 2026-05 found the great_cto pipeline created
# only `epic + gates` in Beads — none of the actual work stages were
# tracked. Reviewer dashboards showed "27 tasks shipped" with zero
# visibility into which agent did what.
#
# Usage:
#
#   # Start a phase — creates an open task, links to parent epic if given
#   ./phase-task.sh open <agent> <feature-slug> [--parent <epic-id>]
#
#   # Mark a phase as in_progress (when actual work starts)
#   ./phase-task.sh start <task-id>
#
#   # Close a phase with a verdict
#   ./phase-task.sh close <task-id> [--verdict ok|fail|blocked] [--notes "<text>"]
#
#   # Find the most recent open phase task for this agent
#   ./phase-task.sh latest <agent>
#
# Idempotent: re-running `open` for an agent that already has an open
# phase task for this feature returns that task's id (no duplicate).
#
# Falls back to .great_cto/tasks.md when bd is not available.

set -uo pipefail

ACTION="${1:-}"
shift || true

if [ -z "$ACTION" ]; then
  echo "Usage: phase-task.sh open|start|close|latest <args>"
  exit 2
fi

# Detect Beads availability
HAS_BD=0
bd help >/dev/null 2>&1 && HAS_BD=1

# ── helpers ─────────────────────────────────────────────────────────────────

extract_id() {
  # Parse `✓ Created issue: <prefix>-<slug> — title` → `<prefix>-<slug>`.
  # The prefix is the project name (derived from dir), e.g. `bd-test`,
  # `phase-test`, `Copytrader_Rust`. The slug is 2-5 alphanum chars.
  # Match the line containing 'Created issue:' and pull the id between the
  # colon and the em-dash / dash separator.
  awk -F'[: \t—–]+' '/Created issue:/ { for (i=1; i<=NF; i++) if ($i ~ /^[a-zA-Z][a-zA-Z0-9_-]+-[a-z0-9]+$/) { print $i; exit } }'
}

phase_label_for() {
  case "$1" in
    architect)        echo "phase-arch" ;;
    pm)               echo "phase-plan" ;;
    senior-dev)       echo "phase-impl" ;;
    code-reviewer)    echo "phase-review" ;;
    qa-engineer)      echo "phase-qa" ;;
    security-officer) echo "phase-security" ;;
    performance-engineer) echo "phase-perf" ;;
    devops)           echo "phase-deploy" ;;
    l3-support)       echo "phase-incident" ;;
    *)                echo "phase-$1" ;;
  esac
}

phase_priority_for() {
  case "$1" in
    architect|security-officer|qa-engineer) echo 1 ;;
    *) echo 2 ;;
  esac
}

# ── open ────────────────────────────────────────────────────────────────────

phase_open() {
  local agent="$1" feature="$2"
  shift 2
  local parent=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --parent) parent="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  local label
  label=$(phase_label_for "$agent")
  local priority
  priority=$(phase_priority_for "$agent")

  if [ "$HAS_BD" = "1" ]; then
    # Check for existing open phase task for this agent + feature.
    # bd list output: `<symbol> <id> <symbol> <priority> <title>`
    # — extract the id with grep (alpha+digits, dashes).
    local existing
    existing=$(bd list --label "$label" --status open 2>/dev/null \
               | grep -F "$feature" \
               | head -1 \
               | grep -oE '[a-zA-Z][a-zA-Z0-9_-]+-[a-z0-9]+' \
               | head -1)
    if [ -n "$existing" ]; then
      echo "$existing"  # idempotent
      return 0
    fi

    local title="${agent}: ${feature}"
    local args=("create" "$title" "--label" "$label" "--label" "phase" "--priority" "P${priority}")
    [ -n "$parent" ] && args+=("--description" "Phase task for ${agent}. Parent: ${parent}")

    local id
    id=$(bd "${args[@]}" 2>&1 | extract_id)
    if [ -n "$id" ]; then
      echo "$id"
      # Link to parent epic if provided
      [ -n "$parent" ] && bd dep add "$id" "$parent" >/dev/null 2>&1 || true
      return 0
    fi
  fi

  # Fallback: append to .great_cto/tasks.md
  mkdir -p .great_cto
  local fb_id="phase-${agent}-$(date +%s)"
  echo "- [ ] [${fb_id}] ${agent}: ${feature}" >> .great_cto/tasks.md
  echo "$fb_id"
}

# ── start ───────────────────────────────────────────────────────────────────

phase_start() {
  local id="$1"
  if [ "$HAS_BD" = "1" ]; then
    bd update "$id" --status in_progress >/dev/null 2>&1 || true
  fi
  echo "$id"
}

# ── close ───────────────────────────────────────────────────────────────────

phase_close() {
  local id="$1"; shift
  local verdict="ok"
  local notes=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --verdict) verdict="$2"; shift 2 ;;
      --notes)   notes="$2"; shift 2 ;;
      *)         shift ;;
    esac
  done

  if [ "$HAS_BD" = "1" ]; then
    # --force: phase tasks may be linked to an open gate as dependency.
    # The phase represents "agent X did its work" — that fact stands
    # regardless of whether the gate aggregation is still open. The gate
    # itself closes separately when the CTO approves.
    case "$verdict" in
      ok|done|pass|approved)
        bd close --force "$id" >/dev/null 2>&1 \
          || bd close "$id" >/dev/null 2>&1 \
          || true ;;
      fail|blocked|rejected)
        bd update "$id" --status blocked ${notes:+--notes "$notes"} >/dev/null 2>&1 || true ;;
      *)
        bd close --force "$id" >/dev/null 2>&1 \
          || bd close "$id" >/dev/null 2>&1 \
          || true ;;
    esac
  else
    # Fallback: mark in tasks.md
    local file=.great_cto/tasks.md
    [ -f "$file" ] && sed -i '' "s/^- \\[ \\] \\[${id}\\]/- [x] [${id}]/" "$file" 2>/dev/null || \
                       sed -i "s/^- \\[ \\] \\[${id}\\]/- [x] [${id}]/" "$file" 2>/dev/null || true
  fi
  echo "$id"
}

# ── latest ──────────────────────────────────────────────────────────────────

phase_latest() {
  local agent="$1"
  local label
  label=$(phase_label_for "$agent")
  if [ "$HAS_BD" = "1" ]; then
    bd list --label "$label" --status open 2>/dev/null \
      | head -1 \
      | grep -oE '[a-zA-Z][a-zA-Z0-9_-]+-[a-z0-9]+' \
      | head -1
  fi
}

# ── dispatch ────────────────────────────────────────────────────────────────

case "$ACTION" in
  open)   phase_open "$@" ;;
  start)  phase_start "$@" ;;
  close)  phase_close "$@" ;;
  latest) phase_latest "$@" ;;
  *)
    echo "Unknown action: $ACTION (use: open|start|close|latest)" >&2
    exit 2
    ;;
esac
