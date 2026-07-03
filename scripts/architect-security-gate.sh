#!/usr/bin/env bash
# scripts/architect-security-gate.sh — architect threat-model + compliance-
# artefact hard-gate, run before finalizing the ARCH doc.
#
# Two independent checks:
#   1. Security-critical archetypes (ai-system, commerce, web3, iot-embedded,
#      regulated, fintech, browser-extension) must have a `## Security`
#      section in the ARCH doc AND a docs/sec-threats/TM-<slug>.md file.
#   2. Any `compliance:` framework declared in PROJECT.md must have its
#      backing artefact(s) on disk (closes the orphaned-pack bug: regulated/
#      DORA shipped with no DORA-checklist.md).
#
# Usage:
#   FEATURE_SLUG=<slug> bash scripts/architect-security-gate.sh
#   (FEATURE_SLUG optional — falls back to latest ARCH-*.md or PROJECT.md title)
#
# Exit: 0 = all required artefacts present (or none required).
#       1 = BLOCKED — prints which artefact is missing and the template to use.

set -uo pipefail

ARCHETYPE=$(grep "^archetype:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
SECURITY_REQUIRED=0
case "$ARCHETYPE" in ai-system|agent-product|commerce|web3|iot-embedded|regulated|fintech|browser-extension) SECURITY_REQUIRED=1 ;; esac

if [ "$SECURITY_REQUIRED" -eq 1 ]; then
  # Compute SLUG from latest ARCH file or fall back to feature slug variable
  SLUG="${FEATURE_SLUG:-$(ls -t docs/architecture/ARCH-*.md 2>/dev/null | head -1 | xargs -I{} basename {} .md | sed 's/^ARCH-//')}"
  # Last-resort slug from feature description in PROJECT.md (avoids "feature" collisions)
  if [ -z "$SLUG" ]; then
    SLUG=$(grep -m1 -E "^# |^## Project" .great_cto/PROJECT.md 2>/dev/null \
      | tr -d '#' | head -c 80 | tr '[:upper:] ' '[:lower:]-' \
      | sed 's/[^a-z0-9-]//g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | head -c 40)
    [ -z "$SLUG" ] && SLUG="feature-$(date +%Y%m%d)"
  fi
  mkdir -p docs/sec-threats docs/architecture docs/decisions
  TM="docs/sec-threats/TM-${SLUG}.md"
  ARCH_FILE="docs/architecture/ARCH-${SLUG}.md"

  # Hard halt: ARCH for security-critical archetype must have ## Security section.
  # Same enforcement model as Step 0a Discovery gate (v1.0.131) — print BLOCKED, exit 1.
  if [ -f "$ARCH_FILE" ] && ! grep -q "^## Security" "$ARCH_FILE"; then
    echo "BLOCKED: $ARCH_FILE missing required ## Security section for archetype=$ARCHETYPE" >&2
    case "$ARCHETYPE" in
      ai-system|agent-product) echo "Template: skills/great_cto/templates/ARCH-ai.md (use the § Security block)" >&2 ;;
      *) echo "Append ## Security section with: trust boundaries, threats, mitigations, mapped gates per archetype pack." >&2 ;;
    esac
    echo "Or run /sec threat ${SLUG} to generate Security section automatically." >&2
    exit 1
  fi

  # Hard halt: threat model file must exist before ARCH gate finalises.
  if [ ! -f "$TM" ]; then
    echo "BLOCKED: archetype=$ARCHETYPE requires threat model at $TM" >&2
    case "$ARCHETYPE" in
      ai-system|agent-product) echo "Template: skills/great_cto/templates/THREAT-MODEL-AI.md (covers OWASP LLM Top 10 + STRIDE)" >&2 ;;
      *) echo "Run: /sec threat ${SLUG}  (security-officer pre-impl mode)" >&2 ;;
    esac
    echo "Threat model must cover (per pack): prompt-injection (ai/agent), PCI-DSS scope (commerce), flash-loan + l2-resilience (web3), ETSI/OTA (iot-embedded), DORA Art.17-23 + ICT-third-party (regulated)." >&2
    exit 1
  fi
fi

# Compliance artefact gate — declared compliance values must have backing artefacts.
# Closes the orphaned-pack bug (regulated/DORA shipped with no DORA-checklist.md).
COMPLIANCE_RAW=$(grep "^compliance:" .great_cto/PROJECT.md 2>/dev/null | sed 's/.*\[//;s/\].*//;s/,/ /g')
for fw in $COMPLIANCE_RAW; do
  fw=$(echo "$fw" | tr -d ' ')
  case "$fw" in
    dora)        REQ="docs/compliance/DORA-ICT-risk-assessment.md docs/compliance/DORA-third-party-register.md" ;;
    nis2)        REQ="docs/compliance/NIS2-article21-controls.md" ;;
    gxp|21cfr11) REQ="docs/compliance/21CFR11-checklist.md" ;;
    tisax)       REQ="docs/compliance/TISAX-VDA-ISA-results.md" ;;
    iso27001)    REQ="docs/compliance/ISO27001-SoA.md" ;;
    sox)         REQ="docs/compliance/SOX-ITGC-checklist.md" ;;
    pci-dss|pci-dss-saq-d) REQ="docs/compliance/PCI-DSS-SAQ-D.md" ;;
    pci-dss-saq-a)         REQ="docs/compliance/PCI-DSS-SAQ-A.md" ;;
    *) REQ="" ;;
  esac
  for f in $REQ; do
    if [ ! -f "$f" ]; then
      TEMPLATE_NAME=$(basename "$f")
      echo "BLOCKED: compliance:[$fw] declared in PROJECT.md but $f does not exist" >&2
      echo "Template: skills/great_cto/templates/${TEMPLATE_NAME}" >&2
      echo "Copy: cp \$PLUGIN/skills/great_cto/templates/${TEMPLATE_NAME} ${f}  — then fill in the {placeholders}" >&2
      exit 1
    fi
  done
done

exit 0
