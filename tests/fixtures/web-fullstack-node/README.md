# web-fullstack-node — great_cto fixture

Minimal Next.js + Prisma skeleton with deliberately seeded problems spanning
the common web-fullstack archetype concerns.

## Deliberate problems

1. **`.env.local` is committed with placeholder `DATABASE_URL`** — committed
   secret pattern; should trigger SEC Beads issue.
2. **`package.json` pins `next@13.4.0`** — one major behind, known CVEs in
   that line. Expected: P1 upgrade issue.
3. **`src/pages/api/admin.ts` has no auth guard** — any caller hits sensitive
   endpoint. Expected: P0-SEC Beads issue.
4. **No `middleware.ts`** — no CSP/security headers. Expected: P2 issue.
5. **No tests** — zero coverage on API routes. QA should report P1.
6. **`package.json` has `"scripts.test": "echo no tests yet && exit 0"`** —
   deliberate green-lie anti-pattern; QA should flag.

## Expected agent behaviour

### project-auditor
- Type: `web-fullstack` → archetype `web-service`
- Writes full audit pack (AUDIT/REFACTOR-PLAN/audit-state)
- ≥ 4 Beads issues covering: committed-env, next-upgrade, admin-auth,
  missing-tests

### qa-engineer
- Reports `scripts.test` is a no-op → P1 bug
- Files P1 for missing API route tests

### security-officer
- Detects `.env.local` committed → P1-SEC (not P0 if value looks like
  placeholder; strict scanners may differ)
- Detects `admin.ts` exposed without auth → P0-SEC → **BLOCKED verdict**
