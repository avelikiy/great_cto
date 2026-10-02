# Tenant authorization comparative corpus recipe

Date: 2026-10-02. Scope: `great_cto-p4o9.4.1.2`. Related: [benchmark contract](2026-10-02-adaptive-benchmark-contract.md), [bound collector](2026-10-02-benchmark-bound-collector.md), [signed scorer](2026-10-02-signed-scorer-report.md).

## Actual repair surface

The second preregistered corpus group is a defective enterprise-SaaS document authorization policy. The fixed handler consumes trusted principal and stored document metadata, plus untrusted request fields. Candidates repair only bounded declarative `src/auth/policy.json`: require authentication, enforce resource-tenant equality and ownership, preserve owner access and useful audit identifiers without credentials. Request tenant IDs cannot substitute for principal identity.

The handler is protected by the oracle's baseline hash. This is a configuration authorization repair, not an arbitrary JavaScript implementation exercise or complete authentication stack. Token verification, database RLS, concurrency and production tenancy are outside this case. This explicit limited repair surface is one representative task cluster, not general product-quality evidence.

Only `files` enter the worker project. Eighteen hidden cases, expected responses and baseline hashes live in a private external operator oracle, pinned before scoring/dispatch. Three resource tenants include Unicode and case-sensitive identifiers. Cases cover owners, equal user IDs across different tenants, same-tenant nonowners, absent/unauthenticated principals and missing user IDs. Request credential markers are synthetic, not real credentials.

## Independent execution and trust boundary

The existing pinned launcher executes verified scorer bytes in a separate Node process without inherited preloads, environment credentials or worker package resolution. The standalone scorer inventories bounded regular files without following links, rejects missing/extra/unsafe artifacts and verifies protected handler/PROJECT bytes. It imports the exact verified handler bytes as a data module, preventing pathname replacement between verification and execution. Modified worker source and dependencies are never imported. Policy is strictly shaped JSON data, not executable expressions.

The actual fixed handler runs hidden requests; the scorer checks responses, owner content, absence of denied data and complete secret-free audit. Reports contain only criterion states and generic evidence, not hidden input values. Git receipts and baseline input digests are checked before/after, including ignored PROJECT data.

Scorer/oracle authority and the fixed baseline handler are trusted operator inputs. Same-user filesystem/key attacks and hostile operator-supplied code are not sandboxed. This is not OS isolation, an HTTP deployment test, provider attestation or an eligible model trial. A modified handler that throws is refused before execution. Unknown provider costs are not turned into zero.

## Test plan and observed checks

| Criterion | Hidden behavioral requirement |
| --- | --- |
| cross-tenant deny | Other principal tenant cannot read, even with equal user ID and a request claiming the resource tenant; nonowner also denied |
| owner allow | Same-tenant authenticated owner receives expected document ID/content |
| unauthenticated deny | Missing, unauthenticated or incomplete principal receives401 without data |
| audit without secrets | Exactly one event with correct action/outcome/identifiers and no request credential |

The defective recipe produces `failed, passed, failed, failed`; repaired policy produces four passes from the separate pinned scorer. Fifteen tests pass without skips. Negative cases cover missing tenant/owner/auth controls, invalid/deny-all policy, empty or credential-bearing audit, malformed JSON, unsupported keys, handler/PROJECT drift, extra executable, symlink and oversized policy. The oracle itself must retain valid category semantics and coverage counts: relabelling an owner case as anonymous refuses scoring, rather than allowing missing checks to pass. Candidate receipts remain unchanged during scoring; hidden credential markers are absent from reports. The actual repair assesses as T2 and retains enterprise-SaaS review plus code review, QA and security. Expanded scorer, signed-launcher, documentation and recall regression passes64/64 without skips. Repeated scanner is83, zero Critical and unchanged35 reviewed High; no exemptions or baseline changes.

## Remaining requirements

Two of eight corpus groups have executable recipes and hidden scorers; six remain. No paired model trials, performance measurement or quality-uplift percentage follows from fixture tests. Matched policies/domain floors, native/scoped live validation and execution/provider provenance still need evidence. `benchmarkEligible=false` remains unchanged. No model calls, human approvals, installed plugin/default changes, merge or release are requested.
