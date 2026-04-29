---
id: EVAL-004
title: Hotfix nano — senior-dev only
archetype: web-service
size: nano
difficulty: size-routing
---

## Input

```
/start "fix typo in error message: 'Authetication failed' → 'Authentication failed' in src/auth/errors.ts"
```

```
/start "rename ENV variable API_KEY to SERVICE_API_KEY in config.ts and .env.example"
```

## Expected behavior

### /start
- Discovery guard: NOT triggered
- Size: `nano` (single file, <10 LOC change)
- Pipeline: senior-dev ONLY (no architect, no qa, no security)
- No gate:arch created
- No ARCH doc created
- Confirmation: "nano — skipping arch doc and gate. Senior-dev will implement directly."

### senior-dev
- Claims task
- Makes targeted change
- Closes task in Beads
- Does NOT run full TDD suite for a typo fix (proportional effort)

### architect
- NOT invoked
- NOT called for nano

## Must NOT happen
- architect invoked for nano
- gate:arch created for nano
- ARCH doc written for a typo fix
- qa-engineer or security-officer invoked
- Size upgraded to small (no logic change, single file)

## Assertions
```bash
[ ! -f docs/architecture/ARCH-*.md ] && echo "PASS: no ARCH doc for nano" || echo "FAIL: ARCH doc created for nano"
# Verify architect was not invoked by checking verdicts
[ ! -f .great_cto/verdicts/architect.log ] || tail -1 .great_cto/verdicts/architect.log | grep -qv "$(date +%Y-%m-%d)" && echo "PASS: architect not called today" || echo "WARN: verify architect was not called for nano"
```
