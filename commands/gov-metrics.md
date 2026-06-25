---
description: "Governance metrics — measure whether the gates actually work. Block rate, override/waiver rate, false-block proxy, R1-textual vs R2-mechanical share, and time-in-gate, computed from the verdict trail."
argument-hint: "[--since 30d] [--json]"
user-invocable: true
allowed-tools: Bash, Read
model: haiku
---

# /gov-metrics — does the gate actually gate?

great_cto's moat is mechanical governance. A gate you can't measure is a vibe, not
a control. This reports the numbers (idea adapted from SantanderAI/mech-gov-framework):

- **Block rate** — share of gate decisions that blocked.
- **Override / waiver rate** — blocks a human bypassed.
- **False-block proxy** — blocked-then-passed-unchanged (gate noise / over-firing).
- **R2 mechanical share** — verdicts enforced by CI/script (the moat) vs **R1 textual**
  (a reviewer's prose judgment). High R1 share = gates lean on vibes, not enforcement.
- **Median time-in-gate** — minutes between consecutive gate decisions on a feature.

## Run

```bash
PT="$(ls -d ~/.claude/plugins/cache/local/great_cto/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||')"
[ -d "$PT" ] || PT="$(pwd)"
node "$PT/scripts/lib/gov-metrics.mjs" $ARGUMENTS
```

`--since 30d` limits the window; `--json` emits machine-readable output for the board.

## Present

Show the CTO the table, then **one sentence of so-what**:
- R2 share < 40% → "gates lean on prose — move judgment into enforced checks."
- false-block proxy > 30% → "gates over-fire — calibrate severity (anti-inflation)."
- block rate ~0% over many decisions → "the gate never says no — is it real?"

Governance is the product. These numbers are how you prove it.
