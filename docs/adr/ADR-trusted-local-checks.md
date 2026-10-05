# Explicit trusted local checks alongside Docker

Status: Accepted for implementation, not released
Date: 2026-10-05
Decider: CTO approval of optional Docker for trusted projects
Tracking: great_cto-p4o9.8.5

## Context

The controller's optional deterministic checks previously required Docker.
Desktop availability can block even package-free, trusted Node projects.
Removing checks or substituting local execution in an already approved run
would invalidate evidence and hide a security-boundary change.

## Decision

Add an explicit local execution backend with mandatory boolean trusted consent.
Omitted backend remains Docker; unsupported and automatic backends fail closed.
There is no Docker-to-local fallback. Existing frozen runs, digests, approvals
and installed candidates are untouched. Policies remain operator-owned outside
the workspace and snapshotted by the existing CLI. Workers cannot choose trust.

Local execution uses argv without a shell, selected-input temporary snapshots,
a minimal environment, bounded time/output and existing artifact validation.
Evidence separates backend/isolation/runtime from command success. Executable
hashes are observed provenance, not immutable pins or prevention of TOCTOU.
Release smoke selects its backend independently of publication adapter and
retains source/artifact binding and independent release approval.

## Options and trade-offs

Docker-only retains stronger filesystem/network/resource controls but requires
a running daemon for trivial checks. Silent fallback improves availability by
changing security semantics invisibly and is rejected. Explicit local execution
reduces setup friction while making weaker guarantees inspectable. Another
sandbox is a future distinct backend, not a label applied to local execution.

## Security and consequences

Local code runs with the operator's privileges. Neither temporary cwd nor a
filtered environment prevents access to host secrets, filesystem or network.
Same-process-group cleanup bounds ordinary POSIX children, not malicious code
that escapes the group. Do not run untrusted code here. Docker remains available
with its existing pinned image and isolation flags. No automatic install,
dependency fetch, marketplace update or production deployment is introduced.

Tests exercise real local child processes, artifacts and release smoke, plus
controller repair/gate flow with explicitly mocked model responses. These do
not constitute a new live Codex/Claude full-graph acceptance or quality benchmark.
