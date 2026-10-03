# Guardian lifecycle protocol core

Scope: great_cto-p4o9.5.8.3.3. Design: [Proposed ADR-028](../adr/ADR-028-browser-profile-guardian.md). Related: [actual browser lifecycle](2026-10-03-board-browser-owner-lifecycle.md).

## Implemented boundary

scripts/lib/browser-guardian-protocol.mjs implements a strict monotone message reducer, not an OS guardian or deletion service. It performs no filesystem, process, IPC, network, scoring or approval operation. Each instance owns an immutable attempt/receipt/registration binding and a fresh random256-bit local message capability. That capability separates instances; it does not establish trusted key custody, hostile same-user isolation or independent authority. Only the private caller binding returns it; public snapshots contain no capability, resource IDs, root paths or raw payload.

Messages must be dense canonical JSON strings of at most8192 bytes. Unknown/missing fields, duplicate keys, malformed or alternative encodings, mismatched attempt/capability, replayed/skipped sequence and wrong phase fail closed. Invalid messages preserve the attempt with a generic reason, without echoing private data. A preserved attempt cannot be restarted by another message.

```text
CREATED --ready--> READY --register--> OBSERVING --stop--> STOPPING
                                                        |
                          full bound quiescent message <-+
                                      |
                                  QUIESCENT
Any invalid message or explicit fault -> PRESERVED
```

Registration requires3..64 unique opaque resource IDs: exactly one scorer, exactly one profile and at least one browser resource. Unknown kinds, duplicate IDs and path/scope fields refuse. The parser copies and freezes the registry; modifying caller data cannot change it. Quiescent requires exactly every registered process ID plus the same profile ID and an explicit retained/removed profile state. Empty/subset/foreign/duplicate process lists or an extra claimed verification flag refuse. Late registration, repeated completion and a removed message cannot authorize anything.

These are message-consistency checks. A dishonest caller can declare internally consistent opaque resources; the reducer cannot independently prove that they correspond to real OS objects or that all descendants are present. Even QUIESCENT snapshots therefore report observationAuthority:unattested-message-consistency, osQuiescenceVerified:false, resourceClosureVerified:false, cleanupAuthorized:false, independentAdmissionVerified:false and benchmarkEligible:false. The fixed enums/terminal behavior and schema do not substitute for trusted launch registration, OS identity or signed supported-host admission.

## Test plan and actual trace integration

| Area | Test type | Evidence |
| --- | --- | --- |
| Complete messages / stop reasons | Unit | Normal, DOM refusal, deadline, scorer death and parent death retain false authority flags |
| Wire/sequence binding | Adversarial unit | Foreign attempts/capabilities, malformed/duplicate/oversized/noncanonical messages, replay/sequence gaps refuse without echo |
| Resource registry | Adversarial unit | Missing/duplicate/foreign/oversized/extra-scope IDs refuse;64-resource upper bound remains unattested |
| Quiescence and terminal ordering | Adversarial unit | Full exact registry required, no subset/deletion/replay acceptance |
| Actual observer traces | Real Chromium lifecycle | Parent test maps observed scorer/browser PID+birth and private profile device/inode/owner into opaque IDs and replays normal/refusal/SIGTERM/SIGKILL events |
| Runtime authority / actual cleanup | Independent integration | Not implemented or certified by this core |

Actual lifecycle tests retain all prior same-path launch, nonempty owned tree, process-group, process exit and pre-cleanup profile assertions. The protocol receives identities only after those observations; test recipe byte digests are binding inputs, not preregistered trial or OS attestations. It processes full quiescent messages only after the owning child closes, captured processes stop and profile status is measured. Test fallback cleanup still belongs to the existing test harness, not this protocol. SIGKILL profile retention is not fixed or hidden by a message-state success.

The core is imported by tests only, not activated by the launcher, shipped controller or default pipeline. Future trusted bootstrap, out-of-process helper, IPC supervision, parent/helper death, late descendants/inherited stdio and ownership-bound cleanup remain required under .5.8.3. Independent admission .5.8 stays open. Integrating this core will change runtime closure and require reviewed versioned policy/artifact checks; it cannot be retroactively attached to sealed trials. Existing scorer bytes and original corpus pins remain unchanged.

No model calls, real gates, install, default, merge, release or benchmark methodology changed. A passing protocol trace is not product completion, eligible model execution, complete resource discovery or signed scoring authority.

Validation: protocol42/42 and final combined protocol/real-browser suite70/70, no skips; docs76/76. First stock quick CI failed only docs-reference synchronization after the new module changed the generated architecture map. The ordinary generator refreshed that map without consumer-check changes. Repeated stock quick CI exited0: root1256, libraries2968 passed/6 skipped, eval238, docs76, browser9, pipeline22 passed/5 skipped. The11 skipped checks remain explicitly NOT CHECKED. HOL83,0 Critical/35 reviewed High unchanged, no new exception. Original sealed8-scenario corpus and runtime pins verify unchanged, benchmarkEligible:false. This closes core prerequisite .3.3 only; external guardian/OS admission/crash cleanup remain open.
