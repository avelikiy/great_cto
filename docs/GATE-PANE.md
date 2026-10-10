# Gates in the session — the gate pane

Claude Code 2.1.287 and later load great_cto's mod (`hooks/hooks.json` → `hooks/gates-pane.tsx`):
the gates waiting on you appear in the session you work in, not only on the board.

| | |
|---|---|
| `/gates` | opens the pane holding the keyboard: `1` / `2` press at once, Esc returns to the prompt |
| status line | `great_cto: N gates waiting — /gates` while any wait |
| a new gate | a toast, and the pane opens without taking the keyboard |
| cheap gate | **Approve** / **Reject** buttons |
| gate expensive to undo (`gate:ship`, …) | type the gate's name and press Enter — the board's own ritual |

**One door for a decision.** The pane reads gates and their approval tokens from the board
(`GET /api/inbox`) and posts a decision to the board (`POST /api/gates/<id>`). The token check
(ADR-024), the binding to the tree as it is, and the decision log stay in the board server; the
pane writes nothing itself. For an expensive gate the typed text is sent as `confirm` and the
server compares it — there is no button in its place.

**Which project.** The pane names its project by the session root's absolute path, which the
board resolves for any project under your home directory — registered or not. The decision log
records the directory's name, never the path.

**How soon.** The board caches a project's tasks for up to five minutes unless its file watcher
or one of its own writes clears the cache, so a gate created outside the board can take that long
to appear.

**Not checked is not "no gates".** When the board is not running, or the project is not one the
board knows, the pane says so. Start the board with `/board`; it is looked for on
`127.0.0.1:${BOARD_PORT:-3141}`.

**Where it does not run.** Claude Code before 2.1.287 skips the module and keeps every other
great_cto hook (2.1.282 prints one line on stderr about early access). Codex reads only
`.codex-plugin/hooks.json` and never sees it.
