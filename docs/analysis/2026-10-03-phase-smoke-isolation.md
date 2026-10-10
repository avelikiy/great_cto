# Exclusively owned phase lifecycle fixture

Related: [board HTTP fixture](2026-10-03-board-smoke-isolation.md) and
[hook lifecycle contract](../HOOKS.md).

Stock L4b delegates to `scripts/lib/phase-smoke.mjs`. The helper allocates a
fresh canonical private directory using `mkdtemp`, with a dot-free basename
compatible with Beads. It never deletes a predictable PID path before init.
Repositories, databases and the sandbox CLI wrapper are beneath that root.
The child environment is allowlisted, sets an explicit local `BEADS_DIR`,
and does not inherit Beads server/central-config overrides or credentials.
Every Beads invocation uses `--sandbox` to disable automatic remote pushes.
Initialization skips agent-file generation and git hooks. HOME and CODEX_HOME
are not reassigned. This is trusted CLI containment, not an OS sandbox.

The actual `phase-task.sh`, git initialization and Beads 1.2.2 execute. Five
logical checks cover labelled fixture task creation, idempotent re-open,
start/close transitions, blocked failure and exactly eight closed synthetic
phase tasks. Both parent gates must remain open. These assertions inspect
actual JSON state rather than counting matching console strings.
Each task's parent gate dependency must exist in that same database; an open
but unrelated gate cannot satisfy the fixture.

Cleanup repeats directory type, canonical path, device/inode/owner and private
permission checks, then removes only the exclusively allocated root. A changed
directory, symlink or widened permissions refuses cleanup. This check is not
an atomic protection against a concurrent process with the same UID. Failed or
timed-out commands retain the root for inspection; a timeout is not proof that
all descendants have stopped. Successful CLI return also does not provide an
OS-level descendant containment certificate.

The native fixture run verified five lifecycle checks and eight closed phase
tasks, with gates still open and no model calls. Ownership regression tests
cover distinct roots, repeated cleanup, replacement directories/symlinks and
widened permissions. Stock L4b counts the assertions as one grouped check;
it explicitly marks actual role/model execution, deployment and human approval
NOT CHECKED. This does not prove the full Codex/Claude pipeline, independent
review, security approval or installed artifact parity. Full CI and artifact
verification remain tracked in great_cto-p4o9.5.9. No installation, release or
default change is part of this fixture.

Full-suite preflight found predictable L1 log paths and a fixed-port MCP
readiness check without owned-listener proof. Those are addressed separately by
the [captured-log/owned MCP fixture](2026-10-03-mcp-smoke-isolation.md) in
great_cto-p4o9.5.9.4. This phase fixture's passing result is not full CI proof.
