# Billing webhook comparative corpus recipe

Date: 2026-10-03. Scope: `great_cto-p4o9.4.1.3`. Related: [benchmark contract](2026-10-02-adaptive-benchmark-contract.md), [tenant recipe](2026-10-02-tenant-auth-benchmark.md), [bound collector](2026-10-02-benchmark-bound-collector.md).

## Actual repair and hidden checks

The third preregistered corpus group contains defective executable JavaScript, not a declarative policy. The worker repairs only `src/billing/webhook.mjs`: validate HMAC-SHA256 over the exact raw body before parsing or mutation, preserve duplicate-event idempotency, reject stale subscription versions without side effects, and prevent charging the same invoice under different event IDs. The gateway is an injected observer, not a real payment provider. State is in-memory and each sequence starts fresh.

Only recipe files enter the worker project. An external private pinned oracle contains synthetic random signing material and randomized event/subscription/invoice identifiers. Six hidden sequences contain twelve deliveries: two invalid signatures (including malformed JSON), three repeated deliveries, cancellation followed by two stale paid events, two distinct events sharing an invoice, and two distinct invoices. Expected statuses, final versions, charge counts and mutation traces are checked by the trusted scorer. Expected answers and criterion labels are not sent to the candidate process. Hidden values do not enter public report evidence.

The scorer validates sequence coverage and semantics before execution, including signature labels, lengths, expected states/counts, repeated event identity, version order and same/different invoice relationships. Corrupted oracle data makes measurement unavailable, never successful. Exact protected inventory hashes include ignored PROJECT data; extra files, protected drift, symlinks, hardlinks, oversized and changing files are refused. The launcher binds pre/post Git receipts and baseline input bytes.

## Execution boundary and limitations

The existing external pinned scorer launches candidate code in a second restricted macOS process using `/usr/bin/sandbox-exec`, a default-deny profile, `--no-addons`, an empty credential/preload environment, bounded input/output and a deadline. The candidate gets only its fixture read scope, the Node executable and bootstrap system read scopes. Writes, network and child-process fork are not admitted. Other platforms or failed sandbox launch report unavailable; there is no unprotected fallback. Root-directory literal read permission supports Node bootstrap without admitting arbitrary descendants. A filesystem-root candidate scope is refused.

Local probes test denial of an operator-owned file read, fixture write, loopback connection and process spawn. This is empirical coverage of those resources, not formal sandbox certification or complete side-channel protection. System metadata and sysctl reads are admitted. The observation wrapper shares a JavaScript runtime with candidate code; capturing builtins before import reduces ordinary monkey-patching but does not provide tamper-proof behavioral attestation against inspector/runtime attacks. Same-user operator/key attacks, arbitrary malicious native code and hardware isolation are not proven. Independent security review remains required before hostile/model-produced code is admitted for eligible trials.

The synthetic callback checks charge requests and state transitions, not provider settlement. Concurrent deliveries, process crashes between gateway effect and durable idempotency storage, transactions, retries after gateway failure, signed malformed event schemas, real HTTP/provider integration and persistence are outside this bounded sequential scenario. No production billing correctness claim follows from these tests.

## Test plan

| Area | Type | Required observations |
| --- | --- | --- |
| Four task criteria | Separate-process behavioral integration | Defective handler fails all four; reference repair passes all four, immutable receipt |
| Signature/idempotency/version/invoice regressions | Mutation tests | Removing each control must fail at least one criterion |
| Oracle integrity | Negative integration | Empty sequences, wrong signature/count/status and repeated invoice in distinct-invoice case refuse scoring |
| Fixture integrity | Negative integration | PROJECT drift, extra source, symlink and hardlink refused |
| Isolation resources | Actual subprocess probes | Operator read, write, network, spawn denied; preloads absent |
| Execution admission | Error/timeout tests | Infinite loop, oversized source and broad root refuse; no fallback |
| Specialist selection | Actual repaired diff assessment | T2 with PCI review, code review, QA and security retained |

Nineteen tests are exercised on macOS, including a format-only signature check that must fail on a well-formed but incorrect HMAC, and a wrong-invoice charge with the correct callback count. Actual invoice and accepted-event identities must match, not just aggregate counts; equivalent object field ordering must not change the score. Non-macOS tests explicitly skip rather than presenting isolation as verified. Fixture self-tests are not model trials. `benchmarkEligible=false` remains unchanged; no provider calls, human approvals, release, install, merge or default change occurs. Independent executable isolation/observer review is tracked as `great_cto-p4o9.5.8`.

## Remaining evidence

Observed final focused checks:19/19 billing tests and107/107 expanded fixture, pinned/signed scorer, collector and protocol tests, all without skips. The initial scanner gate failed at77 on two static synthetic test-secret findings; replacing that fixture material with runtime random bytes restored83, zero Critical and the unchanged35 previously reviewed High. No scanner exemption or baseline edit was made. The stale generated architecture map was regenerated, not bypassed.

Final local `ci-local.sh --quick` exited0: root1255/1255, libraries2755 passed with6 skips, eval238/238, docs76/76, browser9/9. The quick pipeline adds5 skips, for11 explicitly NOT CHECKED. Three Docker and three live model cases in the library suite were not executed; CLI build ran, but full CLI test/pack and full pipeline coverage are not implied by quick mode. Current read-only Claude auth probe returned `loggedIn=false`, `authMethod=none`, so actual joint-provider trials remain unavailable.

Three of eight corpus recipes are implemented after this increment. Bounded import, prompt injection, API compatibility, migration safety and board accessibility remain. Matched domain floors, native/scoped live validation, execution/provider provenance and all paired model trials remain open. Product-quality uplift and unknown provider cost remain unmeasured. Source checkout evidence does not prove behavior in the installed stable plugin.
