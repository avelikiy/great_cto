#!/usr/bin/env bash
# scripts/log-verdict.sh — canonical verdict-line writer for great_cto agents.
#
# Why it exists:
#   - Agents write verdicts as plain `echo "<ts> | agent | verdict | …" >> file`.
#   - The board's /api/cost endpoint expects a `cost=$X` tag in the line.
#   - In practice agents forget. This helper makes the format mandatory and
#     also tees the cost into .great_cto/cost-history.log for fallback parsing.
#
# Usage:
#   scripts/log-verdict.sh <agent> <verdict> <cost_usd> [meta_kv...]
#
# Example:
#   scripts/log-verdict.sh architect APPROVED 0.50 feature=tenant-onboarding arch=docs/architecture/ARCH.md
#
# Writes:
#   .great_cto/verdicts/<agent>.log   ← line with `cost=$<usd>` tag
#   .great_cto/cost-history.log       ← `<ts> <agent> <cost_usd>` (parsed by board fallback)
#
# Exit: 0 on success, 1 on bad args.

set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <agent> <verdict> <cost_usd> [meta_kv...]" >&2
  echo "  example: $0 architect APPROVED 0.50 feature=foo arch=docs/arch.md" >&2
  exit 1
fi

AGENT="$1"; shift
VERDICT="$1"; shift
COST="$1"; shift
META="$*"

# Validate cost is a non-negative number (allow scientific notation, decimals).
if ! [[ "$COST" =~ ^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$ ]]; then
  echo "error: cost_usd must be a non-negative number, got: $COST" >&2
  exit 1
fi

TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PROJ_DIR="${GREAT_CTO_DIR:-.great_cto}"
GLOBAL_DIR="$HOME/.great_cto"

# Emit verdict line. Format kept compatible with existing parser (server.mjs:725-733).
LINE="$TS | $AGENT | $VERDICT"
[ -n "$META" ] && LINE="$LINE | $META"
LINE="$LINE | cost=\$$COST"

# Write to project-local (canonical, git-tracked) AND user-global (board reads
# from ~/.great_cto/verdicts/ for cross-project aggregation — see GREAT_CTO_DIR
# in packages/board/server.mjs:20).
for D in "$PROJ_DIR" "$GLOBAL_DIR"; do
  mkdir -p "$D/verdicts"
  echo "$LINE" >> "$D/verdicts/$AGENT.log"
  echo "$TS $AGENT $COST" >> "$D/cost-history.log"
done
