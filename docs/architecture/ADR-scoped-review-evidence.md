# ADR: Independently attested scoped review evidence

Status: Proposed, opt-in implementation under PR167. Date: 2026-10-02.
Deciders: Operator and independent security reviewer before default enablement.

## Context

The [phased workflow](ADR-phased-specialist-workflow.md) separates design
contracts from implemented-code verdicts. Its whole-tree epochs invalidate a
current review on source mutation. That remains necessary, but it does not prove
that a historical report can be reused for a different run. File age, matching
paths and a previous PASS do not establish a complete dependency closure.

We need bounded reuse without moving gate authority to a cache. This runs under
the same cooperative operator/controller trust boundary as the existing controlled
host, not protection from a malicious process with access to the operator's files.

## Decision

An optional `reviewReuse` section in the outside-worker specialist policy declares
`scopes`, mapping controlled specialist stage names to explicit tracked file paths.
Optional `sources` maps those same stages to `{path, sha256}` of an independently
verified previous controller run stored outside the worker project. Sources are
operator-pinned, never found by scanning verdict logs or choosing the newest file.

Every input binding includes the current task and acceptance criteria, project
declaration bytes, canonical project root, role/capability digest, phase, graph
hash, stage contract, workflow and sorted dependency paths/modes/bytes. Changed
scope, input, role or task refuses a candidate. Dependencies must be tracked,
regular, non-symlink files, not ignored runtime state; missing/deleted/unreadable
inputs refuse reuse. Limits: 200 files, one MiB per file, eight MiB total.

Evidence version 2 uses literal Git pathspecs: a wildcard-looking filename must
itself be tracked, not merely match a tracked sibling. Dependency, report and
prior-run files must have one link. Reads use bounded O_NOFOLLOW/O_NONBLOCK
descriptors with inode/device/owner/mode/link/size/time checks before and after
reading and revalidation of the current canonical path. The aggregate closure
limit is checked incrementally instead of reading all 200 maximum-sized files
before refusing. Prior-run JSON retains its four-MiB cap.

Version-1 evidence is not silently upgraded: its different input binding refuses
reuse and follows the ordinary fresh-worker path. These descriptor observations
are not atomic ancestor handles or a sandbox against same-UID ABA/tampering.
Fresh independent semantic attestation and all mandatory gates still apply.

An ordinary fresh review may mint scoped evidence only if its independent verifier
explicitly attests `dependencyAttestation.state=complete`, the exact input digest
and nonempty actual completeness checks. The verifier is told to inspect the
project inventory/imports/configuration, not to accept the declared closure as
complete by definition. A plain `verified` is insufficient. Controller attempt,
report bytes, verifier evidence and required checks are bound to the receipt.

For an eligible candidate, the controller submits the exact historical report
as a new phase-local Markdown proposal, with a new attempt/report identity. It
omits only that specialist's worker call. The normal independent verifier still
executes against the current task/source and actual copied report, under the
[shared budget](ADR-shared-agent-execution-budget.md). Missing, incomplete or
unverifiable fresh completeness attestation cannot produce a successful reused
result. It follows the existing bounded rework route, invalidating affected
implementation/review approvals. A stale or invalid candidate is audited and
falls back to the ordinary full worker before producing a result.

Mandatory code-reviewer, qa-engineer, security-officer and ai-eval-engineer are
never eligible. Product/architecture/plan/deploy stages are not specialist review
evidence. Reuse imports no human approval, release capability or cursor movement.
Current quorum and human gates remain required. Reused results cannot mint another
historical reuse chain. Roles with scoped policy are executed individually so
candidate choice occurs before worker launch; unrelated mixed-host waves remain.

Example operator policy fragment (paths and hashes must be supplied by operator):

```json
{
  "reviewReuse": {
    "scopes": {"pci-reviewer": ["src/card-boundary.mjs", "package.json"]},
    "sources": {"pci-reviewer": {"path": "/operator/runs/prior.json", "sha256": "<exact sha256>"}}
  }
}
```

## Alternatives and trade-offs

Always rerun every specialist has the simplest cache invalidation semantics, but
cannot reuse a verified unchanged domain boundary. It remains the default.
Whole-tree hash reuse binds bytes but still does not establish task relevance or
completeness and invalidates on unrelated work. Age/path reuse is rejected because
neither age nor path proves inputs. Independently attested scopes cost a fresh
verifier call and require explicit operator configuration. They can save one
specialist worker call per accepted candidate, not mandatory reviews or gates.

## Consequences and verification

The controller does not infer a dependency graph from a model's earlier summary.
Human declarations alone never authorize omission: current independent inspection
must attest completeness. Model attestation is fallible, just like existing stage
verification; it is not a formal semantic proof or compliance certification.
No quality/cost percentage is claimed without the representative benchmark.

Tests cover changed task/project/contract/graph/phase/acceptance/input, altered
report/run pins, untracked/ignored/missing/symlink inputs, missing attestation,
failed required checks, recursion refusal, unchanged candidate acceptance,
fresh verifier execution, mandatory fresh quorum, fallback and rework. Work and
remaining live/security validation are tracked in Beads great_cto-p4o9.3.2.2.2,
not declared complete by this ADR.
Executed results and the actual-host authentication failure are recorded in the
[validation report](../analysis/2026-10-02-scoped-review-validation.md).
