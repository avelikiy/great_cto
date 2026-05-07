#!/usr/bin/env bash
# scripts/submit-catalogs.sh — opens 15+ catalog submission pages with great_cto pre-filled
#
# Usage:
#   scripts/submit-catalogs.sh         # opens all pages in default browser
#   scripts/submit-catalogs.sh --print # prints URLs only
#   scripts/submit-catalogs.sh --copy  # prints + copies project description to clipboard
#
# Each catalog requires manual submit (no API), but this script:
#   1. Opens the right page in browser
#   2. Prints the exact text/keywords to paste
#   3. Tracks state in scripts/.catalog-state (so you can resume)

set -euo pipefail

# ============ Project metadata (single source of truth) ============

PROJECT_NAME="great_cto"
PROJECT_NPM="great-cto"
PROJECT_TAGLINE="29 specialist AI agents that ship from idea to production"
PROJECT_DESC="Open-source Claude Code plugin orchestrating 29 specialist agents (architect, PM, security reviewers, parallel senior-devs, QA, DevOps) across 22 project archetypes. You make 2 decisions per feature; everything else is automatic."
PROJECT_URL="https://greatcto.systems"
PROJECT_REPO="https://github.com/avelikiy/great_cto"
PROJECT_NPM_URL="https://www.npmjs.com/package/great-cto"
PROJECT_AUTHOR="Alexander Velikiy"
PROJECT_HASHNODE="https://hashnode.com/@Greatcto"
PROJECT_BLOG="https://velikiy.hashnode.dev"

KEYWORDS="claude-code, ai-agents, mcp, devtools, sdlc, multi-agent, claude, anthropic, automation, orchestration"
TAGS_SHORT="ai,claude,devtools,opensource"

# ============ Catalogs ============

declare -a CATALOGS=(
  # name | submit URL | category/notes
  "JSR (JavaScript Registry)|https://jsr.io/new|publish via 'npx jsr publish' (also automated in jsr-publish.yml)"
  "Socket.dev|https://socket.dev/login|claim package, get health badge"
  "Snyk Advisor|https://snyk.io/advisor/npm-package/great-cto|auto-indexed, copy badge code"
  "Libraries.io|https://libraries.io/npm/great-cto|claim package ownership"
  "OpenBase|https://openbase.com/js/great-cto|claim, add manual review"
  "npm trends|https://npmtrends.com/great-cto|nothing to submit, just bookmark"
  "Best of JS|https://bestofjs.org/admin/projects|requires PR to bestofjs/bestofjs repo"
  "PulseMCP|https://www.pulsemcp.com/submit|MCP/Claude plugin registry"
  "Smithery.ai|https://smithery.ai/submit|AI agent catalog"
  "MCP.so|https://mcp.so/submit|MCP servers community"
  "alternativeto.net|https://alternativeto.net/software/new/|submit as alternative to other AI dev tools"
  "stackshare.io|https://stackshare.io/tools/new|tech stack discovery"
  "TheresAnAIForThat (TAAFT)|https://theresanaiforthat.com/submit/|massive AI tools directory"
  "Futurepedia|https://www.futurepedia.io/submit-tool|AI tools directory"
  "AI Agents Directory|https://aiagentsdirectory.com/submit|AI agents niche"
  "Product Hunt|https://www.producthunt.com/posts/new|launch product (do this on a Tuesday)"
  "Hacker News (Show HN)|https://news.ycombinator.com/submit|use ready copy from social/hn-reddit-copy.md"
  "GitHub Marketplace|https://github.com/marketplace/new|if eligible (CI tooling counts)"
  "Anthropic Cookbook|https://github.com/anthropics/anthropic-cookbook|PR with example/recipe"
  "Claude Code Templates|https://github.com/davila7/claude-code-templates|PR with template entry"
  "awesome-claude|https://github.com/davila7/awesome-claude|PR to add to list"
  "awesome-mcp-servers|https://github.com/punkpeye/awesome-mcp-servers|PR to add to list"
  "awesome-ai-agents|https://github.com/e2b-dev/awesome-ai-agents|PR to add to list"
  "awesome-devtools|https://github.com/jondot/awesome-devenv|PR to add to list"
  "Daily.dev|https://app.daily.dev/squads/new|create Squad with RSS feeds"
  "Indie Hackers|https://www.indiehackers.com/post/new|forum post, link to repo"
  "Dev.to|https://dev.to/new|cross-post Hashnode articles (use canonical_url)"
)

# ============ State tracking ============

STATE_FILE="$(dirname "$0")/.catalog-state"
touch "$STATE_FILE"

submitted() { grep -qF "$1" "$STATE_FILE" 2>/dev/null; }
mark_done() { echo "$1" >> "$STATE_FILE"; }

# ============ Print helpers ============

color_blue()   { printf "\033[34m%s\033[0m" "$1"; }
color_green()  { printf "\033[32m%s\033[0m" "$1"; }
color_yellow() { printf "\033[33m%s\033[0m" "$1"; }
color_dim()    { printf "\033[2m%s\033[0m" "$1"; }

print_header() {
  echo ""
  echo "========================================================================"
  echo "  great_cto — Catalog submission helper"
  echo "========================================================================"
  echo ""
}

print_metadata() {
  echo "--- Project metadata (copy-paste ready) ---"
  echo ""
  echo "Name:        $PROJECT_NAME"
  echo "npm:         $PROJECT_NPM"
  echo "Tagline:     $PROJECT_TAGLINE"
  echo "URL:         $PROJECT_URL"
  echo "Repo:        $PROJECT_REPO"
  echo "Author:      $PROJECT_AUTHOR"
  echo ""
  echo "Description (long form):"
  echo "$PROJECT_DESC"
  echo ""
  echo "Keywords:    $KEYWORDS"
  echo "Tags (4):    $TAGS_SHORT"
  echo ""
  echo "------------------------------------------"
  echo ""
}

# ============ Modes ============

mode="open"
case "${1:-}" in
  --print) mode="print" ;;
  --copy)  mode="copy" ;;
  --reset) rm -f "$STATE_FILE"; touch "$STATE_FILE"; echo "State reset."; exit 0 ;;
  --status)
    print_header
    echo "Submitted to:"
    if [ -s "$STATE_FILE" ]; then
      cat "$STATE_FILE" | sed 's/^/  ✓ /'
    else
      echo "  (none yet)"
    fi
    echo ""
    echo "Total: $(wc -l < "$STATE_FILE") / ${#CATALOGS[@]}"
    exit 0
    ;;
  --help|-h)
    echo "Usage: $0 [--open|--print|--copy|--status|--reset]"
    echo ""
    echo "  (default)  open all unsubmitted catalog pages in browser"
    echo "  --print    print URLs and metadata only"
    echo "  --copy     print + copy long description to clipboard"
    echo "  --status   show submission progress"
    echo "  --reset    clear submission state"
    exit 0
    ;;
esac

# ============ Detect open command ============

OPEN_CMD=""
if command -v open >/dev/null; then OPEN_CMD="open"
elif command -v xdg-open >/dev/null; then OPEN_CMD="xdg-open"
elif command -v start >/dev/null; then OPEN_CMD="start"
fi

# ============ Run ============

print_header
print_metadata

if [ "$mode" = "copy" ]; then
  if command -v pbcopy >/dev/null; then
    echo "$PROJECT_DESC" | pbcopy
    echo "✓ Long description copied to clipboard."
  elif command -v xclip >/dev/null; then
    echo "$PROJECT_DESC" | xclip -selection clipboard
    echo "✓ Long description copied to clipboard (xclip)."
  fi
  echo ""
fi

echo "--- Catalogs ---"
echo ""

count_done=0
count_pending=0

for entry in "${CATALOGS[@]}"; do
  IFS='|' read -r name url notes <<< "$entry"

  if submitted "$name"; then
    color_green "  ✓ "; echo "$name"
    color_dim   "       $url"; echo ""
    count_done=$((count_done + 1))
    continue
  fi

  count_pending=$((count_pending + 1))
  color_yellow "  ◯ "; echo "$name"
  color_blue "       $url"; echo ""
  if [ -n "${notes:-}" ]; then
    color_dim "       $notes"; echo ""
  fi

  if [ "$mode" = "open" ] && [ -n "$OPEN_CMD" ]; then
    "$OPEN_CMD" "$url" 2>/dev/null || true
    sleep 0.3   # avoid overwhelming the browser
  fi
done

echo ""
echo "------------------------------------------"
echo "Done: $count_done / ${#CATALOGS[@]}"
echo "Pending: $count_pending"
echo ""

if [ "$mode" = "open" ]; then
  echo "Pages opened in browser. After submitting each, mark as done:"
  echo "  echo '<catalog-name>' >> $STATE_FILE"
  echo ""
  echo "Or use:"
  echo "  $0 --status   # check progress"
  echo "  $0 --reset    # start over"
fi
