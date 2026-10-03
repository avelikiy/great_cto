# Board state and discovery namespace prerequisite

Related: [SessionEnd smoke isolation](2026-10-03-session-end-smoke-isolation.md)
and [hook lifecycle contract](../HOOKS.md).

Stock L4 starts the installed board at repository cwd. `--no-open` suppresses
only browser opening: startup still discovers projects, warms Beads, creates
the verdict watcher directory, and starts notification cron/watchers. Those
operations must not use operator state during validation.

## Source changes

The board's global state base now honors `GREAT_CTO_HOME`, matching the CLI.
Unset or empty values retain the existing `~/.great_cto` default. Registry,
share state, VAPID keys, push subscriptions, notification history, alert dedupe,
verdicts, and global patterns derived from that base select the namespace.
Existing explicit registry/history file overrides retain precedence. Three
global memory layers previously bypassed the config base through a direct
home lookup; they now use it too. Their display paths name `$GREAT_CTO_HOME`
when selected, without exposing absolute fixture paths.

`getDiscoveryScope()` provides an explicit `GREAT_CTO_DISCOVERY_ROOT` option.
It must be an absolute existing directory and is canonicalized before scanning.
Explicit invalid values refuse; they never fall back to home discovery. In this
mode discovery scans only that root with the existing one-level depth and does
not decode the Claude known-project cache. Unset/empty values retain the
original eight home roots and Claude cache lookup.

This controls automatic discovery, not authorization: it does not constrain
manually registered projects, request path resolution, or cwd registration.
The future smoke must provide a private cwd, private registry and bounded
fixtures as well. This is not a tenant isolation or OS sandbox claim.

## Evidence and caller impact

Five new tests exercise derived state paths, explicit overrides, default
compatibility, actual scoped discovery with an excluded ambient fixture,
invalid-scope refusal, and global memory reads from the selected namespace.
The ambient fixture registry and lessons remain byte-identical. Test child
home lookup is stubbed; `HOME` and `CODEX_HOME` are not repurposed.

The config consumers (alerts, data readers, fleet, notifications, projects,
routes, share, util, verdicts, watchers, server) were inspected for derived
paths and unchanged signatures. Project consumers preserve their existing
resolution and default discovery behavior. Host allowlist, project resolution,
registry, portfolio, notifications, watchers and data-reader regressions were
run. The pipeline-state reader does not call the changed memory function.

## Remaining work

The stock L4 launcher has **not yet been migrated**. Source server startup and
installed-artifact isolation/admission are not proved by these prerequisite
tests. Notification delivery, paid models, release discovery, live Beads
capture and installed delivery parity are not asserted. Full stock CI has not
run. Next: a private actual-server fixture, exact installed-artifact preflight,
bounded notification/child-process sinks, and explicit NOT CHECKED reporting
for unexecuted integrations. No plugin install, merge, release, default setting
or human/security gate changed.
