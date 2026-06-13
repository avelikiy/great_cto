# great_cto as an AI firewall — runtime action-control for agents

> Traditional security asks **"who has access?"** (IAM, SSO, PAM, DLP). It cannot answer the
> question that matters once AI *acts* instead of *answers*: **"what is this agent about to do
> right now, and should it?"** A formally-permitted agent that exports the entire customer base
> instead of a departmental report has correct permissions and a dangerous action.
>
> great_cto is that missing layer: **action-based control, not access-based.** An autopilot does
> the reversible volume at machine speed and **stops** before any irreversible action until a
> named, qualified human signs. This is the runtime control plane an agent workforce needs.

This is not a separate product to bolt on — it is what the engine already does. The table below
maps the canonical AI-firewall reference architecture onto great_cto's existing components, with
source pointers, so a security reviewer can verify each claim.

## Decision model: ALLOW · APPROVAL-REQUIRED · BLOCK

Every case the autopilot intakes resolves to one of three outcomes — the same three an AI firewall
must produce:

| Decision | great_cto behavior |
|---|---|
| **ALLOW** (auto-clear) | high-confidence, reversible, in-policy → the autopilot completes it straight-through (`autoEligible`, `scripts/lib/run-store.mjs`). |
| **APPROVAL-REQUIRED** | anything irreversible, low-confidence, or policy-flagged → the run **pauses at a human gate** in the operator inbox; a licensed signer approves or rejects. |
| **BLOCK** | the run refuses to proceed (rejected / dead-lettered); nothing irreversible executes (`reject`, `run-store.mjs`). |

The routing dial is the per-tenant **confidence floor**: an approve-recommendation below the floor
is downgraded to escalate (`startRun`, `run-store.mjs`).

## Reference architecture → great_cto components

| AI-firewall layer | great_cto component | Source |
|---|---|---|
| **Tool Gateway** — every tool/system request flows through one chokepoint | the connector layer: each capability (FHIR, AUS, NCCI, sanctions, e-sign, SAR e-file…) is invoked only via `call()` / `getConnector()` | `scripts/lib/connectors.mjs` |
| **Policy Engine** — validates rules before an action | role authorization (26 roles, vertical scoping) + per-vertical compliance packs + the structural flow invariant | `scripts/lib/roles.mjs`, `flows/*.flow.json` |
| **Risk Engine** — scores the operation, not just access | AI recommendation derived from connector risk signals + per-step `reversible` / `blastRadius` flags | `riskSignal()` / `recommend()`, `scripts/lib/flow-runner.mjs` |
| **Decision Engine** — ALLOW / APPROVAL / BLOCK | the flow-runner enforces the invariant: **every irreversible step MUST be preceded by a human gate** — violations are rejected at validation time | `validateInvariants()` / `irreversible-without-gate`, `scripts/lib/flow-runner.mjs:74` |
| **Audit Log** — the complete action chain, tamper-evident | every run event is **hash-chained** (each entry carries the prior entry's hash) and the record is **AES-256-GCM encrypted**; `verifyAudit()` detects any later edit | `pushAudit()` / `verifyAudit()`, `scripts/lib/run-store.mjs:39` |

What this audit captures per the firewall context model: agent identity (the autopilot + vertical),
requester/tenant, tool invoked, the connector evidence, the AI recommendation + confidence, and the
human signer + decision — the full chain an auditor or incident responder needs.

## Why this is stronger than a logging/observability add-on

- **The control is in the execution path, not beside it.** The gate is a hard pause in the runtime
  (`stopAtGate`), not an alert a human might read after the fact. The irreversible action cannot run
  until the gate is signed — it is structurally impossible, not policy-by-convention.
- **The invariant is validated, not trusted.** A flow that places an irreversible step without a
  preceding gate fails validation before it can ever run.
- **The audit is tamper-evident.** Hash-chain + encryption beats a plain append-only log: a later
  edit to hide an action is detectable.
- **Multi-operator, scoped.** Invited operators are role-locked and tenant-isolated; an operator's
  credential is never a key to another tenant's cases or to the builder surface.

## What's on the roadmap (firewall completeness)

- **Safe mode** (tenant-wide): on anomaly or manual trigger, force every case to a human gate
  (`gate-all`) or halt new intake (`halt`). See `docs/plans/PLAN-ai-firewall.md` P2.
- **Volume/scope-aware risk**: escalate *bulk* operations to a gate even when a single instance
  would auto-clear ("CRM access is fine; exporting the entire base is not"). P3.

## For the security buyer

If you are evaluating where the control plane for your agent workforce lives: great_cto is the
**runtime action-control layer** — it sits in front of the irreversible action, enforces a signed
human checkpoint by construction, and produces a tamper-evident chain of every autonomous decision.
Access control says *who*; this says *what, right now, and who signed for it.*
