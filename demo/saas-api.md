# Demo: SaaS API

**Stack**: FastAPI, PostgreSQL, Redis, AWS (ECS)
**Detected types**: `saas-platform` (primary) + `auth-service` (secondary)
**Pipeline**: TDD → MANDATORY auth gate → staging → prod

---

## Session transcript

```
/start "Multi-tenant analytics SaaS, FastAPI + PostgreSQL + Redis, deploy to AWS ECS"

Great CTO: Got it: saas-platform + auth-service. Ready to build.
MANDATORY security gate active (auth-service requires it).

"build tenant isolation layer and JWT auth with refresh token rotation"

[architect — Opus]
Architecture ready → docs/architecture/ARCH-tenant-auth.md
• Row-level security in PostgreSQL for tenant isolation
• JWT (15min) + refresh token rotation (7d), stored in Redis
• Rate limiting per tenant via Redis sliding window
• ADR-001: JWT over sessions — stateless, horizontal scaling
Proceed? [yes/no]

approve

[senior-dev — Sonnet × 2 parallel]
Branch: feat/45-tenant-auth
Tasks claimed: BD-45 (tenant isolation), BD-46 (JWT auth)
TDD: 89 tests — unit + integration + auth boundary
PR: #8 opened

[code review — parallel, read-only]
Security reviewer: hardcoded JWT secret in test fixture → BUG-031 (P1)
Performance reviewer: N+1 query in tenant lookup → BUG-032 (P1)
Readability: all P2
Senior-dev fixing P1s...

[red-team — Sonnet]
• P1: JWT token reuse after logout (missing blacklist) → BUG-033
• P1: Tenant isolation bypass via crafted tenant_id → BUG-034
• P2: Refresh token not invalidated on password change
Senior-dev fixing P1s...

[qa-engineer + security-officer + runbook-writer — parallel]
QA: PASS
  • Auth boundary: 12/12 paths tested ✓
  • Tenant isolation: cross-tenant access: BLOCKED ✓
  • Load test: 1000 concurrent users, p95=145ms ✓
Security: APPROVED
  • OWASP Top 10: clean ✓
  • GDPR checklist: consent, deletion, portability ✓
  • SOC2 controls: audit log, encryption at rest ✓
  • JWT brute-force protection: BLOCKED ✓
Runbook: docs/runbooks/RB-tenant-auth-2026-04-07.md ✓
Confidence: HIGH

ship it

Deploy complete.
Staging: PASS | Prod: PASS | Error rate: 0.04%
SLO: 99.95% uptime configured
```

---

## Key pipeline rules applied

| Rule | Applied |
|------|---------|
| MANDATORY security gate (auth-service) | ✓ |
| GDPR compliance checklist | ✓ |
| SOC2 controls audit | ✓ |
| JWT brute-force testing | ✓ |
| Tenant isolation boundary tests | ✓ |
| ECS rolling deploy | ✓ |
