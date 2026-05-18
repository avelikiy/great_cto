#!/usr/bin/env bash
# tests/security/run-e2e-real-project.sh — end-to-end smoke of the Security
# tab against synthetic-but-real-shaped audit events.
#
# Walks the full operator workflow:
#   1. Back up the existing audit log
#   2. Seed a curated threat scenario (seed-threats.py) using leash's own
#      AuditWriter so the hash chain stays valid
#   3. Probe the board API surface to confirm the new events show up
#   4. Run the API contract tests (run-section-4-frontend.sh)
#   5. Run the browser smoke (Playwright workers=1)
#   6. Take screenshots of every Security sub-tab
#   7. Verify the audit hash chain is still consistent
#   8. Optionally restore the backup
#
# Outputs:
#   /tmp/e2e-real-project.md                            human report
#   tests/security/playwright/screenshots/4e-*.png      one per sub-tab
#   tests/security/playwright/test-results/             playwright detail
#
# Usage:
#   bash tests/security/run-e2e-real-project.sh                 # default
#   KEEP_SEED=1 bash tests/security/run-e2e-real-project.sh     # don't restore backup
#   TENANT=billing-api bash tests/security/run-e2e-real-project.sh
#
# Exit 0 = all stages green; non-zero = at least one stage failed.

set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
source "$SCRIPT_DIR/_lib.sh"

OUT=${OUT:-/tmp/e2e-real-project.md}
TENANT=${TENANT:-$(node -e "
try { console.log(require('${SCRIPT_DIR}/../../packages/board/leash-adapter.mjs').readProjectTenantId('$(pwd)') || 'great-cto'); }
catch { console.log('great-cto'); }
" 2>/dev/null || echo great-cto)}
AUDIT=${LEASH_AUDIT_LOG:-$HOME/.leash/audit.jsonl}
KEEP_SEED=${KEEP_SEED:-0}
BACKUP="$AUDIT.e2e-backup.$$"

: > "$OUT"
echo "# Security tab — end-to-end real-project run" >> "$OUT"
echo >> "$OUT"
echo "- started: $(ts)" >> "$OUT"
echo "- tenant: \`$TENANT\`" >> "$OUT"
echo "- audit log: \`$AUDIT\`" >> "$OUT"
echo >> "$OUT"

overall=0

stage() {
  local name=$1; shift
  echo "## $name" >> "$OUT"
  echo '```' >> "$OUT"
  "$@" 2>&1 | tail -40 >> "$OUT"
  local rc=$?
  echo '```' >> "$OUT"
  if [ "$rc" -eq 0 ]; then
    echo "**stage:** ✓ pass" >> "$OUT"
  else
    echo "**stage:** ✗ fail (exit $rc)" >> "$OUT"
    overall=1
  fi
  echo >> "$OUT"
  return $rc
}

# ── 1. Backup ─────────────────────────────────────────────────────────────
log "1/8 backing up audit log → $BACKUP"
if [ -f "$AUDIT" ]; then
  cp "$AUDIT" "$BACKUP"
  echo "## 1. Backup" >> "$OUT"; echo "Saved $AUDIT to \`$BACKUP\`" >> "$OUT"; echo >> "$OUT"
else
  mkdir -p "$(dirname "$AUDIT")"
  touch "$AUDIT" "$BACKUP"
  echo "## 1. Backup" >> "$OUT"; echo "(audit was empty)" >> "$OUT"; echo >> "$OUT"
fi

# ── 2. Seed synthetic threats ─────────────────────────────────────────────
log "2/8 seeding threats (tenant=$TENANT)"
stage "2. Seed threats" python3 "$SCRIPT_DIR/seed-threats.py" --tenant "$TENANT" --audit "$AUDIT"

# Give the board's audit reader a moment
sleep 1

# ── 3. Board API smoke — does it see the events? ──────────────────────────
log "3/8 probing /api/leash/audit"
api_records=$(curl -sS "$BOARD_URL/api/leash/audit?project=$TENANT&limit=50" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('records',[])))" 2>/dev/null || echo 0)
echo "## 3. Board API sees seeded data" >> "$OUT"
echo '```' >> "$OUT"
echo "GET /api/leash/audit?project=$TENANT&limit=50  →  $api_records records" >> "$OUT"
if [ "${api_records:-0}" -ge 12 ]; then
  echo "✓ board sees ≥12 events" >> "$OUT"
  echo '```' >> "$OUT"
  echo "**stage:** ✓ pass" >> "$OUT"
else
  echo "✗ board sees only $api_records events (expected ≥12)" >> "$OUT"
  echo '```' >> "$OUT"
  echo "**stage:** ✗ fail" >> "$OUT"
  overall=1
fi
echo >> "$OUT"

# ── 4. API contract suite (§4) ────────────────────────────────────────────
log "4/8 §4 API contracts"
stage "4. §4 API contracts" bash "$SCRIPT_DIR/run-section-4-frontend.sh" /tmp/e2e-4-frontend.md

# ── 5. Playwright smoke (15 tests) ────────────────────────────────────────
log "5/8 §4b Playwright smoke (15 tests)"
stage "5. §4b Playwright smoke" bash "$SCRIPT_DIR/run-section-4b-playwright.sh" /tmp/e2e-4b.md

# ── 6. Screenshots ────────────────────────────────────────────────────────
log "6/8 §4e screenshots"
echo "## 6. Screenshots (per sub-tab)" >> "$OUT"
echo '```' >> "$OUT"
cd "$SCRIPT_DIR/playwright" || { echo "missing playwright dir" >> "$OUT"; exit 1; }
if [ ! -f node_modules/.installed ]; then
  npm install --silent --no-audit --no-fund > /tmp/e2e-npm-install.log 2>&1
  npx playwright install chromium > /tmp/e2e-pw-install.log 2>&1
  touch node_modules/.installed
fi
BOARD_URL="$BOARD_URL" npx playwright test tests/4e-e2e-screenshots.spec.ts --reporter=line --workers=1 \
  > /tmp/e2e-pw-output.txt 2>&1
pw_rc=$?
tail -20 /tmp/e2e-pw-output.txt >> "$OUT"
echo '```' >> "$OUT"
if [ "$pw_rc" -eq 0 ]; then
  ls -1 "$SCRIPT_DIR/playwright/screenshots/"4e-*.png 2>/dev/null > /tmp/e2e-screens.txt
  echo "**stage:** ✓ pass — $(wc -l < /tmp/e2e-screens.txt | tr -d ' ') screenshots in tests/security/playwright/screenshots/" >> "$OUT"
  echo >> "$OUT"
  while IFS= read -r p; do
    short=$(basename "$p")
    echo "- \`$short\`" >> "$OUT"
  done < /tmp/e2e-screens.txt
else
  echo "**stage:** ✗ fail" >> "$OUT"
  overall=1
fi
echo >> "$OUT"
cd - >/dev/null

# ── 7. Verify hash chain ──────────────────────────────────────────────────
log "7/8 verifying audit hash chain"
chain_rc=$(python3 -c "
from llm_leash.audit.verify import verify_chain
r = verify_chain('$AUDIT')
print(r)
" 2>&1)
echo "## 7. Audit chain integrity" >> "$OUT"
echo '```' >> "$OUT"
echo "verify_chain returned: $chain_rc" >> "$OUT"
echo '```' >> "$OUT"
if [[ "$chain_rc" =~ ^[0-9]+$ ]] && [ "$chain_rc" -ge 12 ]; then
  echo "**stage:** ✓ pass — $chain_rc records, chain intact" >> "$OUT"
else
  echo "**stage:** ✗ fail" >> "$OUT"
  overall=1
fi
echo >> "$OUT"

# ── 8. Restore (or keep) ──────────────────────────────────────────────────
log "8/8 restore audit"
if [ "$KEEP_SEED" = "1" ]; then
  echo "## 8. Restore" >> "$OUT"
  echo "Skipped (KEEP_SEED=1). Audit log left with seeded events for manual inspection." >> "$OUT"
  echo "Backup is still at \`$BACKUP\`." >> "$OUT"
else
  cp "$BACKUP" "$AUDIT"
  rm -f "$BACKUP"
  echo "## 8. Restore" >> "$OUT"
  echo "Audit log restored from backup." >> "$OUT"
fi
echo >> "$OUT"

# ── Summary ───────────────────────────────────────────────────────────────
echo "## Summary" >> "$OUT"
if [ "$overall" = "0" ]; then
  echo "**Overall: ✅ PASS** — every stage green; Security tab works end-to-end against real-shaped data." >> "$OUT"
else
  echo "**Overall: ❌ FAIL** — at least one stage failed. Inspect each section above." >> "$OUT"
fi
echo >> "$OUT"
echo "- finished: $(ts)" >> "$OUT"

log "report: $OUT"
exit $overall
