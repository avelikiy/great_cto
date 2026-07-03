#!/usr/bin/env bash
# scripts/architect-risk-register-init.sh — scaffold docs/risks/RISK-REGISTER.md
# if it doesn't exist yet (idempotent — never overwrites existing content).
#
# Usage:
#   bash scripts/architect-risk-register-init.sh
#
# After this runs, architect appends one row per risk listed in the ARCH doc's
# `## Risks` section — see skills/great_cto/references/risk-register.md for
# the row format, dedup rules, and ID scheme. Source tag for new rows:
# `ARCH-<slug>`.

set -uo pipefail

REGISTER="docs/risks/RISK-REGISTER.md"
mkdir -p docs/risks docs/risks/closed

if [ ! -f "$REGISTER" ]; then
  cat > "$REGISTER" <<'RLHEAD'
# Risk Register
> Active architectural, operational, and security risks. See `skills/great_cto/references/risk-register.md`.
## Active risks
| ID | Title | Prob | Impact | Mitigation | Owner | Status | Source | Added |
|----|-------|------|--------|------------|-------|--------|--------|-------|
RLHEAD
  echo "RISK-REGISTER.md scaffolded → $REGISTER"
fi
