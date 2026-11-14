# Release-key ceremony — enrol the key `init` trusts

**Who:** the owner, on their own machine. No agent generates, holds or sees this key.
**Time:** about an hour, most of it the backup.
**Why now:** `EMBEDDED_RELEASE_KEY_FINGERPRINT` in `packages/cli/src/release-trust.mjs` is
`NOT_ENROLLED`, so production admission refuses every embedded plugin set and `npx great-cto init`
has no install path on the current version ([plan](../plans/PLAN-archon-lessons.md), blocker B1;
[ADR-050](../adr/ADR-050-managed-plugin-activation.md)).
**Related:** [ADR-045 verified distribution](../adr/ADR-045-verified-distribution.md) ·
[ARCH-plugin-activation](../architecture/ARCH-plugin-activation.md) ·
[verified updates](../reference/verified-updates.md)

## What the key is, and what it is not

- One dedicated **Ed25519** key. Not the Git signing key, not an SSH key, not reused anywhere.
- Its **fingerprint** — SHA-256 of the public key's SPKI DER — is a source constant. A release
  signed by any other key is refused by every CLI that carries this constant; changing it is a
  reviewed commit, never release metadata.
- The signer (`scripts/sign-embedded-release-set.mjs`, `scripts/sign-local-release-artifacts.mjs`)
  reads an **unencrypted PKCS8 PEM file, mode 0600, outside the source tree**. Encrypted-key,
  keychain and hardware-token adapters are not implemented (`docs/reference/verified-updates.md`).
  So the protection is where the file lives, not the file format — see step 1.
- **Limit, stated:** the pin travels inside the npm tarball it protects. A compromised npm account
  replaces CLI, pin and signed set together (ARCH-plugin-activation, risk R1). The key protects
  everything after first install; npm 2FA and publish provenance protect first install. Step 6.

## 1. Choose where the private key lives

On an encrypted volume that is mounted only for a release, on the owner's machine:

- **macOS:** Disk Utility → File → New Image → Blank Image, *Encryption: 256-bit AES*, a password
  kept in a password manager, not the login keychain. Mounted at e.g. `/Volumes/gcto-release`.
- **Linux:** a LUKS container or an encrypted USB stick, mounted at e.g. `/media/gcto-release`.

Not in the repository, not in a synced folder (iCloud Drive, Dropbox, OneDrive), not in a CI secret.
`enroll-release-key.mjs` refuses a path inside the git tree.

## 2. Generate

```bash
cd ~/path/to/great_cto            # a clean checkout of main
node scripts/enroll-release-key.mjs --generate /Volumes/gcto-release/great-cto-release.pem
```

Output: the private key (0600, never overwritten if it exists), `great-cto-release.pem.pub` beside
it, and the fingerprint. Copy the fingerprint somewhere you will see it again (step 4).

## 3. Back up before anything depends on it

A lost key means every installed CLI refuses every future release until users install a CLI with a
new pin by hand. So, before step 4:

- a second copy of the encrypted image on an offline medium kept apart from the machine;
- optionally a paper copy of the PEM (it is 3 short lines) in a safe;
- check the backup: mount it and run
  `node scripts/enroll-release-key.mjs --public-key <backup>/great-cto-release.pem.pub` —
  the fingerprint must match step 2.

## 4. Pin it in source, as a reviewed change

```bash
git switch -c chore/enrol-release-key
node scripts/enroll-release-key.mjs --public-key /Volumes/gcto-release/great-cto-release.pem.pub --write
git diff                           # exactly one line: the sentinel becomes the fingerprint
```

Pass only the **public** file; the tool refuses a private key on this flag. Then:

```bash
node --test tests/lib/enroll-release-key.test.mjs
(cd packages/cli && npm run build && node --test tests/embedded-admission.test.mjs)
node --test tests/e2e/plugin-activation/*.e2e.test.mjs
bash scripts/ci-local.sh --quick
git commit -am "chore: enrol the release key"
```

Open the PR yourself and merge it yourself: this is the one change in the repository whose author
must be the key holder. Publish the fingerprint where a user can compare it independently of npm —
the GitHub release notes and the repository README — so the pin is checkable from two places.

`--write` refuses to replace a pin that is already enrolled. Rotation is its own decision (below).

## 5. First signed build, before publishing anything

```bash
FP=$(node scripts/enroll-release-key.mjs --public-key /Volumes/gcto-release/great-cto-release.pem.pub)
node scripts/enroll-release-key.mjs --public-key /Volumes/gcto-release/great-cto-release.pem.pub --check
node scripts/build-release-artifacts.mjs --out "$(mktemp -d)" \
  --embedded-key /Volumes/gcto-release/great-cto-release.pem --embedded-key-fingerprint "$FP"
```

`build-release-artifacts.mjs` signs the embedded set and then runs the CLI's own
`admitEmbeddedRelease` over it: a set the CLI would refuse is never left on disk. `"state":"PREPARED"`
in its output is the pass. Publishing is a separate, `gate:ship` step (`scripts/release.sh`,
`scripts/publish-local-release.mjs`); this ceremony authorises none of it.

Unmount the volume when done.

## 6. npm account, before the first publish with the pin

- 2FA on the npm account in **auth-and-writes** mode.
- Prefer the hosted publish (`.github/workflows/publish.yml`), which already runs
  `npm publish --provenance`: a tarball not built from this repository is then visible as such.
  A local publish carries no provenance.

## If the key is lost or exposed

- **Exposed:** stop publishing. Generate a new key (steps 1–3). Rotation is a reviewed source change
  with an ADR: it says which releases the old key signed, from which version the new pin applies, and
  how a user on an old CLI moves (a manual `npm i -g great-cto@<new>`; an old CLI will refuse the new
  key's sets by design). Edit the constant by hand in that PR; `--write` will not do it for you.
- **Lost, not exposed:** the same rotation, without the incident note.

## Checklist

- [ ] encrypted volume created, password in a password manager
- [ ] key generated outside the tree, fingerprint noted
- [ ] offline backup made and its fingerprint checked
- [ ] pin PR: one-line diff, tests green, merged by the owner
- [ ] fingerprint published in release notes and README
- [ ] first signed build reports `PREPARED`
- [ ] npm 2FA (auth-and-writes) and provenance on
