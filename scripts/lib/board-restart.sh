#!/usr/bin/env bash
# Restart a running board so it picks up the version that was just installed.
#
# The bug this exists for: installing a new plugin never touched the running
# board. `server.mjs` answers EADDRINUSE with "board already running" and
# exit(0), so every relaunch politely deferred to the old process — and the
# board on this machine served v2.95.0 for nine days while three installers in a
# row reported success. An install that reports a version the user cannot see is
# the same defect class as a guard that never runs.
#
# Killing by command-line pattern is what failed. `/board` matched
# `great_cto.*board.*--port` and `great-cto board`; the process was
# `node packages/board/server.mjs --port 3141` and matched neither, so a
# `--restart` left the stale board running and reported success anyway.
#
# The PORT is the one identifier that cannot be wrong: whoever holds it is the
# board the browser is talking to, whatever its command line says.

# Who holds the port right now. Empty when nothing does.
board_pid_on_port() {
  lsof -ti ":${1:-3141}" -sTCP:LISTEN 2>/dev/null | head -1
}

# The version a running board reports, or empty if it will not answer.
board_reported_version() {
  curl -s --max-time 2 "http://127.0.0.1:${1:-3141}/api/version" 2>/dev/null \
    | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

# Stop whatever is serving the port. Returns 0 if the port ended up free.
board_stop() {
  local port="${1:-3141}" pid
  pid="$(board_pid_on_port "$port")"
  [ -z "$pid" ] && return 0

  kill "$pid" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.2
    [ -z "$(board_pid_on_port "$port")" ] && return 0
  done
  kill -9 "$pid" 2>/dev/null
  sleep 0.4
  [ -z "$(board_pid_on_port "$port")" ]
}

# The working directory a running board was started in — its cwd decides which
# project it opens on, so a restart that changes it is a restart that moved the
# user's board somewhere else. Preserved rather than guessed.
board_cwd() {
  local pid="$1"
  [ -z "$pid" ] && return 1
  lsof -p "$pid" 2>/dev/null | awk '$4=="cwd"{print $NF; exit}'
}

# Start the board, detached, and wait until it answers.
#   $1 server.mjs to run (absolute — the NEW install)
#   $2 cwd to run it in (the OLD board's, so the project does not change)
# Prints the version it reports, or nothing if it never came up.
board_start() {
  # `local` is declared ONCE, at the top. Declaring it inside the loop printed
  # `v=''` to stdout on every iteration under zsh — and this function's stdout IS
  # its return value, so the caller got three lines of noise wrapped around the
  # version it asked for. A function whose output channel carries debris cannot
  # be read by a script.
  local server="$1" cwd="$2" port="${3:-3141}" log="${4:-/tmp/great-cto-board.log}" v=""
  [ -f "$server" ] || return 1
  [ -d "$cwd" ] || cwd="$(dirname "$server")"
  ( cd "$cwd" && nohup node "$server" --port "$port" --no-open >"$log" 2>&1 & ) >/dev/null 2>&1
  for _ in $(seq 1 25); do
    sleep 0.2
    v="$(board_reported_version "$port")"
    [ -n "$v" ] && { printf '%s\n' "$v"; return 0; }
  done
  return 1
}
