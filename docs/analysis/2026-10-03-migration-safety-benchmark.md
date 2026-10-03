# Migration safety comparative corpus

Subsequent corpus: [board accessibility](2026-10-03-board-accessibility-benchmark.md).

Scope: `great_cto-p4o9.4.1.7`. Related: [protocol](2026-10-02-adaptive-benchmark-contract.md), [API corpus](2026-10-03-api-compatibility-benchmark.md).

The seventh representative task is a backward-compatible migration **plan**, not arbitrary SQL implementation. Candidate repairs only `migrations/plan.json`; protected schema and project metadata remain operator-owned. A fixed trusted interpreter admits exact keys, boolean decisions and bounded integer timeouts, then emits only known PostgreSQL statements. Unknown SQL/code, extra keys, missing fields, coerced types and out-of-range deadlines are refused before database execution. No candidate JavaScript, SQL strings, shell or extensions are executed.

The defective plan drops the legacy amount field, lacks rollback preservation/deadlines and broadens reader/migrator privileges. The reference plan adds nullable display_name, keeps id/amount readers, removes only that addition during rollback, preserves rows, uses lockMs100/statementMs1000 and retains restricted roles. Two private oracle rows include real zero and randomized nonzero; external pinned scorer validates their distinct identity and integer bounds. Reports withhold row values.

## Actual PostgreSQL test plan

| Protocol criterion | Real database observation |
| --- | --- |
| rollback path | Apply, rollback and reapply; exact legacy rows preserved, added column removed during rollback |
| reader compatibility | Separate reader transaction holds AccessShareLock; old SELECT returns exact rows before/after migration, new reader sees added column |
| bounded locks | pg_locks confirms granted reader lock; blocked ALTER gets55P03 under1200ms; pg_sleep gets57014 instead of external timeout |
| least privilege | Reader INSERT/UPDATE/DELETE denied42501; both roles denied unrelated private schema; migrator CREATE ROLE/CREATE DATABASE denied42501 and role flags0,0,0 |

Write probes use transactions rolled back even if an unsafe grant permits the operation. Thus privilege failures do not contaminate rollback/read compatibility observations. T2 selection retains db-migration, code, QA and security reviewers. This is specialist selection evidence, not execution/sign-off by those reviewers.

Local PostgreSQL16.14 tools were verified. Each trusted scorer initializes its own generated private temporary cluster, with empty listen_addresses (no TCP), private Unix socket directory and socket permissions0700. No production endpoint, database, environment credentials or user configuration is used. psql runs with -X, finite connect/process deadlines, shell:false, bounded output and explicit local socket/role/database. Startup and shutdown are bounded; missing PostgreSQL16 tools report unavailable/NOT CHECKED rather than simulated success.

Guardian receives an owning-process stdin pipe. EOF or owner termination requests fast PostgreSQL shutdown. Actual SIGKILL of an owning scorer was tested: postmaster PID-file and socket disappeared. Ordinary completion or action failure removes generated data only after confirmed shutdown. Forced owner death can retain the stopped cluster directory for recovery; tests remove their exact generated directory after verifying shutdown. No production files are deleted. An uncancelled teardown timer initially kept completed scorers alive6seconds; cancelling it reduced the25-test suite91s to26s without relaxing outcomes.

## Boundaries and gaps

Final expanded regression147/147 without skips, including25 migration tests and strengthened transactional privilege probes. The defective baseline fails4/4 criteria; reference repair passes4/4. `ci-local.sh --quick` exited0: root1255, libraries2863 passed/6 skipped, eval238, docs76, browser9 and L1–L2 executed22 passed/5 skipped. Eleven explicitly NOT CHECKED; full CLI/pack and L3–L5 were not executed this turn. Final scanner83, zero Critical and unchanged35 reviewed High, without new exceptions or baseline changes. Read-only Claude auth remained loggedIn=false/authMethod=none. No postgres/psql processes remained after the suites.

This is real PostgreSQL execution of a bounded declarative recipe, not proof for arbitrary SQL, production-sized data, distributed replicas, full online backfills or release deployment. The reader may briefly queue while DDL attempts an exclusive lock; the proof is bounded refusal and contract preservation, not zero blocking or zero downtime. The lock/deadline semantics follow [PostgreSQL16 locking](https://www.postgresql.org/docs/16/explicit-locking.html) and [client timeout configuration](https://www.postgresql.org/docs/16/runtime-config-client.html).

Private socket permissions isolate other OS users, not hostile processes running as the same OS user. Local trust authentication and binaries discovered by path/version are not signed independent execution admission or binary provenance. Trusted interpreter/guardian, operator oracle authority and same-user access require independent review under `great_cto-p4o9.5.8`. A finite JSON language avoids the earlier candidate-JS observer tampering surface, but does not certify the host. `benchmarkEligible=false` remains.

Corpus preparation becomes7 of8 after this recipe is verified; this is not product completion or measured model-quality improvement. Native/scoped/provider provenance, independent review, comparative trials and delivered installed artifact proof remain separate. No live models, approvals, defaults, installation, merge or release occur.
