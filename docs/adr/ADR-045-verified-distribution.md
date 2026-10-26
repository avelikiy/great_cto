# ADR-045: Verified release artifacts before activation

**Date:** 2026-10-26
Status: Accepted design, amended by the operator on 2026-10-26 for local CI/CD and a pinned release key; implementation and artifact admission pending
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

Keep local CI/CD as the operational release route. The operator approved this
amendment after confirming that GitHub Actions has been billing-blocked and
`scripts/cd-local.sh` has provided local CI/CD since 2026-06-28. The previous
hosted-only decision created an unavailable prerequisite; this amendment
changes the production authority explicitly, rather than treating local tests
as GitHub OIDC evidence.

Build exact npm and complete compiled plugin archives from one reviewed commit.
Produce a strict release index, sorted plugin runtime inventory and SBOM. Sign
the index and every deliverable blob with a dedicated Ed25519 release key under
the explicit `local-ed25519` profile. Publish the same packed bytes without
repacking or mixing runtime files from an older installed CLI.

The consumer accepts only a separately enrolled public key and its SHA-256
fingerprint over canonical SPKI DER. The candidate cannot supply authority.
Enrollment requires an explicit independent-trust acknowledgement and canonical
public-key path outside candidate staging. Configuration, key creation or
selection, and initial trust are separate operator actions; approval of this
architecture authorizes none of them automatically. Never reuse the Git commit
private key implicitly or write private material into source, artifacts or logs.

Use Ed25519 through the trusted Node crypto runtime. The local profile needs no
Cosign or online signing service. It proves that the enrolled release authority
signed the exact bytes, not hosted-build provenance, transparency-log inclusion,
independent build isolation or a SLSA level. The operator-controlled Node/runtime
closure is an explicit trust assumption.

Preserve the existing hosted `schema=1` GitHub OIDC route as a separate opt-in
profile with its fixed repository, workflow, issuer, exact tag and certificate
workflow-SHA checks through separately trusted Cosign. Never fall back between
profiles on failure. Either route verifies the signed index, source identity,
artifact sizes/digests, archive membership, modes and complete runtime before
candidate code runs. Missing proof leaves the selected installation unchanged.

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
  parsing risk. Keep trusted Cosign for the optional hosted profile; local
  Ed25519 uses the standard Node crypto primitive and no X.509/Rekor parser.
- Requiring hosted OIDC for every release is rejected as the default because
  the documented operational CI/CD is local and Actions is billing-blocked.
- Unsigned local publication or accepting a key from a release is rejected: it
  removes the independently admitted publisher boundary.
- Migrating every package manager to a managed shim would simplify selection
  but changes ownership and is deferred from this first contract.

## Consequences

Verification becomes an availability prerequisite: absent proof preserves the
selected version and reports a refusal. The supported adapter surface is
explicit, so unknown native and package-manager routes cannot inherit a pass
from plain npm. Real signatures from the enrolled local release authority and
legacy-client bootstrap need separate evidence; source tests establish neither.
The hosted profile retains its own hosted signing prerequisites. Rollback retains
owned prior bytes without changing graph data or admitting a legacy snapshot
as a signed release.

## Bootstrap and authority

The local production identity is the independently enrolled Ed25519 SPKI
fingerprint, repository and release namespace. Source admission precedes two
clean build comparison, frozen outputs, signing-only preparation, actual
production-consumer admission, final ship approval, then publication and
separately approved activation. Signing-only preparation publishes no registry
version, GitHub Release or announcement and activates nothing. Local npm
publication uses explicitly authorized operator authentication; npm Trusted
Publisher and a GitHub approval environment are prerequisites of the optional
hosted profile only.

The existing candidate tag `v3.71.0` remains immutable. Its failed hosted run
produced no signed release artifacts. Changed source needs a fresh candidate
version/tag after gates; never retarget the old tag or relabel it as released.

Key enrollment and changes require explicit operator authority. Configuration
refuses overwrite and implicit rotation. In-place rotate/revoke commands are
currently unsupported; production key-lifecycle acceptance remains NOT_RUN.
The required future lifecycle contract is an independently verified new
fingerprint and reviewed operator trust replacement/removal, without automatic
migration or acceptance of an artifact-supplied key. Existing-key possession
alone cannot authorize replacement, and no lifecycle operation may lower the
version watermark. Each retained admission ticket rechecks the trusted key
file; removing configuration is not a revocation registry and does not revoke
an already held ticket. Already running code is not remotely removed.
Compromise remediation, including held tickets and active code, needs a
separate reviewed and authorized operation.

The optional hosted profile still requires the exact-tag GitHub OIDC job and
its own publisher protection/settings. A local key, branch certificate or test
signature cannot masquerade as that identity. Neither profile permits an
invented OIDC token or automatic trust enrollment. Failed evidence remains
recorded until fulfilled or explicitly superseded with preserved acceptance.

## Acceptance and rollback

The existing versioned contract is [distribution-trust-v1.json](../../tests/acceptance/distribution-trust-v1.json).
It remains frozen. [Revision 2](../../tests/acceptance/distribution-trust-v2.json)
adds local-authority coverage without rewriting the historical hosted scenarios.
[Revision 3](../../tests/acceptance/distribution-trust-v3.json) records the
separately approved test-only scorer phase-clock correction: actual readiness
is checked within the scorer's own 1000 ms window, and the 2000 ms watchdog is
anchored to observed readiness. The overall test cap stays 10000 ms; live PID/PPID,
SIGKILL and cleanup checks remain. The original failed runs remain evidence.
The documentation orphan ratchet also tightens from 47 to 46 after the newly
connected local-CI document. No production deadline, budget or release-gate
policy is relaxed. Synthetic tests have authority NONE and cannot establish
release eligibility.

Rollback restores only owned artifact selection and managed-file changes; it
never deletes graph journals, project data or historical review evidence.
No SLSA level, hermetic reproducibility, universal native support or installed
runtime success follows from a signed blob alone.

## References

- [npm provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/)
- [Cosign verify-blob v3.1.4](https://github.com/sigstore/cosign/blob/v3.1.4/doc/cosign_verify-blob.md)
- [Sigstore blob signing](https://docs.sigstore.dev/cosign/signing/signing_with_blobs/)

## Amendment source

The local path is documented in [LOCAL-CICD.md](../LOCAL-CICD.md), introduced by
`dc90600c` and amended by `3b281937` to omit unsupported local OIDC provenance.
The operator explicitly approved the local pinned-key trust amendment on
2026-10-26. That approval is architectural, not key enrollment or publication.
