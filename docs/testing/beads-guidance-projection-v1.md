# Beads runtime guidance projection v1

Frozen before implementation. The candidate profile is unreleased. Keep the failed
unsigned archive builds as evidence: the existing privacy guard correctly refused
Beads maintenance/runtime documents named CLAUDE.md and AGENTS.md.

Do not weaken that guard, add a generic rename/replace API or copy local caches.
The component descriptor and source lock explicitly name the projection recipe.
Other components use `verbatim-runtime-allowlist-v1`. The derived recipe
`beads-runtime-guidance-v1` is allowed only for `beads@local`, version 1.3.2,
repository `https://github.com/gastownhall/beads`, commit
`43f41374a34d82ecf40903451eea277fbb4f1e75`, tree
`28f79ffc36555222f62fe82410410e69e60d8b79`, subdirectory `plugins/beads`.

Only these source paths are affected:

| Source relative path | Output |
|---|---|
| `skills/beads/CLAUDE.md` | Excluded maintenance guide, not runtime completeness evidence |
| `skills/beads/resources/AGENTS.md` | `skills/beads/resources/AGENT_TRACKING.md`, identical bytes/mode |
| `skills/beads/SKILL.md` | Replace exactly two ASCII `resources/AGENTS.md` links with `resources/AGENT_TRACKING.md` |

Preparation rejects any other link count, any pre-existing AGENT_TRACKING.md token
in the original SKILL bytes, a pre-existing replacement-path file, and case/NFC
collisions. All other source members remain unchanged under the public runtime
allowlist; unknown service-file paths in runtime directories refuse preparation.
Original project instructions/metadata are never included as a fallback.

The consumer requires the explicit recipe, its fixed source identity and both
derived runtime members. It rejects mixed original/derived names, unknown recipes,
extra transformations, changed guide bytes/source bindings and noncanonical link
counts. Reconstruct original SKILL bytes with the exact inverse two-link mapping
before verifying original Git blob ID. Do not decode/re-encode, normalize line
endings or strip whitespace. Output size/SHA256/mode bind the projected bytes;
sourcePath/sourceBlob continue to identify the original source member.

Builder and consumer share pure forward/inverse rules. Acceptance covers forward
and inverse identity, changed projected/source bytes, incorrect counts, token/path
collisions and the unchanged archive rejection of AGENTS.md/CLAUDE.md members.
Documentation and SBOM identify DERIVED_PROJECTION, not verbatim upstream or
upstream approval. All preparation remains unsigned, authority NONE; runtime
closure, complete artifact scans, native N01–N20 and operator activation remain
separate checks.
