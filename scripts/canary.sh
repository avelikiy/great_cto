#!/usr/bin/env bash
# scripts/canary.sh — synthetic new-user smoke test.
#
# Purpose: every day, a fresh CI runner does what a brand-new user does:
#   1. great-cto --version returns semver
#   2. cold init creates .great_cto/PROJECT.md in fresh dir
#   3. plugin install side-effects (plugin dir + settings.json)
#   4. great-cto list-rules returns 24 rules with all 5 scanner categories
#   5. great-cto scan finds AI vulnerability on synthetic fixture
#   6. great-cto board starts and serves /api/projects /api/metrics /api/cost
#   7. great-cto adapt generates AGENTS.md + CLAUDE.md (Claude Code-only)
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

# --- step 5: scan on a synthetic vulnerable fixture ------------------------
# We generate the fixture inline rather than looking for one in the plugin
# install directory. Reason: npm publish trims `tests/` from the package
# (see packages/cli/package.json `files` field), so the fixture isn't part
# of the published artifact. Plugin install dir also doesn't carry tests.
# Generating inline keeps step 5 stable across npm / local sources and
# decouples the canary from internal-test file layout.
#
# The fixture intentionally contains 4 high-severity patterns from the
# 24-rule scanner: PI-001 (user input in system prompt), SS-001 (tool
# fetches URL without allowlist), SS-003 (tool exec with user command),
# CR-002 (public endpoint hits LLM without rate limit). Scanner should
# return >= 1 finding at severity high.

echo
echo "▸ step 5 — scan finds AI vulnerability on synthetic fixture"
FIXTURE="$(mktemp -d)/vulnerable-app.ts"
cat > "$FIXTURE" <<'EOF'
// Synthetic fixture — DO NOT use in production. Generated by canary.sh.
import { spawn } from 'node:child_process';
import express from 'express';

// PI-001: User input in system prompt template literal
async function vulnerable1(req: { body: { msg: string } }) {
  return [{ role: 'system', content: `You are a bot. User said: ${req.body.msg}` }];
}

// SS-001: Tool fetches URL without allowlist
async function fetchTool(input: { url: string }) {
  const r = await fetch(input.url);
  return r.text();
}

// SS-003: Tool exec with user command
async function shellTool(input: { cmd: string }) {
  spawn(input.cmd, { shell: true });
}

// CR-002: Public endpoint hits LLM without rate limit
const app = express();
app.post('/chat', async (req, res) => {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: req.body.msg }],
  });
  res.json(completion);
});

declare const openai: any;
EOF

HOME="$CANARY_HOME" "${CLI[@]}" scan "$FIXTURE" --severity high > /tmp/canary-scan.out 2>&1
step "scan finds at least 1 high+ finding" \
  bash -c "grep -qE '[1-9][0-9]* finding' /tmp/canary-scan.out"

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

# --- step 7: adapt generates CLAUDE.md + AGENTS.md ------------------------
# v2.8.5+: Claude Code-only. Earlier --platform cursor/aider/codex/continue
# adapters were removed (commit 4c4f378). Now `adapt` always targets Claude.

echo
echo "▸ step 7 — adapt generates Claude Code configs"

ADAPT_DIR="$(mktemp -d)/adapt-claude"
mkdir -p "$ADAPT_DIR/.great_cto"
cat > "$ADAPT_DIR/.great_cto/PROJECT.md" <<EOF
primary: cli
archetype: cli
description: Canary fixture
size: small
EOF
(cd "$ADAPT_DIR" && HOME="$CANARY_HOME" "${CLI[@]}" adapt > /tmp/canary-adapt.out 2>&1)
step "adapt exits 0" \
  bash -c "test \$? = 0 || cat /tmp/canary-adapt.out"
step "adapt: AGENTS.md + CLAUDE.md created" \
  bash -c "test -f '$ADAPT_DIR/AGENTS.md' && test -f '$ADAPT_DIR/CLAUDE.md'"
step "AGENTS.md references the archetype from PROJECT.md" \
  bash -c "grep -q 'cli' '$ADAPT_DIR/AGENTS.md'"
rm -rf "$(dirname "$ADAPT_DIR")" 2>/dev/null

# --- summary ----------------------------------------------------------------

echo
echo "─────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✓ $PASS passed   canary GREEN"
  exit 0
else
  echo "  ✓ $PASS passed   ✗ $FAIL failed   canary RED"
  echo
  echo "Failed steps:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
