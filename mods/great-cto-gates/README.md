# great-cto-gates — a Claude Code mod (prototype)

The gates waiting on you, in a pane of the session you are working in, instead of a
trip to the board.

- `/gates` opens the pane; the status line says how many gates wait; a new gate raises
  a toast and opens the pane.
- **Approve / Reject** post to the board's own route, `POST /api/gates/<id>`, with the
  token the board issued in `/api/inbox`. The board keeps the one door: token check
  (ADR-024), binding to the tree as it is, the decision log. Nothing here writes a gate.
- A gate that is **expensive to undo** keeps the board's ritual: you type its name
  (`gate:ship`) and press Enter. The text goes to the board as `confirm`; the server
  compares it. There is no button in its place.
- "The board is not answering" and "not a project the board knows" are said as such —
  never as "no gates".

Needs Claude Code 2.1.287+ (the desktop app's engine already has mods) and the board
running on `127.0.0.1:3141` (`/board`). Not part of the great_cto plugin manifest yet:
the plugin's existing hooks, its Codex install and older Claude Code are untouched.

```bash
claude --plugin-dir mods/great-cto-gates           # load it for one session
claude plugin validate mods/great-cto-gates
claude plugin test mods/great-cto-gates            # 8 tests, terminal + desktop
```
