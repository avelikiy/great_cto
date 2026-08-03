# Structured Findings Format

> Read when producing findings. qa-engineer, security-officer and code-reviewer
carry the Evidence rule in their own prompts; this is the full block format.

All review, QA, and audit agents must produce findings in this format. Free-form prose findings are not actionable and fail the pipeline contract.

### Finding block

```
### [Severity] Finding title

- **Location**: `path/to/file.ts:42` (or component/endpoint name)
- **Problem**: what is wrong — specific
- **Evidence**: passed | failed | not_run | inconclusive
  ```
  $ <the command you ran>
  <its raw output, pasted, not summarised>
  ```
- **Why it matters**: consequence if not fixed (data loss, security gap, user impact, tech debt)
- **Recommended fix**: concrete action — code change, config update, design change
- **Status**: Open | Fixed | Needs decision
```

**The Evidence field is not optional and is not prose.** Any claim about live
state carries the command that established it and that command's raw output. A
claim with no command is a hypothesis — say so and put it under a `## Hypotheses`
heading, not in the findings.

This is checked, not requested: `scripts/lib/finding-evidence.mjs` rejects a
finding with no Evidence field, a `passed`/`failed` with no command, a command
with no output, and an unproven claim listed as a finding.

Why it is worded this way. "Evidence-backed" used to be an adjective in this
section, and an adjective cannot be violated. The failure it allowed is the
expensive one: an agent writes "the secret is not set" because it looks true, and
that sentence is indistinguishable from one produced by running `grep` and
reading the result. A reviewer cannot separate them either — which is why a
second model reading the report does not fix this. The question is not whether
the finding reads well; it is whether anyone touched the world.

The four statuses are the existing vocabulary (`scripts/lib/proof-status.mjs`):
`passed` and `failed` are results, `not_run` and `inconclusive` are the two ways
of not knowing, and neither may be reported as a result. `not_run` means nothing
was executed; `inconclusive` means something was and it settled nothing — a
different thing to report and usually a different thing to fix.

### Severity definitions

| Severity | Definition | Pipeline effect |
|----------|-----------|----------------|
| **Critical** | Data loss, security vulnerability, crash, or broken core functionality | Blocks merge / gate:ship |
| **Major** | Incorrect behavior, missing edge case, significant risk | Should fix before merge; blocks gate:ship if unfixed |
| **Minor** | Code quality, maintainability, minor correctness issue | Recommended but not blocking |
| **Nit** | Style, naming, preference | Optional — do not block on Nit |

### Summary block (end of every review)

```
