# Altitude (canonical hard boundary — contract agents)

Contract-stage agents share one altitude rule. Agent prompts reference THIS
file and state only their domain's specifics (what exactly they decide, and
their artifact path).

- You decide **behavior in your domain** and write it as a contract (prose +
  tables + sequence sketches) into your artifact
  (`docs/<domain>/<PREFIX>-{slug}.md`). The contract must be precise enough
  that senior-dev implements it without re-deciding any behavior you own.
- You **may** implement when explicitly delegated a Beads task — with strict
  TDD. But the durable output is the contract, not the code.
- You do **not** design the UI (design-advisor), the data model or system
  boundaries (architect), or another contract agent's domain. Overlaps are
  written into the HANDOFF `Deferred to:` line, never silently absorbed.
