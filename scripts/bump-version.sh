#!/usr/bin/env bash
# Bump plugin version and sync all derived references.
#
# Usage:
#   scripts/bump-version.sh 1.0.84
#
# Updates:
#   - .claude-plugin/plugin.json "version"
#   - packages/cli/package.json "version" (kept in lockstep with the plugin)
#   - README.md version badge
#   - README.md "v1.0.xx — actively maintained" line

set -euo pipefail

NEW="${1:-}"
if [ -z "$NEW" ]; then
  echo "usage: $0 <new-version>" >&2
  exit 2
fi

if ! echo "$NEW" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "FAIL: version must be semver (x.y.z): $NEW" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_JSON="$ROOT/.claude-plugin/plugin.json"
CLI_JSON="$ROOT/packages/cli/package.json"
README="$ROOT/README.md"

OLD=$(grep -m1 '"version"' "$PLUGIN_JSON" | sed 's/.*"\([0-9][0-9.]*\)".*/\1/')

if [ "$OLD" = "$NEW" ]; then
  echo "already at $NEW — nothing to do"
  exit 0
fi

# plugin.json
python3 - "$PLUGIN_JSON" "$NEW" <<'PY'
import json, sys
path, new = sys.argv[1], sys.argv[2]
with open(path) as f: data = json.load(f)
data["version"] = new
with open(path, "w") as f: json.dump(data, f, indent=2); f.write("\n")
PY

# packages/cli/package.json — kept in lockstep with plugin
python3 - "$CLI_JSON" "$NEW" <<'PY'
import json, sys
path, new = sys.argv[1], sys.argv[2]
with open(path) as f: data = json.load(f)
data["version"] = new
with open(path, "w") as f: json.dump(data, f, indent=2); f.write("\n")
PY

# README badge + actively-maintained line
python3 - "$README" "$OLD" "$NEW" <<'PY'
import re, sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f: text = f.read()
text = re.sub(r'version-\d+\.\d+\.\d+-blue', f'version-{new}-blue', text)
text = re.sub(r'^v\d+\.\d+\.\d+ — actively maintained',
              f'v{new} — actively maintained', text, flags=re.M)
with open(path, "w") as f: f.write(text)
PY

echo "bumped: $OLD → $NEW"
echo "  ✓ $PLUGIN_JSON"
echo "  ✓ $CLI_JSON"
echo "  ✓ $README (badge + actively-maintained)"
echo ""
echo "next: update CHANGELOG.md, commit, tag"
