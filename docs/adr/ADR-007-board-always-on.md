# ADR-007: Board always-on — OS supervisor + idempotent `board ensure`

**Status:** Accepted (v2.86.0)
**Date:** 2026-07-12
**Scope:** `packages/cli` — two new `board` subcommands

## Context

The board (Kanban + CTO Dashboard, `packages/board/server.mjs`, `localhost:3141`)
runs only while `great-cto board` holds a foreground process. Close the terminal or
reboot and the admin panel is gone — the user hits `ERR_CONNECTION_REFUSED` with no
hint that nothing is listening. Users expect the admin panel to "just be there".

Two distinct needs, often conflated:

1. **Survive crashes and reboots** — a *supervisor* concern. The OS already ships
   one per platform (launchd / systemd / Task Scheduler). Re-implementing a
   keep-alive loop in Node would duplicate what the OS does better and would itself
   die on reboot.
2. **Be idempotently startable / self-healing** — a *health-gate* concern: "if the
   board isn't answering, bring it up; if it is, do nothing." Cheap to call from a
   supervisor, a cron line, a shell hook, or another CLI command.

## Decision

Split the two needs into two subcommands, mirroring the existing `board-path.ts`
pattern (pure, unit-testable core in a new module; thin side-effectful shell in
`main.ts`).

### `great-cto board ensure` — the health gate
Idempotent. Reads `~/.great_cto/board.pid`, checks the process is alive **and** the
port answers HTTP, then:
- healthy → exit 0, no side effects;
- pid dead / stale / port not answering → detached relaunch (same spawn pattern as
  `restartBoardAfterUpgrade`), rewrite the PID file, exit 0.

Crucially `ensure` does **not** call `killExistingBoard` — that helper is for the
foreground `board` command, which deliberately replaces any prior instance. `ensure`
must never kill a *healthy* board, so its decision is pid-alive **and** port-healthy;
a live pid with a hung port is the one case where it restarts.

### `great-cto board install-daemon` / `uninstall-daemon` — the supervisor
Generates and (on macOS/Linux) activates a per-user OS service that runs
`great-cto board --no-open` with restart-on-exit + start-at-login:

| OS | Supervisor | Unit written to | Activated with |
|----|-----------|-----------------|----------------|
| darwin | launchd | `~/Library/LaunchAgents/co.greatcto.board.plist` | `launchctl load -w` |
| linux | systemd --user | `~/.config/systemd/user/greatcto-board.service` | `systemctl --user enable --now` |
| win32 | Task Scheduler | (script printed) | `schtasks /create /sc onlogon` |

`--dry-run` prints the unit without writing. `KeepAlive`/`Restart=always` means the
supervisor is the source of truth for "always running"; `ensure` is the belt-and-suspenders
for the hung-port case a process-liveness supervisor can't see.

## Consequences

- **Pure renderers are tested, activation is thin.** `board-daemon.ts` exports
  `renderLaunchdPlist` / `renderSystemdUnit` / `renderSchtasksCommand` / `daemonSpec`
  (platform → path + load/unload commands) / `decideEnsureAction` (state → noop |
  start | restart). All unit-tested from `dist/` with no process spawned, matching
  `board-path.test.mjs`.
- **No new runtime deps** — launchd/systemd/schtasks are OS-native; zero-dep board
  policy untouched (this is CLI, not `packages/board`).
- **Cross-platform honestly scoped** — darwin + linux auto-activate; win32 writes the
  command and instructs (no reliable headless `schtasks` test surface here).
- **Not on by default** — installing a persistent OS service is an explicit user
  action (`install-daemon`), never a side effect of `init`. Consistent with the
  opt-in stance in CLAUDE.md.
