# Verified updates

This is the approved ADR-045 implementation contract. It does not attest that a
particular release passed real signing, publication or installed-runtime checks.
Local-key enrollment and the amended implementation remain separate steps.

## Supported boundary

Local CI/CD is the operational release route. Under explicit `local-ed25519`
policy the updater accepts exact stable releases of `avelikiy/great_cto` only
when the separately enrolled release key signs the index and every deliverable.
The fingerprint is SHA-256 of canonical Ed25519 SPKI DER. A public key or
fingerprint offered by the candidate does not grant trust.

The optional hosted schema-1 route retains its fixed GitHub Actions issuer,
`.github/workflows/publish.yml`, exact release tag and certificate workflow SHA.
The two routes are separate policies, never fallback alternatives. Local-key
signatures do not claim GitHub OIDC provenance or transparency-log inclusion.

Both routes check source identity, index, every artifact digest and archive
membership before activation. The first adapter supports an owned plain global
npm prefix and installs the admitted tarball offline with lifecycle disabled.
A private transaction preserves only its package and bin link. Concurrent drift
causes refusal or `RECOVERY_REQUIRED`. Initial `LEGACY_LOCAL_RECOVERY` restores
preexisting local state; it does not authenticate the old installation.

Volta, pnpm, native marketplace activation and automatic companion installation
remain unsupported until their own executable-byte and recovery contracts pass.
No clone, cache removal, settings change or host execution may precede admission.
A verified archive does not authorize native-session activation or runtime fetches.

## Local release authority and toolchain

Initial trust requires the operator to independently authenticate a dedicated
Ed25519 public key and its SPKI fingerprint. Do not derive trust from a release
asset, create a key automatically or reuse the Git signing key implicitly.
Private material remains outside the repository, candidate staging and logs.
No production key has been selected or enrolled by architecture approval.

The local configuration contract is schema 2 with explicit
`profile: local-ed25519`, `publicKey: {path, fingerprint}` and
`npm: {path, sha256}`. Paths must be canonical and outside candidate staging;
configuration is private and refuses overwrite/implicit rotation. Enrollment
needs explicit independent-trust acknowledgement. The consumer checks the
fingerprint against canonical SPKI DER before verifying any release signature.
Trusted Node crypto/runtime and the surrounding Node/npm installation remain
operator toolchain assumptions; hashing npm's entrypoint does not attest its
complete dependency closure. Configuration syntax must follow the implemented
CLI help. With independently approved key material and tool pins, the local
enrollment syntax is:

```bash
great-cto distribution configure --profile local-ed25519 \
  --public-key /absolute/operator/release-public.pem \
  --key-fingerprint APPROVED_SPKI_SHA256 \
  --npm /absolute/operator/npm --npm-sha256 APPROVED_NPM_SHA256 \
  --acknowledge-independent-key
```

The placeholders are not actual trust pins or enrollment approval. The current
signer accepts a canonical unencrypted PKCS8 Ed25519 private file with owner-only
0600 permissions; encrypted-key, keychain and hardware-signing adapters are not
implemented. Never place that private file in the repository or artifact set.

The separate hosted configuration still requires independently authenticated
Cosign v3.1.4, compiled verifier/root pins and an operator-selected npm executable.
Those existing requirements are not a local-profile prerequisite.

In-place rotation/revocation commands are currently unsupported, and production
key-lifecycle acceptance remains NOT_RUN. Reviewed explicit operator trust
replacement/removal with an independently authenticated fingerprint is the
required future contract, without automatic migration. Existing-key possession
or an artifact-supplied next key cannot authorize it. Retained tickets recheck
the trusted key file on each use; removing configuration is not a revocation
registry and does not revoke a ticket already held in memory. Remediation of
held tickets or running compromised code needs separate reviewed authority.

## Signed local format

The schema-2 release index retains the existing source/artifact fields and uses
`publisher: {profile: local-ed25519, keyFingerprint: <64 lowercase hex>}`.
Each of its five final blobs, including the index, has a sidecar named
`<filename>.signature.json`, with exactly `schema: 1`, `profile: local-ed25519`,
`keyFingerprint`, `filename`, `indexDigest` and `signature`.
`indexDigest` is SHA-256 of the final index bytes; `signature` is canonical
base64 for a 64-byte Ed25519 signature. The signature input concatenates UTF-8
`great-cto-release-v1\n`, canonical `JSON.stringify({filename,indexDigest})`,
UTF-8 newline, then the unmodified blob bytes. This binds the namespace, filename
and complete release index; no self-referential signature digest is stored.
Malformed JSON, fields, key type, base64, profile or context refuse admission.

## Release sequence

1. Run local canonical gates and independent reviews on the exact source commit.
2. Produce npm and complete plugin archives, inventory, SBOM and index once.
   Compare a second clean build byte for byte, then freeze the output set.
3. After separate key selection/enrollment, sign all five final blobs through
   the selected local profile without publication or installation.
4. Admit them using the production consumer, then complete artifact/ship gates.
5. Require approval pins for the exact commit and index digest, then recheck
   current public tag/source ancestry in main before any registry mutation.
   Use an explicit canonical owner-only 0600 npm auth file, retaining only the
   registry-scoped _authToken in private temporary config; strip ambient npm
   credentials/config and Node preloads. Publish the original admitted tarball
   with lifecycle disabled, without rebuild, repack or unsigned fallback.
   Read back npm bytes/integrity and preserve immutable signed GitHub assets.
6. Activate only supported installations under separate authority and verify
   the actual running version. Treat native-host uptake as a separate boundary.

`cd-local --publish` and release helpers must refuse unadmitted inputs before
external mutation; historical clean-tree/npm-login checks alone are insufficient.
The hosted route instead signs in its exact-tag SIGN_ONLY run and publishes
through its separately configured protected owner-review environment.

The local source commands deliberately separate signing from publication.

One version has one writer on the machine: Codex and Claude Code both release
from it. `bump-version.sh` claims the version first, before it changes any file.
It writes an atomic, expiring lease file at
`~/.great_cto/release-lease/great-cto@VERSION.json`. The claim is refused in
three cases: another session holds the version, the remote tag or the npm
version is already taken, or the remote could not be checked. Before the tag,
bind the lease to the exact commit. The npm publisher refuses a first
publication unless the lease is live, belongs to this session and is bound to
`--approve-commit`. A readback of a version npm already serves does not need the
lease. After the GitHub release, release the lease. `journal.jsonl` beside the
lease files records every claim, renewal, rebind, takeover and release.

The holder is the host session: `CLAUDE_CODE_SESSION_ID`, or Codex's
`CODEX_THREAD_ID` / `CODEX_SESSION_ID`. A human running the chain from a plain
terminal sets `GREAT_CTO_RELEASE_HOLDER` to a name unique to this release, for
that release only. Never export it in a shell profile: every session would then
share one name.
Without one, every command refuses, because a shared fallback would let a second
session "renew" the first session's claim. Run every step of one release under
the same holder. A lease expires after 12 hours. The holder renews it by running
`acquire` again. A lapsed lease is renewed only if nobody took the version in
the meantime: the remote tag is either absent or points at the lease's bound
commit. That is how a 2FA rerun the next morning works. Another session may take
over an expired lease only after checking that the tag and npm version are still
free. Every write takes a per-version lock, and the lock is never taken over
automatically. A process that died inside it leaves the version refused, and the
refusal names the lock to remove once no release of that version is running:

```bash
node scripts/lib/release-lease.mjs bind --version EXACT_VERSION --commit REVIEWED_COMMIT
# … sign, publish npm, publish the GitHub release …
node scripts/lib/release-lease.mjs release --version EXACT_VERSION
```

```bash
node scripts/sign-local-release-artifacts.mjs \
  --directory /absolute/private/prepared-set --version EXACT_VERSION \
  --commit REVIEWED_COMMIT --private-key /absolute/operator/release-private.pem \
  --key-fingerprint APPROVED_SPKI_SHA256

node scripts/publish-local-release.mjs \
  --directory /absolute/private/signed-set --version EXACT_VERSION \
  --source /absolute/reviewed/checkout \
  --public-key /absolute/operator/release-public.pem \
  --key-fingerprint APPROVED_SPKI_SHA256 \
  --npm /absolute/operator/npm --npm-sha256 APPROVED_NPM_SHA256 \
  --npm-auth-file /absolute/operator/registry-only-auth \
  --approve-commit REVIEWED_COMMIT --approve-index-digest APPROVED_INDEX_SHA256 \
  --approval local-owner-release
```

The approval flags identify an operator decision; they do not run or attest
the full source, artifact or ship gates. The npm command returns
`githubRelease: NOT_PUBLISHED`. The separate GitHub publisher requires the same
approved set and a canonical owner-only token file:

```bash
node scripts/publish-local-github-release.mjs \
  --directory /absolute/private/signed-set --version EXACT_VERSION \
  --source /absolute/reviewed/checkout \
  --public-key /absolute/operator/release-public.pem \
  --key-fingerprint APPROVED_SPKI_SHA256 \
  --github-token-file /absolute/operator/github-owner-token \
  --approve-commit REVIEWED_COMMIT --approve-index-digest APPROVED_INDEX_SHA256 \
  --approval local-owner-release
```

It independently reads back npm bytes first, checks the token owner and repository
write permission, then creates or resumes a source-bound draft. It never replaces
or deletes assets. All ten files must read back byte-identically before the draft
is published, followed by a second public readback. A failed upload leaves the
draft for inspection and exact retry. No API-returned upload URL chooses a
credential destination; authorization is stripped on allowed asset CDN redirects.
If tag lookup omits an existing draft, inspect the draft in the fixed repository
and pass `--resume-release-id DRAFT_RELEASE_ID`. This must be a canonical positive
decimal safe integer. The returned ID, owner, tag and approved commit must match;
a 404 or mismatch refuses before uploads and never creates a replacement draft.
Uploads request JSON metadata while sending the original octet-stream body;
binary downloads continue to request octet-stream responses.
Public npm metadata requests use `application/json`, not GitHub's vendor media type.
GitHub REST cannot atomically compare the complete asset set and publish it;
another authorized writer can race those requests. The client detects observed
drift and verifies before and after publication, but assumes other authorized
writers do not mutate this release during the transaction. This is not a claim
of server-enforced release immutability. Production publication, signed-asset
availability and remote self-update end-to-end still need actual release proof.

Existing `v3.71.0` is an immutable preparation tag whose hosted run failed before
build. Changed source needs a fresh version/tag; never move it or infer a release.
Source tests and generated fixture keys have authority `NONE`, never production
release eligibility. An old timer still runs its old cached code until an
explicitly authorized migration changes it.
