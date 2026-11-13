# ADR draft: macOS app as a distribution channel, with an amendment to ADR-045

**Status:** Draft for the owner. Not accepted, not numbered, authorizes no code and no build.
**Date:** 2026-11-10
**Source:** [RFC-cockpit-for-non-developers.md](RFC-cockpit-for-non-developers.md), owner's decisions 4, 5 and 8.

## Context

- Channels today: npm package, Claude Code plugin, Codex plugin. A non-developer has no
  terminal and no Node, so none of them reaches that user.
- ADR-009: a new channel escapes the machine and needs a human decision.
- ADR-045: nothing activates before admission; a release is one signed index plus signed
  deliverables. `docs/reference/verified-updates.md` fixes the set at five final blobs and
  ten files.
- ADR-007: the board is always on.
- The owner decided: cockpit first through npm, then the app.

## Decision (proposed)

1. **Artifact.** One `Great CTO.app` in a `.dmg` (working name). A native Swift shell with a
   WKWebView, a bundled Node runtime, and the CLI and board **taken byte for byte from the
   admitted npm tarball of the same release**. No rebuild, no second copy of the source.
2. **What the shell does.** Starts the bundled server on a free loopback port, shows it in a
   window, registers a login item, bridges alerts to native notifications, shows a menu-bar
   item. It contains no product logic.
3. **Trust, two layers.** Developer ID signature, hardened runtime, notarization and stapling
   for the operating system. The `.dmg` is also a deliverable in the ADR-045 release index
   with its own Ed25519 `.signature.json`.
4. **Amendment to ADR-045.** The release set grows from five blobs to six (twelve files with
   sidecars). The index names the `.dmg` and its digest. Admission, publication and readback
   rules apply to it unchanged. A release without the `.dmg` is still valid for npm and
   plugin users; the index then says the app deliverable is absent, and the site download
   link is not moved.
5. **Self-check.** On launch the app compares the digest of its bundled runtime files with
   the inventory it shipped with and refuses to start the server on a mismatch.
6. **Agent host.** The app does not embed or authenticate a coding agent. It detects the
   user's own Claude Code or Codex and guides install and sign-in. Branding: never "Claude
   Code" in the app's name or visuals.
7. **Privacy.** No telemetry and no install ping. Network behaviour of updates is decided in
   the updater ADR. `docs/PRIVACY.md` gains an "App" section in the same change.
8. **Authority.** Signing and notarization run only with the owner present, with the owner's
   Apple Developer identity. The key and notarization credentials never enter the
   repository, the candidate staging directory or logs.
9. **Hosting.** GitHub release asset, linked from the site. Not the Mac App Store: its
   sandbox forbids starting the user's CLI.

## Release chain change

After the npm tarball is admitted: build shell → embed admitted tarball contents → sign →
notarize → staple → build `.dmg` → add to index → sign index → publish with the other assets
→ read back. The chain stops on red. If the app stage fails after npm is public, the release
is recorded as partial and says so; it is not presented as complete.

## Verification

- Playwright E2E against the server and Node inside the built bundle.
- A clean macOS user account checklist per release: Gatekeeper, first launch, login item,
  notification, readiness check with Claude absent, uninstall. Recorded with the release.
- `spctl` and `stapler validate` output kept as release evidence.

## Rollback

Remove the asset and the site link; the previous `.dmg` stays available. npm and plugin
channels are unaffected. Uninstall is deleting the app and its login item; `~/.great_cto` is
user data and stays.

## Open

- Apple Developer account: the owner's personal account, to be provided.
- App name (owner's decision 7 is still open).
- Windows and Linux: out of scope; a later ADR chooses the cross-platform shell.
- Exact bundle size and whether Web Push works in WKWebView: to be measured in a spike.

## Preconditions

- The ADR-045 admitted activation route works for the plugin.
- "The board may start work" is accepted and shipped through npm first.
