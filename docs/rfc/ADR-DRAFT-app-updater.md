# ADR draft: in-app updater for the macOS app

**Status:** Draft for the owner. Not accepted, not numbered, authorizes no code.
**Date:** 2026-11-10
**Source:** [RFC-cockpit-for-non-developers.md](RFC-cockpit-for-non-developers.md), owner's decision 6
(a real updater, not notify-only).

## Context

- A non-developer will not re-download a `.dmg` by hand; an app that stays old runs old agent
  definitions without saying so.
- `docs/PRIVACY.md` already documents one on-by-default network request: the CLI update
  check, a read-only `GET` of the npm dist-tags, cached 24 hours, opt-out with
  `GREAT_CTO_NO_UPDATE_CHECK=1`. Telemetry is off by default and stays off.
- ADR-045: an update is admitted only when the enrolled Ed25519 release key signs the index
  and every deliverable; no trust comes from the candidate itself.
- An updater downloads and replaces executable code. Under ADR-009 that is expensive to undo.

## Decision (proposed)

1. **Check.** At most once per 24 hours and on demand, the app requests the release index of
   the latest stable release. The request carries no identifier, no version of the installed
   app beyond what a plain HTTP client sends, and no project data. Same opt-out variable,
   plus a switch in Settings. The check never runs while a task is in flight.
2. **Ask, then download.** The app shows "Version X is available" with the changelog entry.
   Download starts only when the user presses Update. No silent or forced updates.
3. **Admit before replace.** The downloaded `.dmg` is verified by the same consumer code the
   CLI uses for ADR-045: index signature, deliverable signature, digest, version greater than
   the installed one (no downgrade). The pinned key fingerprint is compiled into the app; a
   key offered by the download grants nothing. Apple's signature and notarization are checked
   as well. Any failure refuses and keeps the installed version.
4. **Replace atomically.** The new app is staged next to the old one and swapped on quit.
   The previous version is kept until the new one has started once; if it does not start,
   the old one is restored and the failure is shown.
5. **No third-party update framework** in the first version, so that there is one trust model
   (ADR-045) and not two. Sparkle is the recorded alternative if the atomic swap proves
   fragile.
6. **Key rotation** is not solved here: ADR-045 states rotation is unsupported. Until it is,
   a rotated key means a manual download, and the app says so.
7. **Documentation.** `docs/PRIVACY.md` gains the exact request, its schedule, both opt-outs
   and what is stored locally, in the same change as the code.

## Alternatives

- Notify-only with a download link: the RFC's first recommendation; declined by the owner.
- Sparkle with its own EdDSA key: mature, but a second signing key and trust path.
- Update the server and CLI inside the app without replacing the app: smaller downloads, but
  it changes signed bundle contents and breaks the Apple signature.

## Verification

- Unit: every refusal (bad index signature, bad deliverable signature, digest mismatch,
  downgrade, wrong key, notarization missing), using generated fixture keys with no release
  authority.
- Integration: a local file server with a signed fixture release; update, restart, version
  shown; a broken new version restores the old one.
- Manual, per release: one real update from the previous public version on a clean account.

## Rollback

A remote kill is deliberately absent. Turning the updater off is a release that ships with
the check disabled; users on older versions keep their installed version and can still
download by hand.

## Preconditions

The desktop app channel ADR is accepted, and the ADR-045 consumer is usable as a library by
the app.
