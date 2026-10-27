# Offline companion bundle acceptance v1

Implements the source direction in [ADR-047](../adr/ADR-047-release-bound-native-companions.md).
This contract covers preparation and component byte admission, not native support.

The committed `native-companions.lock.json` selects two exact upstream Git objects.
Operator input is a private JSON map from the two dependency IDs to pre-fetched
canonical bare Git repositories. No credentials, source-directory paths or local
cache state belong in the resulting descriptor, SBOM or archive. Preparation has
no fetch, checkout, companion installer or signing fallback.

Opt-in preparation uses the existing builder with
`--native-companion-sources ABSOLUTE_JSON`. The normal build remains unchanged.
The source lock must be tracked at the exact clean build commit. Output must be a
fresh private directory outside source; existing release bytes are never replaced.

Required source/consumer observations:

| Case | Required result |
|---|---|
| Plain JSON or synthetic admission | No production component inspection capability |
| Wrong profile, dependency ID/root/source, component omitted/duplicated | Refuse |
| Wrong member bytes, mode, source blob/path, license or membership | Refuse complete release admission |
| Missing descriptor with vendor members | Refuse |
| Descriptor without the original required dependencies | Refuse |
| Uncommitted working-tree edit | Not copied; locked Git blob remains selected |
| Tracked operational state | Excluded by the runtime projection |
| Selected symlink/submodule, missing asset reference | Refuse; no following or broadening the allowlist |
| Missing locked source | Refuse; no download or package-manager fallback |
| Explicit bundle profile | Both component inventories and SBOM dependency edges inside the plugin archive |
| Ordinary build | No implicit bundle; existing artifact behavior preserved |
| Publisher-vouched component bytes | authority NONE, runtime closure NOT CHECKED, activation NOT ESTABLISHED |

The profile ID describes the required reviewed-release policy. Its presence is
not evidence that a security review or scanner executed. Inspection reports those
facts as NOT_ATTESTED; preparation reports them as NOT_CHECKED. Independent review
and scans of the **materialized component and complete artifact bytes**, not only
the tracked great_cto tree, are required before any later release approval.
No component-only preparation is a complete native-installable product artifact.

Keep upstream license bytes and record publisher responsibility for the bundled
snapshot. A commit/tree pin is not an upstream signature-verification claim.
Beads/Dolt, shell utilities, primary MCP and startup closure still require separate
runtime evidence. Preserve native N01–N20, host trust, drift/crash recovery and the
later operator activation boundary. No paid-model request is part of these tests.
