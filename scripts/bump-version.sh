#!/usr/bin/env bash
# Bump plugin version and sync all derived references.
#
# Usage:
#   scripts/bump-version.sh 1.0.84
#
# Updates:
#   - .claude-plugin/plugin.json "version"
#   - packages/cli/package.json "version" (kept in lockstep with the plugin)
#   - packages/cli/jsr.json (if present)
#   - README.md version badge
#   - README.md "v1.0.xx — actively maintained" line
#   - CHANGELOG.md — prepends a stub entry "## vX.Y.Z — YYYY-MM-DD\nTBD"
#                   (you fill it in before committing; idempotent if already present)

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
JSR_JSON="$ROOT/packages/cli/jsr.json"
README="$ROOT/README.md"
CHANGELOG="$ROOT/CHANGELOG.md"

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

# packages/cli/jsr.json (if present — kept in lockstep)
JSR_TOUCHED=""
if [ -f "$JSR_JSON" ]; then
  python3 - "$JSR_JSON" "$NEW" <<'PY'
import json, sys
path, new = sys.argv[1], sys.argv[2]
with open(path) as f: data = json.load(f)
data["version"] = new
with open(path, "w") as f: json.dump(data, f, indent=2); f.write("\n")
PY
  JSR_TOUCHED="  ✓ $JSR_JSON"
fi

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

# CHANGELOG.md stub — idempotent prepend
# If "## v$NEW — " already exists, do nothing. Otherwise prepend a stub block
# directly after the file header (after the first "---" divider).
CHANGELOG_TOUCHED=""
if [ -f "$CHANGELOG" ]; then
  python3 - "$CHANGELOG" "$NEW" <<'PY'
import re, sys, datetime, pathlib
path, new = sys.argv[1], sys.argv[2]
p = pathlib.Path(path)
text = p.read_text()

# already exists?
if re.search(rf'^## v{re.escape(new)}\b', text, flags=re.M):
    sys.exit(0)

today = datetime.date.today().isoformat()
stub = (
    f"## v{new} — {today}\n\n"
    f"### TBD — fill in before committing\n\n"
    f"- _Add one bullet per shipped feature._\n"
    f"- _Cite ADRs introduced (if any)._\n"
    f"- _Mention test counts and opt-out flags._\n\n"
    f"---\n\n"
)

# Insert after first horizontal rule (---) which marks the end of the header.
m = re.search(r'^---\s*$', text, flags=re.M)
if m:
    insert_at = m.end() + 1   # after the newline that follows ---
    new_text = text[:insert_at] + "\n" + stub + text[insert_at:]
else:
    # No header divider — just prepend after first heading
    new_text = re.sub(r'(\n)', f'\\1\n{stub}', text, count=1)

p.write_text(new_text)
print("STUB_INSERTED")
PY
  if grep -q "^## v$NEW — " "$CHANGELOG" 2>/dev/null; then
    CHANGELOG_TOUCHED="  ✓ $CHANGELOG (stub inserted — fill in before committing)"
  fi
fi

echo "bumped: $OLD → $NEW"
echo "  ✓ $PLUGIN_JSON"
echo "  ✓ $CLI_JSON"
[ -n "$JSR_TOUCHED" ] && echo "$JSR_TOUCHED"
echo "  ✓ $README (badge + actively-maintained)"
[ -n "$CHANGELOG_TOUCHED" ] && echo "$CHANGELOG_TOUCHED"
echo ""
echo "next: fill in the CHANGELOG stub at the top of CHANGELOG.md, then either"
echo "  manually:   git commit -am 'feat(v$NEW): ...' && git tag v$NEW && git push origin main --tags"
echo "  one-shot:   scripts/release.sh $NEW --skip-bump      # uses already-bumped versions"
