#!/usr/bin/env bash
# skill-discover.sh — scan all 4 skill tiers, emit ~/.great_cto/skills-registry.json
#
# Tiers:
#   1. great_cto built-in (packs, templates, references)
#   2. external dependencies (superpowers, anthropic-skills, beads)
#   3. personal repo (avelikiy/ai-agent-skills or override)
#   4. on-demand (Template Bridge — not enumerated, just noted)
#
# Run via SessionStart hook (24h cache) or manually via `/doctor skills --refresh`.

set -euo pipefail

REGISTRY="${HOME}/.great_cto/skills-registry.json"
mkdir -p "$(dirname "$REGISTRY")"

PLUGIN_DIR=$(ls -d "$HOME/.claude/plugins/cache/local/great_cto/"*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')

# Helper: emit one registry entry as JSON-line (pre-comma-stripped)
emit_entry() {
  local name="$1" source="$2" path="$3" summary="$4"
  # Escape quotes in summary
  summary=$(printf '%s' "$summary" | sed 's/"/\\"/g' | tr -d '\n' | head -c 200)
  printf '    {"name":"%s","source":"%s","path":"%s","summary":"%s"}' "$name" "$source" "$path" "$summary"
}

# Helper: extract description for catalog browsing (≤200 chars).
# Tries in order: frontmatter `description:`, frontmatter `summary:`,
# first non-empty paragraph after frontmatter, first sentence of body.
get_summary() {
  local file="$1"
  local desc

  # 1. frontmatter description (most reliable)
  desc=$(awk '/^---$/{c++; next} c==1 && /^description:/{sub(/^description:[[:space:]]*/,""); print; exit}' "$file" 2>/dev/null)
  if [ -n "$desc" ]; then
    printf '%s' "$desc" | head -c 200
    return
  fi

  # 2. frontmatter summary or when_to_use
  desc=$(awk '/^---$/{c++; next} c==1 && (/^summary:/ || /^when_to_use:/){sub(/^[a-z_]+:[[:space:]]*/,""); print; exit}' "$file" 2>/dev/null)
  if [ -n "$desc" ]; then
    printf '%s' "$desc" | head -c 200
    return
  fi

  # 3. First text line after the SECOND --- (end of frontmatter)
  # OR first text line if no frontmatter at all
  desc=$(awk '
    BEGIN { in_fm=0; saw_close=0 }
    /^---$/ { in_fm = !in_fm; if(!in_fm) saw_close=1; next }
    in_fm { next }
    /^[[:space:]]*$/ { next }
    /^#/ { next }
    /^>/ { next }
    /^[A-Za-z]/ { print; exit }
  ' "$file" 2>/dev/null | head -c 200)
  if [ -n "$desc" ]; then
    printf '%s' "$desc"
    return
  fi

  # 4. Quote-block (often the "what this is" line)
  desc=$(awk '/^>[[:space:]]+\*\*/{sub(/^>[[:space:]]+\*\*[^:*]+\*\*[[:space:]]*/,""); sub(/[[:space:]]*\*\*$/,""); print; exit}' "$file" 2>/dev/null | head -c 200)
  printf '%s' "$desc"
}

# ── Tier 1: great_cto built-in ────────────────────────────────────────────
T1=()
if [ -n "$PLUGIN_DIR" ] && [ -d "$PLUGIN_DIR" ]; then
  for f in "$PLUGIN_DIR"/skills/great_cto/packs/*.md \
           "$PLUGIN_DIR"/skills/great_cto/templates/*.md \
           "$PLUGIN_DIR"/skills/great_cto/references/*.md; do
    [ -f "$f" ] || continue
    name=$(basename "$f" .md)
    summary=$(get_summary "$f")
    type=$(basename "$(dirname "$f")")
    T1+=("$(emit_entry "$name" "great_cto:$type" "$f" "$summary")")
  done
fi

# ── Tier 2: external dependencies ─────────────────────────────────────────
T2=()

# superpowers (declared dep, lives in marketplace cache)
SUPERPOWERS_DIR=$(find "$HOME/.claude/plugins" -type d -path "*/superpowers/skills" 2>/dev/null | head -1)
if [ -n "$SUPERPOWERS_DIR" ]; then
  for skill_dir in "$SUPERPOWERS_DIR"/*/; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    name=$(basename "$skill_dir")
    summary=$(get_summary "$skill_dir/SKILL.md")
    T2+=("$(emit_entry "superpowers:$name" "obra/superpowers" "$skill_dir/SKILL.md" "$summary")")
  done
fi

# anthropic-skills (cloned to ~/.great_cto/anthropic-skills by SessionStart hook)
ANTHROPIC_DIR="$HOME/.great_cto/anthropic-skills"
if [ -d "$ANTHROPIC_DIR" ]; then
  while IFS= read -r f; do
    name=$(basename "$(dirname "$f")")
    summary=$(get_summary "$f")
    T2+=("$(emit_entry "anthropic:$name" "anthropics/skills" "$f" "$summary")")
  done < <(find "$ANTHROPIC_DIR" -name "SKILL.md" 2>/dev/null | head -100)
fi

# beads
BEADS_DIR=$(find "$HOME/.claude/plugins" -type d -name "beads" 2>/dev/null | head -1)
if [ -n "$BEADS_DIR" ] && [ -d "$BEADS_DIR/skills" ]; then
  for skill_dir in "$BEADS_DIR/skills"/*/; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    name=$(basename "$skill_dir")
    summary=$(get_summary "$skill_dir/SKILL.md")
    T2+=("$(emit_entry "beads:$name" "steveyegge/beads" "$skill_dir/SKILL.md" "$summary")")
  done
fi

# ── Tier 3: personal repo ─────────────────────────────────────────────────
T3=()
PERSONAL_DIR="${GREAT_CTO_PERSONAL_SKILLS:-$HOME/.great_cto/personal-skills}"
if [ -d "$PERSONAL_DIR/skills" ]; then
  for skill_dir in "$PERSONAL_DIR/skills"/*/; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    name=$(basename "$skill_dir")
    summary=$(get_summary "$skill_dir/SKILL.md")
    T3+=("$(emit_entry "personal:$name" "personal/$(basename "$PERSONAL_DIR")" "$skill_dir/SKILL.md" "$summary")")
  done
fi

# ── Archetype packs auto-load map ─────────────────────────────────────────
read -r -d '' ARCHETYPE_PACKS <<'JSON' || true
  "ai-system":         ["agent-pack", "ai-pack", "ARCH-ai", "THREAT-MODEL-AI", "ADR-LLM", "ADR-PROMPT", "EVAL-template"],
  "agent-product":     ["agent-pack", "ARCH-ai", "THREAT-MODEL-AI", "ADR-LLM", "ADR-PROMPT", "EVAL-template"],
  "commerce":          ["commerce-pack", "ARCH-default", "PCI-DSS-SAQ-A", "PCI-DSS-SAQ-D"],
  "web3":              ["web3-pack", "ARCH-defi-protocol"],
  "browser-extension": ["browser-extension-pack", "ARCH-browser-extension", "THREAT-MODEL-AI"],
  "game":              ["game-pack", "ARCH-game"],
  "regulated":         ["enterprise-pack", "DORA-ICT-risk-assessment", "DORA-third-party-register", "NIS2-article21-controls", "21CFR11-checklist", "TISAX-VDA-ISA-results", "ISO27001-SoA", "SOX-ITGC-checklist"],
  "iot-embedded":      ["ARCH-default"],
  "data-platform":     ["data-pack", "ARCH-default"],
  "infra":             ["infra-pack", "ARCH-default"],
  "library":           ["library-pack", "ARCH-default"],
  "web-service":       ["web-pack", "ARCH-default"],
  "mobile-app":        ["mobile-pack", "ARCH-default"],
  "devtools":          ["devtools-pack", "ARCH-default"]
JSON

# ── Per-(agent × archetype) skill suggestions ─────────────────────────────
# Logic: archetype determines which agents run; each agent picks skills from
# this map based on its role + project archetype. Agent Step 0 consults the
# matching list and decides which to Read.
read -r -d '' AGENT_SKILLS <<'JSON' || true
  "tech-lead": {
    "_default":          ["pre-mortem", "risk-register", "vendors", "cost-model", "anti-patterns"],
    "ai-system":         ["+ARCH-ai", "+ai-pack", "+secure-sdlc"],
    "agent-product":     ["+ARCH-ai", "+agent-pack", "+secure-sdlc"],
    "commerce":          ["+ARCH-default", "+commerce-pack", "+secure-sdlc"],
    "web3":              ["+ARCH-defi-protocol", "+web3-pack"],
    "browser-extension": ["+ARCH-browser-extension", "+browser-extension-pack"],
    "game":              ["+ARCH-game", "+game-pack"],
    "regulated":         ["+ARCH-default", "+enterprise-pack", "+secure-sdlc"]
  },
  "senior-dev": {
    "_default":          ["superpowers:test-driven-development", "knowledge-extraction", "poc-mode"],
    "ai-system":         ["+agent-pack", "+ADR-LLM", "+ADR-PROMPT"],
    "agent-product":     ["+agent-pack", "+ADR-LLM", "+ADR-PROMPT"],
    "commerce":          ["+commerce-pack"],
    "web3":              ["+web3-pack"],
    "browser-extension": ["+browser-extension-pack"]
  },
  "qa-engineer": {
    "_default":          ["agent-style", "knowledge-extraction"],
    "ai-system":         ["+EVAL-template", "+ai-pack"],
    "agent-product":     ["+EVAL-template", "+agent-pack"],
    "commerce":          ["+commerce-pack"],
    "web3":              ["+web3-pack"]
  },
  "security-officer": {
    "_default":          ["security-tiers", "secure-sdlc", "agent-security", "pre-mortem", "risk-register", "vendors", "waivers"],
    "ai-system":         ["+THREAT-MODEL-AI", "+agent-pack"],
    "agent-product":     ["+THREAT-MODEL-AI", "+agent-pack"],
    "commerce":          ["+PCI-DSS-SAQ-A", "+commerce-pack"],
    "web3":              ["+web3-pack"],
    "browser-extension": ["+THREAT-MODEL-AI", "+browser-extension-pack"],
    "regulated":         ["+enterprise-pack", "+DORA-ICT-risk-assessment", "+NIS2-article21-controls"]
  },
  "devops": {
    "_default":          ["reliability", "secure-sdlc", "poc-mode", "waivers"]
  },
  "l3-support": {
    "_default":          ["incident-patterns", "reliability", "grafana-ops", "anti-patterns", "knowledge-extraction"]
  },
  "project-auditor": {
    "_default":          ["agent-style", "knowledge-extraction", "onboarding"],
    "ai-system":         ["+agent-pack"],
    "agent-product":     ["+agent-pack"]
  },
  "ai-prompt-architect": {
    "_default":          ["ADR-PROMPT", "ai-pack", "agent-pack"]
  },
  "ai-eval-engineer": {
    "_default":          ["EVAL-template", "ai-pack", "agent-pack", "superpowers:test-driven-development"]
  },
  "ai-security-reviewer": {
    "_default":          ["THREAT-MODEL-AI", "agent-pack", "ai-pack", "agent-security"]
  },
  "web-store-reviewer": {
    "_default":          ["browser-extension-pack", "THREAT-MODEL-AI"]
  }
JSON

# ── Build registry JSON ───────────────────────────────────────────────────
{
  echo "{"
  printf '  "discovered_at": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "plugin_version": "%s",\n' "$(grep '"version"' "$PLUGIN_DIR/.claude-plugin/plugin.json" 2>/dev/null | head -1 | awk -F'"' '{print $4}' || echo unknown)"
  printf '  "tier1_great_cto": [\n'
  if [ "${#T1[@]}" -gt 0 ]; then
    printf '%s' "${T1[0]}"
    for entry in "${T1[@]:1}"; do printf ',\n%s' "$entry"; done
    printf '\n'
  fi
  printf '  ],\n'
  printf '  "tier2_external": [\n'
  if [ "${#T2[@]}" -gt 0 ]; then
    printf '%s' "${T2[0]}"
    for entry in "${T2[@]:1}"; do printf ',\n%s' "$entry"; done
    printf '\n'
  fi
  printf '  ],\n'
  printf '  "tier3_personal": [\n'
  if [ "${#T3[@]}" -gt 0 ]; then
    printf '%s' "${T3[0]}"
    for entry in "${T3[@]:1}"; do printf ',\n%s' "$entry"; done
    printf '\n'
  fi
  printf '  ],\n'
  printf '  "archetype_packs": {\n%s\n  },\n' "$ARCHETYPE_PACKS"
  printf '  "agent_skills": {\n%s\n  }\n' "$AGENT_SKILLS"
  echo "}"
} > "$REGISTRY"

# ── Summary to stdout ─────────────────────────────────────────────────────
echo "Skills registry written: $REGISTRY"
echo "  tier1 (great_cto built-in): ${#T1[@]} skills"
echo "  tier2 (external deps):      ${#T2[@]} skills"
echo "  tier3 (personal):           ${#T3[@]} skills"
[ "${#T3[@]}" -eq 0 ] && [ ! -d "$PERSONAL_DIR" ] && \
  echo "  ⚠ tier3 not configured. Set up: gh repo create avelikiy/ai-agent-skills, then SessionStart will clone it."
