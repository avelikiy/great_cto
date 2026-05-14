---
description: "Open the great_cto admin board at http://localhost:3141 (Kanban, cost, pipeline, inbox, memory). Starts it in background if not running."
argument-hint: "[--port N] [--no-open] [--restart]"
user-invocable: true
allowed-tools: Read, Bash, Glob
model: haiku
---

You are the `/board` command. Ensure the admin board is running on
localhost and open it in the user's default browser. Output a short
status line — under 8 lines, no preamble.

## Step 1 — Parse args

```bash
PORT=3141
NO_OPEN=false
RESTART=false
for arg in "$@"; do
  case "$arg" in
    --port=*) PORT="${arg#*=}" ;;
    --port) shift; PORT="$1" ;;
    --no-open) NO_OPEN=true ;;
    --restart) RESTART=true ;;
  esac
done
echo "ARGS port=$PORT no_open=$NO_OPEN restart=$RESTART"
```

## Step 2 — Check if board is already up

```bash
HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/projects" 2>/dev/null || echo 000)
if [ "$HTTP_CODE" = "200" ] && [ "$RESTART" = "false" ]; then
  echo "ALREADY_RUNNING port=$PORT"
  # If --no-open not set, open browser
  if [ "$NO_OPEN" = "false" ]; then
    open "http://localhost:$PORT/" 2>/dev/null || \
      xdg-open "http://localhost:$PORT/" 2>/dev/null || true
  fi
  exit 0
fi
```

If `ALREADY_RUNNING` was printed, stop here and report:
> ✓ Board already running at http://localhost:$PORT/

## Step 3 — Kill stale processes if --restart

```bash
if [ "$RESTART" = "true" ]; then
  pkill -9 -f "great_cto.*board.*--port $PORT" 2>/dev/null
  pkill -9 -f "great-cto board" 2>/dev/null
  # Free the port if something else holds it
  PID_ON_PORT=$(lsof -ti :$PORT 2>/dev/null | head -1)
  [ -n "$PID_ON_PORT" ] && kill -9 "$PID_ON_PORT" 2>/dev/null
  sleep 1
  echo "RESTARTED"
fi
```

## Step 4 — Start board in background

```bash
# Find the great-cto binary — prefer locally-installed plugin version,
# fall back to PATH.
PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')
if [ -f "$PLUGIN_DIR/packages/cli/index.mjs" ]; then
  CLI="node $PLUGIN_DIR/packages/cli/index.mjs"
elif command -v great-cto >/dev/null 2>&1; then
  CLI="great-cto"
else
  echo "ERROR: great-cto not found in PATH or plugin cache."
  echo "Install: npm install -g great-cto"
  exit 1
fi

# Detach board so it survives this command's process exit
LOG_DIR="$HOME/.great_cto"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/board.log"

OPEN_FLAG=""
[ "$NO_OPEN" = "true" ] && OPEN_FLAG="--no-open"

nohup $CLI board --port "$PORT" $OPEN_FLAG > "$LOG_FILE" 2>&1 &
BOARD_PID=$!

# Detach so board outlives this shell
disown $BOARD_PID 2>/dev/null || true

echo "STARTED pid=$BOARD_PID port=$PORT log=$LOG_FILE"
```

## Step 5 — Wait for health + open browser

```bash
# Poll for up to 5 seconds
for i in 1 2 3 4 5 6 7 8 9 10; do
  HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/projects" 2>/dev/null || echo 000)
  [ "$HTTP_CODE" = "200" ] && break
  sleep 0.5
done

if [ "$HTTP_CODE" = "200" ]; then
  if [ "$NO_OPEN" = "false" ]; then
    open "http://localhost:$PORT/" 2>/dev/null || \
      xdg-open "http://localhost:$PORT/" 2>/dev/null || true
  fi
  echo "READY url=http://localhost:$PORT/"
else
  echo "FAILED — board did not respond after 5s. Check $LOG_FILE."
  tail -10 "$LOG_FILE" 2>/dev/null
  exit 1
fi
```

## Step 6 — Render to user

Render exactly this format (no extra prose):

```
✓ Board ready · http://localhost:<port>/
  log:  ~/.great_cto/board.log
  pid:  <pid>
  to stop: kill <pid>  (or restart: /board --restart)
```

If `ALREADY_RUNNING` and not `--restart`:

```
✓ Board already running · http://localhost:<port>/
  (use /board --restart to kill + relaunch)
```

If `FAILED`:

```
✗ Board failed to start on port <port>.
  log tail:
  <last 5 lines of LOG_FILE>

  Try: /board --restart
  Or:  /board --port 3142  (different port)
```

## Notes

- The board is a long-running daemon — running it via `nohup ... &` plus
  `disown` keeps it alive after this command exits.
- The board reads `~/.great_cto/projects.json` for project registry, so
  it serves the full multi-project view automatically.
- Cost data comes from `~/.great_cto/verdicts/` (verdict logs) and
  `docs/plans/` in each registered project.
- Closing the browser tab does NOT stop the board — use `kill <pid>` or
  `pkill -f "great-cto board"` to actually stop.
