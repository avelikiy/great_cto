# ADR-048: Managed activation of the Claude Code plugin from an embedded signed snapshot

**Date:** 2026-11-10
Status: Accepted by the owner on 2026-11-10 (design and slice 1); implementation in progress
Extends: [ADR-045](ADR-045-verified-distribution.md). Applies [ADR-009](../../CLAUDE.md) — activation
is expensive to undo and crosses into every Claude Code session on the machine.
Implementation contract: [ARCH-plugin-activation](../architecture/ARCH-plugin-activation.md)

## Context

`install()` in `packages/cli/src/installer.ts:72-77` throws unconditionally. `runInit` calls it
at step 3 of 5 (`packages/cli/src/main.ts:1105`), so **`npx great-cto init` fails for every
user** and has since ADR-045 removed the git-clone route.

The refusal is right. What it replaced could fall back from a missing tag to mutable `main`,
cloned into the installation path, and filled the missing build by copying `dist/` out of the
running CLI — three release sources in one directory
(`docs/architecture/ARCH-distribution-trust.md:49`). What is missing is the replacement
ADR-045 authorised: *"Managed Claude registration may select only a verified immutable
complete snapshot with compare-and-swap and managed-file recovery"* (ADR-045:68-69).
`proposeManagedPluginActivation` (`packages/cli/src/release-activation.mjs:394-406`) is a stub
that returns `UNSUPPORTED` three ways and writes nothing.

Two facts constrain the choice.

**A new user cannot enrol a key.** `runVerifiedSelfUpgrade` reads the operator toolchain
(`release-update.mjs:189`), and `configureTrustedToolchain` requires an explicit
independent-trust acknowledgement plus an already-authenticated public-key path and
fingerprint, refusing overwrite (`release-update.mjs:74-85`). So the existing download-and-admit
route cannot serve a first install: it would require a key ceremony before `init` works.

**The native marketplace already bypasses admission, observably.** On the owner's machine,
`~/.claude/plugins/known_marketplaces.json` resolves `great-cto` to the Git repository and its
`installLocation` is a clone of branch `main`; `installed_plugins.json` holds
`great_cto@great-cto` pointing at a cache directory published from that clone, `lastUpdated`
the same day. ADR-045 anticipated this (`ARCH-distribution-trust.md:192`); this is the first
time it is measured rather than inferred. `~/.claude/settings.json` contains no plugin
auto-update key, so there is no switch to turn off.

## Decision

**1. The signed plugin snapshot travels inside the npm tarball the user already installed, and
is verified against a key fingerprint pinned in source.** `init` performs no network fetch and
no git operation on the activation path. The embedded set is `great-cto-plugin-<v>.tgz`,
`plugin-inventory.json`, `sbom.cdx.json`, a schema-3 `release-index.json` naming exactly those
three artifacts, and one `.signature.json` sidecar per blob and for that index. Schema 3 exists
to break a digest cycle: the schema-2 index must carry the npm tarball's own digests
(`release-trust.mjs:88-96`) and therefore cannot be packed inside it.

**2. The pin is a key fingerprint, not a content digest.** The plugin snapshot contains
`packages/cli/dist/release-trust.mjs` (`scripts/build-release-artifacts.mjs:163-168`), so
pinning the archive's digest inside the archive is a cycle. A fingerprint is a stable constant
and follows the rule the file already states: *"Rotation is a reviewed source change, not a
value accepted from release metadata"* (`release-trust.mjs:9`).

**3. The first install is honest about what it proves.** On a first `npx`, the bytes, the
checker and the pin arrive together; authenticity rests on the npm registry, not on the
release key. From that install onward the signature stops anyone who can write `~/.claude` but
not the npm package. This statement ships in `init` output, `README.md` and
`docs/reference/verified-updates.md`. The existing enrolled-key route
(`release-update.mjs:183-201`) is retained unchanged for operators and upgrades; the two routes
converge on one admission shape and never fall back to each other.

**4. Activation is one journalled transaction that owns five targets** — the immutable cache
version directory, `installed_plugins.json`, `settings.json`, the local directory
marketplace entry, and the managed `~/.claude/{agents,commands}` files. It reuses
`release-activation.mjs`'s lock, journal, watermark, backup and phase discipline
(`:180-224`, `:300-329`), extracted into a shared module, and adds a sibling adapter rather
than parameterising the npm one: that adapter is specific to one prefix layout, a bin symlink
and a package manager (`:89-115`, `:343-344`). Each host write is compare-and-swap, backed up
with its digest first, and restored only while it still equals this transaction's own write.
A crash at any of six durable boundaries recovers or reports `RECOVERY_REQUIRED`. A concurrent
`init` refuses with zero writes. Same version with the same inventory digest is `ALREADY_ACTIVE`.

**5. Registration targets a source the host cannot refresh,** the existing local *directory*
marketplace, and a registration from any refreshable marketplace is **reported, not
resolved**: `installed_plugins.json` is shared with thirty other plugins, so a surprise
disable is worse than a warning. `known_marketplaces.json` is never written and no other
plugin's entry is read for a decision or written at all.

**6. Companion plugins become optional and the hard declaration is removed.** Deleting
`dependencies` from `.claude-plugin/plugin.json:33-36` is a precondition, not a preference: the
project's own code refuses managed activation while that array is non-empty
(`release-activation.mjs:401`). Both companions are MIT. Nothing of ours imports superpowers
code — the 80 mentions resolve to 8 prompt-level skill names — and the real beads dependency
is the `bd` binary on `PATH`, which every call site already guards. Each absence gets a named
degradation in `/doctor` and in `init` output.

**7. Declared external runtime is classified per host.** For a Claude activation the check
reads `.claude-plugin/plugin.json` and refuses only on a *fetching* entrypoint
(`npx`, `uvx`, `curl`, `pip`); a host interpreter (`python3`, `git`, `bd`) is recorded as an
operator toolchain assumption, the same class as the trusted Node runtime (ADR-045:46-47). The
current guard greps only `.codex-plugin/mcp.json` (`release-activation.mjs:402-403`), so it
both misses the Claude `python3` MCP server and refuses a Claude activation over a Codex-only
file. The `PLUGIN_DIR` fallback in the hooks —
`ls -d ~/.claude/plugins/cache/*/great_cto/*/ | sort -V | tail -1`
(`.claude-plugin/plugin.json:58`, `:63` and ~40 more) — is narrowed to the admitted
registration and made to refuse rather than guess, because it can otherwise select the
git-marketplace cache.

**8. Verification code is resolved from the npm installation, never from the plugin cache.**
Held by an acceptance row, not by discipline. Without it, decision 2 inverts: one successful
bad activation would own the pin for every later run.

**9. Three unverified side effects leave `init`:** the two `git clone`s of mutable `main`
(`main.ts:1217-1234`) become an opt-in `great-cto skills sync`; `applyOverlays()`
(`main.ts:1184`), which writes four files into and patches three files of *another plugin's*
installed bytes (`overlay.ts:188-258`), becomes an explicit command with a backup and a
revert; the pre-1.0.104 command cleanup that unlinks up to 18 files outside any transaction
(`main.ts:1131-1161`) is deleted.

**10. Acceptance is extended, never relaxed.** New frozen
`tests/acceptance/distribution-trust-v4.json` retains every v3 row verbatim — including the
scorer clocks and the PID/SIGKILL/cleanup checks — and adds fifteen rows covering the embedded
set, verifier resolution, the trust statement, cache publication, both compare-and-swaps, the
managed-file journal, six crash boundaries, concurrent and offline `init`, pre-admission
execution, marketplace divergence, per-host runtime scope, companion absence, and byte
equality between the embedded archive, the standalone signed asset and the installed
directory. Approval of this ADR authorises none of: key creation, key enrolment, signing,
publication, or activation on any machine.

## Alternatives considered

- **A separate signed plugin archive downloaded and admitted by the existing `release-update`
  core.** Rejected as the first-install route because it cannot work for a new user:
  `configureTrustedToolchain` demands an independently authenticated key and an explicit
  acknowledgement (`release-update.mjs:74-85`), which a fresh `npx` user cannot supply. Kept
  unchanged as the operator and upgrade route.
- **Fetch a tagged git archive at init.** Rejected: a mutable-ref fallback is the precise
  ADR-045 defect (`installer.ts:30-46`), and a git checkout contains no build — the comment at
  `installer.ts:79-103` records that the board never started for anyone installing the
  documented way.
- **`claude plugin install` from the Git marketplace.** Rejected: that is the bypass measured
  in Context. It publishes plugin bytes from mutable `main` with no signature check.
- **An unsigned in-tarball inventory only.** Rejected: it gives integrity against local
  tampering and no publisher authority, so it would have to be replaced immediately.
- **Pin the plugin archive's sha256 in a file excluded from the snapshot** (the exclusion-list
  precedent exists at `build-release-artifacts.mjs:20`). Recorded as the fallback if the owner
  declines a second signing pass; rejected as default because the constant must be regenerated
  every release and creates a build-order coupling.
- **Bundle pinned companion snapshots into our signed archive.** Licence permits it (both MIT).
  Rejected because it makes great_cto publisher-of-record for a second supply chain, and
  because `overlay.ts` patches superpowers' skill files — we would ship a silently diverging
  fork of an actively developed upstream.
- **Parameterise `activateNpmRelease` instead of adding an adapter.** Rejected: it resolves one
  prefix layout, expects a bin symlink and delegates the write to npm
  (`release-activation.mjs:89-115`, `:343-344`). A plugin activation has five targets and no
  package manager.
- **A managed version-slot shim owning all installs.** ADR-045 already defers this as a future
  independently reviewed migration (`ARCH-distribution-trust.md:69`). Unchanged.

## Consequences

**Positive.** `npx great-cto init` works again, offline, with no key ceremony. Plugin bytes
become publisher-authenticated from the second install onward, where today they are
git-authenticated at best. Five host files acquire one owner, one lock, one journal and a
recovery path, replacing writes that are today scattered across `settings.ts`, two helper
scripts, an untransacted unlink loop and a cross-plugin patcher. The measured marketplace
divergence becomes visible instead of silent. Two defects found while reading are fixed as a
side effect: `settings.ts:63-66` renames without re-reading, so a concurrent host write is
lost; `local-install-registry.mjs:52-55` leaves one `.bak` per run beside the registry, and
there are 45 on the owner's machine.

**Negative.** The npm download grows by about 3.6 MiB (unpacked ≈4.35 MB → ≈15 MB). The
release chain gains a second signing invocation and a byte-comparison. `init` becomes a real
transaction with real failure modes where it used to throw. Fail-closed admission becomes a
denial vector against the user's own install — an unparseable `settings.json` that today
warns and continues (`settings.ts:37-41`) will refuse — so the refusal must name the file and
the one key to add. Three conveniences leave `init` and need their own commands. Total effort
30 engineer-days; 9 to a working `init`.

**Risks.** The bootstrap remains npm's: a compromised registry replaces the bytes, the checker
and the pin together, and no local design fixes that — only 2FA, Trusted Publisher and
provenance, which are outside this slice. The pin travels inside the artifact it protects, so
decision 8 is load-bearing and is the thing most likely to be undone by a later convenience
refactor. The host is not a participant in our lock, so a session can read a half-swapped
`~/.claude/commands` for under a second; ordering mitigates it, nothing eliminates it.
Rollback is not byte-reversible for managed directories until the sync journal lands, because
`sync-managed.mjs:50-56` prunes marker-bearing files whose source is gone. If the user keeps
the Git marketplace, the host will keep refreshing it; this design can only make the admitted
registration unrefreshable and the divergence visible.

**Unchanged.** Graph gates, telemetry defaults, hook trust, source-privacy controls, pnpm and
Volta refusals, Codex activation refusal, key rotation and revocation (still unsupported,
acceptance still `NOT_RUN`, ADR-045:120-131), and every frozen acceptance row in v1, v2 and v3.
