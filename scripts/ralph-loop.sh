#!/usr/bin/env bash
# great_cto unattended runner — a "ralph loop": run a fresh agent session each
# iteration, letting work accumulate in the workspace between runs.
#
# Adapted from SantanderAI/ralph (Apache-2.0, © 2026 César Gallego Rodríguez)
# https://github.com/SantanderAI/ralph — the "Ralph Wiggum" technique.
# This great_cto-native variant drives the continuity through the great_cto
# workspace (.great_cto/HANDOFF.md + PROJECT.md + lessons.md) instead of a
# free-form prompt file, so each fresh session resumes exactly where the last
# one stopped. Closes the roadmap item "headless task-runner — run unattended".
#
# SPDX-License-Identifier: Apache-2.0

set -u

LOCAL_DIR=".great_cto"
ENV_FILE="${LOCAL_DIR}/loop.env"
LOG_DIR="${LOCAL_DIR}/loop-logs"
STOP_FILES=("STOP.md" "${LOCAL_DIR}/stop")   # presence of any → clean exit

usage() {
  cat <<'EOF'
Usage: ralph-loop.sh MAX_ITERATIONS [PROMPT_FILE]

Runs fresh great_cto agent sessions in a loop from the current directory until
MAX_ITERATIONS is reached, a STOP signal appears, or there is no work left.

  MAX_ITERATIONS  Positive integer — the iteration cap.
  PROMPT_FILE     Optional. A file whose contents are the per-iteration prompt.
                  If omitted, a default great_cto loop-prompt is used (read
                  HANDOFF + PROJECT, make incremental progress, update HANDOFF,
                  create STOP.md when done).

Stop the loop any time by creating  ./STOP.md  or  ./.great_cto/stop .

Config (.great_cto/loop.env, created with defaults on first run, re-sourced
each iteration so edits take effect next loop):
  LOOP_TOOL        claude | codex | gemini        (default: claude)
  LOOP_CAPABILITY  low | med | high               (default: high)
  LOOP_CLAUDE_FLAGS  flags for `claude -p`         (default: --permission-mode acceptEdits)
  LOOP_KEEP_LOGS   how many iteration logs to keep (default: 30)
EOF
}

die() { echo "ralph-loop: $*" >&2; exit 1; }

write_default_env() {
  mkdir -p "$LOCAL_DIR"
  cat > "$ENV_FILE" <<'EOF'
# great_cto unattended-loop config. Re-sourced before every iteration.
LOOP_TOOL=claude
LOOP_CAPABILITY=high
LOOP_CLAUDE_FLAGS=--permission-mode acceptEdits
LOOP_KEEP_LOGS=30
EOF
}

# Map low/med/high → model id for the selected tool.
model_for() {
  case "$1:$2" in
    claude:low) echo haiku ;; claude:med) echo sonnet ;; claude:high) echo opus ;;
    codex:low) echo gpt-5.4-mini ;; codex:med) echo gpt-5.4 ;; codex:high) echo gpt-5.5 ;;
    gemini:*) echo gemini-2.5-pro ;;
    *) echo "" ;;
  esac
}

# Build the agent invocation for the chosen tool. Prompt is piped on stdin.
run_agent() {
  local tool="$1" model="$2" logf="$3"
  case "$tool" in
    claude)
      # shellcheck disable=SC2086
      claude -p ${LOOP_CLAUDE_FLAGS} ${model:+--model "$model"} 2>&1 | tee "$logf" ;;
    codex)
      codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check \
        ${model:+--model "$model"} 2>&1 | tee "$logf" ;;
    gemini)
      gemini ${model:+-m "$model"} 2>&1 | tee "$logf" ;;
    *) die "unknown LOOP_TOOL: $tool (allowed: claude codex gemini)" ;;
  esac
}

default_prompt() {
  cat <<'EOF'
You are a great_cto unattended worker running one fresh iteration. Continuity
lives ONLY in the workspace — you start with no memory of prior iterations.

1. Read `.great_cto/HANDOFF.md` (what the last iteration did + what's next) and
   `.great_cto/PROJECT.md` (the goal). If HANDOFF.md is absent, read PROJECT.md
   and `/inbox` to find the next open gate/task.
2. Make the SMALLEST safe increment of real progress on the next open task —
   follow the normal great_cto pipeline and its gates. Do not skip reviewers.
3. Run the relevant tests. Do not leave the tree broken.
4. Rewrite `.great_cto/HANDOFF.md`: what you changed (files), what's verified,
   the single next step. This is the only thing the next iteration will see.
5. If there is genuinely nothing left to do (all gates closed, tests green,
   nothing open in `/inbox`), create `STOP.md` with a one-line reason so the
   loop exits cleanly. Never create STOP.md just because the task is hard.
EOF
}

main() {
  [ $# -ge 1 ] || { usage; exit 2; }
  case "$1" in -h|--help) usage; exit 0 ;; esac
  local max="$1"; shift
  [[ "$max" =~ ^[1-9][0-9]*$ ]] || die "MAX_ITERATIONS must be a positive integer"

  local prompt_file="${1:-}"
  [ -n "$prompt_file" ] && [ ! -f "$prompt_file" ] && die "prompt file not found: $prompt_file"

  command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1 \
    || die "run from inside a git repository (the workspace the agent edits)"

  [ -f "$ENV_FILE" ] || write_default_env
  mkdir -p "$LOG_DIR"

  local i
  for ((i = 1; i <= max; i++)); do
    for s in "${STOP_FILES[@]}"; do
      [ -e "$s" ] && { echo "ralph-loop: stop signal ($s) — exiting after $((i-1)) iteration(s)."; exit 0; }
    done

    # Re-source config each iteration (live reload). Defaults if unset.
    # shellcheck disable=SC1090
    [ -f "$ENV_FILE" ] && source "$ENV_FILE"
    local tool="${LOOP_TOOL:-claude}" cap="${LOOP_CAPABILITY:-high}"
    : "${LOOP_CLAUDE_FLAGS:=--permission-mode acceptEdits}" "${LOOP_KEEP_LOGS:=30}"
    local model; model="$(model_for "$tool" "$cap")"
    command -v "$tool" >/dev/null 2>&1 || die "AI CLI '$tool' not found on PATH"

    local ts logf; ts="$(date +%Y%m%d-%H%M%S)"; logf="${LOG_DIR}/iter-${i}-${ts}.log"
    echo "═══ ralph-loop iteration ${i}/${max} · ${tool}${model:+/$model} · ${ts} ═══"

    if [ -n "$prompt_file" ]; then cat "$prompt_file"; else default_prompt; fi \
      | run_agent "$tool" "$model" "$logf"
    local rc=${PIPESTATUS[1]:-$?}
    echo "ralph-loop: iteration ${i} exited rc=${rc} (log: ${logf})"

    # Log rotation — keep the newest LOOP_KEEP_LOGS.
    ls -1t "${LOG_DIR}"/iter-*.log 2>/dev/null | tail -n +"$((LOOP_KEEP_LOGS + 1))" | xargs -r rm -f
  done

  echo "ralph-loop: reached MAX_ITERATIONS (${max}). Stopping."
}

main "$@"
