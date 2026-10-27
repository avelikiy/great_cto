# ADR-047: Release-bound offline native companions

**Date:** 2026-10-27
Status: Offline-bundle direction accepted by the operator on 2026-10-27;
implementation and independent review pending, no publication or activation authority.
Extends: [ADR-046](ADR-046-native-plugin-activation.md).

## Context

The released plugin depends on companion code outside its signed primary archive.
An installed cache, version listing or dependency declaration does not prove those
bytes are admitted. The operator selected an offline bundle while preserving
mandatory dependencies, archive privacy and the separate activation boundary.

## Decision

Preserve required `superpowers@superpowers-marketplace` and `beads@local`
dependencies. Prepare pinned, reviewed companion plugin snapshots in a future
complete signed great_cto artifact. No required companion or engineering guard
becomes optional as a shortcut to native eligibility.

Use an explicitly versioned `native-companions.json` descriptor inside the signed
plugin inventory. Each component has a fixed dependency ID, package name/version,
reserved root, upstream repository/commit/tree/subdirectory, retained license and
complete projected member inventory. Every component binding is validated
independently against the actual admitted archive, including bytes and modes.
Neither a descriptor nor a previous enabled/cache flag grants installation trust.

Only the two named repositories/components are accepted by profile v1. Obtain
source from exact Git objects. Never reconstruct a snapshot by copying installed
caches or mutable working trees, or use their version flags as source authority.
No arbitrary URLs, package-manager acquisition or branch-head fallback is allowed.
Exclude operational state, credentials, private overlays, Git internals and test
fixtures. The projection is an explicit runtime allowlist; any missing manifest
reference refuses preparation. Keep original license bytes and provenance.

The descriptor and lock bind an explicit projection recipe. Beads' fixed public
runtime guide uses the reversible [guidance projection](../testing/beads-guidance-projection-v1.md):
retain its bytes under AGENT_TRACKING.md, update exactly two SKILL links and omit
the maintenance CLAUDE.md. The archive privacy guard is unchanged. Bind output
hashes separately from original sourcePath/sourceBlob; do not claim this derived
projection is verbatim upstream or establishes runtime closure.

The operator subsequently approved the [hardening projection](../testing/native-companion-hardening-v1.md)
after direct companion skill scans found mutable installation guidance and visual
helper launcher/network/PID risks. `beads-offline-guidance-v2` preserves the guide
mapping and replaces two unverified installer pipelines with explicit refusal.
`superpowers-offline-runtime-v1` enforces loopback bind/URL hosts, removes the
remote branding image, refuses custom shell launching and refuses existing PID
files without signalling their processes. Full original/output SHA256 and exact
inverse source-blob checks bind all four changed members. No arbitrary patch
input is accepted, no existing signed archive is rewritten, and core skills,
licenses and dependency identities remain present. External bd/Dolt prerequisites
are not bundled or implicitly trusted. These changes address named paths only;
they do not establish complete runtime containment or native acceptance.

The great_cto publisher vouches for these reviewed bundled bytes. This is not an
upstream signature-verification claim and does not change the enrolled key.
Component byte admission does not prove startup closure, native registration,
hook trust/enforcement, runtime dependencies or release eligibility. In particular,
Beads plugin prompts do not attest the operator's bd/Dolt executable stack.

Do not rewrite old signed artifacts. Existing releases without this descriptor
retain their unsupported dependency-closure result. Future release builder and
SBOM integration must explicitly include component membership and dependencies;
a bundle prepared in a private directory is not part of a published artifact.

## Selection and recovery

Bundle preparation does not enable a companion installer. A later adapter must
bind every selected component to exact admitted roots, detect alias/version
conflicts, preserve unrelated plugins and maintain a reversible before/after
inventory. Creating a marketplace, disabling an old alias, updating a shared
companion or changing hook trust requires a separately named operator plan.
Never take ownership of a general marketplace such as `local`.

The [existing-valid-local-marketplace probe](../testing/claude-local-marketplace-probe-v4.md)
is distinct from a bare registry entry. The
[exact cache recovery probe](../testing/claude-local-recovery-probe-v5.md) records
why cache metadata belongs in the owned recovery inventory. Native listings with component errors cannot prove runtime selection.
Retain the prior payload/cache outside native pruning: restoring three JSON
files alone can leave native `.orphaned_at` metadata behind. Recovery must restore
exact owned membership/modes or preserve external drift as RECOVERY_REQUIRED.

## Consequences

The complete plugin payload gains reviewed component projections, provenance and
dependency inventories. Maintaining these inputs and deterministic derivations is
the great_cto publisher's responsibility. Materialized component and full-artifact
review/scans are additional work before a future release, not facts established by
an unsigned preparation. Existing ordinary builds and installed plugins remain
unchanged; unsupported native runtime closure continues to refuse activation.

## Authority and sequencing

Implement and validate source contracts first, using inert fixtures and isolated
native hosts. Real upstream projection is preparation evidence only until reviewed.
Complete Claude acceptance before Codex adapter support. Signing, npm/GitHub
publication, key changes, operator installation and active-session reload remain
outside this approval. Missing native observations stay NOT CHECKED.
