# Local guardian resource observation

Scope: prerequisite `great_cto-p4o9.5.8.3.5`, not completion of crash cleanup,
independent browser admission, or the adaptive pipeline release.

Design context: [browser profile guardian ADR](../adr/ADR-028-browser-profile-guardian.md),
[protocol core evidence](2026-10-03-guardian-protocol-core.md), and
[separate IPC helper evidence](2026-10-03-guardian-ipc-helper.md).

The unactivated `browser-guardian-resources.mjs` module creates its own fresh
private temporary root. It accepts no caller-selected root or owner PID other
than the calling process. Registration binds a live direct-child scorer, unique
live direct-child browser roots in separate leader process groups, captured
descendants, and a canonical private Playwright profile directly beneath that
root. Process tuples include PID, start text, UID and group; directory tuples
include device, inode and UID. Invalid scope, changed identities, duplicate or
empty roots, unavailable bounded inventory and repeated registration preserve
the object permanently. Public snapshots omit paths and process identities.

Each observation rechecks root identity/private mode, captured process tuples
and profile identity/private mode. Reparenting is permitted after initial
lineage binding. Zombies do not count as running, which is not a reaping proof.
Missing profiles are reported separately from stopped captured processes.
The fixed `/bin/ps` invocation has a one-second deadline, SIGKILL timeout,
one-MiB output bound, and a 16,384-row bound. Registry size is bounded at 63
processes plus one profile. No process command lines or environment values are
collected. OS inventory execution and creation of the fresh root are the only
resource operations; there is no signal or deletion API.

## Test plan and evidence

- Integration: actual pinned observer/Chromium launch path, held static DOM,
  nonempty scorer/browser inventory, normal completion, DOM refusal, handled
  owner SIGTERM and owner SIGKILL. Compare sampler observation against the
  independent test's captured process tree and profile inspection before
  fixture cleanup. Probe changed root/profile mode after successful binding.
- Negative tests: empty/duplicate roots, foreign scorer lineage, outside or
  symlink profile, wrong profile name, changed root mode/inode, observation
  before registration, wrong owner PID and terminal refusal after restoration.
- Regression: protocol and separate IPC helper tests, generated documentation,
  stock quick CI and HOL scan. Test fixtures alone reclaim their explicitly
  owned scratch resources; the sampler itself never performs reclamation.

Focused execution on macOS passed 67/67 tests with no skips (protocol, helper,
resource owner and actual Chromium lifecycle together). Each lifecycle mode
captured four browser processes; after owner SIGKILL none remained running
before fixture cleanup, while the profile remained retained. The sampler
reported zero captured live processes and retained profile without granting
authority. The eight frozen recipe runtime pins remained byte-verified and
benchmark-ineligible. Evidence log: `/tmp/great-cto-resource-observation-tests.log`.

## Explicit limits

This is practical local observation, not independently attested OS closure.
`ps` inventory is not atomic and its start text has finite resolution. Late or
detached descendants, same-UID interference, executable identity, kernel handle
binding, inventory races, aggregate CPU/RSS and inherited descriptors are not
certified. Even zero captured live processes does not authorize cleanup.
All quiescence/resource-closure/cleanup/admission/benchmark authority flags stay
false. Source tests do not prove the installed plugin includes this module.

The IPC helper does not yet create this root, broker actual browser resources,
or invoke this sampler. Production activation, independently reviewed authority,
parent/helper death, safe crash-profile reclamation and package/runtime closure
remain work under the parent issue. Existing frozen corpus bytes and previous
candidate archives are not changed or re-attested by these tests.
