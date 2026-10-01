---
description: "Before building on an unproven idea, get a timeboxed yes/no answer — start a hypothesis-driven POC that skips 80% of the production pipeline and forces ship/pivot/kill at expiry, then promote a shipped POC through the audits it skipped."
argument-hint: "[start] <hypothesis>  |  decide  |  extend <days>  |  status  |  promote <poc-slug> [mvp|production]"
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
model: sonnet
---

You are the great_cto POC-mode runner. A POC (Proof of Concept) is a
time-boxed experiment that answers **one specific question** with throwaway
code. Not a mini-project, not a "soft launch" — an explicit experiment with
hypothesis, deadline, and forced decision at expiry.

## Guard: great_cto not initialised

```bash
[ -f .great_cto/PROJECT.md ] || { echo "No PROJECT.md found. Run /start first, then /poc."; exit 0; }
```

## Sub-command dispatch

Parse `$1` as the sub-command. Supported forms:

- `/poc start <hypothesis>` → **new POC**; `/poc <hypothesis>` is the same (anything that's not a reserved keyword)
- `/poc decide` → ritual decision at expiry
- `/poc extend <days>` → extend timebox once (max 1 extension)
- `/poc status` → show current POC state (also bare `/poc`)
- `/poc promote <poc-slug> [mvp|production]` → promotion audit for a shipped POC

```bash
SUB="$1"
case "$SUB" in
  start)    ACTION=start;   shift; HYPOTHESIS="$*" ;;
  decide)   ACTION=decide ;;
  extend)   ACTION=extend ;;                 # $2 = days
  status|"") ACTION=status ;;
  promote)  ACTION=promote; shift ;;         # now $1 = slug, $2 = mvp|production
  *)        ACTION=start;   HYPOTHESIS="$*" ;;  # `/poc <hypothesis>` = `/poc start <hypothesis>`
esac
```

---

## Action: start — new POC

Triggered by `/poc start <hypothesis>`, or by `/poc <hypothesis>` when `$1` is not
`decide`, `extend`, `status` or `promote`. The rest of the input is the hypothesis
string (`$HYPOTHESIS`).

### Step 1 — Check for active POC

```bash
ACTIVE=$(grep "^mode:\s*poc" .great_cto/PROJECT.md 2>/dev/null)
if [ -n "$ACTIVE" ]; then
  SLUG=$(grep "^poc_slug:" .great_cto/PROJECT.md | awk '{print $2}')
  EXPIRES=$(grep "^poc_expires:" .great_cto/PROJECT.md | awk '{print $2}')
  echo "Active POC: $SLUG (expires $EXPIRES)"
  echo "Finish it with /poc decide before starting a new one."
  exit 0
fi
```

If an active POC exists, **refuse**. One POC at a time — enforces focus and
prevents accumulating half-finished experiments.

### Step 2 — Gather POC frame interactively

**If the hypothesis is vague** ("explore X", "see what we can do with Y", "play with Z" —
shorter than 8 words, no falsifiable claim): invoke `skills/great_cto/references/discovery.md`
first. Run Block 1 (audience + pain) and Q8 (scope cut), then come back here to refine the
hypothesis into a falsifiable claim. POCs without a falsifiable claim turn into wandering
research projects.

Ask the CTO **four short questions** (don't skip any — these are the guardrails):

1. **Hypothesis** — already captured as `$HYPOTHESIS`. Rephrase it as a falsifiable
   yes/no claim. Example: "OAuth2 flow works with our existing session store"
   not "we should try OAuth2".
2. **Success criteria** — observable, binary, verifiable by a human in <5 min.
   Example: "user can log in + session persists across 3 restarts".
3. **Timebox** — 1 / 3 / 7 / 14 days. **Reject anything > 14 days** — if it
   needs more, it's not a POC, it's a feature. Start with `/start` or create
   an ARCH instead.
4. **Out of scope** — 3 things you're **deliberately** not building. This is
   the most important field. Without it, POC scope drifts into production work.

Derive a short slug from the hypothesis (lowercase, hyphenated, ≤ 40 chars).

### Step 3 — Write POC-<slug>.md

```bash
mkdir -p docs/poc
POC_FILE="docs/poc/POC-${SLUG}.md"
EXPIRES=$(date -v +${DAYS}d +%Y-%m-%d 2>/dev/null || date -d "+${DAYS} days" +%Y-%m-%d)
```

Write to `$POC_FILE`:

```markdown
# POC-<slug> — <short title derived from hypothesis>

**Status**: Active
**Hypothesis**: <one sentence, falsifiable yes/no>
**Success criteria**:
- <observable criterion 1>
- <observable criterion 2>

**Timebox**: <N> days  |  Started: <YYYY-MM-DD>  |  Expires: <YYYY-MM-DD>

## Out of scope
- <thing 1 deliberately not built>
- <thing 2>
- <thing 3>

## Daily log
_Append one line per working day. Format: YYYY-MM-DD — signal / blocker._

- <start-date> — POC started

## Evidence
_Attach or link: screenshots, terminal transcripts, small code snippets,
external benchmarks. Evidence that the hypothesis is confirmed or refuted._

## Decision
_Filled in by /poc decide at expiry. Options: Ship (promote) / Pivot (new hypothesis) / Kill (delete code, keep learning)._

- [ ] Ship → `/poc promote <slug>`
- [ ] Pivot → `/poc "<new hypothesis>"` (kill this first)
- [ ] Kill — learning captured below
```

### Step 4 — Patch PROJECT.md

Add these lines under `## Type` section (or update if present):

```
mode: poc
poc_slug: <slug>
poc_expires: <YYYY-MM-DD>
```

If the `## Type` section already has a `mode:` field, update in place.

### Step 5 — Confirm

```
✓ POC started: POC-<slug>
  Hypothesis: <one sentence>
  Expires: <date> (<N> days)
  Out of scope: <comma-separated>

Agents will now run in POC mode — threat-model, SBOM, cost-model,
formal gates, and pentest scans are SKIPPED. QA runs smoke tests only.
See skills/great_cto/references/poc-mode.md for the full skip matrix.

When timebox hits, run /poc decide.
```

---

## Action: decide

Triggered by `/poc decide`. Walks the CTO through the ship/pivot/kill ritual.

### Step 1 — Load POC state

```bash
SLUG=$(grep "^poc_slug:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
[ -z "$SLUG" ] && { echo "No active POC. Start one with /poc <hypothesis>."; exit 0; }
POC_FILE="docs/poc/POC-${SLUG}.md"
EXPIRES=$(grep "^poc_expires:" .great_cto/PROJECT.md | awk '{print $2}')
TODAY=$(date +%Y-%m-%d)
```

Read `$POC_FILE` — show the CTO the hypothesis, success criteria, and daily log.

### Step 2 — Evaluate success criteria

Ask the CTO — one by one — for each success criterion:

```
Criterion 1: <criterion text>
  Met? [yes/no/partial]  Evidence?
```

Do **not** accept hand-waving. If evidence is "feels right" push back: "What
specifically did you observe? A log line? A screenshot? A timing number?"

Count: met / not met / partial. No pass unless **all** criteria are `met`.

### Step 3 — Present decision

Based on evaluation, guide the CTO to one of three paths:

**SHIP** (all criteria met, team wants to build on this):
```
→ Run /poc promote <slug> to begin promotion audit
  (fills in ARCH, threat-model if needed, SBOM, cost-model, CSO)
```

**PIVOT** (some criteria met, hypothesis needs reshaping):
```
→ Refine the hypothesis and start a new POC:
  /poc "<refined hypothesis>"
  This POC will be archived; no promotion audit.
```

**KILL** (criteria not met, not worth continuing):
```
→ Archive this POC; delete the code branch if separate.
  Capture the learning below.
```

### Step 4 — Capture learning (mandatory)

Regardless of path, ask:

> "One sentence: what did we learn? (this goes to lessons.md)"

Append to `.great_cto/lessons.md`:

```
<YYYY-MM-DD> | poc | <slug> | <one-sentence learning> | <ship|pivot|kill>
```

### Step 5 — Update POC file and PROJECT.md

- Mark POC file `**Status**: Shipped` / `Pivoted` / `Killed`
- Check appropriate box in Decision section
- Append learning to "## Decision" block

If **SHIP**:
- Keep `mode: poc` in PROJECT.md (will flip when `/poc promote` completes)
- Print: `Run /poc promote <slug> now`

If **PIVOT** or **KILL**:
- Remove `mode:`, `poc_slug:`, `poc_expires:` from PROJECT.md
- For KILL: remind CTO to delete the POC code branch (don't delete it automatically — destructive action)

---

## Action: extend

Triggered by `/poc extend <days>`.

```bash
EXT_DAYS="$2"
[ -z "$EXT_DAYS" ] && { echo "Usage: /poc extend <days>"; exit 0; }
if [ "$EXT_DAYS" -gt 7 ]; then
  echo "Extensions capped at 7 days. If you need more, the POC failed its timebox — /poc decide instead."
  exit 0
fi
# Check if already extended
ALREADY=$(grep "^poc_extended:" .great_cto/PROJECT.md 2>/dev/null)
if [ -n "$ALREADY" ]; then
  echo "This POC has already been extended once. No second extension — /poc decide."
  exit 0
fi
```

Max **1** extension, max **7** days. Then:
- Update `poc_expires:` in PROJECT.md
- Add `poc_extended: yes` (single-use flag)
- Append to POC file daily log: `<date> — extended by <N> days, new expiry <date>`
- Print confirmation

---

## Action: status

Triggered by `/poc status` — or automatic if `mode: poc` and CTO runs `/poc` with no args.

```
POC-<slug> — <title>
  Hypothesis: <...>
  Timebox: <N> days  |  Expires: <date> (<M> days remaining)
  Criteria met so far: <auto-count from daily log, or "—" if nothing recorded>
  Out of scope: <...>

  Next: <if expiring today/past, "/poc decide" | else "keep running, /poc decide on <date>">
```

---

## Action: promote — POC to MVP/production

This is the promotion audit. When a POC has shipped
(`/poc decide → SHIP`), `/poc promote <slug>` runs the audits that POC mode
skipped — turning throwaway POC code into production-grade work.

### Guard: target POC exists and is marked Shipped

```bash
SLUG="$1"
TARGET="${2:-production}"
[ -z "$SLUG" ] && { echo "Usage: /poc promote <poc-slug> [mvp|production]"; exit 0; }
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

### Promotion audit — run in order

The promotion audit fills in what POC mode skipped. Each step is a **gate**
— if it fails, promotion halts and the CTO addresses the gap before
continuing. Do not silently pass.

#### Step 1 — Full ARCH document

POC mode allowed a 1-pager. Production requires a full ARCH.

- Invoke `architect` agent via Agent tool with instruction:
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

#### Step 2 — Threat model (archetype-aware, v1.0.134)

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
      echo "BLOCKED: archetype $ARCHETYPE requires $TM before /poc promote can flip mode" >&2
      exit 1
      ;;
  esac
fi
if [ -f "$TM" ] && grep -E "^\| (P|F)-[0-9]+" "$TM" 2>/dev/null | grep -E "Critical|High" | grep -q "__pending__"; then
  echo "BLOCKED: $TM has Critical/High threats with __pending__ mitigations. Run security-officer post-impl review." >&2
  exit 1
fi
```

#### Step 2b — AI prompts + evals (ai-system / agent-product only)

PoC mode allowed prompt sketches and 3 minimum EVAL scenarios. Production needs versioned prompts with sha256 + drift detection, plus full eval coverage (≥ 5 for ai-system, ≥ 10 for agent-product).

```bash
case "$ARCHETYPE" in
  ai-system|agent-product)
    # 1. Promote prompts to ADR-PROMPT files via ai-prompt-architect
    #    Task(subagent_type='ai-prompt-architect', prompt='audit and version all prompts for ${SLUG} promotion to ${TARGET}')
    PROMPT_ADRS=$(ls docs/adr/ADR-*-PROMPT-*.md 2>/dev/null | wc -l | tr -d ' ')
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

#### Step 3 — SBOM

First production-bound SBOM for this code:

```bash
# Invoke /sec sbom — writes docs/releases/SBOM-<version>.json
```

Verify the SBOM has > 5 components (S1 anti-pattern check). If tool failed,
halt and tell CTO to install the archetype-appropriate SBOM tool.

#### Step 3b — Compliance artefacts (v1.0.134)

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

#### Step 4 — Cost model (if project_size ≥ medium)

```bash
PROJECT_SIZE=$(grep "^project_size:" .great_cto/PROJECT.md 2>/dev/null | awk '{print $2}')
```

If `medium` or `large`, require `## Cost Model` section in the new ARCH.
Invoke `architect` to add it if absent.

#### Step 5 — Security officer review

Invoke `security-officer` agent with instruction:
"Review `ARCH-<slug>.md`, POC-<slug> code, and any threat model.
Produce CSO report at `docs/security/CSO-<slug>-<YYYY-MM-DD>.md`.
Focus: credentials handling (no hardcoded secrets from POC phase),
input validation on now-user-facing surfaces, authn/authz if added."

Verify CSO report is produced.

#### Step 6 — Full QA pass

POC mode only ran smoke tests. Now:

- Invoke `qa-engineer` with instruction:
  "Run full QA on POC-<slug> code (now ARCH-<slug>). Coverage target from
  `.great_cto/PROJECT.md`. Test state coverage, error paths, concurrent
  access if relevant. Report at `docs/qa-reports/QA-<slug>-<YYYY-MM-DD>.md`."

Verify QA report, read verdict (PASS / FAIL).

#### Step 7 — Formal gates

POC mode made gates advisory. Now create real blocking gates:

```bash
bd create gate:arch --priority 0 --labels "gate,arch" \
  --description "Promotion: approve ARCH-${SLUG}.md"
bd create gate:ship --priority 0 --labels "gate,ship" \
  --description "Promotion: approve production ship of ${SLUG}" \
  --blocked-by <arch-gate-id>
```

### Step 8 — Flip mode in PROJECT.md

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

### Step 9 — Append to Decision Log

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

### Step 10 — Summary

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

### Failure modes

If any step fails (missing tool, agent blocked, test failure):
- **Do not** flip `mode:` to target.
- Leave `mode: poc` in place — POC remains active.
- Report the specific gap to the CTO.
- Offer to retry the failing step, or allow CTO to address manually.

The promotion audit is **all-or-nothing**. Partial promotion is how POC code
ends up in production without the safety rails. Prevent it.

---

## Principles

1. **One POC at a time** — multi-tasking POCs is how they all fail.
2. **Hard expiry** — no open-ended experiments. Extensions capped at 1×7d.
3. **Observable criteria** — "feels right" is not a criterion.
4. **Forced decision** — every POC ends with ship/pivot/kill, no drift.
5. **Learning always captured** — even (especially) for killed POCs.
6. **Promotion required** — POC code can NEVER become production without `/poc promote`.

See `skills/great_cto/references/poc-mode.md` for the agent-side skip matrix
(which steps architect / senior-dev / qa-engineer / security-officer drop in
POC mode) and the promotion audit flow.
