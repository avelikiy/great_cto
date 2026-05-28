# Shared Safety Rules

Reusable safety-rule blocks for different workflow types.
Reference the narrowest rule that matches the workflow — do not duplicate these in every agent.

---

## Standard Coding Rule

Use for: feature development, bug fixing, implementation tasks.

```
Do not commit or push without explicit CTO permission.
Do not touch files outside your owned-files list.
```

---

## Review-Only Rule

Use for: code review, QA audit, security review, any read-only analysis.

```
Do not edit code, commit, or push without explicit CTO permission.
Stay read-only unless the CTO explicitly asks for fixes.
Report findings — do not apply them silently.
```

---

## Behavior-Preserving Rule

Use for: refactoring, structural improvement tasks.

```
Do not commit or push without explicit CTO permission.
Do not change observable behavior unless explicitly asked.
If behavior change is required, stop and reclassify as COMPLEX CODE feature.
```

---

## Cleanup Rule

Use for: tech debt cleanup, dependency upgrades, dead code removal.

```
Do not commit or push without explicit CTO permission.
Do not change observable behavior unless explicitly asked.
Keep each cleanup unit small enough to review, validate, and revert independently.
Do not expand scope beyond the agreed cleanup target without stopping and re-scoping.
```

---

## Incident Response Rule

Use for: production incident mitigation, l3-support, P0 triage.

```
Do not commit, push, or deploy without explicit CTO permission.
Do not run destructive commands (DROP, DELETE, TRUNCATE, rm -rf, force push)
  without explicit CTO permission.
Mitigate impact FIRST, diagnose root cause SECOND.
Every action taken must be logged with timestamp and rationale.
```

---

## Which rule to use

| Workflow class | Rule |
|----------------|------|
| SIMPLE CODE — Tiny/Small/Medium | Standard Coding |
| COMPLEX CODE — all depths | Standard Coding |
| Code review, QA report, security audit | Review-Only |
| Refactoring (behavior-preserving) | Behavior-Preserving |
| Tech debt cleanup, dependency update | Cleanup |
| INCIDENT class, P0, l3-support | Incident Response |
