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
#   --publish     — also: real npm publish (GUARDED, irreversible — see below)
#
# Guards on --publish (all must hold, else it refuses):
#   • CI is green   • git tree is clean   • the version is NOT already on npm
#   • you are logged in to npm (npm whoami)
# Bump the version first (npm version patch|minor) — never republish an existing one.
#
# Usage:
#   bash scripts/cd-local.sh                 # CI + build + pack + dry-run (safe, default)
#   bash scripts/cd-local.sh --push          # + push current branch to GitHub
#   bash scripts/cd-local.sh --publish       # + publish to npm (guarded)

set -uo pipefail
cd "$(dirname "$0")/.."   # repo root

DO_PUSH=0; DO_PUBLISH=0
for a in "$@"; do
  case "$a" in
    --push) DO_PUSH=1 ;;
    --publish) DO_PUBLISH=1 ;;
    *) echo "unknown flag: $a (use --push | --publish)"; exit 2 ;;
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

# ── publish (opt-in, guarded) ───────────────────────────────────────────────
if [ "$DO_PUBLISH" -eq 1 ]; then
  say "npm publish (guarded)"
  [ -z "$(git status --porcelain)" ] || die "refusing to publish — git tree is dirty. Commit first."
  npm whoami >/dev/null 2>&1 || die "refusing to publish — not logged in to npm (run: npm login)."
  if npm view "great-cto@${CLI_VERSION}" version >/dev/null 2>&1; then
    die "refusing to publish — great-cto@${CLI_VERSION} already exists on npm. Bump first: (cd packages/cli && npm version patch)."
  fi
  # --provenance only works under CI OIDC (GitHub Actions); skip it for local publish.
  PROV=""; [ -n "${CI:-}" ] && PROV="--provenance"
  ( cd packages/cli && npm publish $PROV --access public ) || die "npm publish failed"
  echo "   ✓ published great-cto@${CLI_VERSION}"
  echo "   → tag the release: git tag v${CLI_VERSION} && git push origin v${CLI_VERSION}"
fi

printf '\n\033[42;30m CD-LOCAL: DONE \033[0m  (push:%s publish:%s)\n' "$DO_PUSH" "$DO_PUBLISH"
