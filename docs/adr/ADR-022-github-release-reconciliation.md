# ADR-022 — Reconcile GitHub assets before publishing

**Status:** Accepted
**Date:** 2026-09-09
**Deciders:** great_cto core
**Supersedes:** —
**Superseded by:** —

## Context

The controlled Codex host can approve exact artifact bytes, but GitHub Release
is an external, partially failing workflow. Creating a release, uploading assets
and publishing it are separate effects. A network failure can occur after GitHub
commits any one of them and before the controller receives the response.

Treating a retry as a fresh publish can create a duplicate release. Uploading
with `--clobber` is worse: GitHub CLI deletes the existing asset before uploading
its replacement, so a failed retry can destroy the last remotely retained copy.

## Decision

Create or reuse one draft identified by the approval-bound repository, tag and
target commit. Map every approved artifact to a deterministic remote asset name.
On every execution, inspect the draft, reject unexpected assets, upload only
missing names without `--clobber`, download every remote asset and compare its
SHA-256 with the approved candidate. Run the pinned offline smoke policy against
the downloaded bytes. Publish only after all checks pass.

The release policy stores no GitHub token. Authentication and authorization are
delegated to the installed `gh` credential store. The controller invokes `gh`
with argument arrays and disables interactive prompting.

## Consequences

- An interrupted upload or publication can be reconciled without generating a
  second tag or overwriting an asset.
- A remote release with an unexpected asset, different target or different bytes
  fails closed and requires operator investigation.
- Temporary upload and download files are private and deleted after verification.
- A pre-existing published release is accepted only when its target and every
  asset match the approved candidate and smoke passes again.
- No live GitHub release is created by automated tests; integration tests use a
  stateful fake `gh` boundary and assert the exact non-interactive command flow.

## Rollback and activation contract

GitHub Release publication has `activation: none`. It does not deploy a service,
change traffic or mutate a runtime. Therefore deleting a release cannot restore
a previous runtime and is not a rollback.

Rollback is `superseding-release`: build the previous known-good source as a new
candidate, pass the complete QA/security/release gates, and publish a new tag.
The original release remains immutable audit evidence. Service activation and
infrastructure rollback require a separate adapter with its own observable state,
health checks and approval binding.

## Alternatives rejected

- **Publish directly.** A failed upload can leave a public partial release.
- **Retry with `--clobber`.** It deletes evidence before replacement succeeds.
- **Trust GitHub metadata only.** Names and sizes do not prove approved bytes.
- **Delete on rollback.** Removal does not reverse a deployment and destroys the
  evidence needed to understand it.
