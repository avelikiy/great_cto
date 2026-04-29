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

: "${PLUGIN_DIR:=$(ls -d "$HOME/.claude/plugins/cache/local/great_cto/"*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')}"

# Helper: emit one registry entry as JSON-line (pre-comma-stripped)
# Truncate summary to 280 chars at word boundary (no mid-word cut).
# Compute quality_score (0-100) from frontmatter completeness + body length.
emit_entry() {
  local name="$1" source="$2" path="$3" summary="$4"
  summary=$(printf '%s' "$summary" | sed 's/"/\\"/g' | tr -d '\n')
  if [ "${#summary}" -gt 280 ]; then
    summary=$(printf '%s' "$summary" | head -c 280 | sed 's/ [^ ]*$//')…
  fi

  # Quality scoring (v1.0.144+):
  #   30pt — frontmatter present (--- ... --- block)
  #   20pt — `description:` field present + ≥ 30 chars
  #   15pt — `when_to_use:` OR `summary:` field present
  #   15pt — `applies_to:` field present (archetype tags)
  #   10pt — body has ≥ 50 lines
  #   10pt — file size ≥ 2 KB (substantive content)
  local score=0
  if head -1 "$path" 2>/dev/null | grep -q "^---$"; then score=$((score + 30)); fi
  local desc=$(awk '/^---$/{c++; next} c==1 && /^description:/{sub(/^description:[[:space:]]*/,""); print; exit}' "$path" 2>/dev/null)
  if [ "${#desc}" -ge 30 ]; then score=$((score + 20)); fi
  if grep -qE "^(when_to_use|summary):" "$path" 2>/dev/null; then score=$((score + 15)); fi
  if grep -qE "^applies_to:" "$path" 2>/dev/null; then score=$((score + 15)); fi
  local lines=$(wc -l < "$path" 2>/dev/null | tr -d ' ')
  if [ "${lines:-0}" -ge 50 ]; then score=$((score + 10)); fi
  local size=$(wc -c < "$path" 2>/dev/null | tr -d ' ')
  if [ "${size:-0}" -ge 2048 ]; then score=$((score + 10)); fi

  # v1.0.146: extract applies_to YAML list into JSON array.
  # Supported formats:
  #   applies_to: [archetype1, archetype2]
  #   applies_to:
  #     - archetype1
  #     - archetype2
  local applies_json
  applies_json=$(awk '
    /^---$/ { c++; if(c==2) exit; next }
    c!=1 { next }
    /^applies_to:[[:space:]]*\[/ {
      sub(/^applies_to:[[:space:]]*\[/,""); sub(/\][[:space:]]*$/,"");
      gsub(/[[:space:]]/,""); n=split($0,a,","); for(i=1;i<=n;i++) if(a[i]!="") print a[i];
      next
    }
    /^applies_to:[[:space:]]*$/ { in_list=1; next }
    in_list && /^[[:space:]]*-[[:space:]]+/ { sub(/^[[:space:]]*-[[:space:]]+/,""); gsub(/[[:space:]]/,""); print; next }
    in_list && /^[^[:space:]-]/ { in_list=0 }
  ' "$path" 2>/dev/null | awk 'BEGIN{ORS=""; first=1} {if(!first)printf ","; printf "\"%s\"", $0; first=0}')

  printf '    {"name":"%s","source":"%s","path":"%s","quality_score":%d,"applies_to":[%s],"summary":"%s"}' "$name" "$source" "$path" "$score" "$applies_json" "$summary"
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
    # v1.0.146: skip meta files (README, _drafts, etc. — start with _ or are README)
    case "$name" in README|_*) continue ;; esac
    summary=$(get_summary "$f")
    type=$(basename "$(dirname "$f")")
    T1+=("$(emit_entry "$name" "great_cto:$type" "$f" "$summary")")
  done

  # ALSO scan top-level skill dirs: skills/<name>/SKILL.md (logical skills like skeptical-triage, done-blocked, prose-style, ship, canary, investigate)
  for skill_dir in "$PLUGIN_DIR"/skills/*/; do
    skill_md="$skill_dir/SKILL.md"
    [ -f "$skill_md" ] || continue
    name=$(basename "$skill_dir")
    [ "$name" = "great_cto" ] && continue  # already scanned above
    summary=$(get_summary "$skill_md")
    T1+=("$(emit_entry "$name" "great_cto:skills" "$skill_md" "$summary")")
  done
fi

# ── Tier 2: external dependencies ─────────────────────────────────────────
T2=()

# superpowers (declared dep, can live in marketplace OR local plugins)
# Try multiple locations: marketplace install, plain plugins/, plugins/cache/
SUPERPOWERS_CANDIDATES=$(find "$HOME/.claude/plugins" -maxdepth 6 -type d \( -name "superpowers" -o -name "superpowers-marketplace" \) 2>/dev/null)
for sp_root in $SUPERPOWERS_CANDIDATES; do
  for sp_skills in "$sp_root/skills" "$sp_root/plugins/superpowers/skills"; do
    if [ -d "$sp_skills" ]; then
      for skill_dir in "$sp_skills"/*/; do
        [ -f "$skill_dir/SKILL.md" ] || continue
        name=$(basename "$skill_dir")
        summary=$(get_summary "$skill_dir/SKILL.md")
        T2+=("$(emit_entry "superpowers:$name" "obra/superpowers" "$skill_dir/SKILL.md" "$summary")")
      done
    fi
  done
done

# anthropic-skills (cloned to ~/.great_cto/anthropic-skills by SessionStart hook)
ANTHROPIC_DIR="$HOME/.great_cto/anthropic-skills"
if [ -d "$ANTHROPIC_DIR" ]; then
  while IFS= read -r f; do
    name=$(basename "$(dirname "$f")")
    summary=$(get_summary "$f")
    T2+=("$(emit_entry "anthropic:$name" "anthropics/skills" "$f" "$summary")")
  done < <(find "$ANTHROPIC_DIR" -name "SKILL.md" 2>/dev/null | head -100)
fi

# beads (similar to superpowers — try multiple locations)
BEADS_CANDIDATES=$(find "$HOME/.claude/plugins" -maxdepth 6 -type d -name "beads" 2>/dev/null)
for bd_root in $BEADS_CANDIDATES; do
  for bd_skills in "$bd_root/skills" "$bd_root/plugins/beads/skills"; do
    if [ -d "$bd_skills" ]; then
      for skill_dir in "$bd_skills"/*/; do
        [ -f "$skill_dir/SKILL.md" ] || continue
        name=$(basename "$skill_dir")
        summary=$(get_summary "$skill_dir/SKILL.md")
        T2+=("$(emit_entry "beads:$name" "steveyegge/beads" "$skill_dir/SKILL.md" "$summary")")
      done
    fi
  done
done

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
    "ai-system":         ["+ARCH-ai", "+ai-pack", "+secure-sdlc", "+THREAT-MODEL-AI", "+llm-router"],
    "agent-product":     ["+ARCH-ai", "+agent-pack", "+secure-sdlc", "+THREAT-MODEL-AI"],
    "commerce":          ["+ARCH-default", "+commerce-pack", "+secure-sdlc", "+PCI-DSS-SAQ-A"],
    "web3":              ["+ARCH-defi-protocol", "+web3-pack", "+secure-sdlc"],
    "browser-extension": ["+ARCH-browser-extension", "+browser-extension-pack"],
    "game":              ["+ARCH-game", "+game-pack"],
    "regulated":         ["+ARCH-default", "+enterprise-pack", "+secure-sdlc", "+DORA-ICT-risk-assessment", "+NIS2-article21-controls"],
    "fintech":           ["+ARCH-default", "+enterprise-pack", "+secure-sdlc", "+PCI-DSS-SAQ-D", "+DORA-ICT-risk-assessment"],
    "iot-embedded":      ["+ARCH-default", "+infra-pack", "+secure-sdlc"],
    "data-platform":     ["+ARCH-default", "+data-pack"],
    "mobile-app":        ["+ARCH-default", "+mobile-pack"],
    "library":           ["+ARCH-default", "+library-pack"],
    "enterprise":        ["+ARCH-default", "+enterprise-pack", "+secure-sdlc"],
    "web-app":           ["+ARCH-default", "+web-pack"],
    "marketing-site":    ["+ARCH-default", "+web-pack"],
    "devtools":          ["+ARCH-default", "+devtools-pack"],
    "infra":             ["+ARCH-default", "+infra-pack"]
  },
  "senior-dev": {
    "_default":          ["superpowers:test-driven-development", "knowledge-extraction", "poc-mode"],
    "ai-system":         ["+agent-pack", "+ADR-LLM", "+ADR-PROMPT", "+ai-pack"],
    "agent-product":     ["+agent-pack", "+ADR-LLM", "+ADR-PROMPT"],
    "commerce":          ["+commerce-pack"],
    "web3":              ["+web3-pack"],
    "browser-extension": ["+browser-extension-pack"],
    "game":              ["+game-pack"],
    "regulated":         ["+enterprise-pack"],
    "fintech":           ["+enterprise-pack"],
    "iot-embedded":      ["+infra-pack"],
    "data-platform":     ["+data-pack"],
    "mobile-app":        ["+mobile-pack"],
    "library":           ["+library-pack"],
    "enterprise":        ["+enterprise-pack"],
    "web-app":           ["+web-pack"],
    "devtools":          ["+devtools-pack"],
    "infra":             ["+infra-pack"]
  },
  "qa-engineer": {
    "_default":          ["agent-style", "knowledge-extraction"],
    "ai-system":         ["+EVAL-template", "+ai-pack"],
    "agent-product":     ["+EVAL-template", "+agent-pack"],
    "commerce":          ["+commerce-pack"],
    "web3":              ["+web3-pack"],
    "browser-extension": ["+browser-extension-pack"],
    "game":              ["+game-pack"],
    "regulated":         ["+enterprise-pack"],
    "fintech":           ["+enterprise-pack"],
    "iot-embedded":      ["+infra-pack"],
    "data-platform":     ["+data-pack"],
    "mobile-app":        ["+mobile-pack"],
    "library":           ["+library-pack"],
    "web-app":           ["+web-pack"]
  },
  "security-officer": {
    "_default":          ["security-tiers", "secure-sdlc", "agent-security", "pre-mortem", "risk-register", "vendors", "waivers", "sec-metrics"],
    "ai-system":         ["+THREAT-MODEL-AI", "+agent-pack", "+ai-pack"],
    "agent-product":     ["+THREAT-MODEL-AI", "+agent-pack"],
    "commerce":          ["+PCI-DSS-SAQ-A", "+PCI-DSS-SAQ-D", "+commerce-pack"],
    "web3":              ["+web3-pack"],
    "browser-extension": ["+THREAT-MODEL-AI", "+browser-extension-pack"],
    "regulated":         ["+enterprise-pack", "+DORA-ICT-risk-assessment", "+DORA-third-party-register", "+NIS2-article21-controls", "+ISO27001-SoA", "+SOX-ITGC-checklist", "+TISAX-VDA-ISA-results", "+21CFR11-checklist"],
    "fintech":           ["+enterprise-pack", "+PCI-DSS-SAQ-D", "+DORA-ICT-risk-assessment", "+DORA-third-party-register", "+SOX-ITGC-checklist"],
    "iot-embedded":      ["+infra-pack", "+NIS2-article21-controls"],
    "data-platform":     ["+data-pack"],
    "enterprise":        ["+enterprise-pack", "+ISO27001-SoA", "+SOX-ITGC-checklist"]
  },
  "devops": {
    "_default":          ["reliability", "secure-sdlc", "poc-mode", "waivers", "dora", "burn-rate"],
    "ai-system":         ["+ai-pack"],
    "agent-product":     ["+agent-pack"],
    "commerce":          ["+commerce-pack"],
    "web3":              ["+web3-pack"],
    "regulated":         ["+enterprise-pack", "+DORA-ICT-risk-assessment", "+DORA-third-party-register"],
    "fintech":           ["+enterprise-pack", "+DORA-ICT-risk-assessment"],
    "iot-embedded":      ["+infra-pack"],
    "data-platform":     ["+data-pack", "+infra-pack"],
    "enterprise":        ["+enterprise-pack"]
  },
  "l3-support": {
    "_default":          ["incident-patterns", "reliability", "grafana-ops", "anti-patterns", "knowledge-extraction", "burn-rate"],
    "ai-system":         ["+EVAL-template", "+ai-pack"],
    "agent-product":     ["+EVAL-template", "+agent-pack"],
    "commerce":          ["+commerce-pack"],
    "web3":              ["+web3-pack"],
    "regulated":         ["+enterprise-pack"],
    "fintech":           ["+enterprise-pack"],
    "data-platform":     ["+data-pack"],
    "iot-embedded":      ["+infra-pack"]
  },
  "project-auditor": {
    "_default":          ["agent-style", "knowledge-extraction", "onboarding", "anti-patterns", "decision-log"],
    "ai-system":         ["+agent-pack", "+ai-pack"],
    "agent-product":     ["+agent-pack"],
    "commerce":          ["+commerce-pack"],
    "web3":              ["+web3-pack"],
    "browser-extension": ["+browser-extension-pack"],
    "regulated":         ["+enterprise-pack"]
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
  },
  "pci-reviewer": {
    "_default":          ["commerce-pack", "PCI-DSS-SAQ-A", "PCI-DSS-SAQ-D", "THREAT-MODEL-AI"]
  },
  "oracle-reviewer": {
    "_default":          ["web3-pack", "ARCH-defi-protocol", "THREAT-MODEL-AI"]
  },
  "firmware-reviewer": {
    "_default":          ["THREAT-MODEL-AI", "NIS2-article21-controls"]
  },
  "pm": {
    "_default":          ["pm-planning", "pre-mortem", "cost-model", "anti-patterns"],
    "ai-system":         ["+agent-pack", "+ai-pack"],
    "agent-product":     ["+agent-pack"],
    "commerce":          ["+commerce-pack"],
    "web3":              ["+web3-pack"],
    "browser-extension": ["+browser-extension-pack"],
    "game":              ["+game-pack"],
    "regulated":         ["+enterprise-pack"],
    "fintech":           ["+enterprise-pack"],
    "iot-embedded":      ["+infra-pack"],
    "data-platform":     ["+data-pack"],
    "mobile-app":        ["+mobile-pack"],
    "library":           ["+library-pack"],
    "enterprise":        ["+enterprise-pack"],
    "web-app":           ["+web-pack"],
    "devtools":          ["+devtools-pack"],
    "infra":             ["+infra-pack"]
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
