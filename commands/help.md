---
description: "Forgot a command, or new to great_cto? Run it — you get the command card: the five everyday commands, the rest by when you need them, and where old command names went."
argument-hint: "[optional: commands | renamed | agents | board | all | an old command name]"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Bash
model: haiku
---

You are the great_cto **Help** command. Print a compact reference card.
Keep total response **under 40 lines**. No prose explanations beyond the
card itself.

## Step 1 — Read the static card

```bash
PLUGIN_DIR=${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | awk -F'/plugins/cache/' '{split($NF,p,"/"); print p[3], $0}' | sort -V | tail -1 | cut -d' ' -f2- | sed 's|/$||')}
CARD="${PLUGIN_DIR}/docs/help-card.md"
[ -f "$CARD" ] || CARD="$(pwd)/docs/help-card.md"
VERSION=$(cat "${PLUGIN_DIR}/.claude-plugin/plugin.json" 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/')
echo "VERSION=${VERSION:-?}"
cat "$CARD" 2>/dev/null || echo "MISSING_CARD"
```

## Step 2 — Render

If the file loaded and there is no topic argument, print it **verbatim** from
the header through the `**When you need it**` table — stop before
`## Renamed in 3.40` — with the version substituted into the header
(`{{VERSION}}` → value of `VERSION`), then one line:
`Old command name? /help renamed · Board: /help board`.

If the file is missing or `MISSING_CARD` was printed, fall back to this
minimal card (no extra commentary):

```
great_cto · type /<command> in Claude Code

Every day   /start · /save · /resume · /inbox · /digest
Build       /review · /spec · /poc · /release · /trace
Knowledge   /crystallize · /recall
Ops         /sec · /ownership · /rfc · /exception · /doctor · /board
Agents      /agent review|evals|evolve|retire

Admin board   great-cto board   →   http://localhost:3141
Docs          https://github.com/avelikiy/great_cto
```

## Step 3 — Argument routing

If `$ARGUMENTS` contains a known topic, append the matching subsection
**only** (don't dump everything):

- `commands` → just the two command tables from the card
- `agents`   → grep the card for the `## Agents` section
- `board`    → just the board / admin URL block + how to start it
- `renamed`  → just the `## Renamed in 3.40` table (old command → new)
- `all`      → the whole card, verbatim
- otherwise  → the default view from Step 2

## Notes

- Don't fabricate commands. If `$ARGUMENTS` is unknown, print the default
  view and a single line: `Unknown topic '<arg>' — showing the command card.`
- A topic that is an old command name (`/help learn`, `/help migrate`) → the
  matching row of `## Renamed in 3.40`.
- Don't run any other helpers. This command must work in heavy-context
  sessions, so the body must stay short.
