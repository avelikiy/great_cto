# EVAL-security-officer-claims.md

> Agent: security-officer · Split from EVAL-security-officer-finding-gate on 2026-11-02

## Scenario
Someone in a review states a fact or makes a claim about the system. No code is shown.
The security-officer must treat a stated fact as evidence and name the weakness it
describes, question a reassurance instead of accepting or blocking on it, and accept a
sound design without inventing a problem.

These rows sat in the finding-gate eval until 2026-11-02. Its graph asks what the DIFF
shows, so a claim took the restraint branch: raising nothing scored 1 and a correct
refusal scored 0, whatever the row's Pass column said. Judged on Pass, the stored 3.75.7
and 3.75.8 answers scored 5/13 and 4/13, against the 21/25 total published for 3.75.8.
This file has no graph on purpose, so the rubric judge grades each row on its Pass column.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| H7 | "A dependency has a critical CVE. Our code never calls the affected function." | Severity capped on unreachability, with the reachability evidence cited | Caps and cites |
| H10 | "The fix is deployed. Close the finding." | Requires evidence the fix is live and effective, not that it was deployed | Requires verification |
| H11 | "Pen test found nothing." | Notes the scope and date of the test before treating it as evidence about today's code | Qualifies the evidence |
| H15 | "The JWT has no expiry; sessions are revoked server-side." | Accepts if revocation is actually checked on every request, and asks for that evidence | Tests the compensating control |
| H16 | "User input is escaped when rendered." | Asks about the other sinks — SQL, shell, headers, redirects | Names another sink |

## Holdout cases

> **Independent cases I1–I8 (2026-11-02).** Written by an agent that saw neither the
> agent prompt nor these eval files, from a short role description only. Four state a
> real weakness (one not worth a block), two are reassurances, two are sound designs.
> They were not used to tune the prompt. The H rows were read when the 02.11 rules were
> written and are no longer an independent test.

| # | Scenario | Expected | Pass |
|---|---|---|---|
| H8 | "The endpoint is unauthenticated but only returns public data." | Checks what the response actually contains and whether it enumerates — public content can still leak existence | Tests the response, not the label |
| H9 | "A secret was committed and then removed in the next commit." | Blocks: the secret is in history and must be rotated, removal is not remediation | Requires rotation |
| H12 | "Debug mode is on in the staging build." | Finding scoped to staging, with the question of how the build flag is set for production | Scopes correctly and asks about prod |
| H13 | "Passwords are hashed with bcrypt, cost 4." | Flags the work factor as the finding, not the algorithm | Names the parameter |
| H14 | "CORS allows the app's own domain and localhost." | Flags localhost in a production config | Names localhost |
| H17 | "Admin endpoints are unlisted rather than authenticated." | Blocks: obscurity is not access control | Refuses |
| H18 | "Dependencies scanned weekly; last scan was clean." | Asks the scan date against the last deploy | Checks the window |
| H19 | "Errors return the stack trace to help users report issues." | Flags information disclosure and proposes an error id instead | Names the alternative |
| H20 | "Rate limit is per-IP; our users are behind one NAT." | Flags that the control is ineffective for the real topology | Names the topology |
| I1 | Priya, on the telehealth team: "Visit summary PDFs live in a public storage bucket, but nobody can find them because the file names are random UUIDs, and we only hand the link to the patient." | Raises a finding that an unguessable name is not access control for health records, since links leak through forwarding, logs and referrers and never expire. Asks where the bucket and link generation live, and asks for authenticated or expiring signed access. | The reply raises a finding that UUID file names in a public bucket do not protect the records and names authenticated or expiring access as the remedy, without accepting the design as adequate. |
| I2 | Ticket line from Marco, payments backend: "Pen test passed last spring, so the new refund API is covered." | Does not accept the claim as evidence, because the test predates the new API. Asks whether the refund endpoints were in the scope of that test, or for the report and its scope and date. | The reply does not treat the pen test as covering the refund API and asks whether the refund endpoints were in the test scope or asks for the scope, date or report. |
| I3 | Hana, mobile backend: "Heads up, the push provider key was committed to the repo in March. We deleted it from the file the next day, so HEAD is clean." | Raises a finding that removal from HEAD does not undo exposure, since the key stays in git history and clones. Asks whether the key was rotated at the provider, where it was used, and whether its use was reviewed since March. | The reply raises a finding that the key must be treated as compromised and asks whether it was rotated or revoked, rather than accepting its deletion from HEAD as the fix. |
| I4 | Dmitri, internal admin tool: "We hash staff passwords with bcrypt at cost 12, and sessions are stored server side in Redis with a 30 minute idle timeout." | Accepts this as a sound design and states no problem with it. Does not invent a finding or block over it. | The reply raises no finding about the bcrypt cost or the session storage and does not return BLOCKED. |
| I5 | Lena, logistics platform: "Our driver app API runs Django with DEBUG=True in production for now, it makes the on-call easier when something breaks at night." | Raises a blocking-grade finding, since debug mode exposes stack traces, settings and internal paths to any caller of a public API. Asks where the setting is defined and requires it off in production, with on-call served by error tracking instead. | The reply raises a finding on DEBUG=True in production, asks where it is set or requires it off, and returns BLOCKED or states it must be fixed before release. |
| I6 | Tomas, B2B SaaS: "Don't worry about tenant isolation in the new reports feature, the ORM handles all of that for us." | Does not accept the statement, because an ORM does not scope queries by tenant unless something makes it do so. Asks what enforces the tenant filter on the report queries, such as a default scope or row-level policy, and whether a test shows one tenant cannot read another's reports. | The reply does not accept the ORM claim as proof of isolation and asks what specifically enforces the tenant filter on report queries or asks for a cross-tenant test. |
| I7 | Amara, marketing site team on a B2B SaaS product: "Our public pricing and docs JSON endpoint now sends Access-Control-Allow-Origin: *. It serves the same static read-only content to everyone, takes no cookies and needs no auth." | Accepts this as correctly reasoned, because a wildcard origin on public, credential-free, read-only content exposes nothing a direct request would not. Does not block and does not invent a CORS finding. | The reply raises no finding against the wildcard CORS header on this endpoint and does not return BLOCKED. |
| I8 | Yusuf, fintech support tools: "FYI our support call recordings are kept forever, there is no deletion job. Nobody has asked us to remove any so far, and only the support leads can open them." | Raises a real but non-blocking finding that unbounded retention of recordings that may contain personal and account details grows the exposure and conflicts with retention obligations. Asks where the recordings are stored and for a defined retention period, and tracks this as follow-up rather than blocking the release over it. | The reply raises a finding about missing retention or deletion for the recordings, recommends a defined retention period, and does not make it a release blocker. |

## Pass threshold
4/5 tuning · 13/17 holdout.

## Run
`node tests/eval/runner.mjs --filter EVAL-security-officer-claims --split holdout`

## Cross-refs
- Agent: security-officer · Sibling: EVAL-security-officer-finding-gate (diffs, scored by graph)

## History
| Date | Version | Result | Notes |
|---|---|---|---|
