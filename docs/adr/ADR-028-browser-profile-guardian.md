# ADR-028: Browser scorer resource guardian

**Status:** Proposed · **Date:** 2026-10-03 · **Deciders:** project owner and independent executable/browser admission reviewer.

Tracking: great_cto-p4o9.5.8.3; ownership/design prerequisite .5.8.3.2. This ADR does not activate a guardian or approve host admission.

## Context

Actual [observer lifecycle tests](../analysis/2026-10-03-board-browser-owner-lifecycle.md) establish distinct resource lifetimes. Normal/refusal closes Chromium and removes its temporary profile. SIGTERM closes the browser/profile while a held Node operation can remain alive. SIGKILL stops the captured browser processes at the tested first-DOM phase but leaves its profile. The pinned launcher now uses SIGKILL for a direct deadline after a supervised handled-SIGTERM test reproduced an unbounded synchronous wait. Surviving descendants with inherited stdio and arbitrary OS blocking are not certified by that fix.

An additional actual-launch assertion measures PID, parent, process group, start identity and state without command lines or environment. Chromium root is a process-group leader distinct from the scorer owner in all four measured macOS scenarios. Therefore killing or waiting for the scorer's group cannot establish Chromium ownership or quiescence. The installed Playwright launch implementation also uses detached process groups on non-Windows; the runtime observation, not that source declaration alone, supports this conclusion.

Constraints: preserve existing observer behavior and native keyboard/DOM criteria; never delete user/shared profiles; never widen candidate execution authority; preserve mandatory graph floors and explicit admission/eligibilityfalse. Existing registration015a66ba and candidate2454685f remain immutable historical evidence. A new runtime helper/bootstrap changes the executed closure even if scorer bytes are identical. It requires a versioned execution-policy registration and new artifact checks, not retroactive attachment to old trials. No merge/release/install/default authority is implied.

## Proposed decision

Use a separate guardian resource owner for a future explicitly registered execution policy. The guardian creates the private temporary root before launching the scorer and owns the scorer process plus a bounded registry of actual browser roots. The ordinary launcher observes the guardian and receives only bounded public lifecycle results. The guardian must survive scorer termination; its own death is an unavailable execution, never a completed assessment or a cleanup authorization. No runtime activation is part of this ADR.

A trusted, pinned bootstrap in the dedicated scorer process records actual child launch identity before admitting observation. Preserve chromium.launch and observeBoard; do not silently switch to launchServer, private Playwright internals or a remote browser. The current test's process-global spawn instrumentation is evidence scaffolding, not approved production bootstrap. The design must establish how a child registration binds to the guardian-launched scorer and how ownership remains valid after reparenting. Worker files, model output, candidate DOM and ordinary verdict JSON cannot register a process or directory for deletion.

Resource identity includes a fresh canonical root created by the guardian, directory device/inode/owner/private mode, an unpredictable local capability, guardian/scorer attempt identity, and platform-admitted browser process identity. A pathname or PID is not a capability by itself. PID/start-time checks remain practical regression safeguards, not atomic kernel identity or hostile same-user protection. If supported-host review cannot establish a sufficient process/filesystem boundary, execution must remain unavailable for eligible trials; do not rename these checks into independent attestation.

## Resource state machine

```text
CREATED -> READY -> OBSERVING -> STOPPING -> QUIESCENT -> REMOVED
   |         |          |           |           |
   +---------+----------+-----------+-----------+-> PRESERVED / UNAVAILABLE
```

CREATED means a fresh private root exists. READY requires a live guardian and bound launched scorer. Browser registration precedes OBSERVING; a missing/late/duplicate/foreign registration cannot authorize cleanup. Normal completion, DOM refusal, deadline or scorer disconnect enters STOPPING. Stopping scorer and stopping each bound browser root are separate operations because their process groups differ. QUIESCENT requires positive supported-host evidence for every registered resource, not an empty inventory, an elapsed timer or scorer exit alone. Before REMOVED, revalidate the root identity and filesystem boundary. A changed root, live/unidentified process, incomplete registry, unavailable OS inventory, guardian failure or deadline exhaustion enters PRESERVED/UNAVAILABLE. Retention is bounded diagnostic failure, not successful cleanup.

The guardian may remove only the exact root it created after quiescence. No recursive parent traversal, name-prefix sweep, unresolved environment variable, worker-supplied scope or discovered user profile is a valid target. Unexpected links, filesystem identity changes and ambiguous process evidence must refuse deletion. Directory checks followed by path-based removal are not an atomic defense against a hostile same-user mutation; independent admission must either establish a stronger filesystem authority boundary or retain this limitation and refuse eligible hostile execution.

## Options considered

| Option | Complexity/cost | Behavior and limitations |
| --- | --- | --- |
| In-scorer finally | Low, no new process | Already insufficient: SIGKILL cannot execute finally; no independent lifetime |
| Kill scorer group then remove profile | Low | Rejected: actual Chromium owns a different group; group/PID reuse and profile identity remain unsafe |
| Separate guardian with pinned launch registration | Medium; one helper per observation | Proposed local resource-lifetime design; requires registration trust, bounded cleanup and helper-failure review; not a same-user certificate |
| Separate OS authority/container owning all resources | Higher provisioning and startup cost | Stronger candidate/same-user boundary; runtime closure, network, IPC and signed admission require independent supported-host evaluation |

The proposed guardian separates cleanup lifetime from scoring lifetime without changing the acceptance rubric. It adds protocol and artifact complexity and cannot replace a stronger OS boundary where the threat model requires one. No latency/RSS/cost claim is made before measurement. Same-user/adversarial authority remains part of the full objective; choosing a practical guardian does not remove it from scope.

## Protocol and failure invariants

The launch request carries exact pinned scorer bytes, attempt/receipt identity and reviewed runtime policy, not shell command text. Hidden oracle values and browser/profile paths stay in private operator storage, never public diagnostics or model context. Lifecycle messages are bounded and schema-validated; stale attempts, foreign roots, omitted processes, changed capabilities, multiple completion messages and late score emission refuse acceptance. Guardian process IDs or exit0 alone do not attest behavioral scoring, graph floors, provider execution or human approval.

Parent/guardian/scorer IPC closure must distinguish normal scoring completion from termination. A score is eligible for further validation only after its expected receipt and independent scoring authority checks; cleanup status does not approve a gate. A cleanup failure makes execution unavailable and preserves private recovery evidence. Parent death, guardian death, scorer death and browser death are distinct fault events, not a shared success code. Recovery cannot convert an old interrupted attempt into a newly approved trial.

## Required implementation evidence

Work remains tracked in Beads under .5.8.3; this section specifies acceptance, not a second task tracker. Independent .5.8 controls admission.

| Fault/requirement | Required test and result |
| --- | --- |
| Normal and DOM refusal | Real same-path Chromium observer; registered processes stop and exact owned profile disappears before test fallback cleanup |
| Scorer SIGKILL and direct deadline | Guardian survives scorer; actual profile removal after verified quiescence; no completed score for interrupted execution |
| Parent death | Guardian detects owned parent loss, stops bound scorer/browser resources; no unbound cleanup |
| Guardian failure/death | Parent refuses assessment; no guessed deletion or unrelated-process signal; owned retention recorded privately |
| Failure before browser registration | Root retained/unavailable if resource ownership is incomplete; empty process inventory cannot pass |
| Foreign/stale PID or root, reused identities, changed directory, links | Refusal without touching unrelated browser/files; exact root and process identity fixtures |
| Late descendant and inherited stdio | Bounded external supervision and complete owned-resource proof; direct child exit alone insufficient |
| Artifact/policy closure | Pin helper/bootstrap/tools, actual extracted-artifact launch, versioned policy registration; preserve old corpus/archive |
| Independent supported-host authority | Reviewer-approved process/filesystem isolation, runtime observation integrity and signed admission; local self-run tests insufficient |

## Consequences

Scoring and resource teardown have independently visible outcomes. A crash can no longer rely on scorer cleanup code, and a missing cleanup proof cannot be hidden by green behavioral criteria. New guardian/bootstrap artifacts and fault injection increase the verification surface. Existing source tests, current candidate package and corpus remain useful but do not certify the new architecture. The ADR remains Proposed until independent review resolves supported-host authority and implementation evidence; all admission and benchmark eligibility flags remain false.

## Validation of this prerequisite

Actual same-path macOS lifecycle4/4 and combined board28/28 passed without skips. Each mode observes a live nonempty Chromium tree before continuation/termination and asserts its root is a different group leader from the owning scorer. No group-wide signal is sent by these tests. They do not prove that every future descendant stays in that browser group, atomic PID authority, Linux runtime behavior or guardian implementation.

Stock quick CI exited0: root1256, libraries2926 passed/6 skipped, eval238, docs76, browser9, pipeline22 passed/5 skipped. The11 skipped checks remain explicitly NOT CHECKED. HOL83,0 Critical/35 reviewed High unchanged; no new exception. The original8-scenario frozen corpus/runtime pins reverified unchanged with benchmarkEligible:false. Fresh Claude auth remained loggedIn:false/authMethod:none; no live provider/native run occurred. Only test inventory fields/assertions and this proposed ADR changed; observer/scorer, shipped runtime candidate2454685f, installed plugin, defaults and actual approvals remain untouched.
