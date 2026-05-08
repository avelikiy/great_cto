#!/usr/bin/env bash
# scripts/release.sh — full release workflow.
#
# Combines bump-version.sh + git commit + tag + push + GitHub Release into
# a single command. Designed to be safe to re-run if any step fails midway:
# each step checks current state before acting.
#
# Usage:
#   scripts/release.sh 2.2.0                # full release
#   scripts/release.sh 2.2.0 --dry-run      # show what would happen
#   scripts/release.sh 2.2.0 --skip-bump    # version already bumped manually
#   scripts/release.sh 2.2.0 --skip-push    # don't git push (useful for testing)
#   scripts/release.sh 2.2.0 --skip-release # don't create GitHub Release
#
# Pre-requirements:
#   - clean working tree (no uncommitted changes)
#   - on the main branch
#   - CHANGELOG.md has a real entry for this version (not the "TBD" stub)
#   - gh CLI authenticated (for GitHub Release creation)
#
# Side effects (in order):
#   1. bump-version.sh updates plugin.json / package.json / jsr.json / README
#      and inserts a CHANGELOG stub (you must fill it in before re-running)
#   2. git commit -am "feat(vX.Y.Z): ..."
#   3. git tag vX.Y.Z
#   4. git push origin main --tags
#   5. gh release create vX.Y.Z (with notes auto-extracted from CHANGELOG)
#
# After release:
#   - npm + JSR publish workflows fire automatically on tag push
#   - announce.yml fires on release publish (if secrets configured)

set -euo pipefail

# --- args --------------------------------------------------------------------

NEW="${1:-}"
DRY_RUN=0
SKIP_BUMP=0
SKIP_PUSH=0
SKIP_RELEASE=0

shift_count=1
for arg in "$@"; do
  case "$arg" in
    --dry-run)      DRY_RUN=1 ;;
    --skip-bump)    SKIP_BUMP=1 ;;
    --skip-push)    SKIP_PUSH=1 ;;
    --skip-release) SKIP_RELEASE=1 ;;
  esac
done

if [ -z "$NEW" ] || [[ "$NEW" =~ ^-- ]]; then
  cat <<USAGE
usage: $0 <version> [--dry-run] [--skip-bump] [--skip-push] [--skip-release]

example:
  $0 2.2.0                  # full release
  $0 2.2.0 --dry-run        # preview without writing

pre-requirements:
  - clean working tree
  - on main branch
  - CHANGELOG.md has a real entry for vX.Y.Z (not the TBD stub)
  - gh CLI authenticated
USAGE
  exit 2
fi

if ! echo "$NEW" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "FAIL: version must be semver (x.y.z): $NEW" >&2
  exit 1
fi

# --- helpers -----------------------------------------------------------------

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHANGELOG="$ROOT/CHANGELOG.md"
PLUGIN_JSON="$ROOT/.claude-plugin/plugin.json"

color_blue()   { printf "\033[34m%s\033[0m" "$1"; }
color_green()  { printf "\033[32m%s\033[0m" "$1"; }
color_red()    { printf "\033[31m%s\033[0m" "$1"; }
color_yellow() { printf "\033[33m%s\033[0m" "$1"; }
color_dim()    { printf "\033[2m%s\033[0m" "$1"; }

step() { echo ""; color_blue "▸ $1"; echo ""; }
ok()   { color_green "  ✓ $1"; echo ""; }
warn() { color_yellow "  ⚠ $1"; echo ""; }
fail() { color_red "  ✗ $1"; echo ""; exit 1; }

run() {
  if [ "$DRY_RUN" = "1" ]; then
    color_dim "    [dry-run] $*"; echo ""
  else
    eval "$@"
  fi
}

# --- pre-flight checks -------------------------------------------------------

step "Pre-flight checks"

cd "$ROOT"

# 1. clean working tree
if [ -n "$(git status --porcelain)" ]; then
  if [ "$SKIP_BUMP" = "1" ]; then
    warn "working tree has uncommitted changes (proceeding with --skip-bump assumes those are the bump itself)"
  else
    git status --short
    fail "working tree is dirty — commit or stash before releasing"
  fi
fi
ok "working tree clean"

# 2. on main branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  warn "not on main (currently: $BRANCH)"
  printf "    continue anyway? [y/N] "
  read -r reply
  [ "$reply" = "y" ] || [ "$reply" = "Y" ] || fail "aborted"
fi
ok "on branch: $BRANCH"

# 3. tag doesn't exist already
if git rev-parse "v$NEW" >/dev/null 2>&1; then
  fail "tag v$NEW already exists locally — pick a new version or delete the tag"
fi
ok "tag v$NEW available"

# 4. gh CLI auth (only if we plan to create a release)
if [ "$SKIP_RELEASE" != "1" ]; then
  if ! command -v gh >/dev/null; then
    fail "gh CLI not installed — install or use --skip-release"
  fi
  if ! gh auth status >/dev/null 2>&1; then
    fail "gh CLI not authenticated — run 'gh auth login' or use --skip-release"
  fi
  ok "gh CLI authenticated"
fi

# --- step 1: bump version ----------------------------------------------------

if [ "$SKIP_BUMP" = "1" ]; then
  step "1. Bump version (skipped)"
  CURRENT=$(grep -m1 '"version"' "$PLUGIN_JSON" | sed 's/.*"\([0-9][0-9.]*\)".*/\1/')
  if [ "$CURRENT" != "$NEW" ]; then
    fail "plugin.json says $CURRENT but you asked for $NEW — re-bump or remove --skip-bump"
  fi
  ok "plugin.json already at $NEW"
else
  step "1. Bump version → $NEW"
  if [ "$DRY_RUN" = "1" ]; then
    color_dim "    [dry-run] bash scripts/bump-version.sh $NEW"; echo ""
  else
    bash "$ROOT/scripts/bump-version.sh" "$NEW"
  fi
fi

# --- step 2: validate CHANGELOG entry ----------------------------------------

step "2. Validate CHANGELOG entry"

# Extract the section between "## v$NEW —" and the next "## v" or end.
# If the section is empty, only contains the TBD stub, or doesn't exist → fail.
NOTES_FILE=$(mktemp)
trap "rm -f $NOTES_FILE" EXIT

awk -v ver="v$NEW" '
  $0 ~ ("^## " ver " — ") { in_section = 1; next }
  in_section && /^## v[0-9]+\.[0-9]+\.[0-9]+/ { exit }
  in_section { print }
' "$CHANGELOG" > "$NOTES_FILE"

if [ ! -s "$NOTES_FILE" ]; then
  fail "no CHANGELOG entry for v$NEW — fill it in before releasing"
fi

if grep -q "TBD — fill in before committing" "$NOTES_FILE"; then
  warn "CHANGELOG entry for v$NEW is still the TBD stub:"
  echo ""
  sed 's/^/      /' "$NOTES_FILE" | head -10
  echo ""
  fail "fill in the CHANGELOG stub, then re-run"
fi

ok "CHANGELOG has $(wc -l < "$NOTES_FILE" | tr -d ' ') lines of release notes for v$NEW"

# --- step 3: commit ----------------------------------------------------------

step "3. Commit"

# IMPORTANT: --skip-bump means "version already bumped manually", NOT
# "skip the commit step". Whether we ran bump-version.sh or not, if the
# working tree has uncommitted changes (which it always does at this
# point: bump just edited 4 files, OR user prepared changes manually),
# we MUST commit them or the tag will point at the wrong commit.
if [ -z "$(git status --porcelain)" ]; then
  warn "no changes to commit — tag will point at current HEAD ($(git rev-parse --short HEAD))"
else
  # Use the first non-empty line of the CHANGELOG section as the commit subject
  SUBJECT_LINE=$(grep -m1 -E '^### ' "$NOTES_FILE" | sed 's/^### //' | head -c 80 || echo "")
  [ -z "$SUBJECT_LINE" ] && SUBJECT_LINE="release"
  COMMIT_MSG="feat(v$NEW): $SUBJECT_LINE"

  color_dim "    $(git status --porcelain | wc -l | tr -d ' ') file(s) staged"; echo ""
  color_dim "    commit message: $COMMIT_MSG"; echo ""
  run "git add -A && git commit -m \"$COMMIT_MSG\""
  ok "committed"
fi

# --- step 4: tag -------------------------------------------------------------

step "4. Tag v$NEW"

if [ "$DRY_RUN" = "1" ]; then
  color_dim "    [dry-run] git tag v$NEW"; echo ""
else
  git tag "v$NEW"
fi
ok "tagged v$NEW"

# --- step 5: push ------------------------------------------------------------

if [ "$SKIP_PUSH" = "1" ]; then
  step "5. Push (skipped)"
  warn "remember to: git push origin main --tags"
else
  step "5. Push to origin"
  run "git push origin main"
  run "git push origin v$NEW"
  ok "pushed main + v$NEW"
fi

# --- step 6: GitHub Release --------------------------------------------------

if [ "$SKIP_RELEASE" = "1" ] || [ "$SKIP_PUSH" = "1" ]; then
  step "6. GitHub Release (skipped)"
  warn "to create later: gh release create v$NEW --notes-file <(awk '/^## v$NEW/,/^## v[0-9]/' CHANGELOG.md)"
else
  step "6. Create GitHub Release"

  TITLE_LINE=$(grep -m1 -E '^### ' "$NOTES_FILE" | sed 's/^### //' | head -c 80 || echo "")
  [ -z "$TITLE_LINE" ] && TITLE_LINE="release"
  RELEASE_TITLE="v$NEW — $TITLE_LINE"

  # Determine if this should be marked --latest
  # (highest semver tag → latest)
  HIGHEST_TAG=$(git tag --sort=-v:refname | head -1)
  if [ "$HIGHEST_TAG" = "v$NEW" ]; then
    LATEST_FLAG="--latest"
    color_dim "    will mark as Latest (v$NEW is highest tag)"; echo ""
  else
    LATEST_FLAG=""
    color_dim "    not marking Latest (v$HIGHEST_TAG is higher than v$NEW)"; echo ""
  fi

  if [ "$DRY_RUN" = "1" ]; then
    color_dim "    [dry-run] gh release create v$NEW --title \"$RELEASE_TITLE\" $LATEST_FLAG --notes-file ..."; echo ""
  else
    gh release create "v$NEW" \
      --title "$RELEASE_TITLE" \
      --notes-file "$NOTES_FILE" \
      $LATEST_FLAG
  fi
  ok "GitHub Release created: https://github.com/avelikiy/great_cto/releases/tag/v$NEW"
fi

# --- summary -----------------------------------------------------------------

echo ""
color_green "╭─ Released v$NEW ────────────────────────────────────╮"
echo ""
color_green "│"
[ "$SKIP_BUMP" != "1" ]    && color_green "│  ✓ bumped plugin.json / package.json / jsr.json / README"
[ "$SKIP_BUMP" != "1" ]    && color_green "│  ✓ committed"
color_green "│  ✓ tagged v$NEW"
[ "$SKIP_PUSH" != "1" ]    && color_green "│  ✓ pushed main + tag"
[ "$SKIP_RELEASE" != "1" ] && [ "$SKIP_PUSH" != "1" ] && color_green "│  ✓ GitHub Release created"
color_green "│"
color_green "╰─────────────────────────────────────────────────────╯"
echo ""

if [ "$SKIP_PUSH" != "1" ]; then
  echo "  Next:"
  echo "    npm + JSR workflows fire automatically on the tag push"
  echo "    announce.yml fires on Release publish (if secrets configured)"
  echo ""
  echo "    Watch:  gh run list --limit 5"
fi
