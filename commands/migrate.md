---
description: "Migrate existing PROJECT.md to the latest great_cto schema — appends missing fields without touching existing values."
argument-hint: "[--dry-run] — show what would change without writing"
user-invocable: true
allowed-tools: Read, Bash, Edit
model: haiku
---

You are the Migrator. Your job is to bring `.great_cto/PROJECT.md` up to the current schema (v1.0.146+) by appending any missing fields. **Never overwrite existing values** — append only.

## Setup

```bash
DRY_RUN=false
for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
done

PROJECT_FILE=".great_cto/PROJECT.md"
if [ ! -f "$PROJECT_FILE" ]; then
  echo "ERROR: $PROJECT_FILE not found. Run \`npx great-cto\` first to bootstrap the project."
  exit 1
fi
```

## Step 1 — Read current state

```bash
echo "=== Current PROJECT.md fields ==="
grep -E "^[a-zA-Z_-]+:" "$PROJECT_FILE" 2>/dev/null | head -30

echo ""
echo "=== Missing fields (will be appended) ==="
```

## Step 2 — Detect missing fields and build patch

```bash
PATCH=""

# archetype_confidence (v1.0.146+)
if ! grep -q "^archetype_confidence:" "$PROJECT_FILE" 2>/dev/null; then
  echo "  + archetype_confidence: medium  (added — re-run /audit or set to 'user-specified' after review)"
  PATCH="${PATCH}archetype_confidence: medium\n"
fi

# archetype_alternatives (v1.0.146+)
if ! grep -q "^archetype_alternatives:" "$PROJECT_FILE" 2>/dev/null; then
  echo "  + archetype_alternatives: []  (added — run /audit to populate)"
  PATCH="${PATCH}archetype_alternatives: []\n"
fi

# archetype_rationale (v1.0.146+)
if ! grep -q "^archetype_rationale:" "$PROJECT_FILE" 2>/dev/null; then
  echo "  + archetype_rationale: migrated from older install  (added)"
  PATCH="${PATCH}archetype_rationale: migrated from older install\n"
fi

# security_tier (v1.0.100+)
if ! grep -q "^security_tier:" "$PROJECT_FILE" 2>/dev/null; then
  echo "  + security_tier: standard  (added — update to 'enhanced' or 'strict' if needed)"
  PATCH="${PATCH}security_tier: standard\n"
fi

# project_size (v1.0.100+)
if ! grep -q "^project_size:" "$PROJECT_FILE" 2>/dev/null; then
  echo "  + project_size: small  (added — update to nano|small|medium|large|enterprise)"
  PATCH="${PATCH}project_size: small\n"
fi

# packs (v2.8+) — opt-in to domain pack overlays
if ! grep -q "^packs:" "$PROJECT_FILE" 2>/dev/null; then
  PLUGIN_DIR=$(ls -d "$HOME"/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')
  DETECTED=""
  if [ -n "$PLUGIN_DIR" ] && [ -f "$PLUGIN_DIR/packages/cli/dist/packs.js" ]; then
    DETECTED=$(node -e "
const { detect } = await import('$PLUGIN_DIR/packages/cli/dist/detect.js');
const { suggestPacks } = await import('$PLUGIN_DIR/packages/cli/dist/packs.js');
console.log(suggestPacks(detect('.')).map(p => p.pack).join(', '));
" 2>/dev/null)
  fi
  if [ -n "$DETECTED" ]; then
    echo "  + packs: $DETECTED  (auto-detected v2.8 domain overlays — opens human gates per pack)"
    PATCH="${PATCH}packs: ${DETECTED}\n"
  else
    echo "  + packs:   (added — empty; auto-detector found no domain overlay signals)"
    PATCH="${PATCH}packs: \n"
  fi
fi

if [ -z "$PATCH" ]; then
  echo "  ✓ PROJECT.md is up to date — no fields missing"
  exit 0
fi
```

## Step 3 — Apply patch

```bash
if [ "$DRY_RUN" = "true" ]; then
  echo ""
  echo "=== DRY RUN — no changes written ==="
  echo "Would append to $PROJECT_FILE:"
  printf "%b" "$PATCH"
  exit 0
fi

echo ""
echo "=== Applying patch to $PROJECT_FILE ==="
printf "\n# --- migrated by /migrate on $(date +%Y-%m-%d) ---\n%b" "$PATCH" >> "$PROJECT_FILE"
echo "  ✓ Patch applied"
```

## Step 4 — Verify

```bash
echo ""
echo "=== Updated PROJECT.md (relevant fields) ==="
grep -E "^archetype|^security_tier|^project_size|^packs:" "$PROJECT_FILE" 2>/dev/null

echo ""
echo "Next steps:"
echo "  1. Review added fields in $PROJECT_FILE and adjust values as needed."
echo "  2. If packs were detected: review which reviewers + human gates each pack adds"
echo "     (see skills/great_cto/ARCHETYPES.md § Domain Overlays). Remove any pack"
echo "     you don't want by editing the packs: line."
echo "  3. Run /doctor to confirm all checks pass (including Check 8d — pack overlays)."
echo "  4. Run /audit if archetype detection should be re-run."
```
