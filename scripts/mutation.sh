#!/usr/bin/env bash
# Mutation score of the board's critical files (StrykerJS, command runner over
# node --test). Not part of every gate: it reruns the file's tests once per
# mutant. Run weekly, and before merging a change to one of these files.
#
#   scripts/mutation.sh               every config in stryker/
#   scripts/mutation.sh gate-tokens   one of them
#
# Scores land in .great_cto/test-results/mutation/<name>.json; the recorded
# baseline and target are in docs/testing/BOARD-TEST-STRATEGY.md §3.1.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -x node_modules/.bin/stryker ] || { echo "mutation: @stryker-mutator/core is not installed (npm ci) — not checked" >&2; exit 2; }

names=("$@")
if [ ${#names[@]} -eq 0 ]; then
  for f in stryker/*.conf.json; do names+=("$(basename "$f" .conf.json)"); done
fi

rc=0
for n in "${names[@]}"; do
  conf="stryker/$n.conf.json"
  [ -f "$conf" ] || { echo "mutation: no $conf" >&2; exit 64; }
  echo "── mutation: $n"
  node_modules/.bin/stryker run "$conf" || rc=1
done
exit $rc
