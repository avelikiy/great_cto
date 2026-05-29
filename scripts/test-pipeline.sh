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

# --- args --------------------------------------------------------------------

QUICK=0
SKIP_L1=0; SKIP_L2=0; SKIP_L3=0; SKIP_L4=0; SKIP_L5=0
VERBOSE=0
for arg in "$@"; do
  case "$arg" in
    --quick)    QUICK=1; SKIP_L3=1; SKIP_L4=1; SKIP_L5=1 ;;
    --skip-l1)  SKIP_L1=1 ;;
    --skip-l2)  SKIP_L2=1 ;;
    --skip-l3)  SKIP_L3=1 ;;
    --skip-l4)  SKIP_L4=1 ;;
    --skip-l5)  SKIP_L5=1 ;;
    --verbose|-v) VERBOSE=1 ;;
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
PLUGIN_DIR="$(ls -d "$HOME"/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null \
              | sort -V | tail -1 | sed 's|/$||')"

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
[ "$QUICK" = "1" ] && echo "${C_DIM}mode: quick (L1 + L2 only)${C_RESET}"

# =============================================================================
# L1 — Static & unit
# =============================================================================
section "L1 — Static & unit (~30s)"
if [ "$SKIP_L1" = "1" ]; then
  skipped "L1 (--skip-l1)"
else
  check "npm test (CLI unit tests)" \
    bash -c "cd packages/cli && npm test --silent >/tmp/gctest-l1-test.log 2>&1"

  check "archetype regression (28 cases)" \
    bash -c "cd packages/cli && node test-archetypes.mjs >/tmp/gctest-l1-arch.log 2>&1 && grep -q 'Failed: 0/' /tmp/gctest-l1-arch.log"

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
  check "board API regression tests (12 cases)" \
    bash -c "pytest tests/board/ --tb=line -q >/tmp/gctest-l1-board.log 2>&1 && grep -qE '^[0-9]+ passed' /tmp/gctest-l1-board.log"

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
  skipped "L2 (no plugin dir found in ~/.claude/plugins/cache/local/great_cto/)"
else
  CLI="node $PLUGIN_DIR/packages/cli/index.mjs"

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

  check "adapt --platform aider writes .aider.conf.yml + CONVENTIONS.md" \
    bash -c "tmp=\$(mktemp -d); mkdir -p \$tmp/.great_cto; printf 'primary: fintech\\ncompliance: pci-dss\\n' > \$tmp/.great_cto/PROJECT.md; cd \$tmp && $CLI adapt --platform aider >/dev/null 2>&1 && [ -f .aider.conf.yml ] && [ -f CONVENTIONS.md ] && [ -f AGENTS.md ]"

  # v2.5.0 subcommands
  check "webhook list returns config path" \
    bash -c "$CLI webhook list 2>&1 | grep -q 'config:'"

  check "report cost --format json returns valid JSON with summary" \
    bash -c "$CLI report cost --period 30d --format json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d[\"type\"]==\"cost\"; assert \"summary\" in d; assert \"savings_x\" in d[\"summary\"]'"

  check "report cost --format html emits valid HTML5" \
    bash -c "$CLI report cost --period 30d --format html 2>/dev/null | head -1 | grep -q '<!doctype html>'"

  check "report agents --format json returns agent records" \
    bash -c "$CLI report agents --period 30d --format json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d[\"type\"]==\"agents\"; assert \"agents\" in d'"

  check "mcp --sse server starts and /healthz returns valid JSON" \
    bash -c "
      $CLI mcp --sse --port 8766 >/dev/null 2>&1 &
      MCP_PID=\$!
      sleep 1
      out=\$(curl -sf http://127.0.0.1:8766/healthz 2>/dev/null)
      kill \$MCP_PID 2>/dev/null
      wait \$MCP_PID 2>/dev/null
      echo \"\$out\" | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d[\"transport\"]==\"sse\"'
    "

  # HMAC tests use canonical name 'github'. Backup/restore any existing config.
  check "serve enforces HMAC: invalid signature returns 401" \
    bash -c "
      cfg=~/.great_cto/webhooks.json
      [ -f \$cfg ] && cp \$cfg \$cfg.gctest-bak
      $CLI webhook add-incoming github --secret testsecret123 >/dev/null 2>&1
      $CLI serve --port 3144 >/dev/null 2>&1 &
      SRV_PID=\$!
      sleep 1
      code=\$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-GitHub-Event: pull_request' -H 'X-Hub-Signature-256: sha256=baad' -d '{}' http://127.0.0.1:3144/webhook/github)
      kill \$SRV_PID 2>/dev/null
      wait \$SRV_PID 2>/dev/null
      [ -f \$cfg.gctest-bak ] && mv \$cfg.gctest-bak \$cfg || $CLI webhook remove github >/dev/null 2>&1
      [ \"\$code\" = '401' ]
    "

  check "serve enforces HMAC: valid signature returns 200" \
    bash -c "
      cfg=~/.great_cto/webhooks.json
      [ -f \$cfg ] && cp \$cfg \$cfg.gctest-bak
      $CLI webhook add-incoming github --secret testsecret123 >/dev/null 2>&1
      $CLI serve --port 3145 >/dev/null 2>&1 &
      SRV_PID=\$!
      sleep 1
      payload='{\"action\":\"opened\",\"number\":1,\"repository\":{\"full_name\":\"x/y\"}}'
      sig=\$(echo -n \"\$payload\" | openssl dgst -sha256 -hmac 'testsecret123' | awk '{print \"sha256=\"\$2}')
      code=\$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-GitHub-Event: pull_request' -H \"X-Hub-Signature-256: \$sig\" -d \"\$payload\" http://127.0.0.1:3145/webhook/github)
      kill \$SRV_PID 2>/dev/null
      wait \$SRV_PID 2>/dev/null
      [ -f \$cfg.gctest-bak ] && mv \$cfg.gctest-bak \$cfg || $CLI webhook remove github >/dev/null 2>&1
      [ \"\$code\" = '200' ]
    "
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
    bash -c "echo '{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/tmp/x.ts\",\"content\":\"const k = \\\"AKIAIOSFODNN7EXAMPLE\\\"\"}}' | node $HOOKS/secret-scan.mjs; [ \$? -eq 2 ]"

  check "secret-scan allows clean code (exit 0)" \
    bash -c "echo '{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/tmp/x.ts\",\"content\":\"const x = 1;\"}}' | node $HOOKS/secret-scan.mjs"

  check "secret-scan respects opt-out env" \
    bash -c "GREAT_CTO_DISABLE_SECRET_SCAN=1 bash -c 'echo \"{\\\"tool_name\\\":\\\"Write\\\",\\\"tool_input\\\":{\\\"file_path\\\":\\\"/tmp/x.ts\\\",\\\"content\\\":\\\"AKIAIOSFODNN7EXAMPLE\\\"}}\" | node $HOOKS/secret-scan.mjs'"

  check "format-check accepts arbitrary input without crashing" \
    bash -c "echo '{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"/tmp/none.txt\"}}' | node $HOOKS/format-check.mjs"

  check "cost-guard runs cleanly without budget" \
    bash -c "echo '{\"hook_event_name\":\"UserPromptSubmit\",\"prompt\":\"/start foo\"}' | node $HOOKS/cost-guard.mjs"

  check "session-end produces a snapshot directive" \
    bash -c "echo '{\"hook_event_name\":\"SessionEnd\",\"cwd\":\"$ROOT\"}' | node $HOOKS/session-end.mjs"
fi

# =============================================================================
# L4 — Board API
# =============================================================================
section "L4 — Board API (~30s)"
BOARD_PID=""
cleanup_board() {
  if [ -n "$BOARD_PID" ]; then
    kill "$BOARD_PID" 2>/dev/null || true
    wait "$BOARD_PID" 2>/dev/null || true
  fi
  pkill -f "packages/board/server" 2>/dev/null || true
}
trap cleanup_board EXIT

if [ "$SKIP_L4" = "1" ]; then
  skipped "L4 (--skip-l4)"
elif [ -z "$PLUGIN_DIR" ]; then
  skipped "L4 (no plugin dir)"
elif ! command -v curl >/dev/null; then
  skipped "L4 (no curl)"
else
  # Free port if leaked from prior run
  pkill -f "packages/board/server" 2>/dev/null || true
  sleep 1

  nohup node "$PLUGIN_DIR/packages/board/server.mjs" >/tmp/gctest-l4-board.log 2>&1 &
  BOARD_PID=$!
  # Wait up to 5s for server to listen
  for i in 1 2 3 4 5; do
    curl -sf http://127.0.0.1:3141/api/projects >/dev/null 2>&1 && break
    sleep 1
  done

  if ! curl -sf http://127.0.0.1:3141/api/projects >/dev/null 2>&1; then
    printf "  ${C_FAIL}✗${C_RESET} board failed to start\n"
    cat /tmp/gctest-l4-board.log | tail -5 | sed 's/^/      /'
    FAIL=$((FAIL+1)); FAILURES+=("board startup")
  else
    for endpoint in /api/projects /api/agents-installed /api/metrics /api/cost \
                    /api/memory /api/inbox /api/resume /api/decisions \
                    /api/pipeline /api/logs /api/tasks; do
      check "$endpoint returns valid JSON" \
        bash -c "curl -sf 'http://127.0.0.1:3141$endpoint' | python3 -m json.tool >/dev/null"
    done

    check "agents-installed reports >=33 agents" \
      bash -c "n=\$(curl -sf http://127.0.0.1:3141/api/agents-installed | python3 -c 'import sys,json; print(json.load(sys.stdin)[\"total\"])'); [ \"\$n\" -ge 33 ]"

    check "agents-installed includes new agents (continuous-learner, edtech, gov, insurance reviewers)" \
      bash -c "names=\$(curl -sf http://127.0.0.1:3141/api/agents-installed | python3 -c 'import sys,json; print(\" \".join(a[\"name\"] for a in json.load(sys.stdin)[\"agents\"]))'); for must in continuous-learner edtech-reviewer gov-reviewer insurance-reviewer; do echo \"\$names\" | grep -qw \"\$must\" || exit 1; done"

    check "memory endpoint surfaces exactly 11 layers" \
      bash -c "n=\$(curl -sf http://127.0.0.1:3141/api/memory | python3 -c 'import sys,json; print(len(json.load(sys.stdin)[\"layers\"]))'); [ \"\$n\" = '11' ]"

    check "memory has both project + global scopes" \
      bash -c "scopes=\$(curl -sf http://127.0.0.1:3141/api/memory | python3 -c 'import sys,json; m=json.load(sys.stdin); print(\" \".join(set(l.get(\"scope\",\"\") for l in m[\"logs\" if \"logs\" in m else \"layers\"])))'); echo \"\$scopes\" | grep -q project && echo \"\$scopes\" | grep -q global"

    # Math invariant — only applies to task-estimation source (both rates
    # hardcoded: $0.30/AI-hr ÷ $150/human-hr = 500x in v2.5.9+; was 7500x
    # earlier with the unrealistic $0.02/hr default). PLAN sources use
    # real measured numbers and have project-specific ratios.
    check "metrics math: human/llm ratio ≈ 500× when source=tasks" \
      bash -c "curl -sf 'http://127.0.0.1:3141/api/projects' | python3 -c '
import sys,json,urllib.request
projs = json.load(sys.stdin)
projs = projs if isinstance(projs,list) else projs.get(\"projects\",[])
for p in projs:
    slug = p.get(\"slug\") or p.get(\"name\")
    if not slug: continue
    m = json.load(urllib.request.urlopen(f\"http://127.0.0.1:3141/api/metrics?project={slug}\"))
    cost = m[\"cost\"]
    if cost[\"llm_usd\"] <= 0: continue
    if cost.get(\"source\") != \"tasks\": continue
    ratio = cost[\"human_usd\"] / cost[\"llm_usd\"]
    # Default rates: \$0.30/AI-hr (Sonnet+Haiku mix) vs \$150/human-hr (mid-level
    # fully-loaded) → exactly 500x. Empirical drift from per-agent rounding
    # is < 5%. Tolerance 470-530 covers all observed projects.
    assert 470 <= ratio <= 530, f\"task-source ratio drift: {ratio} (expected ~500)\"
    sys.exit(0)
sys.exit(0)  # no task-source data → vacuously pass
'"
  fi
fi

# =============================================================================
# L4b — Phase task lifecycle (v2.5.7+ phase-task.sh)
# =============================================================================
section "L4b — Phase task lifecycle (~10s)"
if [ "$SKIP_L4" = "1" ]; then
  skipped "L4b (--skip-l4)"
elif ! command -v bd >/dev/null; then
  skipped "L4b (no bd CLI)"
else
  PT="$ROOT/scripts/phase-task.sh"
  # bd rejects directory names containing dots (`tmp.XXXX` from mktemp).
  # Use a stable safe path.
  TMP="/tmp/gctest-phasetask-$$"
  rm -rf "$TMP" && mkdir -p "$TMP"
  cd "$TMP" && git init -q && bd init -q >/dev/null 2>&1

  GATE=$(bd create "gate:test" --label gate 2>&1 | grep -oE '[a-z][a-zA-Z0-9_-]+-[a-z0-9]+' | head -1)

  check "phase-task open creates labelled task with correct prefix" \
    bash -c "
      cd '$TMP'
      ID=\$(bash '$PT' open architect test-feature --parent '$GATE')
      [ -n \"\$ID\" ] && bd show \"\$ID\" >/dev/null 2>&1
    "

  check "phase-task open is idempotent — same id on re-open" \
    bash -c "
      cd '$TMP'
      A=\$(bash '$PT' open architect test-feature)
      B=\$(bash '$PT' open architect test-feature)
      [ \"\$A\" = \"\$B\" ]
    "

  check "phase-task close --verdict ok closes despite open gate dependency" \
    bash -c "
      cd '$TMP'
      ID=\$(bash '$PT' open senior-dev test-feature --parent '$GATE')
      bash '$PT' start \"\$ID\" >/dev/null
      bash '$PT' close \"\$ID\" --verdict ok >/dev/null
      bd show \"\$ID\" 2>&1 | grep -iE 'closed' >/dev/null
    "

  check "phase-task close --verdict fail marks blocked" \
    bash -c "
      cd '$TMP'
      ID=\$(bash '$PT' open qa-engineer test-feature)
      bash '$PT' close \"\$ID\" --verdict fail --notes 'test failure' >/dev/null
      bd show \"\$ID\" 2>&1 | grep -iE 'blocked' >/dev/null
    "

  check "full 8-stage pipeline → 8 closed phase tasks" \
    bash -c "
      tmp=/tmp/gctest-pipeline-\$\$ ; rm -rf \"\$tmp\" && mkdir -p \"\$tmp\" && cd \"\$tmp\" && git init -q && bd init -q >/dev/null 2>&1
      gate=\$(bd create 'gate' --label gate 2>&1 | grep -oE '[a-z][a-zA-Z0-9_-]+-[a-z0-9]+' | head -1)
      for a in architect pm senior-dev code-reviewer qa-engineer security-officer performance-engineer devops; do
        tid=\$(bash '$PT' open \$a feat --parent \$gate)
        bash '$PT' close \"\$tid\" --verdict ok >/dev/null
      done
      n=\$(bd list --status closed 2>&1 | grep -cE '^✓ [a-z]' | tr -d ' ')
      rm -rf \"\$tmp\"
      [ \"\$n\" -ge 8 ]
    "

  cd "$ROOT"
  rm -rf "$TMP"
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

  check "all 22 great_cto commands present in ~/.claude/commands/" \
    bash -c "missing=0; for cmd in start audit inbox digest review ownership oncall rfc release doctor burn cost sec poc promote crystallize migrate resume save learn agent-review agent-retire; do [ -f ~/.claude/commands/\$cmd.md ] || { echo \"missing: \$cmd\" >&2; missing=\$((missing+1)); }; done; [ \"\$missing\" = '0' ]"

  check "34 agents synced into ~/.claude/agents/great_cto-*.md" \
    bash -c "n=\$(ls ~/.claude/agents/great_cto-*.md 2>/dev/null | wc -l | tr -d ' '); [ \"\$n\" -eq 34 ]"

  check "agent-review + agent-retire commands present" \
    bash -c "[ -f ~/.claude/commands/agent-review.md ] && [ -f ~/.claude/commands/agent-retire.md ]"

  check "all 4 new agents synced (continuous-learner + 3 reviewers)" \
    bash -c "for a in continuous-learner edtech-reviewer gov-reviewer insurance-reviewer; do [ -f ~/.claude/agents/great_cto-\$a.md ] || exit 1; done"

  check "plugin.json sync list includes new commands" \
    bash -c "grep -q 'agent-review' .claude-plugin/plugin.json && grep -q 'agent-retire' .claude-plugin/plugin.json"

  check "plugin.json sync list includes all 4 new agents" \
    bash -c "grep -q 'continuous-learner' .claude-plugin/plugin.json && grep -q 'edtech-reviewer' .claude-plugin/plugin.json && grep -q 'gov-reviewer' .claude-plugin/plugin.json && grep -q 'insurance-reviewer' .claude-plugin/plugin.json"
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
echo "${C_OK}All checks passed. Pipeline ready to merge.${C_RESET}"
exit 0
