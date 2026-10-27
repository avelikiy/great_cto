# Native plugin activation acceptance

Status: Proposed executable acceptance contract; all scenarios below NOT RUN.
Design: [ADR-046](../adr/ADR-046-native-plugin-activation.md).
These are future acceptance scenarios, not a test report or permission to activate.

Run each host separately in a dedicated owned temporary home. Pin host version,
operator executables, candidate commit/index and dependency evidence. Use real
native management commands and a separately enforced outbound-network deny
boundary; mocks cannot establish no-fetch behavior. Record attempts, failures,
actual command exits and unobserved assertions. Do not access provider credentials
or invoke paid models to prove registration or MCP startup.

| ID | Scenario | Required observation |
|---|---|---|
| N01 | Forged index, key substitution, altered blob or signature | Refuse before candidate/host helper execution or operator mutation |
| N02 | Complete immutable payload | Exact archive membership, digests and modes, including compiled CLI files |
| N03 | Same version with different bytes | Conflict; no replacement of an existing directory |
| N04 | Network-dependent MCP entry | Refuse during closure admission, before host registration |
| N05 | Missing or unadmitted companion | Explicit unsupported dependency state; no automatic install |
| N06 | Real local native registration | One unambiguous selected registration, fixed source/installed roots and unchanged neighboring plugins |
| N07 | Native command returns zero with incomplete copy | Refuse enablement; report partial state and recovery result |
| N08 | Fresh host startup with network denied | Local MCP resolves admitted bytes and returns expected bounded response |
| N09 | Existing hook trust | Existing selection preserved; changed trust requirement reported, never auto-accepted |
| N10 | Guard enforcement | Deterministic allowed and forbidden operations measured in the isolated native host |
| N11 | Crash at each durable phase | Recovery chooses correct phase; no unowned paths deleted |
| N12 | Smoke failure after selection | Exact prior selections and owned managed files restored |
| N13 | Concurrent registry or managed-file edit | Refusal or RECOVERY_REQUIRED, no overwrite of external edits |
| N14 | Second concurrent installer | One owner; losing operation makes no selection writes |
| N15 | Identical retry | No file churn or duplicate registration; retained admission checked |
| N16 | Replaced npm/host/runtime or symlinked state | Refuse before execution or selection mutation |
| N17 | Legacy rollback | Restored state labelled legacy recovery; no signed-release or downgrade claim |
| N18 | Extra global managed files | Complete owned before/after inventory restored, or mode refused |
| N19 | Active operator conversation | Not terminated; required reload explicitly reported |
| N20 | Private metadata | No tokens, prompts, project content or private absolute paths in public artifacts |

For a supported adapter, N01–N20 must execute with no unexplained skip. A scenario
that cannot be exercised keeps that adapter unsupported; it does not block the
already supported plain npm adapter. Host-specific commands, expected marker
format, fixed deadlines and cleanup ownership must be specified in the versioned
implementation acceptance before tests run. Do not invent them from a passing run.

Operator rollout is a later, separate evidence phase. Check actual selected roots,
fresh process, MCP and hooks against the exact accepted candidate. A version
string, screenshot, listing, source merge or signed archive alone is insufficient.
