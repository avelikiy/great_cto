#!/usr/bin/env bash
# awesome-list-check.sh — are we still listed where we were listed?
#
# Getting into a curated list is work; falling out of one is silent. A list
# gets restructured, an entry gets pruned in a cleanup, and nothing tells the
# project it used to be there. This checks weekly and opens ONE issue per list
# that dropped us.
#
# Lifted out of .github/workflows/awesome-list-checker.yml so the logic lives
# in a file that can be read, run by hand, and called from any CI — the same
# reason check-design.sh resolves its guards from one place. The workflow's
# version was inline YAML with github-script, runnable nowhere else.
#
# Usage:  bash scripts/ci/awesome-list-check.sh            # report only
#         GITHUB_TOKEN=… bash scripts/ci/awesome-list-check.sh   # + open issues
#
# Exit: 0 every list still lists us · 1 at least one dropped us · 2 cannot tell
set -uo pipefail

REPO="${CIRRUS_REPO_FULL_NAME:-${GITHUB_REPOSITORY:-avelikiy/great_cto}}"

# name|raw-url|state
#
# Which lists, and why these — kept because the next person will otherwise
# re-add the ones that were deliberately dropped:
#   awesome-ai-sdks       e2b-dev's framework/SDK list — the right shape for us
#   awesome-claude-code   web-form submissions only, no PRs; tracked so we
#                         notice if an accepted entry later disappears
# Deliberately NOT tracked:
#   awesome-mcp-servers   we bundle an MCP, we are not an MCP server
#   awesome-ai-agents     that list is for autonomous agents, not frameworks
#
# `state` is `listed` (we are in it, and falling out is a regression worth an
# issue) or `pending` (submitted, not accepted yet, so absence is the expected
# reading and not news).
#
# The third column exists because the first version of this script did not have
# it and reported "no longer listed" for two lists we had never been in: both
# submissions were still open. "Not there yet" and "dropped us" need different
# words and different consequences — one is a wait, the other is a regression.
# Move an entry to `listed` when the PR or issue is accepted; the check then
# starts guarding it.
LISTS=(
  "awesome-ai-sdks|https://raw.githubusercontent.com/e2b-dev/awesome-ai-sdks/main/README.md|pending"
  "awesome-claude-code|https://raw.githubusercontent.com/hesreallyhim/awesome-claude-code/main/README.md|pending"
)

missing=0
unreachable=0
pending=0

for entry in "${LISTS[@]}"; do
  name="${entry%%|*}"
  rest="${entry#*|}"
  url="${rest%%|*}"
  state="${rest#*|}"

  body="$(curl -sL --max-time 30 --fail "$url" 2>/dev/null)"
  if [ -z "$body" ]; then
    # Three states. A list we could not fetch is NOT a list that dropped us:
    # opening an issue on a network blip trains everyone to close them unread.
    echo "  ? ${name} — could not fetch, NOT CHECKED (not a pass, not a failure)"
    unreachable=$((unreachable + 1))
    continue
  fi

  hits="$(printf '%s' "$body" | grep -ic 'great[_-]cto' || true)"
  if [ "$hits" -eq 0 ] && [ "$state" = "pending" ]; then
    # Expected. A submission that has not been accepted is a wait, not a fault,
    # and filing an issue about it every Monday teaches everyone to mute the label.
    echo "  · ${name} — not listed yet (submission still open); nothing to report"
    pending=$((pending + 1))
    continue
  fi

  if [ "$hits" -eq 0 ]; then
    echo "  ✗ ${name} — was listed, is not any more"
    missing=$((missing + 1))

    if [ -n "${GITHUB_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
      # One issue per list, not one per run. An open issue for this list means
      # the message already landed; a second one is noise that gets the label
      # muted.
      open="$(GH_TOKEN="$GITHUB_TOKEN" gh issue list --repo "$REPO" \
                --state open --label awesome-list-missing --limit 100 \
                --json title --jq '.[].title' 2>/dev/null || true)"
      if printf '%s' "$open" | grep -qF "$name"; then
        echo "    (an open issue for ${name} already exists — not filing another)"
      else
        GH_TOKEN="$GITHUB_TOKEN" gh issue create --repo "$REPO" \
          --title "Missing from ${name}" \
          --label awesome-list-missing --label distribution \
          --body "The weekly health check found great_cto is no longer listed in [${name}](${url}). Open a PR to re-list, or close this if the delisting was deliberate." \
          >/dev/null 2>&1 && echo "    issue opened" || echo "    could not open an issue"
      fi
    else
      echo "    GITHUB_TOKEN unset or gh missing — NOT REPORTED, only printed"
    fi
  else
    echo "  ✓ ${name} — listed (${hits} mention(s))"
  fi
done

echo
if [ "$unreachable" -gt 0 ]; then
  echo "${unreachable} list(s) could not be fetched — this run did not check them."
fi
if [ "$missing" -gt 0 ]; then
  echo "${missing} list(s) no longer list great_cto."
  exit 1
fi
if [ "$pending" -gt 0 ]; then
  echo "${pending} submission(s) still waiting — absence there is expected, not a finding."
fi
if [ "$unreachable" -gt 0 ] && [ "$missing" -eq 0 ]; then
  exit 2
fi
echo "no tracked list that HAD great_cto has dropped it."
exit 0
