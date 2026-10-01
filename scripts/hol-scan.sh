#!/usr/bin/env bash
# Run the HOL AI Plugin Scanner over this repository, the way the removed GitHub
# workflow did (score >= 80, no critical or high finding), in the local gate.
#
# Why here: Actions on the account is billing-locked, so the workflow never ran;
# it was removed on 2026-10-01. The scanner reads the plugin the way a stranger
# installing it would — manifest, permissions, MCP commands, secrets — which no
# other gate step asks. Same pinned build as the action: the wheel's sha256 and
# every dependency's hash are checked before anything is installed.
#
# The scanner is installed once, under ~/.great_cto/tools/ (override with
# GREAT_CTO_TOOLS) with python3.12 — the version the action set up, and the one
# requirements.txt was locked for (3.11 pulls a dependency the lock does not
# carry). With no python3.12, or no network on the first run, the scan is
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
  "$PY" -m pip -q install --require-hashes --only-binary=:all: -r scripts/hol-scanner/requirements.txt >/dev/null 2>&1 \
    || not_measured "could not install the hash-locked dependencies (offline?)"
  "$PY" -m pip -q download --only-binary=:all: --no-deps --dest "$TOOLS/dist" "plugin-scanner==$VER" >/dev/null 2>&1 \
    || not_measured "could not download plugin-scanner==$VER (offline?)"
  WHEEL=$(ls "$TOOLS"/dist/plugin_scanner-*.whl 2>/dev/null | head -1)
  GOT=$(shasum -a 256 "$WHEEL" | awk '{print $1}')
  if [ "$GOT" != "$SHA" ]; then
    echo "HOL plugin scanner: wheel sha256 $GOT does not match the pin $SHA — refusing to install"
    rm -rf "${TOOLS:?}"; exit 1
  fi
  "$PY" -m pip -q install --no-deps "$WHEEL" >/dev/null 2>&1 || not_measured "could not install the verified wheel"
  touch "$TOOLS/.installed"
fi

REPORT=$(mktemp "${TMPDIR:-/tmp}/hol-report.XXXXXX")
trap 'rm -f "$REPORT"' EXIT
"$TOOLS/venv/bin/plugin-scanner" scan . --format json --output "$REPORT" >/dev/null 2>&1 \
  || { [ -s "$REPORT" ] || not_measured "the scanner produced no report"; }
node scripts/lib/hol-verdict.mjs "$REPORT"
