---
description: "Promote extracted incident knowledge into global patterns and agent improvements."
argument-hint: "[approve GP-NNNN | reject GP-NNNN <reason> | rollback GP-NNNN | prune | status]"
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---
<!-- great_cto-managed -->

You are the great_cto knowledge crystallization command. You read incident knowledge
extractions (KE files), promote them to global patterns (GP files), and propose
concrete improvements to agent workflow files. Human approves every agent change.

**Privacy rule:** GP files and proposals never contain project names, client names,
URLs, credentials, or identifying data. Generic technology descriptors only.
See `skills/great_cto/references/knowledge-extraction.md` for the full privacy checklist.

---

## Setup

```bash
KE_DIR=~/.great_cto/extractions
GP_DIR=~/.great_cto/global-patterns
PROPOSAL_DIR=~/.great_cto/proposals
METRICS_DIR=~/.great_cto/metrics

mkdir -p "$KE_DIR" "$GP_DIR" "$PROPOSAL_DIR" "$METRICS_DIR"

# Plugin dir (for agent files)
PLUGIN_DIR=$(find ~/.claude -name "ARCHETYPES.md" -path "*/great_cto/*" 2>/dev/null | sort -V | tail -1 | xargs dirname)
[ -z "$PLUGIN_DIR" ] && PLUGIN_DIR=$(dirname "$(find . .great_cto \
  -name "ARCHETYPES.md" 2>/dev/null | head -1)" 2>/dev/null)

TODAY=$(date +%Y-%m-%d)
```

---

## Dispatch by argument

```bash
ARG="${1:-status}"
case "$ARG" in
  approve)   SUBCOMMAND=approve; GP_ID="$2" ;;
  reject)    SUBCOMMAND=reject;  GP_ID="$2"; REASON="${@:3}" ;;
  rollback)  SUBCOMMAND=rollback; GP_ID="$2" ;;
  propose)   SUBCOMMAND=propose; GP_ID="$2" ;;   # NEW: Sprint 3 — PR-gate
  prune)     SUBCOMMAND=prune ;;
  status)    SUBCOMMAND=status ;;
  *)         SUBCOMMAND=review ;;  # default: show pending KEs + proposals
esac
```

---

## Subcommand: status / review (default)

Show all pending KE files not yet promoted + all proposals awaiting approval.

```bash
echo "=== CRYSTALLIZE STATUS ==="
echo ""

# Pending KE files
PENDING_KE=$(ls "$KE_DIR"/KE-*.yaml 2>/dev/null | while read f; do
  if ! grep -q "^promoted_to:" "$f" 2>/dev/null; then echo "$f"; fi
done)

KE_COUNT=$(echo "$PENDING_KE" | grep -c "." 2>/dev/null || echo 0)
echo "Pending extractions (KE): $KE_COUNT"
if [ "$KE_COUNT" -gt 0 ]; then
  echo "$PENDING_KE" | while read ke; do
    KE_ID=$(grep "^ke_id:" "$ke" | awk '{print $2}')
    AGENT=$(grep "^target_agent:" "$ke" | awk '{print $2}')
    CONF=$(grep "^confidence:" "$ke" | awk '{print $2}')
    ITER=$(grep "^  iterations:" "$ke" | awk '{print $2}')
    MTTR=$(grep "^mttr_reduction_estimate:" "$ke" | sed "s/mttr_reduction_estimate: //")
    echo "  • $KE_ID → $AGENT (confidence=$CONF iter=$ITER mttr_reduction=$MTTR)"
  done
fi

echo ""

# Pending proposals
PENDING_PROP=$(ls "$PROPOSAL_DIR"/PROPOSAL-*.md 2>/dev/null | while read f; do
  if grep -q "^Status: PENDING_APPROVAL" "$f" 2>/dev/null; then echo "$f"; fi
done)

PROP_COUNT=$(echo "$PENDING_PROP" | grep -c "." 2>/dev/null || echo 0)
echo "Pending proposals (GP): $PROP_COUNT"
if [ "$PROP_COUNT" -gt 0 ]; then
  echo "$PENDING_PROP" | while read prop; do
    GP_ID=$(grep "^GP_ID:" "$prop" | awk '{print $2}')
    TARGET=$(grep "^Target agent:" "$prop" | sed "s/Target agent: //")
    EVIDENCE=$(grep "^Evidence:" "$prop" | sed "s/Evidence: //")
    echo "  • $GP_ID → $TARGET — $EVIDENCE"
  done
  echo ""
  echo "Run: /crystallize approve <GP-ID> | /crystallize reject <GP-ID> <reason>"
fi

# Active pattern stats
ACTIVE=$(ls "$GP_DIR"/GP-*.md 2>/dev/null | \
  xargs grep -l "^status: active" 2>/dev/null | wc -l | tr -d ' ')
TOTAL_HITS=$(grep -rh "^hits:" "$GP_DIR" 2>/dev/null | \
  awk -F': ' '{sum+=$2} END{print sum+0}')
echo ""
echo "Active patterns: ${ACTIVE:-0} | Total hits: ${TOTAL_HITS:-0}"
echo "Run /crystallize (no args) to review, or /crystallize prune to archive stale patterns"
```

---

## Subcommand: review (promote KE → GP + generate proposals)

Run when there are pending KE files. For each qualifying KE:
1. Check noise filter (confidence + iterations thresholds)
2. Check deduplication (slug already in GP_DIR?)
3. Generate GP-NNNN file
4. Generate PROPOSAL-*.md with concrete agent diff

```bash
# Noise filter thresholds
MIN_ITERATIONS_MEDIUM=5   # medium confidence requires 5+ iterations
MIN_ITERATIONS_LOW=8      # low confidence requires 8+ iterations

echo "=== REVIEWING KE FILES ==="
echo ""

ls "$KE_DIR"/KE-*.yaml 2>/dev/null | while read ke_file; do
  # Skip already promoted
  grep -q "^promoted_to:" "$ke_file" 2>/dev/null && continue

  KE_ID=$(grep "^ke_id:" "$ke_file" | awk '{print $2}')
  CONFIDENCE=$(grep "^confidence:" "$ke_file" | awk '{print $2}')
  ITERATIONS=$(grep "^  iterations:" "$ke_file" | awk '{print $2}')
  IS_CANDIDATE=$(grep "^  pattern_candidate:" "$ke_file" | awk '{print $2}')
  TARGET_AGENT=$(grep "^target_agent:" "$ke_file" | awk '{print $2}')
  TARGET_SKILL=$(grep "^target_skill:" "$ke_file" | awk '{print $2}')
  SLUG=$(echo "$KE_ID" | sed 's/KE-[0-9-]*-//')

  # Validate routing: must have exactly one of target_agent / target_skill
  if [ -z "$TARGET_AGENT" ] && [ -z "$TARGET_SKILL" ]; then
    echo "  SKIP: KE has no target_agent or target_skill"; continue
  fi

  echo "Processing: $KE_ID"

  # Noise filter
  PROMOTE=false
  case "$CONFIDENCE" in
    high)   PROMOTE=true ;;
    medium) [ "${ITERATIONS:-0}" -ge "$MIN_ITERATIONS_MEDIUM" ] && PROMOTE=true ;;
    low)    [ "${ITERATIONS:-0}" -ge "$MIN_ITERATIONS_LOW" ] && PROMOTE=true ;;
  esac
  [ "$IS_CANDIDATE" != "true" ] && PROMOTE=false

  if [ "$PROMOTE" != "true" ]; then
    echo "  SKIP: below promotion threshold (confidence=$CONFIDENCE iter=$ITERATIONS)"
    continue
  fi

  # Deduplication — check if slug already in GP library
  EXISTING_GP=$(ls "$GP_DIR"/GP-*-"$SLUG".md 2>/dev/null | head -1)
  if [ -n "$EXISTING_GP" ]; then
    EXISTING_ID=$(grep "^id:" "$EXISTING_GP" | awk '{print $2}')
    echo "  DEDUP: slug '$SLUG' matches existing $EXISTING_ID — incrementing hits counter"
    CURRENT_HITS=$(grep "^hits:" "$EXISTING_GP" | awk '{print $2}')
    sed -i.bak "s/^hits: ${CURRENT_HITS}/hits: $((CURRENT_HITS+1))/" "$EXISTING_GP" 2>/dev/null
    sed -i.bak "s/^confidence: .*/confidence: validated/" "$EXISTING_GP" 2>/dev/null
    rm -f "${EXISTING_GP}.bak"
    printf "promoted_to: %s\n" "$EXISTING_ID" >> "$ke_file"
    echo "  MERGED into $EXISTING_ID (hits now $((CURRENT_HITS+1)))"
    continue
  fi

  # Assign new GP number
  LAST_NUM=$(ls "$GP_DIR"/GP-*.md 2>/dev/null | \
    grep -oE "GP-[0-9]+" | sort -V | tail -1 | grep -oE "[0-9]+")
  NEXT_NUM=$(printf "%04d" $((${LAST_NUM:-0} + 1)))
  GP_ID="GP-${NEXT_NUM}"
  GP_FILE="$GP_DIR/${GP_ID}-${SLUG}.md"

  # Extract fields from KE for GP file (read from YAML)
  SYMPTOM=$(grep -A3 "^  observable:" "$ke_file" | grep -v "observable:" | head -2 | tr -d '>' | xargs)
  STACK=$(grep "^  stack_fingerprint:" "$ke_file" | sed "s/.*: //")
  FIX=$(grep -A3 "^  fix:" "$ke_file" | grep -v "fix:" | head -2 | tr -d '>' | xargs)
  VERIFICATION=$(grep -A3 "^  verification:" "$ke_file" | grep -v "verification:" | head -2 | tr -d '>' | xargs)
  BREAKTHROUGH_TOOL=$(grep "^  breakthrough_tool:" "$ke_file" | awk '{print $2}')
  DETECTION_WORKED=$(grep "^  detection_method_that_worked:" "$ke_file" | awk '{print $2}')
  MTTR_EST=$(grep "^mttr_reduction_estimate:" "$ke_file" | sed "s/mttr_reduction_estimate: //")
  SOURCE_DATE=$(grep "^date:" "$ke_file" | awk '{print $2}')
  APPLIES_TO=$(grep -A5 "^  pattern_applies_to:" "$ke_file" | grep "^    -" | sed "s/    - //" | tr '\n' ',' | sed 's/,$//')

  # Write GP file (privacy-safe: no project names)
  cat > "$GP_FILE" <<GPEOF
---
id: ${GP_ID}
slug: ${SLUG}
status: active
version: 1
created: ${SOURCE_DATE}
last_validated: ${SOURCE_DATE}
source_ke: ${KE_ID}
target_agents: [${TARGET_AGENT}]
applies_to: [${APPLIES_TO}]
stack_fingerprint: ${STACK}
symptom: ${SYMPTOM}
detection_order:
  - ${BREAKTHROUGH_TOOL} — works where standard tools give false negatives
  - Check stack-specific configuration fields (see Fix below)
  - Standard diagnostic chain (only if the above are clean)
confidence: ${CONFIDENCE}
hits: 1
mttr_reduction: ${MTTR_EST}
---

### ${GP_ID} — $(echo "$SLUG" | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')

**Stack** — ${STACK}
**Tell** — ${SYMPTOM}
**Detection order (fastest to root cause)**
1. ${BREAKTHROUGH_TOOL} — this is what works; standard tools give false negatives
2. Check configuration fields specific to this stack (see Fix below)
3. Only if both clean → standard diagnostic chain

**False negatives** — ${DETECTION_WORKED} was the breakthrough; the following gave NO SIGNAL:
$(grep -A10 "^  detection_methods_that_failed:" "$ke_file" | grep "^    -" | sed "s/    - /- /")

**Why standard checks fail**
$(grep -A5 "^  why_standard_checks_missed_it:" "$ke_file" | grep -v "why_standard_checks_missed_it:" | tr -d '>' | xargs)

**Fix template**
${FIX}

**Verification**
${VERIFICATION}

**Applies to** — ${APPLIES_TO}

## Rejection history
<!-- populated by /crystallize reject -->

## Hit log
<!-- populated by SessionStart pattern matcher -->
${TODAY} — initial crystallization from ${KE_ID}
GPEOF

  echo "  CREATED: $GP_FILE"

  # Generate proposal
  PROPOSAL_FILE="$PROPOSAL_DIR/PROPOSAL-${GP_ID}.md"
  PROPOSED_CHANGE=$(grep -A5 "^proposed_change:" "$ke_file" | grep -v "proposed_change:" | tr -d '>' | xargs)
  TARGET_SECTION=$(grep "^target_section:" "$ke_file" | sed "s/target_section: //")

  # Routing line — agent OR skill
  if [ -n "$TARGET_SKILL" ]; then
    ROUTING_LINE="Target skill: ${TARGET_SKILL}"
  else
    ROUTING_LINE="Target agent: ${TARGET_AGENT}"
  fi

  cat > "$PROPOSAL_FILE" <<PROPEOF
# Agent Evolution Proposal — ${GP_ID}

Date: ${TODAY}
Source: ${KE_ID}
GP_ID: ${GP_ID}
${ROUTING_LINE}
Target section: ${TARGET_SECTION}
Status: PENDING_APPROVAL
Evidence: MTTR reduction ${MTTR_EST}, confidence=${CONFIDENCE}, iterations=${ITERATIONS:-?}

## Proposed change

${PROPOSED_CHANGE}

## Risk assessment

- Change is additive (new step before existing steps, not replacing them)
- Guarded by technology check (only activates when relevant stack detected)
- Rollback: \`/crystallize rollback ${GP_ID}\`

## Approve

  /crystallize approve ${GP_ID}

## Reject

  /crystallize reject ${GP_ID} <reason>
PROPEOF

  # Mark KE as promoted
  printf "promoted_to: %s\n" "$GP_ID" >> "$ke_file"
  echo "  PROPOSAL: $PROPOSAL_FILE"
  echo "  → Run: /crystallize approve $GP_ID"
done

# Update INDEX.md
echo "" > /tmp/gp_index_new.md
printf '# Global Pattern Index\n\nAuto-maintained by /crystallize. Do not edit manually.\n\n' > "$GP_DIR/INDEX.md"
printf '| ID | Slug | Status | Hits | Target | MTTR reduction |\n' >> "$GP_DIR/INDEX.md"
printf '|----|------|--------|------|--------|----------------|\n' >> "$GP_DIR/INDEX.md"
ls "$GP_DIR"/GP-*.md 2>/dev/null | while read f; do
  ID=$(grep "^id:" "$f" | awk '{print $2}')
  SLUG=$(grep "^slug:" "$f" | awk '{print $2}')
  STATUS=$(grep "^status:" "$f" | awk '{print $2}')
  HITS=$(grep "^hits:" "$f" | awk '{print $2}')
  TARGET=$(grep "^target_agents:" "$f" | sed "s/.*\[//;s/\].*//")
  MTTR=$(grep "^mttr_reduction:" "$f" | sed "s/.*: //")
  printf '| %s | %s | %s | %s | %s | %s |\n' "$ID" "$SLUG" "$STATUS" "$HITS" "$TARGET" "$MTTR"
done >> "$GP_DIR/INDEX.md"
echo "INDEX.md updated"
```

---

## Subcommand: approve GP-NNNN

Apply the proposed change. **Two target modes**:
- `Target agent: <name>` — pattern is matched at runtime via Step 0 Pattern Lookup (no file edit needed)
- `Target skill: <relative-path>` — pattern is **appended** to the skill doc as a new entry

```bash
# Find proposal
PROP_FILE=$(ls "$PROPOSAL_DIR"/PROPOSAL-"${GP_ID}".md 2>/dev/null | head -1)
if [ -z "$PROP_FILE" ]; then
  echo "ERROR: No proposal found for $GP_ID"
  exit 1
fi

grep -q "PENDING_APPROVAL" "$PROP_FILE" || { echo "ERROR: $GP_ID is not pending"; exit 1; }

# Detect target mode (agent vs skill)
TARGET_AGENT=$(grep "^Target agent:" "$PROP_FILE" 2>/dev/null | sed "s/Target agent: //")
TARGET_SKILL=$(grep "^Target skill:" "$PROP_FILE" 2>/dev/null | sed "s/Target skill: //")
GP_FILE=$(ls "$GP_DIR"/"${GP_ID}"-*.md 2>/dev/null | head -1)
PROPOSED_CHANGE=$(awk '/^## Proposed change/{f=1;next} /^## /{f=0} f' "$PROP_FILE" | sed '/^$/d' | head -10)

echo "=== APPROVING $GP_ID ==="

if [ -n "$TARGET_SKILL" ]; then
  # === SKILL TARGET ===
  SKILL_FILE="$PLUGIN_DIR/$TARGET_SKILL"
  [ ! -f "$SKILL_FILE" ] && SKILL_FILE="$TARGET_SKILL"
  if [ ! -f "$SKILL_FILE" ]; then
    echo "ERROR: Skill file not found: $TARGET_SKILL"
    exit 1
  fi
  echo "Target skill: $SKILL_FILE"
  echo "Proposed change:"
  echo "$PROPOSED_CHANGE"
  echo ""
  echo "Appending crystallized pattern to $SKILL_FILE..."

  # Append a new entry block at the end of the skill file with the proposed change
  cat >> "$SKILL_FILE" <<SKILLEOF

<!-- Crystallized from $GP_ID on $TODAY (source KE: $(grep "^source_ke:" "$GP_FILE" | awk '{print $2}')) -->
### Pattern $GP_ID — $(grep "^slug:" "$GP_FILE" | awk '{print $2}')

$PROPOSED_CHANGE

**Detection** — $(grep -A 2 "^detection_order:" "$GP_FILE" | grep "^  - " | head -1 | sed 's/^  - //')
**Fix** — $(grep "^fix:" "$GP_FILE" | sed 's/fix: //')
**Verification** — $(grep "^verification:" "$GP_FILE" | sed 's/verification: //')
**Source** — $GP_ID (confidence=$(grep "^confidence:" "$GP_FILE" | awk '{print $2}'), MTTR reduction $(grep "^mttr_reduction:" "$GP_FILE" | sed 's/mttr_reduction: //'))
SKILLEOF

  echo "  ✓ Skill file extended"
  TARGET_DESC="skill:$TARGET_SKILL"

  # Commit
  git -C "$PLUGIN_DIR" add "$SKILL_FILE" 2>/dev/null
  git -C "$PLUGIN_DIR" commit -m "feat(skill): crystallize ${GP_ID} into $(basename "$SKILL_FILE")" 2>/dev/null \
    && echo "  ✓ Committed to plugin repo"

elif [ -n "$TARGET_AGENT" ]; then
  # === AGENT TARGET ===
  AGENT_FILE="$PLUGIN_DIR/agents/${TARGET_AGENT}.md"
  [ ! -f "$AGENT_FILE" ] && AGENT_FILE="agents/${TARGET_AGENT}.md"
  if [ ! -f "$AGENT_FILE" ]; then
    echo "ERROR: Agent file not found: $TARGET_AGENT"
    exit 1
  fi
  echo "Target agent: $AGENT_FILE"
  echo "Proposed change:"
  echo "$PROPOSED_CHANGE"
  echo ""

  if grep -q "## Step 0: Pattern Lookup" "$AGENT_FILE" 2>/dev/null; then
    echo "  ✓ Step 0 present — $GP_ID will be matched at runtime via global-patterns dir"
  else
    echo "  ⚠ Step 0 not yet in $AGENT_FILE — run v1.0.113+ agent update first"
  fi
  TARGET_DESC="agent:$TARGET_AGENT"

  # Copy updated agent to ~/.claude/agents/
  cp "$AGENT_FILE" ~/.claude/agents/great_cto-${TARGET_AGENT}.md 2>/dev/null \
    && echo "  ✓ Agent file synced to ~/.claude/agents/"

else
  echo "ERROR: proposal has neither 'Target agent:' nor 'Target skill:' field"
  exit 1
fi

# Mark proposal approved
sed -i.bak "s/^Status: PENDING_APPROVAL/Status: APPROVED\nApproved: $TODAY/" "$PROP_FILE" 2>/dev/null
rm -f "${PROP_FILE}.bak"

# Update GP file last_validated
sed -i.bak "s/^last_validated: .*/last_validated: $TODAY/" "$GP_FILE" 2>/dev/null
rm -f "${GP_FILE}.bak"

# Log metric
printf '%s APPROVED %s target=%s\n' "$TODAY" "$GP_ID" "$TARGET_DESC" \
  >> "$METRICS_DIR/crystallize.log"

echo ""
echo "DONE: $GP_ID approved. Pattern is now active."
[ -n "$TARGET_AGENT" ] && echo "Next matching incident: Step 0 will surface it before investigation starts."
[ -n "$TARGET_SKILL" ] && echo "Skill doc updated; agents that read this skill will see the new pattern next session."
```

---

## Subcommand: reject GP-NNNN

```bash
PROP_FILE=$(ls "$PROPOSAL_DIR"/PROPOSAL-"${GP_ID}".md 2>/dev/null | head -1)
[ -z "$PROP_FILE" ] && echo "ERROR: No proposal for $GP_ID" && exit 1

sed -i.bak "s/^Status: PENDING_APPROVAL/Status: REJECTED\nRejected: $TODAY\nRejection reason: ${REASON}/" \
  "$PROP_FILE" 2>/dev/null && rm -f "${PROP_FILE}.bak"

GP_FILE=$(ls "$GP_DIR"/"${GP_ID}"-*.md 2>/dev/null | head -1)
if [ -n "$GP_FILE" ]; then
  # Record rejection in GP file
  cat >> "$GP_FILE" <<REJEOF

### Rejection — $TODAY
Reason: ${REASON}
Status: rolled back to archived after rejection.
REJEOF
  sed -i.bak "s/^status: active/status: rejected/" "$GP_FILE" 2>/dev/null
  rm -f "${GP_FILE}.bak"
fi

printf '%s REJECTED %s reason="%s"\n' "$TODAY" "$GP_ID" "$REASON" \
  >> "$METRICS_DIR/crystallize.log"

echo "DONE: $GP_ID rejected. Reason recorded. Pattern will not be injected."
```

---

## Subcommand: rollback GP-NNNN

```bash
GP_FILE=$(ls "$GP_DIR"/"${GP_ID}"-*.md 2>/dev/null | head -1)
TARGET_AGENT=$(grep "^target_agents:" "$GP_FILE" | sed "s/.*\[//;s/\].*//;s/ //g")

AGENT_FILE="$PLUGIN_DIR/agents/${TARGET_AGENT}.md"
COMMIT=$(git -C "$PLUGIN_DIR" log --oneline "$AGENT_FILE" 2>/dev/null | \
  grep "$GP_ID" | head -1 | awk '{print $1}')

if [ -n "$COMMIT" ]; then
  git -C "$PLUGIN_DIR" revert "$COMMIT" --no-edit 2>/dev/null && \
    echo "Reverted commit $COMMIT for $GP_ID"
  cp "$AGENT_FILE" ~/.claude/agents/great_cto-${TARGET_AGENT}.md 2>/dev/null
fi

sed -i.bak "s/^status: active/status: rolled-back/" "$GP_FILE" 2>/dev/null
rm -f "${GP_FILE}.bak"

printf '%s ROLLBACK %s target=%s commit=%s\n' "$TODAY" "$GP_ID" "$TARGET_AGENT" "${COMMIT:-no-commit}" \
  >> "$METRICS_DIR/crystallize.log"

echo "DONE: $GP_ID rolled back."
```

---

## Subcommand: propose GP-NNNN

**Sprint 3 — PR-gate for crystallize** (Hermes self-evolution pattern).

Creates a git branch `evolve/<agent>-<timestamp>`, applies the proposed agent
change, runs the EVAL suite for that agent to measure before/after improvement,
then opens a GitHub PR with the diff and score. Human review is mandatory —
this command never merges.

```bash
GP_FILE=$(ls "$GP_DIR"/"${GP_ID}"-*.md 2>/dev/null | head -1)
[ -z "$GP_FILE" ] && echo "ERROR: No GP file for $GP_ID" && exit 1

# Read the proposal details
TARGET_AGENT=$(grep "^target_agents:" "$GP_FILE" 2>/dev/null | sed 's/target_agents: \[//;s/\]//' | tr -d ' ' | cut -d, -f1)
TARGET_FILE=$(grep "^proposed-fix:" "$GP_FILE" 2>/dev/null | grep -oE '[a-zA-Z/_-]+\.md' | head -1)
[ -z "$TARGET_AGENT" ] && echo "ERROR: No target_agents in $GP_FILE" && exit 1

# Plugin source dir (the committed source, not the cache)
REPO_DIR=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
AGENT_SRC="$REPO_DIR/agents/${TARGET_AGENT}.md"
[ ! -f "$AGENT_SRC" ] && echo "ERROR: agent file not found: $AGENT_SRC" && exit 1
```

### 1. Measure baseline EVAL score (before)

```bash
EVAL_PATTERN="EVAL-${TARGET_AGENT}"
EVAL_COUNT=$(ls "$REPO_DIR/tests/eval/${EVAL_PATTERN}"*.md 2>/dev/null | wc -l | tr -d ' ')

if [ "$EVAL_COUNT" -gt 0 ] && [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "Running baseline eval for $TARGET_AGENT ($EVAL_COUNT files)..."
  BEFORE_SCORE=$(cd "$REPO_DIR" && node tests/eval/runner.mjs \
    --filter "$EVAL_PATTERN" --dry-run 2>/dev/null | grep "pass rate" | \
    grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "no-eval")
  echo "Baseline score: ${BEFORE_SCORE:-no-eval}"
else
  BEFORE_SCORE="no-eval"
  [ "$EVAL_COUNT" -eq 0 ] && echo "No EVAL files found for $TARGET_AGENT — run /gen-evals $TARGET_AGENT first for scored PRs"
fi
```

### 2. Create evolve branch and apply change

```bash
BRANCH="evolve/${TARGET_AGENT}-$(date +%Y%m%d-%H%M)"
cd "$REPO_DIR"
git checkout -b "$BRANCH" 2>&1

# The proposed change is described in the GP file — apply it
# For shape F (recurring tool failure), the proposed-fix: field has file:line
PROPOSED_FIX=$(grep "^Proposed-fix\|proposed-fix\|proposed_fix" "$GP_FILE" | head -1 | sed 's/.*: //')
echo ""
echo "Proposed fix from $GP_ID:"
echo "  $PROPOSED_FIX"
echo ""
echo "Apply the proposed change to $AGENT_SRC now."
echo "(Edit the file to implement the fix described above.)"
echo ""
echo "When done, press Enter to continue..."
```

You (the agent) must now apply the proposed change to `$AGENT_SRC`. Read the
`proposed-fix:` field from the GP file and make the minimal targeted edit
described. Do not expand scope — only the change stated in the GP.

### 3. Measure AFTER score

```bash
if [ -n "$ANTHROPIC_API_KEY" ] && [ "$EVAL_COUNT" -gt 0 ]; then
  echo "Running post-change eval..."
  AFTER_SCORE=$(cd "$REPO_DIR" && node tests/eval/runner.mjs \
    --filter "$EVAL_PATTERN" --dry-run 2>/dev/null | grep "pass rate" | \
    grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "no-eval")
else
  AFTER_SCORE="no-eval"
fi
echo "Before: ${BEFORE_SCORE} → After: ${AFTER_SCORE}"
```

### 4. Commit and open PR

```bash
git add "agents/${TARGET_AGENT}.md"
git commit -m "$(cat <<CMSG
evolve(${TARGET_AGENT}): apply ${GP_ID} — ${PROPOSED_FIX%%:*}

Pattern: $(grep '^## pattern:' "$GP_FILE" | sed 's/## pattern: //')
Confidence: $(grep '^confidence:' "$GP_FILE" | awk '{print $2}')
Occurrences: $(grep '^occurrences:' "$GP_FILE" | awk '{print $2}')
Eval before: ${BEFORE_SCORE} → after: ${AFTER_SCORE}
GP source: $GP_FILE
CMSG
)"

# Open PR (requires gh CLI)
PR_BODY="## Crystallize PR — $GP_ID

### Proposed change
\`\`\`
$PROPOSED_FIX
\`\`\`

### Pattern
$(grep -A5 '^## pattern:' "$GP_FILE" | head -6)

### Eval scores
| Agent | Before | After | Delta |
|-------|--------|-------|-------|
| $TARGET_AGENT | ${BEFORE_SCORE} | ${AFTER_SCORE} | $([ "$BEFORE_SCORE" != "no-eval" ] && echo "computed" || echo "no EVAL files — run /gen-evals $TARGET_AGENT") |

### Evidence
$(grep -A10 '^Evidence\|^\*\*Evidence' "$GP_FILE" | head -10)

### Review checklist
- [ ] Change is minimal and targeted (no scope creep)
- [ ] Agent still passes its core responsibility after change
- [ ] Proposed fix matches the pattern evidence
- [ ] EVAL scores improved or held (or no EVAL files exist yet)

**Gate: human approve required. Never merge this automatically.**

🤖 Generated by \`/crystallize propose $GP_ID\`"

git push -u origin "$BRANCH" 2>&1
gh pr create \
  --title "evolve(${TARGET_AGENT}): $GP_ID" \
  --body "$PR_BODY" \
  --label "evolve,needs-review" 2>&1 || \
  echo "gh CLI unavailable — push succeeded, open PR manually from branch $BRANCH"

printf '%s PROPOSED %s target=%s before=%s after=%s branch=%s\n' \
  "$(date +%Y-%m-%d)" "$GP_ID" "$TARGET_AGENT" \
  "${BEFORE_SCORE}" "${AFTER_SCORE}" "$BRANCH" \
  >> "$METRICS_DIR/crystallize.log"

echo ""
echo "DONE: Branch $BRANCH → PR opened. Human review required before merge."
echo "To reject: /crystallize reject $GP_ID <reason>"
echo "To approve and merge: review the PR, then: /crystallize approve $GP_ID"
```

---

## Subcommand: prune

Archive zero-hit patterns older than 90 days.

```bash
echo "=== PRUNING stale patterns ==="
NINETY_DAYS_AGO=$(date -v-90d +%Y-%m-%d 2>/dev/null || date -d "90 days ago" +%Y-%m-%d)
PRUNED=0

ls "$GP_DIR"/GP-*.md 2>/dev/null | while read f; do
  STATUS=$(grep "^status:" "$f" | awk '{print $2}')
  HITS=$(grep "^hits:" "$f" | awk '{print $2}')
  CREATED=$(grep "^created:" "$f" | awk '{print $2}')

  [ "$STATUS" != "active" ] && continue
  [ "${HITS:-0}" -gt 0 ] && continue
  [ "$CREATED" \> "$NINETY_DAYS_AGO" ] && continue

  GP_ID=$(grep "^id:" "$f" | awk '{print $2}')
  sed -i.bak "s/^status: active/status: archived/" "$f" 2>/dev/null
  rm -f "${f}.bak"
  echo "  ARCHIVED: $GP_ID (0 hits, created $CREATED)"
  PRUNED=$((PRUNED+1))
done

echo "Pruned: $PRUNED patterns archived (hits=0, age>90d)"
```
