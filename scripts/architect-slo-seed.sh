#!/usr/bin/env bash
# scripts/architect-slo-seed.sh — seed docs/reliability/SLO.md with a draft
# entry for a newly-introduced network-facing or user-impacting service.
#
# Usage:
#   SVC_NEW="billing" bash scripts/architect-slo-seed.sh
#
# Idempotent — does nothing if the service heading already exists. Draft
# defaults (99.9% availability / <200ms p95 / <0.5% error rate, all 30d
# rolling) are starting points; the CTO tightens or loosens based on product
# criticality. Tightening later requires an ADR per
# skills/great_cto/references/reliability.md § SLO change procedure.

set -uo pipefail

if [ -z "${SVC_NEW:-}" ]; then
  echo "usage: SVC_NEW=<service-name> bash scripts/architect-slo-seed.sh" >&2
  exit 1
fi

SLO=docs/reliability/SLO.md
mkdir -p docs/reliability
[ ! -f "$SLO" ] && printf '# SLO — %s\n\n> Per-service Service Level Objectives. See `skills/great_cto/references/reliability.md`.\n\n## Services\n\n' "$(basename "$PWD")" > "$SLO"

if ! grep -q "^### $SVC_NEW$" "$SLO"; then
  {
    printf '### %s\n' "$SVC_NEW"
    printf '| SLI | Target | Budget (30d rolling) | Window |\n'
    printf '|-----|--------|----------------------|--------|\n'
    printf '| Availability (HTTP 2xx / total) | 99.9%% | 43.2 min downtime | 30d rolling |\n'
    printf '| Latency p95 | < 200ms | 2h over threshold | 30d rolling |\n'
    printf '| Error rate | < 0.5%% | 3.6h > threshold | 30d rolling |\n\n'
  } >> "$SLO"
  echo "SLO seeded for $SVC_NEW — CTO to review/tighten defaults before merge"
fi
