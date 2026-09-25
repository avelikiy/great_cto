# Work fast — fewer turns, no waiting (canonical)

> Measured on 1,987 agent runs (PLAN-2026-09-23-agent-speed): 88% of senior-dev's time is
> the model, not the tools, and each turn is another full pass over the context. Two or
> more tool calls shared one message in 15% of turns; `until … sleep` polling took 5.4 h;
> the full test suite ran after every edit (`flutter test` 1,029 times).

1. **Batch independent calls into one message.** Reading several files, several greps,
   `ls`/`git log`/`git status`, independent checks — issue them together in a single turn.
   Sequence calls only when one needs the other's output.
2. **Never poll.** No `until …; do sleep …; done`, no `sleep` between checks, no
   `timeout N` wrapped around a wait. Run a long command in the background and continue,
   or block once on the project with `node "$PD/scripts/lib/board-watch.mjs"`.
3. **Run the tests your change touches while iterating; the full suite once, before the
   verdict.** `node "$PD/scripts/lib/affected-tests.mjs"` prints the targeted command for
   the files you changed (JS/TS, Rust, Dart/Flutter, Python, Go); `full` means it could not
   map them and the full suite is the honest answer.
4. **Read a file once.** Read what you need whole rather than in many slices, and do not
   re-read a file you just wrote — the tool said whether the write succeeded.

`$PD` is the plugin directory:
`PD=${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/*/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')}`
