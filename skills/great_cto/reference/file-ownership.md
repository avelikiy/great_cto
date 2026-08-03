# File Ownership Matrix

> Read when deciding which agent may write a given path.

| Task | Owned files | Must not touch |
|------|-------------|----------------|
| Task 1 | src/auth/*, src/session/* | src/api/*, src/db/* |
| Task 2 | src/api/* | src/auth/*, src/db/* |
```
No two tasks may share ownership of any file. Overlap = blocked until resolved.

**Database splitting** — if the project has a monolithic database, architect MUST include a `## Database Split Plan` section in the ARCH doc covering:
- Which tables belong to which domain (ownership map)
- Transition strategy: dual-write (write to both old + new schema simultaneously) OR cut-and-migrate (migrate all at once with downtime window)
- Data consistency validation: row count checksums before and after migration
- Rollback procedure: database rollback is SEPARATE from `git revert` — must have down-migration scripts or snapshot restore
- Foreign key breakage: document all cross-domain FK references and how each is resolved (async event, API call, or denormalized copy)

If database split is required, add to QA plan: "Schema migration dry-run + row count checksum + down-migration test" as MANDATORY gate prerequisite artifact.

**Dependency graph validation** — use these tools per stack:
- PHP → [Deptrac](https://deptrac.dev): `deptrac analyse --config deptrac.yaml` — define layers per domain, fail on violations
- JavaScript/TypeScript → [dependency-cruiser](https://github.com/sverweij/dependency-cruiser): `depcruise src --validate .dependency-cruiser.cjs`
- Python → [importlinter](https://import-linter.readthedocs.io): `lint-imports`
- Go → `go vet ./...` + custom `goimports` check for cross-package imports
- Java → [ArchUnit](https://www.archunit.org): define `LayeredArchitecture` rules in tests
Output report to `docs/qa-reports/DEP-GRAPH-<date>.txt`. Gate blocks if circular deps found.

**Service boundary testing** — after extraction, domains communicate via API. Add to QA plan:
- Contract tests between domains using [Pact](https://pact.io) (consumer-driven) or manual API contract docs
- Inject cross-domain calls in test: auth token from auth service → validate in billing service → confirm 401 on expired token
- Test event flow: `domain A emits event → domain B receives and processes → verify state change`
- Cross-domain regression: run full integration suite against extracted services, not just unit tests

**API versioning during extraction** — if public API changes during service split:
- Keep original endpoint routes intact (backward compat) — add new routes under new namespace if needed
- Use API gateway or proxy to route old routes to new service during cutover
- Deprecation window: old routes stay active minimum 1 sprint after cutover
- Document breaking vs non-breaking changes in ARCH doc `## API Contract Changes` section
