#!/usr/bin/env bash
# scripts/auditor-scaffold-dirs.sh — create standard doc dirs if absent.
# Idempotent — never overwrites existing content.
#
# Usage:
#   bash scripts/auditor-scaffold-dirs.sh
#
# Scaffolds:
#   docs/risks/RISK-REGISTER.md   — read by /inbox, /audit, security-officer
#   docs/vendors/                 — read by security-officer quarterly review

set -uo pipefail

# Risk register
if [ ! -f docs/risks/RISK-REGISTER.md ]; then
  mkdir -p docs/risks/closed
  cat > docs/risks/RISK-REGISTER.md << 'RISKEOF'
# Risk Register

> Managed by great_cto. See `skills/great_cto/references/risk-register.md` for schema.
> Do NOT edit header. Append risk rows below.

## Active risks

| ID | Title | Impact | Prob | Owner | Source | Status |
|----|-------|--------|------|-------|--------|--------|

## Closed risks

See `docs/risks/closed/`.
RISKEOF
  echo "  scaffolded docs/risks/RISK-REGISTER.md"
fi

# Vendor register
mkdir -p docs/vendors
if [ ! -f docs/vendors/.gitkeep ]; then
  touch docs/vendors/.gitkeep
  echo "  scaffolded docs/vendors/ (add VENDOR-<slug>.md per third-party dependency)"
fi
