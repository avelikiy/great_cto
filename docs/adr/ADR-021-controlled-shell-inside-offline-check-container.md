# ADR-021 — A controlled shell sequences offline checks inside the container

**Status:** Accepted
**Date:** 2026-09-08
**Deciders:** great_cto core
**Supersedes:** —
**Superseded by:** —

## Context

The Codex host controller accepts operator-owned check policies as arrays of
arguments. It must copy a filtered read-only input snapshot into writable tmpfs,
run several checks in order, send check logs to stderr, and finally return an
explicit artifact set on stdout. Docker supplies one entrypoint per container.

The repository deliberately removed shell-string construction from host-side
call sites in 3.27.6. Reintroducing the same pattern on the host would restore
command injection through titles and paths. The new check executor is different
in mechanism and trust boundary, but that difference must be explicit.

## Decision

Use `/bin/sh -c` **inside the digest-pinned offline container only** as the
sequencer. The host still invokes Docker through `execFile` with an argument
array. Every operator-provided command argument is encoded with POSIX
single-quote escaping; NUL is refused. The generated script owns only four
operations: copy `/input` to `/work`, run commands serially, redirect their
stdout to the log stream when exporting, and invoke the fixed artifact exporter.

The container has no network, capabilities, host home, credential mount, Docker
socket or writable host output mount. It runs nonroot with a read-only root and
bounded tmpfs. The policy and image digest are recorded as evidence. A shell
inside this boundary is command execution by design, not a parser used to reach
the host.

## Consequences

- Images used for checks must contain POSIX `sh`; export-enabled images must also
  contain Node for the fixed exporter.
- Correct escaping is load-bearing and has both a hostile-argument regression
  test and a witness marker.
- An operator-controlled command can destroy `/work` or exhaust its bounded
  allocation. It cannot modify the input snapshot or host project through the
  mounts the controller supplies.
- Repository code executed by a permitted command remains untrusted code. The
  container boundary, not the command name, is the control.

## Exit criteria

Remove the shell when the executor can express copy, ordered argv execution,
stdout/stderr separation and artifact extraction through direct container APIs
or one process per step without losing the same filesystem snapshot. That design
must preserve timeout cleanup and the current evidence contract.

## Alternatives rejected

- **Host shell.** Rejected because project and policy data would reach a parser
  with host credentials and filesystem access.
- **One container per command.** Rejected because build state in `/work` would
  be lost or require a writable cross-container mount and a larger cleanup API.
- **Allow one command only.** Rejected because it pushes sequencing back into an
  opaque repository script and weakens per-command evidence.
