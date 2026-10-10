# Packaged controller graph and selection probe

Date: 2026-10-02. Scope: `great_cto-p4o9.4.3.1.9`. Related: [candidate package](2026-10-02-candidate-runtime-package.md), [pinned smoke](2026-10-02-pinned-package-smoke.md), [benchmark contract](2026-10-02-adaptive-benchmark-contract.md).

## Evidence boundary

Successful delivered CLI startup did not exercise graph construction or specialist selection. The optional `controllerProbe: true` path now runs a separate trusted harness process after archive pin admission and extraction, importing the extracted package's actual controller, specialist planner, role profiles and rules. It invokes construction/selection and fail-closed cursor checks only: it never invokes `runStage`, approval or release functions. Whole-package inventory and archive pin are rechecked afterwards. Parent probe checks the graph digest against the extracted data bytes and rejects unsupported report shapes. This is not a loaded-module attestation or an OS sandbox.

The harness builds new private disposable Git fixtures, with empty Git templates, hooks disabled for fixture commits, explicit identity, signing and fsmonitor disabled. Child environment is allowlisted; system/global Git config are suppressed. Policy JSON files are owned by the harness outside each worker fixture and mode0600. This exercises policy construction but not CLI policy-path admission. Mixed Codex/Claude routes are configured and asserted, not dispatched. There is no provider-network enforcement or provider receipt; provider calls/cost remain unknown/null, not inferred zero.

The first actual attempt failed during `git init`, before graph loading, because the stripped environment exposed an invalid system Git config. Suppressing system/global config for these controlled fixtures repaired the launch. The failed private diagnostic directory is retained; no package failure or successful graph execution is claimed from that attempt. No operator Git config was modified.

## Test plan

| Area | Type | Explicit requirement |
| --- | --- | --- |
| Delivered graph and role profiles | Archive integration | Every constructed state has the actual shared pipeline digest and supported role profiles |
| Mandatory reviews | Structural behavior | Code review, QA, security remain a joined barrier to devops with ship/security/compliance boundaries |
| Archetype floors | Behavior matrix | Web, fintech, mobile and AI selection includes hardcoded expected domain roles, not just the package's own selected list |
| Workflow entry/preparation | Behavior matrix | Existing, phased and full-cycle entry obey ordering; contracts precede implementation where required |
| No speculative low-risk claim | Negative behavior | Empty existing diff refuses; clean planning retains unknown/T2 |
| Missing/unknown/drift inputs | Negative behavior | Missing project/pipeline, unknown archetype and project drift refuse or block |
| Graph weakening | Negative behavior | Unsafe review exit and missing compliance gate block with zero attempts/approvals |
| Harness/diagnostic isolation | Integration | Private empty fixture root, separate process, mode0600 diagnostics, no lifecycle installation |
| Altered delivered graph | Adversarial archive fixture | Even a freshly pinned archive fails if security/compliance gates are removed |

## Actual candidate result

Executed archive SHA256 `19e9928b566bd52c87046070024bb3c76935f1528e08343ceed930a4b08eecf3`, built from source `2078523eb32c257c4f1e79f6f38ffdf361357bee`. Actual graph SHA256 `accb6ac27581ae2fac69f018f67a0ea11af535f800e61c2f91c4501c0af01cf6`. The extracted package's inventory and archive pin remained unchanged after the CLI smoke and controller probe.

Twelve positive scenarios pass: eleven domain/workflow combinations plus clean unknown/T2 planning. Eight expected refusals/blocks pass. AI existing-change is intentionally refused because prompt architecture contracts cannot be moved after code; phased/full-cycle select AI security, prompt architecture and evaluation. Fintech preparation includes PCI and regulated specialists plus security/compliance hard gates. Mobile selects the store reviewer. Full-cycle construction retains product/architecture/plan ordering. All cases assert zero recorded attempts, steps and approvals; no stages or gates are executed.

Focused probe/archive suites passed9/9 without skips after final report-shape and private-fixture checks. Earlier expanded documentation/recall run passed21/21. The archive-fixture integration also exercises a package missing its controller and a freshly pinned archive with security/compliance gates removed; both fail without echoing private child output. Source-unit fixtures and actual archived candidate are distinct evidence scopes.

This is coverage of four representative domains, not all archetypes, all corpus groups, all hosts' native events or an executed product lifecycle. Full-cycle here means constructing its graph, not finishing it. `executionArtifactProvenanceVerified=false` and `benchmarkEligible=false` remain explicit. Source callback tests, archive fixtures and actual candidate execution are reported separately; fixture execution is not relabelled a delivered production run. No installed plugin, defaults, merge, release or approvals are changed.
