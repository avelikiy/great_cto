# ADR: Phased specialist contracts and complete controlled capability registry

Status: Proposed, implemented for review. Date: 2026-10-02.
Deciders: maintainer and independent security reviewer.
Beads: great_cto-p4o9.3.2.2.1.

Related: [post-build scheduling](ADR-controlled-specialist-scheduling.md),
[shared admission budget](ADR-shared-agent-execution-budget.md),
[change-driven selection](ADR-change-driven-specialist-plan.md),
and [live validation](../analysis/2026-10-02-phased-mixed-host-validation.md).

## Context

Post-build inspection cannot substitute for pre-implementation threat models or
design contracts. Existing-change v1 rejected contract/eval selections. Many
shipped domain agents also lacked an explicit controlled capability profile.
An executable native host prompt is not an appropriate substitute: proposal
workers cannot dispatch agents, operate gates, mutate state or deploy.

## Decision

Keep existing-change semantics and defaults unchanged. Add two explicitly
operator-selected workflows in the outside-workspace specialist policy:

```json
{"mode":"adaptive","workflow":"phased-change","base":"<commit>","contracts":["auth-engineer"]}
```

`phased-change` enters at senior-dev, but intercepts that cursor before the first
implementation dispatch. `full-cycle` enters at product-owner and preserves the
product, architecture and planning graph and its declared gates. It intercepts
senior-dev only after upstream verification and approvals. Existing project
declaration is required and frozen; this is not an automatic project bootstrap.
For a clean committed tree with no implemented diff, only explicit phased
planning may select declaration-driven contracts. The assessment stays unknown
and T2; this exception never enables selective runtime gate stand-down. Native
advisory and existing-change modes still refuse an empty change. Unreadable,
unsafe or missing input is never treated as clean planning evidence.

Selected domain reviewers run in two distinct identities: `<role>-prebuild`
for threat/design review, then `<role>` for inspection of the implementation.
AI prompt architecture runs as a pre-build contract; AI evaluation runs in the
post-build quorum. Contract identities are controller-owned, not arbitrary
worker aliases. Every selected identity resolves to an explicit registered
capability profile. All shipped agent names have explicit descriptions, but
profile availability alone does not declare every role schedulable in every
phase or authorize external actions.

Operator-selected optional contracts are limited to auth, subscription billing,
integrations, source connectors, media, routing, AI prompts and design. Unknown
or side-effecting contract roles are refused. No domain is silently dropped.
Selected additional contract documents must be included in the implementation
context; the existing controller context mechanism records all earlier results.

Pre-build roles produce new Markdown contracts/threat models only under
`docs/specialist-contracts/`. The symmetric join requires every selected role's
successful independent verification. Each edge carries a hard plan gate;
regulatory selections additionally preserve security/compliance approval.
No worker verdict or process exit can approve these gates. Explicit underlying
host routes apply to pre-build identities unless an explicit staged route
overrides them. Mixed-host independent preparation pairs use the existing
frozen-wave dispatch and shared admission budget.

Preparation binds the bounded Git-visible input scope. Only exact independently
verified preparation outputs are excluded while the preparation quorum runs.
Source mutation during this phase blocks dispatch/approval. On completion,
contracts remain immutable controller-attested artifacts, while implementation
may change source as its purpose requires. Post-build review includes contract
bytes in a new dependency epoch. If implementation introduces a domain/contract
not selected in preparation, refuse progression and require a newly assessed
run. Post-build rejection invalidates implementation and post-build evidence,
retaining the approved contracts as requirements, not as implementation PASS.

## Alternatives and trade-offs

Running all roles after code is simpler but defeats prevention and inspects the
wrong artifact for contract roles. Reusing the same result key for pre/post
stages conflates design sign-off and code approval; rejected. Distinct identities
retain provenance and deterministic repair without duplicating executable
prompts. Additional pre-build verification and human approvals increase
regulated-change overhead. This is deliberate and remains opt-in.

## Validation strategy

Unit/contract: every shipped agent and every archetype/pack/compliance selection
has an explicit profile; unsupported roles still fail closed. Integration:
product/architecture/plan approvals precede preparation; domain quorum and verifier
failures prevent implementation; preparation cannot write code; changed inputs
invalidate preparation; new domains block post-build progression; AI contract
and eval stages are correctly separated; explicit contract selection, mixed-host
preparation and bounded post-build repair preserve evidence. Regression covers
legacy controller, native hooks, gates, budgets, receipts and release.

Fixtures exercise actual controller transitions with test runners; they do not
establish live model quality or installed-plugin parity.

## Consequences and remaining boundaries

No implicit historical PASS reuse, no defaults change, no release or deployment authority.
Explicit opt-in reuse requires the separate [scoped evidence contract](ADR-scoped-review-evidence.md),
including fresh independent dependency/current-task attestation and unchanged human gates.
Ignored runtime inputs remain outside the Git-visible attestation. Full external
provisioning/import/live monitoring require their independent operator contracts.
Scoped historical reuse, native asynchronous admission, live benchmark,
independent security review, actual scanner and release/install verification
remain tracked in Beads. Do not call this installed 100 percent support.
