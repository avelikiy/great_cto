---
name: mobile-release
description: Ship an iOS or Android build to testers and stores without reusing a build number or shipping an OTA bundle that crashes on launch. Covers version and build-number policy, code signing done by the project's own tooling, TestFlight / Play internal / Firebase uploads, Maestro on the uploaded build, phased rollout and halt, OTA runtime compatibility, and the store hand-off. Use for any mobile release step ("собери сборку для тестировщиков", "выложи во внутренний трек", "подними номер сборки", "обнови по воздуху", "отправь в стор"). Loaded by release-manager.
when_to_use: |
  Apply when:
  - building a signed iOS or Android binary meant for anyone other than the developer
  - bumping a version, versionCode or CFBundleVersion
  - uploading to TestFlight, Play Console, Firebase App Distribution, or publishing an OTA update
  - preparing a store submission or changing a phased rollout
  Do NOT apply to:
  - a debug build on a simulator or emulator for development
  - store-policy questions (privacy labels, IAP rules) — that is mobile-store-reviewer
effort: medium
allowed-tools: Read, Bash, Grep
---

# mobile-release — the binary testers get is the commit CI checked, signed by tooling, numbered once

A mobile release has three mistakes that cannot be taken back: a build number the store
has already seen, a key that left its store, and an update pushed to phones that cannot
run it. Everything below exists to make those three impossible, not unlikely.

## 1. Version and build number

| Field | iOS | Android | Rule |
|---|---|---|---|
| Marketing version | `CFBundleShortVersionString` / `MARKETING_VERSION` | `versionName` | from the release (semver), the same on both platforms |
| Build number | `CFBundleVersion` / `CURRENT_PROJECT_VERSION` | `versionCode` | **strictly increasing, never reused, set by script** |

- Read the highest build number the store already has before bumping, not the one in the
  repo: `fastlane` `latest_testflight_build_number` / `google_play_track_version_codes`,
  or `eas build:version:get`. The repo can be behind a build someone uploaded by hand.
- New build number = max(store, repo) + 1. A Play `versionCode` that was uploaded once is
  burned even if that build was deleted; Play rejects it forever.
- Commit the bump with the release (`chore(release): <version> (<build>)`), then build
  **that** commit. A build from an uncommitted bump cannot be traced back.
- Expo with `appVersionSource: remote`: EAS owns the counter; do not also edit native files.

## 2. Signing — through tooling, never by hand

The agent never opens, prints, copies, moves, base64-encodes or uploads a signing key,
keystore, `.p8`, `.p12`, `.jks`, provisioning private key or their passwords. A key that
appears in any output is compromised: stop and follow `secrets-rotation`.

| Platform | Where the key lives | What the agent runs |
|---|---|---|
| iOS | fastlane `match` repo, Xcode automatic signing, EAS credentials | `fastlane match <type> --readonly`, `xcodebuild -allowProvisioningUpdates`, `eas build` |
| Android | Play App Signing (upload key), EAS-managed signing, the CI secret store | `./gradlew bundleRelease` with signing config read from env/keystore properties the operator set up |

Allowed metadata checks: `security find-identity -v -p codesigning` (lists identities, not
keys), `keytool -list -v -keystore … ` **only if the operator types the password**; `apksigner
verify --print-certs` on the built artifact. If signing fails, report the tool's error and
stop — do not create, rotate or export credentials; that is the operator's step.

`--readonly` on `match` always: a non-readonly run can revoke and recreate certificates for
the whole team.

## 3. Build

- Build from a clean tree at the commit CI checked (`git status --porcelain` empty). The
  build packs the directory, not HEAD.
- iOS: `xcodebuild archive` + `-exportArchive` with an `ExportOptions.plist` from the repo,
  or the project's fastlane lane, or `eas build --platform ios --profile production`.
- Android: `./gradlew bundleRelease` (AAB for Play), `assembleRelease` only for Firebase /
  direct APK; or `eas build --platform android`.
- Record: artifact path, size, SHA-256, build number, commit. `bundletool dump manifest`
  / `PlistBuddy` on the artifact proves the number inside equals the number you set.
- Use the project's pinned tool versions (`Gemfile.lock` → `bundle exec fastlane`,
  `npx eas-cli@<pinned>`), not a global install.

## 4. Distribute to internal testers (no gate)

| Channel | Command shape | Done when |
|---|---|---|
| TestFlight internal group | `fastlane pilot upload` / `xcrun altool --upload-app` / `eas submit -p ios` | build shows **Processed** in App Store Connect, not just "uploaded" |
| Play internal track | `fastlane supply --track internal` / `eas submit -p android` | release on `internal` with this `versionCode`, status completed |
| Firebase App Distribution | `firebase appdistribution:distribute <apk/aab> --groups <internal>` | release id returned |

Before each upload `mobile-store-reviewer` re-checks policy (permission strings, privacy
manifest, IAP). Its BLOCK stops the upload.

## 5. E2E on the uploaded build

Maestro runs against the build testers got — installed from the TestFlight / Play internal
/ Firebase artifact on a simulator or device — **not a fresh local rebuild**. Rebuilding
per run costs time and proves a different binary.

- Flows live in the project (`e2e/flows/`, `.maestro/`); run with `maestro test <dir>`.
- On failure read the per-step screenshots before re-running.
- iOS simulator cannot install a TestFlight build; use the exported `.app` from the same
  archive (same build number, same commit) and say so in the report.

## 6. Beyond internal testers — after `gate:release` only

External TestFlight groups, Play closed/open/production tracks, App Store submission and
any increase of a staged rollout reach real users and are slow or impossible to reverse.

- Prepare: exact command, track, rollout %, release notes per locale, build number.
- Default `store-submit: hand-off` (PROJECT.md): the agent prepares, the operator presses
  "Submit for review" / "Start rollout". With `store-submit: gate` the agent runs the
  prepared command after `gate:release` is approved — never on its own approval.
- Phased rollout: start at the project's first stage (Play 1-5 %, iOS 7-day phased).
  Increase only after crash-free users and the top crash list for this build are read.
- **Halt is always allowed** without a new gate (`supply --rollout` halt / pause phased
  release): it restores the approved state. Report it at once.

## 7. OTA updates (EAS Update, Expo)

An OTA bundle runs on native code that already sits on phones. If the native side changed,
the bundle crashes on launch for every user who gets it.

- Refuse an OTA when any native dependency, config plugin, permission or SDK version changed
  since the build that owns the target `runtimeVersion`: `npx expo-updates fingerprint:generate`
  (or `@expo/fingerprint`) must equal the fingerprint of that build. Mismatch → native build.
- Internal channel (`preview`, `internal`): allowed without a gate.
- Production channel: `gate:release`, plus the fingerprint proof, plus a rollback named
  (`eas update:republish` of the previous group, or `eas update:rollback`).
- CodePush is retired; do not propose it.

## Report

```
MOBILE-RELEASE <app> <version> (<build>) @ <commit>
  bump     : PASS — store max 41 → 42, committed in <sha>
  signing  : PASS — match readonly / Play App Signing; no key material read
  artifact : PASS — app-release.aab sha256 <…>, versionCode 42 inside
  upload   : PASS — Play internal, completed
  e2e      : PASS — maestro 12/12 flows on the internal-track build
  beyond   : HAND-OFF — production 5 % prepared, waiting for gate:release
```

A line you could not check is `NOT CHECKED` with the reason, never omitted.
