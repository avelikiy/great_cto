#!/bin/sh
# Keep the installed Codex plugin in sync with its configured Git marketplace.
# Codex owns the download, version comparison and cache replacement; this script
# only installs or removes a per-user macOS timer. It never edits plugin cache.

set -eu

LABEL=com.great-cto.codex-auto-update
INTERVAL=21600 # six hours
AGENTS_DIR=${GREAT_CTO_LAUNCH_AGENTS_DIR:-"$HOME/Library/LaunchAgents"}
PLIST="$AGENTS_DIR/$LABEL.plist"
LAUNCHCTL=${GREAT_CTO_LAUNCHCTL:-launchctl}
DOMAIN="gui/$(id -u)"

escape_xml() {
  printf '%s' "$1" | sed -e 's/\&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g"
}

codex_bin() {
  if [ -n "${GREAT_CTO_CODEX_BIN:-}" ]; then
    printf '%s\n' "$GREAT_CTO_CODEX_BIN"
  else
    command -v codex || true
  fi
}

trusted_marketplace() {
  _market_root=$("$_bin" plugin marketplace list | sed -n 's/^great-cto[[:space:]][[:space:]]*//p' | head -n 1)
  [ -n "$_market_root" ] || {
    echo 'great-cto Git marketplace is not configured in Codex' >&2; return 1;
  }
  _remote=$(git -C "$_market_root" remote get-url origin 2>/dev/null || true)
  case "$_remote" in
    https://github.com/avelikiy/great_cto.git|git@github.com:avelikiy/great_cto.git) ;;
    *) echo 'great-cto marketplace does not point to the expected GitHub repository' >&2; return 1 ;;
  esac
}

render_plist() {
  _bin=$(codex_bin)
  [ -n "$_bin" ] && [ -x "$_bin" ] || { echo 'codex executable not found' >&2; return 1; }
  case "$_bin" in /*) ;; *) echo 'codex executable must have an absolute path' >&2; return 1 ;; esac
  _script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  _script="$_script_dir/$(basename -- "$0")"
  _log_dir="$HOME/.great_cto"
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>$(escape_xml "$_script")</string>
    <string>refresh</string><string>$(escape_xml "$_bin")</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>StandardOutPath</key><string>$(escape_xml "$_log_dir/codex-auto-update.log")</string>
  <key>StandardErrorPath</key><string>$(escape_xml "$_log_dir/codex-auto-update.err.log")</string>
</dict></plist>
EOF
}

case "${1:-}" in
  refresh)
    _bin=${2:-$(codex_bin)}
    [ -n "$_bin" ] && [ -x "$_bin" ] || { echo 'codex executable not found' >&2; exit 1; }
    case "$_bin" in /*) ;; *) echo 'codex executable must have an absolute path' >&2; exit 1 ;; esac
    # A marketplace can be reconfigured after enable. Revalidate on EVERY tick,
    # before asking the host to download or replace any installed artifact.
    trusted_marketplace
    exec "$_bin" plugin marketplace upgrade great-cto --json
    ;;
  render)
    render_plist
    ;;
  enable)
    [ "$(uname -s)" = Darwin ] || { echo 'automatic refresh requires macOS' >&2; exit 1; }
    _bin=$(codex_bin)
    [ -n "$_bin" ] && [ -x "$_bin" ] || { echo 'codex executable not found' >&2; exit 1; }
    trusted_marketplace
    if [ -f "$PLIST" ] && ! grep -q "<string>$LABEL</string>" "$PLIST"; then
      echo "refusing to replace an unexpected launch agent: $PLIST" >&2; exit 1
    fi
    mkdir -p "$AGENTS_DIR" "$HOME/.great_cto"
    _temp=$(mktemp "$AGENTS_DIR/.$LABEL.XXXXXX")
    trap 'rm -f "$_temp"' EXIT HUP INT TERM
    render_plist > "$_temp"
    chmod 600 "$_temp"
    if [ -f "$PLIST" ]; then "$LAUNCHCTL" bootout "$DOMAIN" "$PLIST" >/dev/null 2>&1 || true; fi
    mv -f "$_temp" "$PLIST"
    trap - EXIT HUP INT TERM
    "$LAUNCHCTL" bootstrap "$DOMAIN" "$PLIST"
    "$LAUNCHCTL" kickstart -k "$DOMAIN/$LABEL"
    echo "enabled: $PLIST (every 6 hours and at load)"
    ;;
  disable)
    if [ -f "$PLIST" ]; then
      grep -q "<string>$LABEL</string>" "$PLIST" || {
        echo "refusing to remove an unexpected launch agent: $PLIST" >&2; exit 1;
      }
      "$LAUNCHCTL" bootout "$DOMAIN" "$PLIST" >/dev/null 2>&1 || true
      rm -f "$PLIST"
    fi
    echo 'disabled'
    ;;
  status)
    if [ ! -f "$PLIST" ]; then echo 'disabled'; exit 0; fi
    if "$LAUNCHCTL" print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
      echo "enabled: $PLIST"
    else
      echo "configured but not loaded: $PLIST"
      exit 1
    fi
    ;;
  *)
    echo 'usage: codex-auto-update.sh enable|disable|status|render|refresh' >&2
    exit 2
    ;;
esac
