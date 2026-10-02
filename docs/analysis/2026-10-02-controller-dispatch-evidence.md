# Controller invocation evidence

Date: 2026-10-02. Beads: great_cto-p4o9.4.2.
Status: controller telemetry foundation, not an attested benchmark collector.

## Recorded boundary

The controlled Codex pipeline records runner and independent-verifier invocation
attempts in its outside-workspace state. This includes routed Claude Code workers,
parallel waves and rework. Each entry has a unique controller call identity, host,
role, kind, start/end timestamps and returned/threw outcome. Durable intent is saved
before invocation and completion afterward. Runner response, error text, prompts
and incidental identity fields are not copied into this telemetry.

Admission refusal produces no invocation entry. Parallel fetched responses do not
launch or count a worker again. Scoped report reuse records only the newly invoked
verifier, never a fictitious saved-worker call. Fresh histories start empty; old
saved states without telemetry remain explicitly incomplete after new invocations.
These rules do not change approval authority, admission accounting or stage verdicts.
CLI status and secret-free run projections expose only `controllerDispatch`
aggregates, never raw call identities or arbitrary record payloads.

`dispatchEvidenceSummary` merges overlapping and adjacent call intervals, then sums
their union. It does not sum parallel durations. It measures elapsed controller-call
time, not CPU time, token generation time or full pipeline wall time. Human gate dwell
between calls is excluded. Local timestamp resolution and wall-clock adjustments
remain measurement limitations. A reversed interval makes measurements unknown.

An unfinished intent, malformed/duplicate record or incomplete history returns null
counts and elapsed time, not zero. The history is bounded at1024 calls; overflow
refuses a new dispatch instead of dropping evidence. This is deliberately fail-closed.

## What this does not prove

Invocation attempts include failed process launches and callbacks that fail before
any provider request. They are NOT provider API/model request counts or completed
product work. Returned callbacks can still contain a rejected proposal or failed
verdict. State timestamps are controller-produced records, not external attestation.
The summary never infers actualCostUsd, product quality, scored acceptance or escaped
defects. Those remain independently sourced, and missing billing remains null.

The [matched protocol](2026-10-02-adaptive-benchmark-contract.md) still needs a pinned
baseline, representative fixtures, graph-floor validation, hidden scorer and a
collector that binds controller state, receipts and independent outcome evidence.
No live model benchmark or human approval is performed by this increment. Native
Claude hook invocations are outside this controlled-controller telemetry boundary.

## Verification design

Unit checks cover union arithmetic, missing/incomplete/corrupt histories, persistence
ordering and failures, duplicate rejection, concurrency, bounded records and payload
minimization. Controller integrations cover mixed-wave worker/verifier accounting,
refused admission, legacy resume without redispatch, rework and scoped worker reuse.
These are deterministic fixture tests, not a live dual-provider acceptance run.

Focused unit/controller/host/budget regression passed106/106, with no skips. This
includes an actual read-only CLI status subprocess and retained fetched-wave
resume. HOL scanner passed at83 with zero critical and35 high in the unchanged
reviewed baseline; no new high/critical findings. An initial scan rejected a
credential-shaped synthetic test field; the payload-minimization assertion was
preserved without that literal. Scanner rules, baseline and threshold were not
changed. Claude auth status remains loggedIn:false; no model calls or approvals.

Repeated broad quick gate finished GREEN with11 explicitly NOT CHECKED: root1255,
library2590 passed/6 skipped, eval238, docs76, browser9 and layout8 passed; L1+L2
passed with5 quick omissions. The initial quick run was red on the same synthetic
scanner finding and is not presented as success. No current full L1-L5, CLI
package/export gate, independent security approval or installed-artifact validation
is inherited from previous commits. These remain separate delivery obligations.
