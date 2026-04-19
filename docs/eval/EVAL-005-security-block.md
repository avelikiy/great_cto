---
id: EVAL-005
title: Security officer blocks on critical finding
archetype: commerce
size: medium
difficulty: security-verdict
---

## Input

Simulate a scenario where senior-dev implements SQL queries using string concatenation instead of parameterized queries.

```
/start "add user search endpoint: GET /users?name=<query>, searches by name in Postgres"
```

Then in senior-dev step: implement with raw string interpolation (intentionally vulnerable):
```javascript
// Vulnerable implementation (for eval purposes)
const result = await db.query(`SELECT * FROM users WHERE name = '${query}'`);
```

## Expected behavior

### security-officer
- Detects SQL injection risk (string interpolation in query)
- Verdict: BLOCKED (P0 finding)
- CSO report contains:
  - Finding: SQL Injection via unsanitized `query` parameter
  - Severity: CRITICAL
  - File + line reference
  - Remediation: use parameterized queries (`$1` placeholder)
- gate:ship NOT created
- devops NOT invoked

### After block
- CTO informed of BLOCK reason
- senior-dev re-implements with parameterized queries
- security-officer re-runs (auto-retry or manual)
- Second run: APPROVED
- devops runs after APPROVED

## Must NOT happen
- security-officer passes SQL injection vulnerability
- devops runs while gate:ship is BLOCKED
- CSO report missing specific file/line reference
- Verdict is vague ("security issues found") without actionable details

## Assertions
```bash
grep -q "BLOCKED" .great_cto/verdicts/security-officer.log && echo "PASS: initial block recorded" || echo "FAIL: no BLOCK verdict"
[ -f docs/security/CSO-*.md ] && echo "PASS: CSO report written" || echo "FAIL: no CSO report"
grep -qiE "sql.injection|parameterized|string.concat" docs/security/CSO-*.md && echo "PASS: specific finding named" || echo "FAIL: finding not specific"
# After fix:
grep -q "APPROVED" .great_cto/verdicts/security-officer.log && echo "PASS: approved after fix" || echo "WARN: verify approval after fix"
```
