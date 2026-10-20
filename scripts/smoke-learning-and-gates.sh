#!/usr/bin/env bash
# Smoke-check the 3.65–3.67 changes against an INSTALLED great_cto, in a sandbox.
#
#   bash scripts/smoke-learning-and-gates.sh                 # newest installed plugin
#   bash scripts/smoke-learning-and-gates.sh <plugin-dir>    # a specific one
#
# HOME is redirected to a temp directory: the operator's ~/.great_cto is never
# read or written. Every check prints PASS/FAIL with the fact it saw; the script
# exits 1 if any check failed. No network, no model calls, no money.
set -u
PL="${1:-$(ls -d "$HOME"/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1)}"
PL="${PL%/}"
[ -f "$PL/scripts/lessons-merge.mjs" ] || { echo "no great_cto plugin at '$PL'"; exit 2; }
SB=$(mktemp -d "${TMPDIR:-/tmp}/gcto-smoke.XXXXXX")
REAL_HOME=$HOME
export HOME="$SB/home"; mkdir -p "$HOME/.great_cto/projects"
stop_board(){ [ -n "$BOARD" ] || return 0; kill "$BOARD" 2>/dev/null; for i in $(seq 1 25); do kill -0 "$BOARD" 2>/dev/null || break; sleep 0.2; done; kill -9 "$BOARD" 2>/dev/null; wait "$BOARD" 2>/dev/null; BOARD=; true; }
trap 'stop_board; rm -rf "$SB"' EXIT
FAILS=0; BOARD=
pass(){ printf '  \033[32mPASS\033[0m %s\n' "$*"; }
fail(){ printf '  \033[31mFAIL\033[0m %s\n' "$*"; FAILS=$((FAILS+1)); }
check(){ if eval "$2"; then pass "$1"; else fail "$1"; fi; }
echo "plugin: ${PL/#$REAL_HOME/~}   sandbox HOME: $HOME"

# ── 1. Lesson needs evidence (ADR-037) ─────────────────────────────────────────
echo; echo "1. A lesson in 3 projects is a candidate, not a global decision"
lesson(){ printf -- '---\ndate: 2026-10-20\nproject: %s\narchetype: web-service\nconfidence: high\n%b\n---\n\n## pattern: retry-once\n\n**Decision/Pattern:** retry the flaky step once, then fail loudly.\n' "$1" "$2"; }
for p in a b c; do mkdir -p "$HOME/.great_cto/projects/$p"; lesson "$p" 'eval: EVAL-continuous-learner-extraction.md\ncomponent: prompt' > "$HOME/.great_cto/projects/$p/lessons.md"; done
OUT=$(node "$PL/scripts/lessons-merge.mjs" 2>&1)
check "unmeasured lesson listed as candidate" 'grep -q "candidate .*retry-once" <<<"$OUT"'
check "and NOT written to decisions.md" '[ ! -f "$HOME/.great_cto/decisions.md" ]'
OUT=$(node "$PL/scripts/lessons-merge.mjs" --measure retry-once 2>&1)
check "--measure without --yes prices it and runs nothing" 'grep -q "cost:" <<<"$OUT" && grep -q "nothing was run" <<<"$OUT"'
OUT=$(node "$PL/scripts/lessons-merge.mjs" --no-eval "smoke" 2>&1); rc=$?
check "a bypass for all candidates at once is refused" '[ $rc -ne 0 ]'
for p in a b c; do lesson "$p" 'eval: EVAL-continuous-learner-extraction.md\ncomponent: prompt\neval_delta: +20.0% (±5.0%, improvement)\neval_confidence: improvement' > "$HOME/.great_cto/projects/$p/lessons.md"; done
node "$PL/scripts/lessons-merge.mjs" >/dev/null 2>&1
check "a measured improvement IS promoted, with its stamp" 'grep -q "^eval_confidence: improvement" "$HOME/.great_cto/decisions.md" 2>/dev/null'
rm -f "$HOME/.great_cto/decisions.md"
for p in a b c; do lesson "$p" 'eval: EVAL-x.md\ncomponent: prompt\neval_delta: -20.0% (±5.0%, regression)\neval_confidence: regression' > "$HOME/.great_cto/projects/$p/lessons.md"; done
node "$PL/scripts/lessons-merge.mjs" --no-eval "smoke" --slug retry-once >/dev/null 2>&1
check "a measured regression is never promoted, even with --no-eval" '[ ! -f "$HOME/.great_cto/decisions.md" ]'

# ── 2. Component + control arm (ADR-038) ──────────────────────────────────────
echo; echo "2. The A/B arms follow the lesson's component"
for p in a b c; do lesson "$p" 'eval: EVAL-continuous-learner-extraction.md\ncomponent: skill\nchanges: skills/great_cto/SKILL.md' > "$HOME/.great_cto/projects/$p/lessons.md"; done
OUT=$(cd "$PL" && node scripts/lessons-merge.mjs --measure retry-once 2>&1)
check "a skill lesson gets a control arm (baseline · hint · full)" 'grep -q "arms: baseline · hint · full" <<<"$OUT"'
for p in a b c; do lesson "$p" 'eval: EVAL-continuous-learner-extraction.md' > "$HOME/.great_cto/projects/$p/lessons.md"; done
OUT=$(cd "$PL" && node scripts/lessons-merge.mjs --measure retry-once --yes 2>&1); rc=$?
check "an unlabelled lesson is refused before anything runs" '[ $rc -ne 0 ] && grep -q "component:" <<<"$OUT"'

# ── 3. /crystallize reads the real eval stamp ─────────────────────────────────
echo; echo "3. /crystallize approve reads the stamp its own stamper writes"
GP="$SB/GP-0001.md"; printf -- '---\nid: GP-0001\n---\n# p\n' > "$GP"
node --input-type=module -e "import { stampTrace } from '$PL/scripts/lib/gp-eval-trace.mjs'; import fs from 'node:fs';
  fs.writeFileSync('$GP', stampTrace(fs.readFileSync('$GP','utf8'), { ke:'K', commit:'c', ts:'t', delta:{ meanDelta:-0.2, noiseBand:0.05, direction:'regression' } }));"
node "$PL/scripts/lib/gp-approve-gate.mjs" "$GP" --no-eval "smoke" >/dev/null 2>&1; rc=$?
check "a stamped regression is blocked even with --no-eval" '[ $rc -ne 0 ]'

# ── 4. Change map rule (artifact-lint) ────────────────────────────────────────
echo; echo "4. A review without a change map is rejected"
R="$SB/repo"; mkdir -p "$R/docs/reviews"
printf '# Review\n\n**Date:** 2026-10-21\n\n## Findings\n\nnone\n' > "$R/docs/reviews/REVIEW-a.md"
OUT=$(cd "$R" && node "$PL/scripts/hooks/artifact-lint.mjs" --enforce --json 2>/dev/null)
check "missing change map is an error" 'grep -q "change-map-missing" <<<"$OUT"'
printf '\n## Change map\n\n```mermaid\nflowchart LR\n  A[app.js] --> B[db]\n```\n' >> "$R/docs/reviews/REVIEW-a.md"
OUT=$(cd "$R" && node "$PL/scripts/hooks/artifact-lint.mjs" --enforce --json 2>/dev/null)
check "a real flowchart passes" '! grep -q "change-map" <<<"$OUT"'

# ── 5. Gate brief on a live board ─────────────────────────────────────────────
echo; echo "5. The gate brief on a running board"
P="$SB/proj"; mkdir -p "$P/.great_cto/verdicts" "$P/docs/reviews"
( cd "$P" && git init -q && git config user.email t@t && git config user.name t && echo 'x=1' > app.js && git add . && git commit -qm init && echo 'x=2' > app.js )
printf 'archetype: web-service\n' > "$P/.great_cto/PROJECT.md"
printf '# Tasks\n\n| ID | Title | Status | Labels |\n|---|---|---|---|\n| g-ship | gate:ship — release | open | gate |\n' > "$P/.great_cto/tasks.md"
cp "$R/docs/reviews/REVIEW-a.md" "$P/docs/reviews/REVIEW-a.md"
printf '{"v":1,"ts":"2026-10-21T10:00:00Z","agent":"code-reviewer","verdict":"APPROVED","meta":{"review":"docs/reviews/REVIEW-a.md"}}\n' > "$P/.great_cto/verdicts/code-reviewer.log"
PORT=$((20000 + RANDOM % 20000))
# `exec`, so $! is the board itself: killing a wrapping subshell left the board
# running against a deleted sandbox (seen 20.10 — an orphan showing read errors).
( cd "$P" && BOARD_PORT=$PORT GREAT_CTO_NO_UPDATE_CHECK=1 exec node "$PL/packages/board/server.mjs" >/dev/null 2>&1 ) & BOARD=$!
for i in $(seq 1 50); do curl -s "localhost:$PORT/api/heartbeat" >/dev/null 2>&1 && break; sleep 0.2; done
curl -s "localhost:$PORT/api/inbox" >/dev/null
B=$(curl -s "localhost:$PORT/api/gates/g-ship/brief")
sec(){ node -e 'const b=JSON.parse(process.argv[1]);const s=b.sections.find(x=>x.key===process.argv[2]);console.log(JSON.stringify(s))' "$B" "$1"; }
check "brief lists the changed file" 'sec change | grep -q "app.js"'
check "reviewer verdict without a receipt is NOT counted for this tree" 'sec reviews | grep -q "\"onThisTree\":false"'
check "change map from the review is on the brief" 'sec map | grep -q "flowchart LR"'
echo 'x=3' > "$P/app.js"
B=$(curl -s "localhost:$PORT/api/gates/g-ship/brief")
check "a tree moved after the gate was shown is said first" 'node -e "process.exit(JSON.parse(process.argv[1]).moved===true?0:1)" "$B"'

stop_board
check "the test board is gone when the script ends" '! curl -s "localhost:$PORT/api/heartbeat" >/dev/null 2>&1'

echo
[ $FAILS = 0 ] && { echo "ALL PASS"; exit 0; } || { echo "$FAILS FAILED"; exit 1; }
