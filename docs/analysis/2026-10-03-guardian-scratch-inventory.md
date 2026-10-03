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

An additional integration gap is tracked as `.5.8.3.7.3`: the broker's
continuation guard currently checks its registration/phase booleans, but does
not re-observe resource-owner preservation before releasing the held scorer.
Ready/completion paths need coordinated resource refusal too. The owner's
terminal refusal is verified here; propagating it into every broker execution
transition is not claimed complete. The current unactivated probe's DOM result
is not signed admission, and none of its false authority flags are relaxed.
