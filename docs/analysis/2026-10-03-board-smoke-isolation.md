# Actual isolated board HTTP smoke

Related: [board namespace prerequisite](2026-10-03-board-state-namespace.md),
[SessionEnd fixture](2026-10-03-session-end-smoke-isolation.md), and
[hook lifecycle contract](../HOOKS.md).

Stock L4 now delegates to `scripts/lib/board-smoke.mjs` rather than launching
the board at repository cwd. The trusted-artifact preflight requires every
global state path to select the fresh fixture namespace and the discovery
scope to exclude home/Claude cache lookup. Unsupported artifacts refuse with
`BOARD_SMOKE_ISOLATION_UNSUPPORTED` / exit 77 / NOT CHECKED before server start.
No fallback to operator state is used. Module initialization is trusted code,
not a malicious-module sandbox.

## What really executes

The artifact's actual HTTP server, router, discovery and filesystem readers
run in a private fixture project. A child-local builtin home patch prevents
direct home lookups from reading operator Claude metadata; neither HOME nor
CODEX_HOME is repurposed. The environment is allowlisted, including only the
dedicated state/discovery scope and loopback bind configuration.

Beads reads return a synthetic completed task. Other child process APIs are
intercepted: git observations are not executed; unknown process attempts fail
the result. External fetch/http/https requests are refused and recorded. Fixture
notifications are disabled and push subscriptions are empty. No credentials
are inherited and no real Beads/model child or notification delivery occurs.
These controls cover the trusted implementation's APIs, not arbitrary native
code or OS-level networking/process isolation.

An OS-selected port is reserved then released before launch. Readiness requires
the owned child's IPC event from the actual server listener and the same bound
port, not HTTP from an unknown port owner. A bind collision or exit zero before
listening fails; it does not become an existing-server success. Cleanup signals
only the direct child and removes only the fresh root. Required forced cleanup
makes the smoke fail.

## Assertions and limits

The smoke requests the original eleven JSON endpoints: projects, agents,
metrics, cost, memory, inbox, resume, decisions, pipeline, logs and tasks. It
requires the private project inventory, the copied agent fixture inventory,
four named specialist agents, eleven memory layers, project/global scopes,
and a positive task-estimation denominator with rate ratio in 470–530.
Source evidence: 71 copied agents and a synthetic ratio of 500. This ratio is
a test of estimation arithmetic, **not** a measured quality/cost improvement.
The original vacuous no-task ratio pass is removed.

Actual operator installed-agent parity is not proved by copying source agents;
stock L5 retains the separate parity checks. Stock L4 explicitly marks actual
git/Beads capture, notification delivery, release discovery/cron, and operator
agent inventory as NOT CHECKED. Parent goal requirements remain open.

The current selected installed local 3.48.0 board refuses exit 77 before launch:
it lacks the new namespace/discovery contract. The source board exercises all
eleven endpoints successfully. Negative tests cover legacy refusal before
entrypoint, exit-zero-before-listening, and intercepted model launch. Full stock
CI has not run. L4b now uses [exclusively owned temporary roots](2026-10-03-phase-smoke-isolation.md)
instead of pre-deleting predictable PID paths (great_cto-p4o9.5.9.3).
Installed plugin/defaults/releases and human/security gates are unchanged.
