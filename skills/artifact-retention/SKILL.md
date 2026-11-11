---
name: artifact-retention
description: After a build is delivered, delete its intermediate copies and old versions — keep exactly the version that runs and one previous for rollback — and report the space freed as measured by `df`, never `du`. Covers local build output, mobile build caches, container images, release dirs and stale browser-session copies, with a never-delete list (volumes, databases, installed SDKs, simulator runtimes, the rollback version). Use after any release or image build, before heavy builds when free disk is low, and when disk space drops fast ("диск кончается", "почисти старые сборки", "ENOSPC"). Loaded by release-manager, devops.
when_to_use: |
  Apply when:
  - a release or deploy finished and was verified
  - free disk is below 30 GB on a build machine or below 15 % on a server, before building
  - disk space drops fast with no build running
  Do NOT apply to:
  - data: volumes, databases, backups, logs with their own retention
  - another session's build or work tree that is still in progress
effort: low
allowed-tools: Read, Bash, Grep
---

# artifact-retention — keep what runs and one rollback, measure what you freed

Build machines fill up from copies that already did their job: agent work trees, old
`DerivedData`, Gradle outputs, image tags, browser profiles. A full disk breaks the next
build, other people's builds, and even command output. Cleaning is part of "released".

## What to keep

| Kind | Keep | Delete |
|---|---|---|
| Web build output (`dist/`, `.next/`, `out/`, `.vercel/output`) | current release | older release outputs |
| Mobile artifacts (`.ipa`, `.aab`, `.apk`, `.xcarchive`) | the shipped one + one previous | older archives |
| Mobile caches (`DerivedData/<project>-*`, `android/app/build`, `.gradle` project dir) | — (rebuildable) | after delivery |
| Container images `<app>:<tag>` | the image a container uses (running **or stopped**) + the rollback tag | older tags of that app |
| Release dirs `*-<sha>` | active + one previous | older |
| Hosted deployments (Vercel, Pages, Workers versions) | live + previous | leave to the host's retention unless asked |

## Never delete

- Volumes, databases, backups, `pg_wal`, data files — even when a tool calls them "reclaimable".
- The rollback version, even when it is old.
- Installed tools, not copies: Xcode, simulator runtimes, Android SDK and system images,
  `~/.gradle/caches`, `node_modules`, installed browsers (`ms-playwright`), the user's
  Chrome profile and `/Applications`.
- Anything another session or process uses. Check: `lsof +D <dir>` empty, no running
  build (`pgrep -fl 'xcodebuild|gradle|docker build|buildx'`), work tree merged and clean
  (`git merge-base --is-ancestor <head> origin/<main>` and no tracked changes).
- Never by glob over temp roots, never `docker system prune`, never `docker image prune -a`.

## How

1. **Before:** `df -k /` (and on APFS `diskutil apfs list | grep -E 'Capacity (Consumed|In Use)'`).
2. **List exact paths and tags**, each with why it is old and that nothing uses it.
3. **Ask the operator first** for anything that is not your own rebuildable build output
   (other sessions' copies, browser clones, images you did not build). Your own
   intermediate output of the release you just shipped needs no extra question.
4. **Remove one exact path or tag at a time.**
5. **After:** `df -k /` again. Report **the `df` difference**. `du` counts APFS clones and
   shared image layers as full copies — a "67 GB" folder freed 2 GB. Never promise a `du`
   number.

## Stale browser-session copies (macOS)

Chrome copies itself to `$(getconf DARWIN_USER_TEMP_DIR)/../X/com.google.Chrome.code_sign_clone/`
on launch; Playwright leaves `playwright*` profiles in the temp dir. Each copy is stale
when `lsof +D <that dir>` is empty and no running Chrome uses it as `--user-data-dir`.
Remove one directory at a time, after asking. If copies keep appearing, find the launcher
(`ps -axo pid,ppid,lstart,command`) instead of cleaning again.

## Report — one line

`cleanup: removed <n> items (<list>), df freed <X> GB, kept <current> + <rollback>`
