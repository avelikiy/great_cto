#!/usr/bin/env bash
# tests/security/run-section-4b-playwright.sh — §4 browser-level tests via Playwright.
#
# Complements run-section-4-frontend.sh: that script asserts API contracts,
# this one asserts that the UI actually wires those APIs into clicks &
# state changes.
#
# Auto-installs deps + browser the first time the script is run (gated by
# the marker file tests/security/playwright/node_modules/.installed).

set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/_lib.sh"

OUT=${1:-/tmp/section-4b-playwright.md}
: > "$OUT"
echo "# §4 Browser tests (Playwright) ($(ts))" >> "$OUT"
echo >> "$OUT"

PW_DIR="$SCRIPT_DIR/playwright"
if [ ! -d "$PW_DIR" ]; then
  echo "Playwright dir missing: $PW_DIR" >> "$OUT"
  skip "$OUT" "Playwright tests" "missing pw dir"
  echo "**Result:** 0 passed · 0 failed · 1 skipped" >> "$OUT"
  exit 0
fi

# Board must be running
board_ok=$(curl_status "$BOARD_URL/api/security")
if [ "$board_ok" != "200" ]; then
  skip "$OUT" "Playwright tests" "board $BOARD_URL not reachable ($board_ok)"
  echo "**Result:** 0 passed · 0 failed · 1 skipped" >> "$OUT"
  exit 0
fi

cd "$PW_DIR" || exit 1

# Install deps on first run (idempotent)
MARKER="node_modules/.installed"
if [ ! -f "$MARKER" ]; then
  echo "Installing Playwright + browsers (one-time)…" >&2
  npm install --silent --no-audit --no-fund > /tmp/pw-install.log 2>&1 || {
    fail "$OUT" "npm install" "see /tmp/pw-install.log"
    echo "**Result:** $PASSED passed · $FAILED failed · $SKIPPED skipped" >> "$OUT"
    exit 1
  }
  npx playwright install --with-deps chromium > /tmp/pw-browser-install.log 2>&1 || {
    # Non-fatal — on macOS without sudo we still get the browser without deps
    npx playwright install chromium > /tmp/pw-browser-install.log 2>&1 || {
      fail "$OUT" "playwright install chromium" "see /tmp/pw-browser-install.log"
      echo "**Result:** $PASSED passed · $FAILED failed · $SKIPPED skipped" >> "$OUT"
      exit 1
    }
  }
  touch "$MARKER"
fi

# Run the suite
echo '```' >> "$OUT"
BOARD_URL="$BOARD_URL" npx playwright test --reporter=line > /tmp/pw-output.txt 2>&1
rc=$?
tail -50 /tmp/pw-output.txt >> "$OUT"
echo '```' >> "$OUT"

# Parse line-reporter summary: lines like "X passed (Ys)" or "X failed"
total_pass=$(grep -Eo '[0-9]+ passed' /tmp/pw-output.txt | head -1 | awk '{print $1}')
total_fail=$(grep -Eo '[0-9]+ failed' /tmp/pw-output.txt | head -1 | awk '{print $1}')
total_skip=$(grep -Eo '[0-9]+ skipped' /tmp/pw-output.txt | head -1 | awk '{print $1}')
PASSED=${total_pass:-0}
FAILED=${total_fail:-0}
SKIPPED=${total_skip:-0}

echo >> "$OUT"
echo "**Result:** $PASSED passed · $FAILED failed · $SKIPPED skipped" >> "$OUT"
echo >> "$OUT"
echo "HTML report: /tmp/playwright-report/index.html" >> "$OUT"

exit $rc
