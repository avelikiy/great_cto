# ADR-045: Verified release artifacts before activation

**Date:** 2026-10-26
Status: Proposed; gate:arch pending
Extends: [ADR-044](ADR-044-host-graph-coverage.md)
Implementation contract: [ARCH-distribution-trust](../architecture/ARCH-distribution-trust.md)

## Context

The operator requested repair of the distribution-policy blocker before the
next graph release. Current updater paths install a mutable package or invoke
host marketplace refresh before checking the selected version. The plugin Git
installer can also combine a source checkout with an older CLI build.

Signed Git commits, npm registry signatures and npm provenance already provide
useful protections. npm provenance is a Sigstore-signed attestation recorded in
a transparency ledger. None of these should be described as absent simply
because the application lacks explicit preactivation admission.

## Decision

Build exact npm and complete compiled plugin archives from one reviewed commit.
Produce a strict release index and a sorted plugin runtime inventory. Sign the
index and every deliverable blob with Sigstore in the pinned GitHub Actions
publisher workflow. Publish the same packed bytes, without repacking or mixing
runtime files from an older installed CLI.

The consumer fixes repository, workflow, issuer and stable tag identity in
trusted policy. Verify the certificate workflow SHA against the signed index
commit, then verify artifact size/digests, archive membership, allowed modes,
complete runtime and installation identity before any candidate code runs.
Use a separately trusted Cosign toolchain. Candidate-provided keys, roots,
commands, broad identity regexes and disabled transparency checks are refused.
Missing proof leaves the previous selected installation unchanged.

Keep plain npm ownership in the first supported updater. Install only the
admitted local zero-runtime-dependency tarball using offline, ignore-scripts
mode, sanitized npm configuration and the exact installation prefix. Preserve
only great-cto and its bin selection in a private recovery transaction. Smoke
failure or interruption restores verified previous bytes, or reports
RECOVERY_REQUIRED if safe recovery cannot be established. For the first upgrade,
a pre-mutation hashed local legacy snapshot may be restored only as recovery of
preexisting operator state. It is labelled LEGACY_LOCAL_RECOVERY, never as an
admitted signed release, and cannot lower the highest-admitted watermark. If
that snapshot cannot be safely created, the first activation refuses.

Managed Claude registration may select only a verified immutable complete
snapshot with compare-and-swap and managed-file recovery. Native marketplace,
pnpm and Volta paths are unsupported until their own preactivation and recovery
contracts pass isolated real-host tests. They must refuse before mutation,
without invoking the old updater as a fallback. Existing hook trust is preserved.
A verified plugin archive does not admit external runtime fetched by npx MCP
entrypoints or automatically installed companion dependencies. Host activation
remains unsupported until a proven local, no-fetch route binds all executable
bytes to the admitted inventory. This includes the current Codex npx MCP entry
and Claude companion dependency resolution.
An old timer pointing to cached old code requires explicit installed-phase
migration; changing source does not change that timer.

## Alternatives

- Origin URL and post-install version checks do not bind installed bytes.
- Custom JavaScript certificate/transparency verification adds cryptographic
  implementation risk and is rejected in favor of trusted Cosign.
- Migrating every package manager to a managed shim would simplify selection
  but changes ownership and is deferred from this first contract.

## Consequences

Verification becomes an availability prerequisite: absent proof preserves the
selected version and reports a refusal. The supported adapter surface is
explicit, so unknown native and package-manager routes cannot inherit a pass
from plain npm. The first hosted signing run and legacy-client bootstrap need
separate evidence; source tests alone cannot establish either. Rollback retains
owned prior bytes without changing graph data or admitting a legacy snapshot
as a signed release.

## Bootstrap and authority

The exact production identity is the publisher workflow at an exact release
tag. A branch certificate or local test signature cannot substitute for it.
The first proof therefore needs SOURCE_ADMITTED, a candidate tag and SIGN_ONLY
hosted job, then ARTIFACT_ADMITTED and final publishing approval. SIGN_ONLY
must not publish npm or JSR, create a public GitHub Release, emit release
announcements or activate an installation. All tag-triggered publication routes,
including jsr-publish.yml, must be disabled or gated during this phase.

This ordering needs explicit approval: prior permission to publish only after
full ship checks does not itself authorize a tag before artifact admission.
Publisher settings, workflow availability and trusted verifier bootstrap remain
external prerequisites. No exception, automatic trust enrollment or invented
OIDC token is introduced. Existing failed evidence and blocked tasks remain
recorded until fulfilled or explicitly superseded with preserved acceptance.

## Acceptance and rollback

The proposed versioned contract is [distribution-trust-v1.json](../../tests/acceptance/distribution-trust-v1.json).
It adds hostile-input, actual cryptographic verification, zero-pre-admission
execution, crash/recovery, rollback and exact-byte publication checks. Existing
graph gates and frozen assertions/deadlines remain unchanged. Synthetic tests
have authority NONE and cannot establish release eligibility.

Rollback restores only owned artifact selection and managed-file changes; it
never deletes graph journals, project data or historical review evidence.
No SLSA level, hermetic reproducibility, universal native support or installed
runtime success follows from a signed blob alone.

## References

- [npm provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/)
- [Cosign verify-blob v3.1.4](https://github.com/sigstore/cosign/blob/v3.1.4/doc/cosign_verify-blob.md)
- [Sigstore blob signing](https://docs.sigstore.dev/cosign/signing/signing_with_blobs/)
