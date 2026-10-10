#!/usr/bin/env bash
# scripts/test-pipeline.sh — automated pre-merge gate for great_cto.
#
# Runs Levels 1–5 of the pipeline test plan (~5 min total). Each level
# is a self-contained group of checks. Exit code = number of failed checks.
#
# Usage:
#   scripts/test-pipeline.sh                   # all levels
#   scripts/test-pipeline.sh --quick           # only L1 + L2 (~90 sec)
#   scripts/test-pipeline.sh --skip-l3         # skip hooks (slow on cold ruff)
#   scripts/test-pipeline.sh --skip-l4         # skip board (no Node port)
#   scripts/test-pipeline.sh --verbose         # show command output
#   scripts/test-pipeline.sh --plugin-dir=/absolute/artifact # explicit candidate
#
# Levels:
#   L1  Static & unit       npm test · archetype regression · syntax checks
#   L2  Smoke CLI           --version · ci gate · mcp tools/list
#   L3  Hooks               secret-scan · format-check · cost-guard · session-end
#   L4  Board API           endpoints · math invariants · 11 layers · 34 agents
#   L5  Plugin sync         ~/.claude/commands · ~/.claude/agents
#
# Exit codes:
#   0   all pass
#   N>0 number of failed checks across all levels

set -uo pipefail
# AWS publishes this as its own documentation example key. Assembled, not written:
# the hook under test must still see the exact string.
_EXAMPLE_KEY="AKIA""IOSFODNN7""EXAMPLE"


# --- args --------------------------------------------------------------------

QUICK=0
SKIP_L1=0; SKIP_L2=0; SKIP_L3=0; SKIP_L4=0; SKIP_L5=0
VERBOSE=0
EXPLICIT_PLUGIN_DIR=""
for arg in "$@"; do
  case "$arg" in
    --quick)    QUICK=1; SKIP_L3=1; SKIP_L4=1; SKIP_L5=1 ;;
    --skip-l1)  SKIP_L1=1 ;;
    --skip-l2)  SKIP_L2=1 ;;
    --skip-l3)  SKIP_L3=1 ;;
    --skip-l4)  SKIP_L4=1 ;;
    --skip-l5)  SKIP_L5=1 ;;
    --verbose|-v) VERBOSE=1 ;;
    --plugin-dir=*)
      [ -z "$EXPLICIT_PLUGIN_DIR" ] || { echo 'duplicate --plugin-dir' >&2; exit 2; }
      EXPLICIT_PLUGIN_DIR="${arg#--plugin-dir=}"
      case "$EXPLICIT_PLUGIN_DIR" in /*) ;; *) echo '--plugin-dir must be absolute and nonempty' >&2; exit 2 ;; esac
      ;;
    -h|--help)
      sed -n '2,21p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo "unknown flag: $arg (try --help)" >&2
      exit 2 ;;
  esac
done

# --- helpers -----------------------------------------------------------------

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Find latest installed plugin dir (for L2/L4/L5 — runs against the SYNCED
# version, not the working tree, to catch packaging issues)
if [ -n "$EXPLICIT_PLUGIN_DIR" ]; then
  # Do not install an unreviewed candidate over the operator's plugin just to
  # test it. This explicit artifact seam leaves HOME and host registries alone.
  for required in .claude-plugin/plugin.json packages/cli/index.mjs packages/cli/dist/main.js packages/board/server.mjs; do
    [ -f "$EXPLICIT_PLUGIN_DIR/$required" ] || { echo "candidate artifact missing: $required" >&2; exit 2; }
  done
  PLUGIN_DIR="$(cd "$EXPLICIT_PLUGIN_DIR" && pwd -P)" || exit 2
  PLUGIN_MODE='explicit candidate artifact (not operator installed-plugin evidence)'
else
  PLUGIN_DIR="$(ls -d "$HOME"/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null \
              | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2- | sed 's|/$||')"
  PLUGIN_MODE='operator installed plugin'
fi

if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_FAIL=$'\033[31m'; C_DIM=$'\033[2m'
  C_HEAD=$'\033[1;34m'; C_RESET=$'\033[0m'; C_WARN=$'\033[33m'
else
  C_OK=""; C_FAIL=""; C_DIM=""; C_HEAD=""; C_RESET=""; C_WARN=""
fi

PASS=0; FAIL=0; SKIP=0
declare -a FAILURES

# check NAME COMMAND   — runs COMMAND, prints ✓/✗, accumulates counters.
check() {
  local name="$1"; shift
  local out
  if [ "$VERBOSE" = "1" ]; then
    if "$@"; then
      printf "  ${C_OK}✓${C_RESET} %s\n" "$name"
      PASS=$((PASS+1))
    else
      printf "  ${C_FAIL}✗${C_RESET} %s\n" "$name"
      FAIL=$((FAIL+1)); FAILURES+=("$name")
    fi
  else
    if out=$("$@" 2>&1); then
      printf "  ${C_OK}✓${C_RESET} %s\n" "$name"
      PASS=$((PASS+1))
    else
      printf "  ${C_FAIL}✗${C_RESET} %s\n" "$name"
      [ -n "$out" ] && printf "${C_DIM}      %s${C_RESET}\n" "$(echo "$out" | tail -3 | head -3)"
      FAIL=$((FAIL+1)); FAILURES+=("$name")
    fi
  fi
}

skipped() { printf "  ${C_DIM}–${C_RESET} %s ${C_DIM}(skipped)${C_RESET}\n" "$1"; SKIP=$((SKIP+1)); }
section() { echo; printf "${C_HEAD}▸ %s${C_RESET}\n" "$1"; }

# Wrap a command + extra assertion in one logical check
check_cmd_assert() {
  local name="$1"; local cmd="$2"; local assertion="$3"
  if eval "$cmd" 2>/dev/null | eval "$assertion" >/dev/null 2>&1; then
    printf "  ${C_OK}✓${C_RESET} %s\n" "$name"; PASS=$((PASS+1))
  else
    printf "  ${C_FAIL}✗${C_RESET} %s\n" "$name"; FAIL=$((FAIL+1)); FAILURES+=("$name")
  fi
}

# --- header ------------------------------------------------------------------

START_TS=$(date +%s)
echo "${C_HEAD}great_cto pipeline test${C_RESET}"
echo "${C_DIM}root: $ROOT${C_RESET}"
echo "${C_DIM}plugin dir: ${PLUGIN_DIR:-<not synced>}${C_RESET}"
echo "${C_DIM}artifact mode: $PLUGIN_MODE${C_RESET}"
[ "$QUICK" = "1" ] && echo "${C_DIM}mode: quick (L1 + L2 only)${C_RESET}"

# =============================================================================
# L1 — Static & unit
# =============================================================================
section "L1 — Static & unit (~30s)"
if [ "$SKIP_L1" = "1" ]; then
  skipped "L1 (--skip-l1)"
else
  check "npm test (CLI unit tests)" \
    bash -c "cd packages/cli && npm test --silent"

  check "archetype regression (28 cases)" \
    bash -c 'cd packages/cli && out=$(node test-archetypes.mjs 2>&1) && printf "%s\n" "$out" && printf "%s\n" "$out" | grep -q "Failed: 0/"'

  check "board server.mjs syntax" \
    node --check packages/board/server.mjs

  check "board index.html parses (HTML5 closing tags)" \
    bash -c "node -e \"
      const fs=require('fs');
      const h=fs.readFileSync('packages/board/public/index.html','utf8');
      const opens=(h.match(/<(div|span|script|style|head|body|html)\\b[^>]*>/g)||[]).length;
      const closes=(h.match(/<\\/(div|span|script|style|head|body|html)>/g)||[]).length;
      // Allow drift up to 5 (self-closing irregularities)
      if (Math.abs(opens-closes) > 5) { console.error('tag drift', opens, 'vs', closes); process.exit(1); }
    \""

  check "all CLI scripts syntactically valid" \
    bash -c "for f in scripts/hooks/*.mjs scripts/lessons-merge.mjs; do node --check \"\$f\" || exit 1; done"

  check "release.sh + bump-version.sh syntax" \
    bash -c "bash -n scripts/release.sh && bash -n scripts/bump-version.sh"

  # Board API regression suite (closes QA-002…QA-009 + v2.7.0 logs parser)
  # `tests/board/` is in .gitignore (line 90) — removed from public history on
  # 2026-05-10 and never committed since. So this check has never been able to
  # pass on any clone: not in CI, not for a contributor, not on the release
  # machine. It was green here only while one person's untracked files survived,
  # and it went red the day they did not.
  #
  # It is NOT deleted, because the board API is worth regression-testing and the
  # committed Node suite (packages/board/*.test.mjs, 40+ files, run by ci-local)
  # is what actually covers it. What is deleted is the pretence: when the suite
  # is absent this reports absent, and absence never reads as a pass.
  if ls tests/board/test_*.py >/dev/null 2>&1; then
    check "board API regression tests (pytest)" \
      bash -c 'out=$(pytest tests/board/ --tb=line -q 2>&1) && printf "%s\n" "$out" && printf "%s\n" "$out" | grep -qE "^[0-9]+ passed"'
  else
    skipped "board pytest — suite is not in this repository (.gitignore:90); the committed Node board tests cover this surface"
  fi

  # v2.6.0+: agent prompt structural linter
  check "agent-prompt-lint: 0 errors across all agents/" \
    bash -c "node scripts/agent-prompt-lint.mjs --json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(1 if d[\"errors\"] > 0 else 0)'"
fi

# =============================================================================
# L2 — Smoke CLI
# =============================================================================
section "L2 — Smoke CLI (~1m)"
if [ "$SKIP_L2" = "1" ]; then
  skipped "L2 (--skip-l2)"
elif [ -z "$PLUGIN_DIR" ]; then
  skipped "L2 (no plugin dir found in ~/.claude/plugins/cache/*/great_cto/)"
else
  # These legacy smoke commands use bash -c. Quote the executable path once,
  # so operator-selected artifact names remain data, not shell source.
  CLI="node $(printf '%q' "$PLUGIN_DIR/packages/cli/index.mjs")"

  check "great-cto --version returns semver" \
    bash -c "$CLI --version 2>&1 | grep -qE '^[0-9]+\\.[0-9]+\\.[0-9]+'"

  check "ci with no PROJECT.md passes (exit 0)" \
    bash -c "tmp=\$(mktemp -d); $CLI ci \$tmp --quiet >/dev/null 2>&1; rc=\$?; rm -rf \$tmp; [ \$rc = '0' ]"

  check "ci --no-archetype --no-budget passes (exit 0)" \
    bash -c "tmp=\$(mktemp -d); $CLI ci \$tmp --no-archetype --no-budget --quiet >/dev/null 2>&1; rc=\$?; rm -rf \$tmp; [ \$rc = '0' ]"

  check "mcp server initialize returns protocolVersion 2024-11-05" \
    bash -c "( echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}'; sleep 0.3 ) | $CLI mcp 2>/dev/null | grep -q '\"protocolVersion\":\"2024-11-05\"'"

  check "mcp tools/list returns 7 tools" \
    bash -c "n=\$(( echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}'; echo '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}'; sleep 0.3 ) | $CLI mcp 2>/dev/null | tail -1 | python3 -c 'import sys,json; print(len(json.load(sys.stdin)[\"result\"][\"tools\"]))'); [ \"\$n\" = '7' ]"

  check "adapt --dry-run for codex previews AGENTS.md" \
    bash -c "tmp=\$(mktemp -d); mkdir -p \$tmp/.great_cto; printf 'primary: fintech\\ncompliance: pci-dss\\n' > \$tmp/.great_cto/PROJECT.md; cd \$tmp && $CLI adapt --platform codex --dry-run 2>&1 | grep -q 'AGENTS.md'"

  # This asserted `adapt --platform aider` produced `.aider.conf.yml` AND
  # `CONVENTIONS.md`. Neither half was real: `--platform` is not parsed anywhere
  # in main.ts, and `CONVENTIONS.md` has never been written by any version of
  # this CLI. The check was written against an interface that never shipped —
  # and it stayed that way because nothing ran it.
  #
  # The aider target is selected by `ai_tools:` in PROJECT.md, which is what the
  # code has always done. Asserted against the CLI's real surface:
  check "ai_tools: [aider] writes .aider.conf.yml alongside AGENTS.md" \
    bash -c "tmp=\$(mktemp -d); mkdir -p \$tmp/.great_cto; printf 'primary: fintech\\ncompliance: pci-dss\\nai_tools: [aider]\\n' > \$tmp/.great_cto/PROJECT.md; cd \$tmp && $CLI adapt >/dev/null 2>&1 && [ -f .aider.conf.yml ] && [ -f AGENTS.md ] && [ -f CLAUDE.md ]"

  # The negative half, and the reason the check above is not enough: a generator
  # that wrote every tool's file for every project would also satisfy it.
  check "a project that did not ask for aider does not get .aider.conf.yml" \
    bash -c "tmp=\$(mktemp -d); mkdir -p \$tmp/.great_cto; printf 'primary: fintech\\ncompliance: pci-dss\\n' > \$tmp/.great_cto/PROJECT.md; cd \$tmp && $CLI adapt >/dev/null 2>&1 && [ ! -f .aider.conf.yml ]"

  # v2.5.0 subcommands
  check "webhook list returns config path" \
    bash -c "$CLI webhook list 2>&1 | grep -q 'config:'"

  check "report cost --format json returns valid JSON with summary" \
    bash -c "$CLI report cost --period 30d --format json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d[\"type\"]==\"cost\"; assert \"summary\" in d; assert \"savings_x\" in d[\"summary\"]'"

  check "report cost --format html emits valid HTML5" \
    bash -c "$CLI report cost --period 30d --format html 2>/dev/null | head -1 | grep -q '<!doctype html>'"

  check "report agents --format json returns agent records" \
    bash -c "$CLI report agents --period 30d --format json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d[\"type\"]==\"agents\"; assert \"agents\" in d'"

  check "isolated MCP owned listener, SSE initialize and seven-tool inventory" \
    node "$ROOT/scripts/lib/mcp-smoke.mjs" "$PLUGIN_DIR/packages/cli/index.mjs"

  # Probe the installed artifact, never back up or mutate operator config.
  # Incompatible artifacts fail explicitly before registration or server start.
  check "serve enforces HMAC: invalid signature returns 401" \
    node "$ROOT/scripts/lib/webhook-smoke.mjs" "$PLUGIN_DIR/packages/cli/index.mjs" invalid

  check "serve enforces HMAC: valid signature returns 200" \
    node "$ROOT/scripts/lib/webhook-smoke.mjs" "$PLUGIN_DIR/packages/cli/index.mjs" valid
fi

# =============================================================================
# L3 — Hooks
# =============================================================================
section "L3 — Hooks (~2m)"
if [ "$SKIP_L3" = "1" ]; then
  skipped "L3 (--skip-l3)"
elif [ -z "$PLUGIN_DIR" ]; then
  skipped "L3 (no plugin dir)"
else
  HOOKS="$PLUGIN_DIR/scripts/hooks"
  [ -d "$HOOKS" ] || HOOKS="$ROOT/scripts/hooks"

  check "secret-scan blocks AKIA key (exit 2)" \
    bash -c 'printf "%s\n" "$2" | node "$1"; [ "$?" -eq 2 ]' _ "$HOOKS/secret-scan.mjs" \
      "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/tmp/x.ts\",\"content\":\"const k = \\\"${_EXAMPLE_KEY}\\\"\"}}"

  check "secret-scan allows clean code (exit 0)" \
    bash -c 'printf "%s\n" "$2" | node "$1"' _ "$HOOKS/secret-scan.mjs" \
      '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x.ts","content":"const x = 1;"}}'

  check "secret-scan respects opt-out env" \
    bash -c 'printf "%s\n" "$2" | GREAT_CTO_DISABLE_SECRET_SCAN=1 node "$1"' _ "$HOOKS/secret-scan.mjs" \
      "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/tmp/x.ts\",\"content\":\"${_EXAMPLE_KEY}\"}}"

  check "format-check accepts arbitrary input without crashing" \
    bash -c 'printf "%s\n" "$2" | node "$1"' _ "$HOOKS/format-check.mjs" \
      '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/none.txt"}}'

  check "cost-guard runs cleanly without budget" \
    bash -c 'printf "%s\n" "$2" | node "$1"' _ "$HOOKS/cost-guard.mjs" \
      '{"hook_event_name":"UserPromptSubmit","prompt":"/start foo"}'

  check "session-end writes an actual isolated fixture snapshot" \
    node "$ROOT/scripts/lib/session-end-smoke.mjs" "$HOOKS/session-end.mjs"
  skipped "SessionEnd actual git/Beads capture (fixture stubs; NOT CHECKED)"
  skipped "SessionEnd actual lessons merge (launch intercepted; NOT CHECKED)"
  skipped "SessionEnd paid learner (explicitly off; NOT CHECKED)"
fi

# =============================================================================
# L4 — Board API
# =============================================================================
section "L4 — Board API (~30s)"
# Probe the installed artifact in a private fixture. Unsupported isolation is
# a failed NOT CHECKED check, never a fallback to operator state.
if [ "$SKIP_L4" = "1" ]; then
  skipped "L4 (--skip-l4)"
elif [ -z "$PLUGIN_DIR" ]; then
  skipped "L4 (no plugin dir)"
else
  check "isolated board: 11 JSON APIs, agent inventory, memory scopes and nonvacuous task rate ratio" \
    node "$ROOT/scripts/lib/board-smoke.mjs" "$PLUGIN_DIR/packages/board/server.mjs" "$ROOT/agents"
  skipped "Board actual git/Beads capture (fixture adapter; NOT CHECKED)"
  skipped "Board notification delivery (disabled fixture sinks; NOT CHECKED)"
  skipped "Board release discovery/cron (not exercised; NOT CHECKED)"
  skipped "Board operator agent inventory (copied fixture; NOT CHECKED; parity remains in L5)"
fi

# =============================================================================
# L4b — Phase task lifecycle (v2.5.7+ phase-task.sh)
# =============================================================================
section "L4b — Phase task lifecycle (isolated Beads fixture)"
if [ "$SKIP_L4" = "1" ]; then
  skipped "L4b (--skip-l4)"
elif ! command -v bd >/dev/null; then
  skipped "L4b (no bd CLI)"
else
  check "phase-task lifecycle: five checks with actual isolated Beads; gate stays open" \
    node "$ROOT/scripts/lib/phase-smoke.mjs" "$ROOT/scripts/phase-task.sh" "$(command -v bd)"
  skipped "L4b actual role/model execution, deployment and human approval (synthetic verdicts; NOT CHECKED)"
fi

# =============================================================================
# L5 — Plugin sync
# =============================================================================
section "L5 — Plugin sync (~30s)"
if [ "$SKIP_L5" = "1" ]; then
  skipped "L5 (--skip-l5)"
else
  check "plugin.json is valid JSON" \
    bash -c "python3 -c 'import json; json.load(open(\"$ROOT/.claude-plugin/plugin.json\"))'"

  # Was a hard-coded list of 19 names; 3.40 folded four of them into modes of
  # other commands and the list kept asking for the files that were removed.
  # Parity with commands/, the same property the agents check below holds.
  check "every command in commands/ is synced into ~/.claude/commands/" \
    bash -c "missing=0; for f in \"$ROOT\"/commands/*.md; do cmd=\$(basename \"\$f\" .md); [ -f ~/.claude/commands/\$cmd.md ] || { echo \"missing: \$cmd\" >&2; missing=\$((missing+1)); }; done; [ \"\$missing\" = '0' ]"

  # Was `-eq 34`. The repository ships seventy agents, so this had been failing
  # for every agent added since the number was written down — and the fix it
  # invited was to edit the constant, which is the same work again next month.
  #
  # The property is PARITY, not a count: everything in agents/ reaches
  # ~/.claude/agents/. That is what a sync is for, it needs no maintenance, and
  # unlike a threshold it also catches the opposite failure — a stale synced
  # agent left behind after the source file was retired.
  check "every agent in agents/ is synced into ~/.claude/agents/" \
    bash -c '
      repo=$(ls agents/*.md 2>/dev/null | xargs -n1 basename | sed "s/\.md$//" | sort)
      synced=$(ls ~/.claude/agents/great_cto-*.md 2>/dev/null | xargs -n1 basename \
               | sed "s/^great_cto-//; s/\.md$//" | sort)
      missing=$(comm -23 <(echo "$repo") <(echo "$synced"))
      extra=$(comm -13 <(echo "$repo") <(echo "$synced"))
      [ -n "$missing" ] && { echo "not synced: $missing" >&2; }
      [ -n "$extra" ]   && { echo "synced but not in agents/: $extra" >&2; }
      [ -z "$missing$extra" ]
    '

  check "agent command present (review/evals/evolve/retire)" \
    bash -c "[ -f ~/.claude/commands/agent.md ]"

  check "all 4 new agents synced (continuous-learner + 3 reviewers)" \
    bash -c "for a in continuous-learner edtech-reviewer gov-reviewer insurance-reviewer; do [ -f ~/.claude/agents/great_cto-\$a.md ] || exit 1; done"

  # Was two greps for names in a hand-kept install list. That list had left out
  # fifteen agents by 2026-09-11; SessionStart now installs every agents/*.md and
  # commands/*.md through scripts/lib/sync-managed.mjs, so the property is that
  # no list is back.
  check "SessionStart installs every agent and command, from no hand-kept list" \
    bash -c "grep -q 'scripts/lib/sync-managed.mjs' .claude-plugin/plugin.json && ! grep -qE 'for (AGENT|CMD) in ' .claude-plugin/plugin.json"
fi

# =============================================================================
# Summary
# =============================================================================
END_TS=$(date +%s)
DUR=$((END_TS - START_TS))

echo
echo "${C_HEAD}─────────────────────────────────────────${C_RESET}"
printf "  ${C_OK}✓ %d passed${C_RESET}    " "$PASS"
[ "$FAIL" -gt 0 ] && printf "${C_FAIL}✗ %d failed${C_RESET}    " "$FAIL"
[ "$SKIP" -gt 0 ] && printf "${C_DIM}– %d skipped${C_RESET}    " "$SKIP"
printf "${C_DIM}(${DUR}s)${C_RESET}\n"

if [ "$FAIL" -gt 0 ]; then
  echo
  echo "${C_FAIL}Failures:${C_RESET}"
  for f in "${FAILURES[@]}"; do
    echo "  • $f"
  done
  echo
  echo "${C_DIM}Re-run with --verbose to see command output.${C_RESET}"
  exit "$FAIL"
fi

echo
if [ "$SKIP" -gt 0 ]; then
  echo "${C_WARN}Executed checks passed; $SKIP checks NOT CHECKED. Full pipeline readiness is unproven.${C_RESET}"
else
  echo "${C_OK}Automated checks passed. Merge still requires applicable independent review and human/security gates.${C_RESET}"
fi
exit 0
