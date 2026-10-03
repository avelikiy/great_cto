# Guardian scratch identity registration and active-parent death

This implements prerequisites `.5.8.3.7.1` and `.5.8.3.7.2` under the still-open
full resource guardian issue. It extends the
[resource owner](2026-10-03-guardian-resource-observation.md) and
[external probe broker](2026-10-03-guardian-browser-broker.md) following the
[Proposed ADR](../adr/ADR-028-browser-profile-guardian.md). Historical evidence
describing a profile-only registry remains historical, not the current API.

## Current read-only registry

At first-DOM registration, the owner enumerates direct entries of its fresh
private root with `opendirSync`, reading at most nine entries before refusal.
Registration requires exactly the reported canonical Chromium profile plus
one actual `playwright-artifacts-*` directory. Both must be private, same-UID,
same-device real directories, without links. The owner binds each name to its
device/inode/UID identity; no caller-selected artifact path is accepted.
The combined registry is bounded at 64 processes/directories. No child names,
paths or process identities appear in public snapshots.

Each observation enumerates the root again. Unknown names, additional scratch
directories, files, links, changed private mode or identity preserve the owner.
Missing registered entries are recorded monotonically. Reappearing entries
cannot be adopted, even with a matching name or possible inode reuse. Snapshot
fields distinguish registered/retained directory counts and profile/artifacts
retention. The module still has no browser signal or deletion API and all
quiescence, resource-closure, cleanup, admission and eligibility flags are false.

This is bounded **top-level** identity observation, not a certificate for every
recursive browser-created file, every transition between samples or atomic
same-UID isolation. Filesystem syscall latency is not bounded by the entry
count. Legitimate but unregistered future scratch types fail closed rather
than silently enlarging cleanup scope. A separate versioned policy would be
needed to admit additional launch shapes or executable/bootstrap closure.

## Test strategy and concrete evidence

Integration preserves actual pinned `observeBoard` / `chromium.launch` behavior.
It binds both directories in direct owner and external helper tests for normal,
DOM refusal, scorer death, helper death, parent IPC loss and duplicate start.
After zero captured running processes is independently measured by the fixture,
it checks directory states before fallback. Directory fault fixtures add an
unknown name, a link to the owned root, a replaced artifacts inode while keeping
the original inode in owned private storage, and a reappearing removed profile.
Every such observation preserves; the sampler never removes the original inode.
Negative unit fixtures now include an artifacts directory so foreign scorer
lineage still reaches its process check rather than failing an empty registry.

A new nested trusted parent actually forks the helper and starts Chromium.
Before parent SIGKILL, the fixture checks direct parent/helper/scorer lineage
and captures the live helper/scorer/browser descendant tree plus both scratch
directories. After the real signal, captured processes stop, both scratch
directories disappear through held scorer IPC unwind and observer `finally`,
and the creator's exact root remains. This is checked before fallback cleanup,
not inferred from the parent's exit or a mocked disconnect. Signals used for
fault injection/fallback are confined to trusted fixture-created processes and
captured unchanged identities. No guardian cleanup authority is minted.

Focused macOS execution passed **79/79 tests with zero skips**, covering protocol,
resource owner, external helper/probe and direct Chromium lifecycle. Evidence:
`/tmp/great-cto-scratch-inventory-focused.log`. Unsupported hosts/tools report
explicit NOT CHECKED, not a passing ownership claim.

## Full parent requirements remain open

Parent death is proven at the held first-DOM phase, not arbitrary timing or a
hostile execution. Zombies are excluded from running counts, not certified
reaped. Detached/late process closure, inherited descriptors, aggregate IPC/RSS,
recursive scratch safety, atomic process/filesystem authority, independently
signed supported-host admission, versioned runtime registration and actual
delivered/installed artifact execution are still required. No production
controller uses this probe. Old corpus registrations/archives are not rewritten,
and there is no model execution, gate approval, merge, release or installation.

The subsequently fixed broker integration gap `.5.8.3.7.3` is documented in
[broker preservation evidence](2026-10-03-guardian-broker-preservation.md).
Ready, continuation, completion and scorer-exit paths now freshly observe the
resource owner and propagate preservation. This remains an unactivated probe,
not signed admission; none of its false authority flags are relaxed.

## Unregistered lineage and inherited descriptors

Registration previously captured the scorer and selected browser descendants
but silently omitted other direct scorer children. Observation subsequently
checked only captured identities, overlooking new children of the captured
tree. Three actual Node process fixtures first failed with OBSERVING instead
of PRESERVED. The owner now refuses incomplete registration and preserves on
observing any uncaptured child of a registered process. It never adopts that
child or expands its authority.

The fixed native fixture covers an extra scorer child before registration, a
late scorer child and a late browser descendant. Each holds a private file
descriptor. In the third case the browser exits while its descendant remains
running with inherited stdout and the file descriptor; ChildProcess close is
delayed until that descendant naturally exits. A parsed OS row confirms the
holder's PID, UID and non-zombie state after direct browser exit. All authority
flags stay false. Fixture cleanup waits for its owned scorer and inherited
pipe closure, then checks the exact private root identity before removal.

These are static Node lineage/descriptor fixtures, not Chromium launch or
hostile same-UID isolation evidence. An orphan detached before observation,
PID reuse between samples, recursive descriptor inventory and independently
signed executable/resource closure are still unproved. No guardian signal or
deletion API, production activation, artifact registration, installation or
benchmark admission is added.

Final macOS scoped execution passed 43/43 with zero skips: the three new
native lineage cases plus resource-owner, broker, helper and direct Chromium
lifecycle callers. Documentation/link checks passed 81/81 with zero skips;
syntax, diff whitespace and generated-reference checks also passed. This is
scoped source evidence, not a new full-CI or delivered-artifact verdict.
