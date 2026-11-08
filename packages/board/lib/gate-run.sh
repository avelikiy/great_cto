#!/usr/bin/env bash
# gate-run.sh <worktree> <branch> <main checkout>: one full local gate on a worktree,
# started from the board's merge-readiness card. It waits for a quiet machine and
# keeps <main checkout>/.great_cto/gate-queue.json current so the card can say so.
# Its result reaches the card through gate-runs.jsonl, which ci-local writes itself.
set -u
W=$1; B=$2; R=$3; Q="$R/.great_cto/gate-queue.json"
HEAD_SHA="$(git -C "$W" rev-parse HEAD)"
write() { # state idle ahead
  local tmp="$Q.$$"
  printf '{"branch":"%s","head":"%s","state":"%s","idle":%s,"ahead":%s,"pid":%s}\n' "$B" "$HEAD_SHA" "$1" "${2:-null}" "${3:-0}" "$$" > "$tmp" && mv "$tmp" "$Q"
}
LINKED=""
cleanup() { rm -f "${Q:?}"; for d in $LINKED; do [ -L "$W/$d" ] && rm -f "${W:?}/${d:?}"; done; }
trap cleanup EXIT
idle() { top -l 4 -n 0 -s 5 2>/dev/null | grep "CPU usage" | tail -3 | awk '{gsub("%","",$7); s+=$7} END {if (NR) printf "%d", s/NR}'; }
write queued
for _ in $(seq 1 480); do
  others=$(ps -axo command | grep -cE "^(/bin/)?bash .*ci-local\.sh" || true); id=$(idle); free=$(df -g / 2>/dev/null | awk 'NR==2{print $4}')
  write queued "${id:-null}" "$others"
  # No reading on this platform is no reason to wait: only a measured busy machine waits.
  [ "$others" = 0 ] && { [ -z "$id" ] || [ "$id" -ge 30 ]; } && { [ -z "$free" ] || [ "$free" -ge 8 ]; } && break
  sleep 45
done
cd "$W" || exit 1
for d in node_modules packages/cli/node_modules; do [ -e "$d" ] || { [ -e "$R/$d" ] && ln -s "$R/$d" "$d" && LINKED="$LINKED $d"; }; done
[ -d "$HOME/.great_cto/tools/ms-playwright" ] && export PLAYWRIGHT_BROWSERS_PATH="$HOME/.great_cto/tools/ms-playwright"
(cd packages/cli && npm run build >/dev/null 2>&1) || exit 1
write running
bash scripts/ci-local.sh --e2e --jobs=8 > "$R/.great_cto/gate-run.log" 2>&1
