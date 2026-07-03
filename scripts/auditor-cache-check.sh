#!/usr/bin/env bash
# scripts/auditor-cache-check.sh — project-auditor 24h cache check +
# invalidation, run before spawning the Phase 1-4 sub-agents.
#
# Usage:
#   bash scripts/auditor-cache-check.sh
#
# Prints "CVE_CACHE_HIT: ..." if .great_cto/cache/cve-scan.json is < 24h old
# (Agent 2 should read that cache instead of re-running npm audit). Then
# invalidates the CVE cache if any lock file (package-lock.json, yarn.lock,
# Cargo.lock, poetry.lock, go.sum) has been modified more recently than the
# cache file, printing "CACHE_INVALIDATED: <file> changed".
#
# Stack cache (.great_cto/cache/stack.json) follows the same 24h/manifest-
# change invalidation rule but is not separately checked here — same logic,
# gated on package.json/pyproject.toml/Cargo.toml/go.mod instead of lockfiles.

set -uo pipefail

CACHE_DIR=".great_cto/cache"
mkdir -p "$CACHE_DIR"

# CVE scan: cache for 24h (dependencies don't change faster)
CVE_CACHE="$CACHE_DIR/cve-scan.json"
if [ -f "$CVE_CACHE" ] && [ $(( $(date +%s) - $(stat -f %m "$CVE_CACHE" 2>/dev/null || stat -c %Y "$CVE_CACHE" 2>/dev/null || echo 0) )) -lt 86400 ]; then
  echo "CVE_CACHE_HIT: reusing scan from $(stat -f %Sm "$CVE_CACHE" 2>/dev/null)"
fi

# Cache invalidation check — package-lock.json / yarn.lock / Cargo.lock /
# poetry.lock / go.sum newer than the cache means dependencies changed.
for LOCK in package-lock.json yarn.lock Cargo.lock poetry.lock go.sum; do
  if [ -f "$LOCK" ] && [ "$LOCK" -nt "$CVE_CACHE" ] 2>/dev/null; then
    rm -f "$CVE_CACHE"
    echo "CACHE_INVALIDATED: $LOCK changed"
    break
  fi
done
