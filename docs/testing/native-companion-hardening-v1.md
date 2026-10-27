# Native companion hardening v1

Frozen before implementation. The operator approved a release-bound derived
projection on 2026-10-27 after actual companion scans and independent review.
This contract grants source work only, not signing, release or native activation.

Keep the existing pinned upstream identities, licenses, required dependency IDs
and core skills. Introduce `beads-offline-guidance-v2` and
`superpowers-offline-runtime-v1`. Never rewrite an already signed artifact.
The Beads recipe retains the previous exact guide rename/two-link mapping.

| Component/member | Required derivation |
|---|---|
| Beads skills/beads/commands/version.md | Replace the single mutable installer pipeline with an explicit refusal and operator toolchain instruction |
| Beads skills/beads/resources/TROUBLESHOOTING.md | Same single installer replacement |
| Superpowers skills/brainstorming/scripts/server.cjs | Loopback-only bind and URL host; no remote branding markup; refuse custom shell launcher, retain platform argv launcher |
| Superpowers skills/brainstorming/scripts/start-server.sh | Refuse an existing PID file without signalling any PID or deleting it |

Each changed member binds full original and projected SHA256 and original Git
blob. Fixed byte hunks must occur exactly once; replacement collisions, changed
surroundings, missing hunks, unknown source tuples and mixed recipes refuse.
Inverse derivation verifies projected SHA256, restores exact original bytes and
checks original SHA256 before existing source-blob validation. No text decoding,
line-ending normalization or arbitrary patch API. Require every changed member
in the consumer inventory. SBOM marks both components DERIVED_PROJECTION.

Acceptance: preserve byte modes and unmodified members; forward/inverse identity
on actual pinned sources; reject pre/post mutations, missing/colliding hunks and
missing required derived members. Execute the derived visual helper only in an
owned network-denied fixture: hostile custom launcher cannot create a sentinel;
non-loopback host is refused; generated branding has no external image; an
existing PID file causes refusal and its live owned sentinel survives. No model
or provider key is needed. Do not execute third-party acquisition instructions.

Rescan exact component skills and complete archive. Broad fs/child_process
findings require source-bound independent adjudication, not blanket suppression.
Existing source baselines do not apply to third-party skills. Preserve earlier
failed reports. Native support remains UNSUPPORTED until ADR-046 N01–N20 pass.

`bd prime`, bd and Dolt remain explicit independently checked operator toolchain
prerequisites. This patch neither bundles nor installs them. Optional project
build commands are not proof of hermetic toolchain closure. Session state,
filesystem ownership/symlink races, arbitrary HTML, active browser containment
and host lifecycle still require separate runtime acceptance.
