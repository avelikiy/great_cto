---
description: "Promote a POC to MVP/production. Runs the full audits that POC-mode skipped. Required before any POC can see production."
argument-hint: "<poc-slug> [target: mvp|production, default: production]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto promotion command. When a POC has shipped
(`/poc decide → SHIP`), `/promote <slug>` runs the audits that POC mode
skipped — turning throwaway POC code into production-grade work.

## Guard: target POC exists and is marked Shipped

```bash
SLUG="$1"
TARGET="${2:-production}"
[ -z "$SLUG" ] && { echo "Usage: /promote <poc-slug> [mvp|production]"; exit 0; }
POC_FILE="docs/poc/POC-${SLUG}.md"
[ ! -f "$POC_FILE" ] && { echo "No POC found at $POC_FILE"; exit 0; }

STATUS=$(grep -m1 "^\*\*Status\*\*:" "$POC_FILE" | sed 's/.*: //')
if [ "$STATUS" != "Shipped" ]; then
  echo "POC-${SLUG} status is '${STATUS}', not 'Shipped'."
  echo "Run /poc decide first to complete the POC ritual."
  exit 0
fi

[ "$TARGET" != "mvp" ] && [ "$TARGET" != "production" ] && { echo "Target must be 'mvp' or 'production'"; exit 0; }
```

## Promotion audit — run in order

The promotion audit fills in what POC mode skipped. Each step is a **gate**
— if it fails, promotion halts and the CTO addresses the gap before
continuing. Do not silently pass.

### Step 1 — Full ARCH document

POC mode allowed a 1-pager. Production requires a full ARCH.

- Invoke `tech-lead` agent via Agent tool with instruction:
  "Expand POC-<slug> into a full ARCH document at
  `docs/architecture/ARCH-<slug>.md`. Use the POC hypothesis, criteria,
  and evidence as input. Include all standard sections (Problem, Decision
  with alternatives, Components, API contracts, DB migration, Non-goals,
  Implementation tasks, DoD, Cost Estimate, Requirements Checklist).
  Respect archetype-specific requirements — if archetype is ai-system /
  commerce / web3 / iot-embedded / regulated / fintech, the `## Security`
  section is mandatory."
- Verify output exists:
  ```bash
  [ -f "docs/architecture/ARCH-${SLUG}.md" ] || { echo "BLOCKED: ARCH doc not produced"; exit 1; }
  ```

### Step 2 — Threat model (archetype-aware, v1.0.134)

```bash
ARCHETYPE=$(grep "^archetype:" .great_cto/PROJECT.md | awk '{print $2}')
TM="docs/sec-threats/TM-${SLUG}.md"
mkdir -p docs/sec-threats

case "$ARCHETYPE" in
  ai-system|agent-product)
    # Delegate to ai-security-reviewer specialist (v1.0.134+) — full OWASP LLM Top 10 coverage.
    # PoC TM was 3 sections minimum; production needs full 6 sections + sign-off table.
    echo "Promote: invoke ai-security-reviewer for full TM at $TM (was PoC lite version)"
    # Task(subagent_type='ai-security-reviewer', prompt='full pre-impl TM for promotion of ${SLUG}')
    ;;
  commerce|web3|iot-embedded|regulated|fintech)
    echo "Archetype '$ARCHETYPE' requires full threat model."
    # Invoke /sec threat ${SLUG} (security-officer pre-impl mode)
    ;;
  *)
    echo "Threat model optional for archetype '$ARCHETYPE' — recommended if feature touches auth/payments/PII."
    ;;
esac

# Hard halt: TM file exists + Critical/High threats signed off (no __pending__)
if [ ! -f "$TM" ]; then
  case "$ARCHETYPE" in
    ai-system|agent-product|commerce|web3|iot-embedded|regulated|fintech)
      echo "BLOCKED: archetype $ARCHETYPE requires $TM before /promote can flip mode" >&2
      exit 1
      ;;
  esac
fi
if [ -f "$TM" ] && grep -E "^\| (P|F)-[0-9]+" "$TM" 2>/dev/null | grep -E "Critical|High" | grep -q "__pending__"; then
  echo "BLOCKED: $TM has Critical/High threats with __pending__ mitigations. Run security-officer post-impl review." >&2
  exit 1
fi
```

### Step 2b — AI prompts + evals (ai-system / agent-product only)

PoC mode allowed prompt sketches and 3 minimum EVAL scenarios. Production needs versioned prompts with sha256 + drift detection, plus full eval coverage (≥ 5 for ai-system, ≥ 10 for agent-product).

```bash
case "$ARCHETYPE" in
  ai-system|agent-product)
    # 1. Promote prompts to ADR-PROMPT files via ai-prompt-architect
    #    Task(subagent_type='ai-prompt-architect', prompt='audit and version all prompts for ${SLUG} promotion to ${TARGET}')
    PROMPT_ADRS=$(ls docs/decisions/ADR-*-PROMPT-*.md 2>/dev/null | wc -l | tr -d ' ')
    if [ "${PROMPT_ADRS:-0}" -lt 1 ]; then
      echo "BLOCKED: at least one ADR-PROMPT-*.md required for production. Invoke ai-prompt-architect." >&2
      exit 1
    fi

    # 2. Expand eval suite via ai-eval-engineer
    #    Task(subagent_type='ai-eval-engineer', prompt='expand PoC eval set to production coverage for ${SLUG}')
    EVAL_COUNT=$(find tests/eval -type f -name "EVAL-*.md" 2>/dev/null | wc -l | tr -d ' ')
    MIN=5
    [ "$ARCHETYPE" = "agent-product" ] && MIN=10
    if [ "${EVAL_COUNT:-0}" -lt "$MIN" ]; then
      echo "BLOCKED: production $ARCHETYPE requires ≥ $MIN EVAL files (have ${EVAL_COUNT:-0}). Invoke ai-eval-engineer." >&2
      exit 1
    fi

    # 3. monthly-budget-llm-usd must be set
    BUDGET=$(grep "^monthly-budget-llm-usd:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}' | tr -d '$')
    if [ -z "$BUDGET" ] || [ "$BUDGET" = "0" ]; then
      echo "BLOCKED: production AI archetype requires monthly-budget-llm-usd in PROJECT.md (got: '$BUDGET')" >&2
      exit 1
    fi
    ;;
esac
```

### Step 3 — SBOM

First production-bound SBOM for this code:

```bash
# Invoke /sec sbom — writes docs/releases/SBOM-<version>.json
```

Verify the SBOM has > 5 components (S1 anti-pattern check). If tool failed,
halt and tell CTO to install the archetype-appropriate SBOM tool.

### Step 3b — Compliance artefacts (v1.0.134)

For each value in `compliance: [...]` in PROJECT.md, verify the matching evidence artefact exists. PoC mode skipped these; production cannot.

```bash
COMPLIANCE_RAW=$(grep "^compliance:" .great_cto/PROJECT.md 2>/dev/null | sed 's/.*\[//;s/\].*//;s/,/ /g')
mkdir -p docs/compliance
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
    [ -f "$f" ] || { echo "BLOCKED: compliance:[$fw] requires $f for production. Template: skills/great_cto/templates/$(basename "$f")" >&2; exit 1; }
  done
done
```

### Step 4 — Cost model (if project_size ≥ medium)

```bash
PROJECT_SIZE=$(grep "^project_size:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
```

If `medium` or `large`, require `## Cost Model` section in the new ARCH.
Invoke `tech-lead` to add it if absent.

### Step 5 — Security officer review

Invoke `security-officer` agent with instruction:
"Review `ARCH-<slug>.md`, POC-<slug> code, and any threat model.
Produce CSO report at `docs/security/CSO-<slug>-<YYYY-MM-DD>.md`.
Focus: credentials handling (no hardcoded secrets from POC phase),
input validation on now-user-facing surfaces, authn/authz if added."

Verify CSO report is produced.

### Step 6 — Full QA pass

POC mode only ran smoke tests. Now:

- Invoke `qa-engineer` with instruction:
  "Run full QA on POC-<slug> code (now ARCH-<slug>). Coverage target from
  `.great_cto/PROJECT.md`. Test state coverage, error paths, concurrent
  access if relevant. Report at `docs/qa-reports/QA-<slug>-<YYYY-MM-DD>.md`."

Verify QA report, read verdict (PASS / FAIL).

### Step 7 — Formal gates

POC mode made gates advisory. Now create real blocking gates:

```bash
bd create gate:arch --priority 0 --labels "gate,arch" \
  --description "Promotion: approve ARCH-${SLUG}.md"
bd create gate:ship --priority 0 --labels "gate,ship" \
  --description "Promotion: approve production ship of ${SLUG}" \
  --blocked-by <arch-gate-id>
```

## Step 8 — Flip mode in PROJECT.md

Only after **all** previous steps pass:

```
mode: <target>  # was: poc
```

Remove `poc_slug:` and `poc_expires:` lines. Keep `poc_extended:` if present
(telemetry).

Move POC file:
```bash
mkdir -p docs/poc/promoted
mv "docs/poc/POC-${SLUG}.md" "docs/poc/promoted/"
# Append to promoted file: "Promoted to ${TARGET} on $(date +%Y-%m-%d) — see ARCH-${SLUG}.md"
```

## Step 9 — Append to Decision Log

```bash
mkdir -p docs/decisions
DEC_LOG="docs/decisions/DECISION-LOG.md"
[ ! -f "$DEC_LOG" ] && printf "# Decision Log\n\n" > "$DEC_LOG"
cat >> "$DEC_LOG" <<EOF

## D-$(date +%s) — Promoted POC-${SLUG} to ${TARGET}

Date: $(date +%Y-%m-%d)
Hypothesis validated: <copy from POC file>
Evidence: <POC-${SLUG}.md, promotion-audit artefacts>
Next: Open gate:arch and gate:ship from bd queue.
EOF
```

## Step 10 — Summary

```
✓ POC-<slug> promoted to <target>

Produced:
  - docs/architecture/ARCH-<slug>.md (full)
  - docs/sec-threats/TM-<slug>.md   (if required by archetype)
  - docs/releases/SBOM-<ver>.json
  - docs/security/CSO-<slug>-<date>.md
  - docs/qa-reports/QA-<slug>-<date>.md
  - Decision log entry D-<id>

Gates open (blocking):
  - gate:arch — approve ARCH
  - gate:ship — approve production deploy

PROJECT.md:
  - mode: <target> (was: poc)

Next: run /inbox to review gates.
```

## Failure modes

If any step fails (missing tool, agent blocked, test failure):
- **Do not** flip `mode:` to target.
- Leave `mode: poc` in place — POC remains active.
- Report the specific gap to the CTO.
- Offer to retry the failing step, or allow CTO to address manually.

The promotion audit is **all-or-nothing**. Partial promotion is how POC code
ends up in production without the safety rails. Prevent it.
