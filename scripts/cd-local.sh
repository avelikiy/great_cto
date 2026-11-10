#!/usr/bin/env bash
# scripts/cd-local.sh — local CI/CD pipeline for great_cto, run on this mac.
#
# GitHub Actions is the source of truth when healthy, but while it's unavailable
# (account-level Actions failure — see the billing note in docs), this is the
# working pipeline: it runs the CI gate and the CD stages locally.
#
# Stages:
#   1. CI         — scripts/ci-local.sh (structural, docs-ref, all tests, cli build+pack)
#   2. Build+pack — packages/cli build + npm pack (the release artifact)
#   3. Dry-run    — npm publish --dry-run (shows exactly what WOULD ship)
#   --push        — also: git push the current branch to origin
#   --publish     — refused: use the separately admitted immutable publisher
#
# Usage:
#   bash scripts/cd-local.sh                 # CI + build + pack + dry-run (safe, default)
#   bash scripts/cd-local.sh --push          # + push current branch to GitHub
#   node scripts/publish-local-release.mjs  # explicit signed-artifact route

set -uo pipefail
cd "$(dirname "$0")/.."   # repo root

DO_PUSH=0
for a in "$@"; do
  case "$a" in
    --push) DO_PUSH=1 ;;
    --publish) echo "refusing legacy publication: use scripts/publish-local-release.mjs with verified admitted artifacts and explicit owner approval"; exit 1 ;;
    *) echo "unknown flag: $a (use --push; publication requires the verified publisher)"; exit 2 ;;
  esac
done

say() { printf '\n\033[1m━━ %s\033[0m\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1"; exit 1; }

CLI_VERSION="$(node -p "require('./packages/cli/package.json').version")"
echo "cd-local: great-cto@${CLI_VERSION} on $(uname -s), node $(node -v)"

# ── 1. CI gate ──────────────────────────────────────────────────────────────
say "CI gate (scripts/ci-local.sh)"
bash scripts/ci-local.sh || die "CI gate failed — fix before any CD stage."

# ── 2. Build + pack ─────────────────────────────────────────────────────────
say "Build + pack release artifact"
( cd packages/cli && npm run build >/dev/null && npm pack ) || die "build/pack failed"
TARBALL="packages/cli/great-cto-${CLI_VERSION}.tgz"
[ -f "$TARBALL" ] && echo "   artifact: $TARBALL ($(du -h "$TARBALL" | cut -f1))"

# ── 3. Dry-run publish (always — shows what would ship) ─────────────────────
say "npm publish --dry-run (no publish)"
( cd packages/cli && npm publish --dry-run 2>&1 | grep -E "name:|version:|total files:|package size:" )

# ── push (opt-in) ───────────────────────────────────────────────────────────
if [ "$DO_PUSH" -eq 1 ]; then
  say "git push $(git branch --show-current) → origin"
  git push origin "$(git branch --show-current)" || die "git push failed"
  echo "   ✓ pushed"
fi

printf '\n\033[42;30m CD-LOCAL: PREPARATION DONE \033[0m  (push:%s publish:0)\n' "$DO_PUSH"
