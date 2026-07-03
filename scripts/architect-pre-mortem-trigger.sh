#!/usr/bin/env bash
# scripts/architect-pre-mortem-trigger.sh — decides whether a pre-mortem is
# required before architect finalizes the ARCH doc, and scaffolds the file
# path / hard-halts production mode when it's missing.
#
# Usage:
#   FEATURE_SLUG=<slug> bash scripts/architect-pre-mortem-trigger.sh
#   (FEATURE_SLUG optional — falls back to latest ARCH-*.md or PROJECT.md title)
#
# Reads .great_cto/PROJECT.md (project_size, archetype, risk, pre-mortem: skip).
# Exit: 0 = no pre-mortem required, or required-and-file-already-exists.
#       1 = BLOCKED (production mode + high-risk archetype + file missing).
# Side effect: prints "Pre-mortem required. Generating <path>" when the file
# needs to be created (non-production) — architect then writes it per
# skills/great_cto/references/pre-mortem.md (Scenario / ≥5 failure modes /
# P×I rank / mitigations→gates).

set -uo pipefail

SIZE=$(grep "^project_size:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
ARCHETYPE=$(grep "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
RISK_FLAG=$(grep "^risk:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
SKIP_FLAG=$(grep "^pre-mortem: skip" .great_cto/PROJECT.md 2>/dev/null)

TRIGGER=0
case "$SIZE" in large|enterprise) TRIGGER=1 ;; esac
case "$ARCHETYPE" in web3|iot-embedded|regulated|healthcare|fintech|insurance|gov-public) TRIGGER=1 ;; esac
[ "$RISK_FLAG" = "high" ] && TRIGGER=1
[ -n "$SKIP_FLAG" ] && TRIGGER=0

if [ "$TRIGGER" -eq 1 ]; then
  mkdir -p docs/pre-mortems
  # Compute SLUG from feature description or latest ARCH file
  SLUG="${FEATURE_SLUG:-$(ls -t docs/architecture/ARCH-*.md 2>/dev/null | head -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')}"
  # Last-resort slug from feature description in PROJECT.md (avoids "feature" collisions)
  if [ -z "$SLUG" ]; then
    SLUG=$(grep -m1 -E "^# |^## Project" .great_cto/PROJECT.md 2>/dev/null \
      | tr -d '#' | head -c 80 | tr '[:upper:] ' '[:lower:]-' \
      | sed 's/[^a-z0-9-]//g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | head -c 40)
    [ -z "$SLUG" ] && SLUG="feature-$(date +%Y%m%d)"
  fi
  PRE="docs/pre-mortems/PRE-${SLUG}.md"
  if [ ! -f "$PRE" ]; then
    # Hard halt for production mode in high-risk archetypes — pre-mortem is mandatory before ARCH gate.
    MODE=$(grep "^mode:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
    if [ "$MODE" = "production" ]; then
      echo "BLOCKED: pre-mortem PRE-${SLUG}.md is mandatory for production mode (size=$SIZE, archetype=$ARCHETYPE)" >&2
      echo "Generate it now per skills/great_cto/references/pre-mortem.md (Scenario / ≥5 failure modes / P×I rank / mitigations→gates) or set 'pre-mortem: skip' in PROJECT.md with documented justification." >&2
      exit 1
    fi
    echo "Pre-mortem required. Generating $PRE — see skills/great_cto/references/pre-mortem.md for schema."
    # Architect writes PRE-<slug>.md per reference: Scenario, ≥5 failure modes, rank P×I,
    # early warning signs, mitigations→gates, risks to register, empty post-ship review.
  fi
fi

exit 0
