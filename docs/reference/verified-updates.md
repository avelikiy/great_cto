# Verified updates

This is the implementation contract for ADR-045. It does not attest that a
particular release has passed hosted signing, publication or installation.

## Supported boundary

The updater accepts an exact stable release of `avelikiy/great_cto`, signed by
`.github/workflows/publish.yml` at that version's tag. It checks the certificate
workflow commit, signed index, every artifact digest and archive membership
before activation. An ordinary npm package, a source checkout or a valid
signature from another workflow is insufficient.

The first adapter supports an owned plain global npm prefix. It installs the
admitted local tarball offline with lifecycle scripts disabled. A private
transaction preserves only the selected package and its bin link. Unknown
concurrent changes cause a refusal or `RECOVERY_REQUIRED`, rather than an
overwrite. Recovery of an initial local snapshot is labelled
`LEGACY_LOCAL_RECOVERY`; it does not authenticate that old installation.

Volta, pnpm, native marketplace activation and automatic companion installation
are unsupported until their own executable-byte and recovery contracts pass.
The CLI refuses these routes before clone, cache removal, settings changes or
host execution. Existing plugin sessions are not proof of a verified update.
Source-only release and eval-development tools require the repository checkout;
they are excluded from the plugin runtime rather than bundling test fixtures.

## Operator toolchain

`great-cto distribution status` checks local verifier configuration without
admitting a release. Initial configuration requires independently authenticated
Cosign v3.1.4, the reviewed Sigstore trust root and an operator-selected npm
executable. Record canonical absolute paths and SHA-256 digests:

```sh
great-cto distribution configure \
  --cosign /absolute/path/to/cosign --cosign-sha256 <sha256> \
  --trusted-root /absolute/path/to/trusted_root.json --root-sha256 <sha256> \
  --npm /absolute/path/to/npm-cli.js --npm-sha256 <sha256> \
  --acknowledge-independent-toolchain
```

The configuration is private and is not overwritten automatically. Production
admission additionally enforces the verifier and root digests compiled into the
consumer. Supplying a self-chosen digest does not grant trust. npm's executable
and its surrounding Node/npm installation remain an operator toolchain
assumption; hashing its entrypoint does not attest its dependency closure.

`great-cto upgrade --self` discovers a stable published version, downloads only
fixed repository assets within size limits, verifies them, then invokes the
supported adapter. Missing signatures or unsupported ownership preserve the
selected installation. Selecting the current version reports `ALREADY_CURRENT`
without claiming artifact admission.

## Release sequence

1. Validate and independently review the exact source commit.
2. Build npm and complete plugin archives, inventory, SBOM and index once.
   Compare an independent clean build byte for byte.
3. Run the exact-tag hosted `SIGN_ONLY` workflow. It signs and verifies every
   final blob without publishing a registry version or GitHub Release.
4. Independently admit the returned artifacts and complete the ship checks.
5. Resume publication through the preexisting protected owner-review
   environment, referencing the immutable successful signing-run artifact ID.
   Publish the original npm tarball and compare registry readback bytes.
6. Activate only supported installations and verify the running version.

Source tests, injected verifiers and upstream cryptographic fixtures cannot
authorize production publication. A refused native route is an enforced safety
boundary, not evidence of complete native installation support. An old timer
continues to run its old cached code until an authorized migration changes it.
