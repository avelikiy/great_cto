# Postmortem — six months of silent pipeline failure

**Date**: 2026-04-20
**Detected via**: manual audit of a long-running project's `.great_cto/` state
**Impact**: pipeline appeared to run; produced zero pipeline artefacts
**Severity**: P0 — the product's primary job silently did nothing

---

## What happened

A project had been using great_cto for six months. Running `/audit`, `/review`,
`/inbox` regularly. No visible errors.

But on inspection:

- `docs/audit/` — empty
- `docs/architecture/` — empty
- `docs/qa-reports/` — empty
- `docs/security/` — empty
- `.great_cto/verdicts/` — did not exist
- `.great_cto/permission-denied.log` — did not exist
- Only artefacts present: `PROJECT.md` and a Beads backlog (17 open, including a
  P0-SEC for committed API keys — never triaged because the CSO never wrote a
  report)

Every pipeline phase had silently failed.

## Root cause

Three compounding gaps:

1. **Plan-mode inheritance** — sub-agents spawned while the main session was in
   plan mode inherited it. `Write` and `Bash` were denied. The agent would emit
   "I'd write AUDIT-..." in its transcript, then terminate successfully.
2. **No post-conditions** — agents had no check "did my artefact actually land
   on disk?". A green exit code was treated as success.
3. **No audit trail** — no `verdicts/` log, no `permission-denied.log`. The user
   had no way to notice that nothing was being written.

Result: the user trusted six months of green check-marks that represented
nothing.

## What we shipped

**v1.0.78 — Pre-flight probe.** Every agent starts by probing `Bash` +
`Write` with a tiny no-op. If either is denied, the agent exits immediately with
a `BLOCKED (plan-mode)` verdict instead of hallucinating work.

**v1.0.79 — Artefact post-conditions + verdict log.** Every agent, on exit,
verifies its expected artefact exists and appends a line to
`.great_cto/verdicts/YYYY-MM-DD.log`:

```
2026-04-20T09:41:00Z | project-auditor | DONE    | artefacts=2 | beads_open=7
2026-04-20T10:22:00Z | security-officer | BLOCKED | P0 + SEC label → must block
```

Hard rule: `if agent == security-officer and P0 > 0 and SEC label present →
STATUS = BLOCKED`. No exceptions.

**v1.0.80 — `/doctor` health check.** Shows missing artefacts, stale
phases, Beads state, permission denials in one glance. Plugin-wide diagnosis in
~2 seconds.

**v1.0.80 — Test harness.** Three-layer validation (structural, e2e
assert-only, manual dogfood) covering 3 fixtures. Anything that breaks the
agent contract fails CI before shipping.

**v1.0.81 — zsh compatibility.** Found during dogfood: several shell
idioms (`grep -c … || echo 0`, bare globs with `2>/dev/null`) produced wrong
results on macOS zsh. Fixed across `/doctor` and the SessionStart banner.

**v1.0.82 — Two more fixtures** covering common failure modes
(unauthenticated admin endpoint, committed API keys). CI matrix expanded.

**v1.0.83 — `/doctor --fix`.** One-shot remediation for recoverable
issues: missing dirs, missing `env.sh`, old PROJECT.md format, stale denied-log.

## What a new user gets now

Opening Claude Code in a project:

- **P0 banner** on every session start if any Beads P0 is open
- **Staleness warning** if audit > 30d or digest > 8d
- **`/doctor`** — "is my pipeline healthy?" answered in 2 seconds
- **`/doctor --fix`** — "you're missing some dirs, here, fixed"
- **Verdict log** — every agent run leaves an auditable trail
- **Pre-flight probe** — agents refuse to run blind; fail loud instead of silent

## Lessons

1. **Silent success is the worst failure mode.** An agent writing nothing while
   reporting DONE is undetectable without artefact post-conditions.
2. **Permission-denied events need their own log file.** Without
   `.great_cto/permission-denied.log` the cause is unrecoverable.
3. **`/doctor` pays for itself on day one.** It exists because the product's
   owners couldn't tell the product was broken for six months.
4. **CI harness must assert artefact shape, not just exit code.** A test that
   runs the agent and doesn't check `docs/audit/AUDIT-*.md` existence is a test
   that will tolerate this bug.

## Related commits

- `fix: /audit reliably detects your project type` (v1.0.76)
- `feat: /doctor health check + reliable agent execution` (v1.0.78–v1.0.80)
- `fix: /doctor runs cleanly on macOS` (v1.0.81)
- `chore: broader pipeline test coverage` (v1.0.82)
