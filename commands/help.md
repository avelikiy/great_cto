---
description: "Show great_cto commands, key concepts, and admin board URL. Use when you don't remember a command or you are new to great_cto."
argument-hint: "[optional: topic — e.g. 'commands', 'agents', 'board']"
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
PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')
CARD="${PLUGIN_DIR}/docs/help-card.md"
[ -f "$CARD" ] || CARD="$(pwd)/docs/help-card.md"
VERSION=$(cat "${PLUGIN_DIR}/.claude-plugin/plugin.json" 2>/dev/null | grep '"version"' | head -1 | sed 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/')
echo "VERSION=${VERSION:-?}"
cat "$CARD" 2>/dev/null || echo "MISSING_CARD"
```

## Step 2 — Render

If the file loaded, print it **verbatim** with the version substituted
into the header (`{{VERSION}}` → value of `VERSION`).

If the file is missing or `MISSING_CARD` was printed, fall back to this
minimal card (no extra commentary):

```
great_cto · type /<command> in Claude Code

Daily       /inbox · /digest · /doctor · /resume · /save
Pipeline    /start · /audit · /review · /poc · /promote
Ops         /oncall · /ownership · /rfc · /release · /sec · /cost · /burn
Memory      /learn · /crystallize · /migrate
Agents      /agent-review · /agent-retire

Admin board   great-cto board   →   http://localhost:3141
Docs          https://github.com/avelikiy/great_cto
```

## Step 3 — Argument routing

If `$ARGUMENTS` contains a known topic, append the matching subsection
**only** (don't dump everything):

- `commands` → just the command table from the card
- `agents`   → grep the card for the `## Agents` section
- `board`    → just the board / admin URL block + how to start it
- otherwise  → full card

## Notes

- Don't fabricate commands. If `$ARGUMENTS` is unknown, print the full
  card and a single line: `Unknown topic '<arg>' — showing full card.`
- Don't run any other helpers. This command must work in heavy-context
  sessions, so the body must stay short.
