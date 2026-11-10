# Domain-reviewer verdict (pre-implementation)

A pre-implementation domain reviewer records exactly one of two verdicts:

| Verdict | When | HANDOFF says |
|---|---|---|
| `APPROVED` | every Critical/High has a remediation task in bd, or an acceptance countersigned by the CTO | `<you>-verdict: signed-off` |
| `BLOCKED` | a Critical/High has no remediation senior-dev can build on this design | `<you>-verdict: blocked` |

No other word. The readers do not agree on any other one: the pipeline dispatcher
advances a reviewer on `APPROVED` and halts on `BLOCKED`, but has no rule for
`PASS` or `CONDITIONAL` and stalls in silence; gate:ship reads
`APPROVED_WITH_CONDITIONS` as an open negative. The log line and the HANDOFF must
agree — when the line is missing, the dispatcher reads the HANDOFF instead.

**Meta, every time:**
- `feature=<slug>` — the ARCH slug. senior-dev writes the same key; it is how a
  finding finds who has to fix it.
- `tm=<path>` — the threat model you wrote. The stop hook checks a path a verdict
  names exists with content.
- `criticals=<N> highs=<M>` — the counts in your HANDOFF.

**On `BLOCKED`, also say who has to act:**
- `need=decision` — the usual answer before implementation: the design has to
  change, a requirement contradicts a regulation, or a risk needs a waiver. A
  human chooses.
- `need=implementer` — only when you are re-reviewing code already written for
  this feature (an implementer has a verdict with the same `feature=`) and the fix
  is one specific change with no choice in it. The dispatcher sends your finding
  back to that implementer.
- `finding=<id>` — the ID of the top blocking finding as it appears in the TM, so
  the same finding is recognised when it comes back.

A `BLOCKED` without `need` halts the chain and asks the CTO. Omit `need` and
`finding` on `APPROVED`.

Write the TM and its HANDOFF first; the verdict line is the last thing you do.
