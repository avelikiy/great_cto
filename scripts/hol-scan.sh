#!/usr/bin/env bash
# Run the HOL AI Plugin Scanner over this repository, the way the removed GitHub
# workflow did (score >= 80, no critical or high finding), in the local gate.
#
# Why here: Actions on the account is billing-locked, so the workflow never ran;
# it was removed on 2026-10-01. The scanner reads the plugin the way a stranger
# installing it would — manifest, permissions, MCP commands, secrets, and (via the
# Cisco skill scanner) the skills themselves — which no other gate step asks.
# Same build as the catalogue's own check: the wheel's sha256 is verified against
# scripts/hol-scanner/PIN, dependency versions are fixed by constraints.txt.
#
# The scanner is installed once, under ~/.great_cto/tools/ (override with
# GREAT_CTO_TOOLS) with python3.12, as the action sets up. With no python3.12,
# no network on the first run, or no Cisco skill scanner, the scan is
# NOT MEASURED: it prints `# skip 1`, which the gate counts as a skipped check —
# never as a pass.
set -uo pipefail
cd "$(dirname "$0")/.."

PIN=scripts/hol-scanner/PIN
VER=$(sed -n 's/^version=//p' "$PIN"); SHA=$(sed -n 's/^sha256=//p' "$PIN")
TOOLS="${GREAT_CTO_TOOLS:-$HOME/.great_cto/tools}/plugin-scanner-$VER"
PY="$TOOLS/venv/bin/python"

not_measured() { echo "HOL plugin scanner: not measured — $1"; echo "# skip 1"; exit 0; }

if [ ! -f "$TOOLS/.installed" ]; then
  command -v python3.12 >/dev/null 2>&1 || not_measured "python3.12 is not installed (the version the scanner's lock targets)"
  rm -rf "${TOOLS:?}"; mkdir -p "$TOOLS/dist"
  python3.12 -m venv "$TOOLS/venv" >/dev/null 2>&1 || not_measured "could not create a venv"
  "$PY" -m pip -q download --only-binary=:all: --no-deps --dest "$TOOLS/dist" "plugin-scanner==$VER" >/dev/null 2>&1 \
    || not_measured "could not download plugin-scanner==$VER (offline?)"
  WHEEL=$(ls "$TOOLS"/dist/plugin_scanner-*.whl 2>/dev/null | head -1)
  GOT=$(shasum -a 256 "$WHEEL" | awk '{print $1}')
  if [ "$GOT" != "$SHA" ]; then
    echo "HOL plugin scanner: wheel sha256 $GOT does not match the pin $SHA — refusing to install"
    rm -rf "${TOOLS:?}"; exit 1
  fi
  "$PY" -m pip -q install -c scripts/hol-scanner/constraints.txt "$WHEEL" >/dev/null 2>&1 \
    || not_measured "could not install the verified wheel and its pinned dependencies (offline?)"
  "$PY" -m pip show cisco-ai-skill-scanner >/dev/null 2>&1 \
    || not_measured "the Cisco skill scanner did not install — the catalogue runs it, so a scan without it is not the catalogue's verdict"
  touch "$TOOLS/.installed"
fi

REPORT=$(mktemp "${TMPDIR:-/tmp}/hol-report.XXXXXX")
trap 'rm -f "$REPORT"' EXIT
"$TOOLS/venv/bin/plugin-scanner" scan . --format json --output "$REPORT" >/dev/null 2>&1 \
  || { [ -s "$REPORT" ] || not_measured "the scanner produced no report"; }
node scripts/lib/hol-verdict.mjs "$REPORT"
