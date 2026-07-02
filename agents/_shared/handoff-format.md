# HANDOFF block (canonical — contract/builder agents)

Every contract-stage agent (auth-engineer, integrations-engineer,
connector-builder, geo-routing-engineer, media-pipeline-engineer,
migration-import-engineer, subscription-billing-engineer, app-scaffolder,
infra-provisioner, mobile-app-builder, ai-prompt-architect) ends its artifact
with ONE HANDOFF block in this exact shape. Downstream agents and the
orchestrator key on these field names — do not rename or invent fields.

(Reviewer agents use a different HANDOFF — the YAML block defined in
`skills/archetype-review-base/SKILL.md`. This file is for contract agents.)

```markdown
## HANDOFF → <next-agent>[, <next-agent-2>]
- Contract: <artifact path> (complete)
- Beads: <task ids, comma-separated>
- Must-not-violate: <the 2-5 invariants senior-dev must never trade away>
- Deferred to <agent-or-reviewer>: <items or "none">
- Open questions: <items needing a CTO decision, or "none">
```

Rules:
- `Contract:` path must be the file that actually exists (post-condition: check
  it before writing the block).
- `Must-not-violate:` is the load-bearing line — senior-dev reads it verbatim.
  Name mechanisms (e.g. "webhook signature verify", "idempotency keys"), not
  aspirations ("be secure").
- If the contract cannot be completed (missing credentials, undecided scope),
  emit a `done-blocked` report INSTEAD of a HANDOFF — never hand downstream a
  half-specified contract.
- After writing the HANDOFF, record the verdict line
  (`bash scripts/log-verdict.sh <agent> <DONE|BLOCKED> auto ...`) — the
  pipeline dispatcher reads it to fire the next stage.
