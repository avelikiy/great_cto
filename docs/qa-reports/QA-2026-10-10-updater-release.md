# QA: macOS Codex updater release 3.61.0

Date: 2026-10-10. Tracking: great_cto-932g.5.
Scope: PR #163 delivery. Adaptive PR #167 is excluded.

## Review and source gate

Independent read-only Claude review APPROVED application commit `9f457935`,
session `cafcb6f0-569a-4e2a-9d85-968746c34a69`, after correcting launchd PATH.
It used no Bash, writes, hooks or delegated agents. Review is not execution.
Subsequent fixture, translation and synthetic screenshot changes did not change
that application's files. The complete local gate at
`dc02e8072dfbe578b5af91f149ff99ed12e05d45` completed with exit 0.

| Suite | Pass | Fail | Not checked |
| --- | ---: | ---: | ---: |
| Root, hooks and board | 1346 | 0 | 0 |
| Libraries | 2579 | 0 | 4 |
| Eval | 238 | 0 | 0 |
| Documentation | 76 | 0 | 0 |
| Browser board scenarios | 14 | 0 | 0 |
| Installed pipeline L1-L5 | 55 | 0 | 1 |
| CLI | 362 | 0 | 0 |
| Archetypes | 34 | 0 | 0 |

Counts overlap across suites; they are not a unique-test total. Four library
skips are opt-in live scenarios. The historical pytest suite is absent, not
passed. Full log SHA-256:
`a621cd57cf5502827f712a244d6c0c6851f0f4d814dd9b65b025de569aff32a8`.

Pinned HOL 2.0.1116 policy passes with score 82 and its existing baseline:
zero Critical, 35 baseline High, nine Medium, eight Info. No baseline additions
or security exception. A preceding native-abort execution was retained as a
failure, not counted as clean. Fresh Snyk on the exact pushed candidate succeeded.
Disabled GitHub workflows are not represented as executed CI.

PR #163 merged as `cf12f95c583a00fd483086748044cd922cb86f61` at
2026-10-10T13:54:24Z. Its tree is byte-identical to the tested candidate.
Release source/tag target: `11e8774a1f1ac31cad3284d3b2835e0b1e6dacd8`.
The release changes only synchronized version references, release notes and
five fresh synthetic screenshots; application directories match the merged tree.
After the version bump, 105 documentation, manifest, updater, screenshot and
package-content tests passed with zero failures or skips. Log SHA-256:
`75c759a4d4fbbd1e5e55fcc9620cb97e3ae765c771ed9de8e2351ce04dda784f`.

## Published artifact

[GitHub v3.61.0](https://github.com/avelikiy/great_cto/releases/tag/v3.61.0)
published at 2026-10-10T14:02:45Z. Exact main and tag were pushed normally.
Fresh registry queries confirmed `great-cto@3.61.0` and latest=3.61.0.
The registry archive is byte-identical to the tested local archive:

- Files: 160. Compressed: 749457 bytes. Unpacked: 2383254 bytes.
- SHA-256: `439e9b4e922060976a168c01b8fb3c46bab1206dd50ec6e459cb450fa1ffa5f0`.
- npm integrity: `sha512-dpVuXNqXtvIhz0TQXWnBPlEuOlWvjPMyIyozLdam+7KNDG2S0DyJDLdfqScQwsXYJa5EQL612iXjlxIOB0P3eA==`.

A fresh registry consumer prefix/cache, with lifecycle scripts disabled, verified
CLI version 3.61.0, autonomous Skills import, a synthetic document's exact hash,
unknown loaded state, not-measured quality, unchanged document and board manifest
version. This probe did not start a live board from that consumer; autonomous
consumer HTTP verification belongs to the preceding 3.60.0 release report.
The updater helper is distributed in the Git plugin, not the npm archive.

## Operator installation and actual scheduler

Both Claude Code registry entries point to existing 3.61.0 cache directories.
Codex plugin list reports enabled `great-cto@great-cto` at 3.61.0. The terminal
CLI under the operator's existing user prefix reports 3.61.0. Lifecycle scripts
were disabled for that npm update; the plugin installer ran separately.
Old plugin caches, registry backup and the preceding CLI archive are preserved.

Repeated localhost:3141 `/api/version` reads returned
`version=3.61.0, installed=3.61.0, stale=no`. The board is loopback-only.
No foreign project metrics or operator screenshots are included in this report.

### Later live-board observation and recovery

The initial successful readbacks were followed by real HTTP timeouts:
`/api/version` at five and ten seconds; `/` at three seconds. A private macOS
sample confirms the board's main thread in `SyncProcessRunner`/`uv_run`, but
does not identify the JavaScript caller. Several owned `bd list` children
remained beyond five minutes despite the asynchronous refresh's declared 20s
timeout. Exact cause and regression attribution are not established.

Only the inspected board process was TERM-stopped and restarted detached from
the same installed 3.61.0 artifact and the same project cwd. No broad process
kill, downgrade or registry mutation was used. Initial recovery probes returned
HTTP200: version in 48.6ms and HTML in 5.0ms; version=installed=3.61.0, stale=no.
The async task-cache warm-up completed in 4380ms. This is recovery, not a fix
or sustained-responsiveness proof. P1 bug great_cto-932g.7 remains open.
Private sample SHA-256:
`fe8870213ccfd0a49520a19c5de90412e7ad33f05122f78b81901f6ab9aa9885`.

The replacement stalled again about 17 minutes later: version at a fixed 3s
probe deadline returned HTTP000 and zero bytes. A second exact-board restart
adds a private diagnostic preload, leaving installed source unchanged. The
preload preserves subprocess options/results and records no raw argv/cwd/output.
It identifies one concrete blocking path: routes.mjs:863 inbox elsewhere read,
data-readers.mjs:516 inboxElsewhere ->407 getInbox, beads.mjs:788 getTasks
->459 bdList ->112 bd spawnSync. One actual synchronous `bd` call took
19379.18ms; subsequent cross-project reads added further serial delay.
This proves an event-loop blocking request path, not the exclusive cause of
earlier indefinite stalls. Owned async `bd list` children also exceeded six
minutes despite a declared 20s timeout; their full lifecycle still needs repair.
The second native sample SHA-256 is
`31dbf849f9c01113a8b633faf66b3756a55e27edb49b5a860536a79425dc08eb`.
P1 remains open; a diagnostically instrumented restart is not a product fix.

The standalone helper was deployed to a stable global configuration location.
Its SHA-256 matches both reviewed source and installed Codex plugin:
`3e0ab7ae9f0eef74070a8669587f650a40ed94bf41e66ea27f53c1aae05df0da`.
The official configured marketplace origin was independently read before enable.
The new per-user launchd job runs `/bin/sh` with that helper, the resolved Codex
binary and explicit Node PATH. Plist readback confirms RunAtLoad and interval
21600 seconds. Its first actual run ended with exit 0, `upgradedRoots` naming
the great-cto marketplace and an empty errors array.

A loaded legacy job existed although its old plist was absent. Initial enable
failed with bootstrap error 5. The exact legacy label, program and idle state
were inspected; that owned registration was booted out, then enable succeeded.
Automatic repair is not shipped: follow-up bug great_cto-932g.6 records this edge.
No active refresh or unrelated job was terminated.

The plugin installer also ran a Codex refresh during this deployment. Both
commands succeeded; exclusive attribution of the 3.60.0-to-3.61.0 transition to
the timer is therefore not established. The six-hour recurring tick has not
yet been observed. Scheduling state alone is not installation evidence.

## Rollback and boundaries

No rollback was needed. If startup or origin validation regresses, disable the
exact updater job and restore the preserved stable helper/registration only
after inspecting job state. The preceding 3.60.0 plugin caches and saved 3.59.1
CLI archive remain available; restoring a cache also requires matching host
registration and an independently verified board restart. Do not force-kill a
running refresh or blindly overwrite host configuration.

The updater follows the configured Git ref (main by default), which can advance
ahead of npm. It does not update the npm CLI, approve gates, publish or merge.
It has no scheduled-command timeout; removed Node/Codex/helper paths require
re-enable. New sessions and host hook review remain necessary. Installation
does not prove hot-loading, a fresh live-model benchmark, a measured quality
uplift or full adaptive pipeline compatibility.
