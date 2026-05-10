#!/usr/bin/env bash
# scripts/canary.sh — synthetic new-user smoke test.
#
# Purpose: every day, a fresh CI runner does what a brand-new user does:
#   1. cd to an empty directory, git init
#   2. npx great-cto init  (cold install — pulls from npm)
#   3. assert .great_cto/PROJECT.md got created
#   4. assert ~/.claude/agents/great_cto-* synced
#   5. great-cto --version returns semver
#   6. great-cto list-rules returns 24 rules
#   7. great-cto scan on bundled fixture works
#   8. great-cto board starts and serves /api/projects
#
# If any step fails, the whole script exits non-zero and the GitHub Actions
# job opens an issue. Used by .github/workflows/daily-canary.yml.
#
# Run locally:
#   scripts/canary.sh [--source local|npm]   (default: local)
#
# `local` mode runs from the working tree (`node packages/cli/index.mjs`)
# and skips the npm download step — useful for pre-merge checks.
# `npm` mode runs the published `npx great-cto@latest` — the real cold-install
# experience that CI exercises.

set -uo pipefail

SOURCE="${1:-local}"
shift 2>/dev/null || true

# Resolve script directory once, before any cd, so subsequent helpers can find
# sibling scripts (mock-llm.py) regardless of where canary.sh was invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
[ -z "$SCRIPT_DIR" ] && SCRIPT_DIR="$(pwd)"

# --- isolated home so we don't pollute the developer's ~/.claude ------------

CANARY_HOME="$(mktemp -d)/home"
CANARY_PROJECT="$(mktemp -d)/proj"
mkdir -p "$CANARY_HOME" "$CANARY_PROJECT"

cleanup() {
  rm -rf "$(dirname "$CANARY_HOME")" "$(dirname "$CANARY_PROJECT")" 2>/dev/null
  if [ -n "${BOARD_PID:-}" ]; then kill "$BOARD_PID" 2>/dev/null; fi
}
trap cleanup EXIT

# --- helpers ----------------------------------------------------------------

PASS=0; FAIL=0
declare -a FAILURES

step() {
  local name="$1"; shift
  if "$@"; then
    printf "  ✓ %s\n" "$name"
    PASS=$((PASS+1))
  else
    printf "  ✗ %s\n" "$name"
    FAIL=$((FAIL+1))
    FAILURES+=("$name")
  fi
}

# --- preflight --------------------------------------------------------------

echo "▸ canary preflight"
echo "  source       : $SOURCE"
echo "  CANARY_HOME  : $CANARY_HOME"
echo "  PROJECT_DIR  : $CANARY_PROJECT"
echo "  node version : $(node --version)"
echo "  os           : $(uname -s)"

# Resolve CLI binary.
if [ "$SOURCE" = "npm" ]; then
  # Cold install: real new-user path. Touches the published artifact.
  CLI=("npx" "-y" "great-cto@latest")
else
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  CLI=("node" "$REPO_ROOT/packages/cli/index.mjs")
fi

# --- step 1: --version returns semver --------------------------------------

echo
echo "▸ step 1 — great-cto --version"
HOME="$CANARY_HOME" "${CLI[@]}" --version > /tmp/canary-version.out 2>&1
step "version returns semver" \
  bash -c "grep -qE '^[0-9]+\\.[0-9]+\\.[0-9]+' /tmp/canary-version.out"

# --- step 2: cold init creates PROJECT.md ----------------------------------

echo
echo "▸ step 2 — cold init in fresh dir"
cd "$CANARY_PROJECT" && git init -q
HOME="$CANARY_HOME" "${CLI[@]}" init > /tmp/canary-init.out 2>&1
step "init exits 0" test "$?" -eq 0
step ".great_cto/PROJECT.md created" test -f "$CANARY_PROJECT/.great_cto/PROJECT.md"
step "PROJECT.md has archetype field" \
  bash -c "grep -qE '^(archetype|primary):' '$CANARY_PROJECT/.great_cto/PROJECT.md'"

# --- step 3: plugin install side-effects -----------------------------------

echo
echo "▸ step 3 — plugin install side-effects"
step "plugin dir created in CANARY_HOME" \
  bash -c "ls -d '$CANARY_HOME/.claude/plugins/cache/local/great_cto'/*/ >/dev/null 2>&1"
step "settings.json updated" test -f "$CANARY_HOME/.claude/settings.json"

# --- step 4: list-rules returns 24 rules -----------------------------------

echo
echo "▸ step 4 — list-rules"
HOME="$CANARY_HOME" "${CLI[@]}" list-rules > /tmp/canary-rules.out 2>&1
step "exits 0" test "$?" -eq 0
step "loads exactly 24 rules" \
  bash -c "grep -qE '^24 rule\\(s\\) loaded\\.' /tmp/canary-rules.out"
step "has all 5 scanner categories" \
  bash -c "for c in cost-runaway prompt-injection rag-poisoning secrets-in-prompts ssrf-in-tools; do grep -q \"\$c\" /tmp/canary-rules.out || exit 1; done"

# --- step 5: scan on the bundled vulnerable fixture ------------------------
# Use the fixture shipped inside the plugin install (clone) so we exercise
# the same code path L2 of test-pipeline.sh covers, without inventing a
# fixture that might miss the rule signatures.

echo
echo "▸ step 5 — scan finds AI vulnerability on bundled fixture"
PLUGIN_INSTALL="$(ls -d "$CANARY_HOME/.claude/plugins/cache/local/great_cto"/*/ 2>/dev/null | sort -V | tail -1)"
FIXTURE="$PLUGIN_INSTALL/packages/cli/tests/agentshield/fixtures/vulnerable-app.ts"
if [ -f "$FIXTURE" ]; then
  HOME="$CANARY_HOME" "${CLI[@]}" scan "$FIXTURE" --severity high > /tmp/canary-scan.out 2>&1
  step "scan finds at least 1 high+ finding" \
    bash -c "grep -qE '[1-9][0-9]* finding' /tmp/canary-scan.out"
else
  step "scan fixture exists in plugin install" false
fi

# --- step 6: board server starts + serves /api/projects -------------------

echo
echo "▸ step 6 — board boots and serves API"
# Pick a free port — don't collide with anything else on CI.
PORT=$(node -e "
const s=require('net').createServer().listen(0,()=>{const p=s.address().port;console.log(p);s.close();});
" 2>/dev/null)
[ -z "$PORT" ] && PORT=33141

HOME="$CANARY_HOME" "${CLI[@]}" board --port "$PORT" --no-open > /tmp/canary-board.log 2>&1 &
BOARD_PID=$!
# Wait up to 10s for it to come up
for i in $(seq 1 20); do
  if curl -sf "http://127.0.0.1:$PORT/api/projects" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
step "board /api/projects returns 200" \
  bash -c "curl -sf -o /dev/null -w '%{http_code}' 'http://127.0.0.1:$PORT/api/projects' | grep -q 200"
step "board /api/metrics returns 200" \
  bash -c "curl -sf -o /dev/null -w '%{http_code}' 'http://127.0.0.1:$PORT/api/metrics' | grep -q 200"
step "board /api/cost returns valid JSON" \
  bash -c "curl -sf 'http://127.0.0.1:$PORT/api/cost' | python3 -c 'import sys,json; json.load(sys.stdin)'"

# --- step 7: adapt --platform <host> for all 5 hosts ----------------------
# Verifies the cross-host promise: same plugin → platform-native configs.
# We don't try to BOOT Cursor/Codex/Aider/Continue in CI (no headless mode
# for commercial hosts), but we DO assert each `adapt` run produces the
# right files in the right places, and that the YAML/JSON ones parse.

echo
echo "▸ step 7 — adapt to all 5 hosts"

for HOST in claude codex cursor aider continue; do
  ADAPT_DIR="$(mktemp -d)/adapt-$HOST"
  mkdir -p "$ADAPT_DIR/.great_cto"
  cat > "$ADAPT_DIR/.great_cto/PROJECT.md" <<EOF
archetype: cli
description: Canary fixture for $HOST
size: small
EOF
  (cd "$ADAPT_DIR" && HOME="$CANARY_HOME" "${CLI[@]}" adapt --platform "$HOST" > /tmp/canary-adapt-$HOST.out 2>&1)
  case "$HOST" in
    claude)
      step "claude: AGENTS.md + CLAUDE.md created" \
        bash -c "test -f '$ADAPT_DIR/AGENTS.md' && test -f '$ADAPT_DIR/CLAUDE.md'"
      ;;
    codex)
      step "codex: AGENTS.md created" \
        bash -c "test -f '$ADAPT_DIR/AGENTS.md'"
      ;;
    cursor)
      step "cursor: .cursorrules + .cursor/rules/*.mdc created" \
        bash -c "test -f '$ADAPT_DIR/.cursorrules' && test -f '$ADAPT_DIR/.cursor/rules/great-cto.mdc'"
      ;;
    aider)
      step "aider: .aider.conf.yml is valid YAML + CONVENTIONS.md exists" \
        bash -c "test -f '$ADAPT_DIR/.aider.conf.yml' && test -f '$ADAPT_DIR/CONVENTIONS.md' && python3 -c 'import yaml,sys; yaml.safe_load(open(\"$ADAPT_DIR/.aider.conf.yml\"))'"
      ;;
    continue)
      step "continue: .continue/rules.md created" \
        bash -c "test -f '$ADAPT_DIR/.continue/rules.md'"
      ;;
  esac
  rm -rf "$(dirname "$ADAPT_DIR")" 2>/dev/null
done

# --- step 8+9: live boot OSS hosts against generated configs -------------
# Verify the generated configs are not just syntactically valid but actually
# loadable by the real hosts. Uses scripts/mock-llm.py — no API tokens spent.
# Hosts are skipped (not failed) if not installed locally — GitHub Actions
# installs them before running canary.

SKIPPED=0
skipped() {
  printf "  · %s (skipped — host not installed)\n" "$1"
  SKIPPED=$((SKIPPED+1))
}

start_mock_llm() {
  MOCK_PORT=$(node -e "
    const s=require('net').createServer().listen(0,()=>{const p=s.address().port;console.log(p);s.close();});
  " 2>/dev/null)
  [ -z "$MOCK_PORT" ] && MOCK_PORT=18088
  python3 "$SCRIPT_DIR/mock-llm.py" --port "$MOCK_PORT" > /tmp/canary-mock-llm.log 2>&1 &
  MOCK_PID=$!
  for i in $(seq 1 20); do
    if curl -sf "http://127.0.0.1:$MOCK_PORT/healthz" > /dev/null 2>&1; then return 0; fi
    sleep 0.2
  done
  return 1
}

stop_mock_llm() {
  if [ -n "${MOCK_PID:-}" ]; then
    kill "$MOCK_PID" 2>/dev/null
    wait "$MOCK_PID" 2>/dev/null  # absorb the SIGTERM message
    MOCK_PID=""
  fi
}

# === step 8: Aider live boot ===
echo
echo "▸ step 8 — Aider live boot against mock LLM"

if ! command -v aider >/dev/null 2>&1; then
  skipped "aider not in PATH (install via pip install aider-chat)"
elif ! start_mock_llm; then
  step "mock LLM started" false
else
  AIDER_DIR="$(mktemp -d)/aider-test"
  mkdir -p "$AIDER_DIR/.great_cto"
  cat > "$AIDER_DIR/.great_cto/PROJECT.md" <<EOF
archetype: cli
description: Aider live-boot canary
size: small
EOF
  (cd "$AIDER_DIR" && git init -q && HOME="$CANARY_HOME" "${CLI[@]}" adapt --platform aider > /dev/null 2>&1)
  echo "// canary fixture" > "$AIDER_DIR/sample.js"
  (cd "$AIDER_DIR" && git add -A && git commit -q -m "init" 2>/dev/null)

  # Aider against mock OpenAI endpoint, no streaming, no pretty output, no auto-commit
  cd "$AIDER_DIR"
  # Do NOT override HOME here — pip-user-installed aider needs its real
  # site-packages on sys.path. The mock-LLM env still isolates the network.
  OPENAI_API_KEY=sk-canary-mock \
  OPENAI_API_BASE="http://127.0.0.1:$MOCK_PORT/v1" \
    timeout 30 aider \
      --model openai/mock-model \
      --no-pretty --no-stream --no-auto-commits --no-show-model-warnings \
      --yes-always \
      --message "say OK" \
      sample.js \
      > /tmp/canary-aider.log 2>&1
  AIDER_RC=$?

  step "aider launches without import error" \
    bash -c "! grep -qE 'ModuleNotFoundError|ImportError' /tmp/canary-aider.log"
  step "aider read .aider.conf.yml without YAML error" \
    bash -c "! grep -qiE 'yaml.*error|invalid yaml' /tmp/canary-aider.log"
  # Exit-code check is intentionally lenient: aider can return non-zero against
  # a mock LLM (auth/parse errors are expected) without indicating a real
  # integration break. The two prior checks already verify launch + config.
  step "aider exited without crash (no SIGKILL/SIGSEGV)" \
    bash -c "[ '$AIDER_RC' != '137' ] && [ '$AIDER_RC' != '139' ]"

  rm -rf "$(dirname "$AIDER_DIR")"
  stop_mock_llm
fi

# === step 9: Codex CLI live boot ===
echo
echo "▸ step 9 — Codex CLI live boot against mock LLM"

# OpenAI Codex CLI binary: tried `codex`, `openai-codex`, common installs.
CODEX_BIN=""
for candidate in codex openai-codex "@openai/codex"; do
  if command -v "$candidate" >/dev/null 2>&1; then CODEX_BIN="$candidate"; break; fi
done

if [ -z "$CODEX_BIN" ]; then
  skipped "codex not in PATH (install via npm install -g @openai/codex)"
elif ! start_mock_llm; then
  step "mock LLM started for codex" false
else
  CODEX_DIR="$(mktemp -d)/codex-test"
  mkdir -p "$CODEX_DIR/.great_cto"
  cat > "$CODEX_DIR/.great_cto/PROJECT.md" <<EOF
archetype: cli
description: Codex CLI live-boot canary
size: small
EOF
  (cd "$CODEX_DIR" && git init -q && HOME="$CANARY_HOME" "${CLI[@]}" adapt --platform codex > /dev/null 2>&1)
  echo "// canary fixture" > "$CODEX_DIR/sample.js"

  cd "$CODEX_DIR"
  OPENAI_API_KEY=sk-canary-mock \
  OPENAI_BASE_URL="http://127.0.0.1:$MOCK_PORT/v1" \
  HOME="$CANARY_HOME" \
    timeout 30 "$CODEX_BIN" --help > /tmp/canary-codex.log 2>&1
  CODEX_RC=$?

  # We only verify --help works (proves binary launches against our env);
  # actual prompt-and-respond cycle varies wildly across codex CLI versions.
  step "codex --help exits 0" \
    bash -c "[ '$CODEX_RC' = '0' ]"
  step "AGENTS.md was generated for codex" \
    test -f "$CODEX_DIR/AGENTS.md"

  rm -rf "$(dirname "$CODEX_DIR")"
  stop_mock_llm
fi

# --- summary ----------------------------------------------------------------

echo
echo "─────────────────────────────────────────"
SKIP_NOTE=""
[ "$SKIPPED" -gt 0 ] && SKIP_NOTE="   · $SKIPPED skipped"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✓ $PASS passed${SKIP_NOTE}   canary GREEN"
  exit 0
else
  echo "  ✓ $PASS passed   ✗ $FAIL failed${SKIP_NOTE}   canary RED"
  echo
  echo "Failed steps:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
