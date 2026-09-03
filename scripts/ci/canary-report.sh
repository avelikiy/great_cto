#!/usr/bin/env bash
# canary-report.sh — open ONE issue when a canary cell breaks.
#
# The canary is the only signal that the PUBLISHED package still installs for a
# new user on a machine that is not ours. When it goes red at 06:00 UTC nobody
# is watching, so the failure has to become an issue or it is not a signal at
# all — it is a red tick in a list nobody opens.
#
# One issue per matrix cell, and not a second one while the first is open: ten
# cells failing the same root cause would otherwise file ten issues a day until
# the label is muted, which is how a real alert gets turned off.
#
# Lifted out of .github/workflows/daily-canary.yml, where it was inline
# github-script and therefore ran nowhere else.
#
# Usage:  GITHUB_TOKEN=… bash scripts/ci/canary-report.sh "<cell description>"
# Exit:   0 reported, or already reported · 1 could not report
set -uo pipefail

CELL="${1:?usage: canary-report.sh "<cell>"}"
REPO="${CIRRUS_REPO_FULL_NAME:-${GITHUB_REPOSITORY:-avelikiy/great_cto}}"

# The run this failed in, so the issue points at evidence rather than at a
# claim. Cirrus and Actions name it differently; neither being present is not
# fatal — an issue without a link still beats no issue.
if [ -n "${CIRRUS_BUILD_ID:-}" ]; then
  RUN_URL="https://cirrus-ci.com/build/${CIRRUS_BUILD_ID}"
elif [ -n "${GITHUB_RUN_ID:-}" ]; then
  RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${REPO}/actions/runs/${GITHUB_RUN_ID}"
else
  RUN_URL="(no run url available)"
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "canary-report: GITHUB_TOKEN unset — canary failed on ${CELL} and was NOT REPORTED." >&2
  echo "canary-report: that is a missing alert, not a passing run." >&2
  exit 1
fi
if ! command -v gh >/dev/null 2>&1; then
  echo "canary-report: gh CLI not installed — canary failed on ${CELL} and was NOT REPORTED." >&2
  exit 1
fi

TITLE="Daily canary failed — ${CELL}"
export GH_TOKEN="$GITHUB_TOKEN"

open="$(gh issue list --repo "$REPO" --state open --label canary --limit 100 \
          --json title --jq '.[].title' 2>/dev/null || true)"
if printf '%s' "$open" | grep -qF "$CELL"; then
  echo "canary-report: an open issue for ${CELL} already exists — not filing another."
  exit 0
fi

gh issue create --repo "$REPO" \
  --title "$TITLE" \
  --label canary --label bug \
  --body "$(cat <<EOF
The daily canary failed on **${CELL}**.

Run: ${RUN_URL}
Date: $(date -u +%Y-%m-%d)

The canary exercises the cold-install path a new user takes — \`npx great-cto\`,
a cold \`init\` in an empty directory, plugin sync side-effects, and the board
API smoke test. A failure here means the PUBLISHED package is broken for that
cell, which the working-tree tests cannot see.

Reproduce locally:

    bash scripts/canary.sh npm     # the published artifact, as a user gets it
    bash scripts/canary.sh local   # the working tree

Close this when the cell is green again; the next run will re-open it if not.
EOF
)" >/dev/null 2>&1 && { echo "canary-report: issue opened for ${CELL}"; exit 0; }

echo "canary-report: could not open an issue for ${CELL}." >&2
exit 1
