---
id: EVAL-002
title: JWT auth service
archetype: commerce
size: medium
difficulty: security-gate
---

## Input

```
/start "build JWT auth service with refresh tokens, password reset, rate limiting. Node.js, Postgres."
```

## Expected behavior

### /start
- Discovery guard: NOT triggered (clear deliverable)
- Type detection: `auth-service` → archetype `commerce`
- Size: `medium` (new service, schema required)
- Security gate: MANDATORY (commerce archetype)
- Pipeline: architect → senior-dev → qa → security-officer → devops
- Compliance: `owasp` auto-added (commerce default)

### architect
- Checkpoint A cost estimate: medium | ~$4-6 | ~45min | +20% security gate
- ARCH doc: REQ-001 (JWT issue/verify), REQ-002 (refresh rotation), REQ-003 (rate limiting), REQ-004 (password reset flow)
- ADR: token storage strategy (httpOnly cookie vs Authorization header)
- Beads tasks: ≥ 4 tasks created

### security-officer
- Scans for: SQL injection in auth queries, bcrypt rounds ≥ 12, token expiry enforced, rate limit bypass
- Must produce CSO-*.md with APPROVED or BLOCKED verdict
- If BLOCKED: specific findings listed (not generic "security issues found")

### devops
- Only runs after security-officer APPROVED
- RELEASE-*.md created

## Must NOT happen
- security-officer skipped (MANDATORY for commerce)
- Size downgraded to small (new service + schema = medium minimum)
- Discovery guard triggered
- ARCH doc missing REQ items for refresh token flow

## Assertions
```bash
grep -q "security-gate: mandatory" .great_cto/PROJECT.md && echo "PASS: mandatory gate set" || echo "FAIL: security gate not mandatory"
[ -f docs/security/CSO-*.md ] && echo "PASS: CSO report exists" || echo "FAIL: no security report"
grep -q "REQ-00[1-4]" docs/architecture/ARCH-*.md && echo "PASS: REQ items present" || echo "FAIL: REQ items missing"
grep -qE "APPROVED|BLOCKED" docs/security/CSO-*.md && echo "PASS: clear verdict" || echo "FAIL: no verdict"
```
