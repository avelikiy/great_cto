# Current candidate package verification

Scope: `great_cto-p4o9.4.3.1.10` (in progress). Related: [frozen corpus](2026-10-03-corpus-registration.md), [previous packaging closure](2026-10-02-candidate-runtime-package.md), [controller probe boundary](2026-10-02-packaged-controller-assets.md).

## Actual artifact

The previous candidate came from source2078523e and predates the complete corpus and static UI specialist correction. A fresh private package was built from clean source `435a664f95be2f896d146b4ab847973326ff141b`, using the local TypeScript build and explicit board bundling (95 runtime modules), then `npm pack --ignore-scripts`. No installation or publishing lifecycle was executed. The retained local version3.48.0 does not identify this candidate as the public npm baseline or the installed plugin.

- Archive: `/Users/Shared/great-cto-candidate-20261003.409hpi/great-cto-3.48.0.tgz`.
- Archive SHA256: `ae087112f99128147be2d12622d41417b8d0df2d570963680d6dc0bee66dda3e`.
- Extracted inventory digest: `fb3856429b931b4ab94b55e2f81fb448700c75ebfd5f80da5a7be1c69887471c`.
- Actual controller bytes SHA256: `43bf6ffb777ec4993ab9c306e07be72c2531e307644e8ff35c18615123ece3ce`.
- Graph SHA256: `accb6ac27581ae2fac69f018f67a0ea11af535f800e61c2f91c4501c0af01cf6`.
- Private diagnostics: `/private/var/folders/xf/8mjkgbt91mgg9b0m_gyrh92w0000gn/T/great-cto-package-smoke-pWmidy`.

A separate read-only comparison matched all161 regular extracted files against local repository/build outputs, with no unmapped files or byte mismatch. Bundled paths map to repository-relative paths; other package files map to packages/cli. This includes generated build outputs and assets, so it is local build parity, not proof that all161 files are committed source, reproducible compilation or runtime loaded-module closure attestation. The corpus registrar/oracles/scorers are operator-side tools and are not claimed to be bundled application assets.

## Test plan and observed execution

| Requirement | Check | Result |
| --- | --- | --- |
| Actual CLI entry | Separate Node process, pinned extracted archive | `--version` exit0, version3.48.0 |
| Controller CLI startup | Private empty run store | `codex-host list` exit0, state ok, empty list, unreadable0 |
| Controller construction | Separate trusted harness importing delivered modules | 12 positive scenarios and8 expected refusals |
| Review/ordering safety | Existing representative web/fintech/mobile/AI matrix | Joined mandatory barriers, security/compliance gates and phased/full-cycle ordering retained |
| Mutation refusal | Whole inventory and archive rechecked after execution | Both unchanged |
| Source/build parity | Independent read-only byte comparison | 161/161 local output matches |
| Frozen corpus contexts | All8 registered inputs with explicit changed-path/role expectations | Not yet executed; task remains in progress |
| Actual workflow/provider proof | Dispatched roles, independently verified outputs, actual authorized gates | Not established by this probe |

All tested states have zero recorded dispatch attempts and approvals. Host routes are configured for Codex and Claude Code, not dispatched. Provider calls and cost remain unknown/null, not zero. Full-cycle here means graph construction, not completion of a product lifecycle. Actual model/native events, matched-arm role floors, running module/tool/provider provenance, same-user isolation and independent admission remain outside this evidence scope. `executionArtifactProvenanceVerified=false` and `benchmarkEligible=false` remain explicit.

The artifact and diagnostics are intentionally retained. No installed plugin, defaults, merge, release or actual gate approval changed. Next required work is all eight frozen-context delivered-controller probes, followed by the remaining independent evidence prerequisites and live matched trials; this fresh archive alone cannot make the experiment eligible.

The existing pinned package/controller harness suites passed9/9 without skips. The complete local CLI suite, including a fresh TypeScript build, passed356/356 without skips. Documentation tests passed76/76; diff checks passed. HOL score83, zeroCritical and unchanged35 reviewedHigh; no new High/Critical or exception changes. These targeted suites and actual artifact checks supplement, but do not replace, the preceding source quick CI. No new full L3-L5/live model/native lifecycle suite was run in this verification.
