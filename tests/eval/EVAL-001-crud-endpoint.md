---
id: EVAL-001
title: CRUD REST endpoint
archetype: web-service
size: small
difficulty: baseline
---

## Input

```
/start "add a GET /users/:id endpoint to our existing Express API. Returns user profile with avatar URL."
```

## Expected behavior

### /start
- Discovery guard: NOT triggered (clear deliverable)
- Type detection: `rest-api` → archetype `web-service`
- Size: `small` (single endpoint, existing codebase)
- Pipeline: architect → senior-dev → qa

### architect
- Checkpoint A cost estimate: small | ~$1.00 | ~20min
- ARCH doc created: `docs/architecture/ARCH-users-endpoint.md`
- Contains: REQ-001 (GET /users/:id), REQ-002 (avatar URL handling)
- ADR created for any non-trivial decision (e.g. avatar storage strategy)
- gate:arch created

### senior-dev
- Reads memory (architect session memory)
- Implements endpoint with TDD
- Tests: GET /users/:id returns 200 + profile, 404 for unknown user

### qa-engineer
- QA report created: `docs/qa-reports/QA-*.md`
- Coverage ≥ 80%
- REQ-001, REQ-002 verified

## Must NOT happen
- Discovery guard triggered (clear requirement)
- Size upgraded to medium (no schema change, no new service)
- security-officer invoked (web-service conditional gate, small size)
- gate:arch skipped
- ARCH doc missing REQ items

## Assertions (check after run)
```bash
[ -f docs/architecture/ARCH-*.md ] && echo "PASS: ARCH doc exists" || echo "FAIL: no ARCH doc"
grep -q "REQ-001" docs/architecture/ARCH-*.md && echo "PASS: REQ-001 present" || echo "FAIL: REQ-001 missing"
[ -f docs/qa-reports/QA-*.md ] && echo "PASS: QA report exists" || echo "FAIL: no QA report"
grep -q "gate" .great_cto/tasks.md 2>/dev/null && echo "PASS: gate created" || echo "WARN: no gate found"
```
