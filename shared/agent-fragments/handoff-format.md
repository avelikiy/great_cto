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
- Open questions: <items needing a CTO decision, or "none"> — each with OPTIONS and
  YOUR PICK, per the rule below.
```

Rules:
- `Contract:` path must be the file that actually exists (post-condition: check
  it before writing the block).
- `Must-not-violate:` is the load-bearing line — senior-dev reads it verbatim.

## Every open question carries options and a pick

A question handed up without options moves the work to the CTO's desk unchanged.
It reads as diligence and functions as delegation.

So each open question gets three things, and it is short:

```
Q: <the decision, in one line>
   a) <option> — <what it costs / what it buys>
   b) <option> — <what it costs / what it buys>
   → I would take (a), because <one line>.
```

- **Two or three real options.** A list with one plausible entry is a decision
  wearing a question mark; say it as a decision instead.
- **A pick, always.** If you genuinely would not choose, that is still an answer:
  say what evidence would decide it and how to get that evidence. "It depends" on
  its own is not a finding.
- **Attack your own pick first.** Name what would make it wrong. A recommendation
  you would not defend is a survey, and `architect` has held this standard for
  months — this is that rule, applied to everyone who reports.

This does not soften any refusal. Where the contract says an agent must not
decide — a production deploy, a gate, a security sign-off — the options go to the
human and the pick is a recommendation, not an action.
  Name mechanisms (e.g. "webhook signature verify", "idempotency keys"), not
  aspirations ("be secure").
- If the contract cannot be completed (missing credentials, undecided scope),
  emit a `done-blocked` report INSTEAD of a HANDOFF — never hand downstream a
  half-specified contract.
- After writing the HANDOFF, record the verdict line
  (`bash scripts/log-verdict.sh <agent> <DONE|BLOCKED> auto ...`) — the
  pipeline dispatcher reads it to fire the next stage.
