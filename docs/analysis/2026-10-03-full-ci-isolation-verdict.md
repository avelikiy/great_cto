# Full CI verdict and cross-run cleanup removal

Related: [owned MCP smoke](2026-10-03-mcp-smoke-isolation.md),
[phase fixture](2026-10-03-phase-smoke-isolation.md), and
[hook lifecycle contract](../HOOKS.md).

The non-quick `ci-local.sh` run at published `adf454b9` completed with exit 1.
Its private log is `/Users/Shared/great-cto-full-ci-ka0ZMQ`. Root/hooks/board
tests passed 1256/1256, eval 238/238, docs 76/76, browser 9/9 and CLI 361/361.
The library suite had 3038 tests: 3029 passed, three failed and six skipped.
Failures were changed-resource broker refusal termination, the external
guardian tainted-continue browser probe and the separate packaged-controller
matrix process. Its retained diagnostic had a null exitCode with empty output;
that alone does not prove the cause or that every descendant stopped.

HOL scanner scored 77 against the unchanged floor of 80: zero Critical,
39 High, including 35 historically reviewed findings. Four new High entries
refer to two files: webhook namespace test secret fixtures and dynamic
SessionEnd bootstrap execution. No new baseline exceptions were added. The
generated architecture reference was stale. Remediation is tracked in
great_cto-p4o9.5.9.5, and the three library failures in .5.9.7.

The stock L1–L5 suite finished with 33 grouped checks passed, three failed,
nine skipped. The selected installed local 3.48.0 lacks the webhook
namespace and board isolation contracts, so the two HMAC and board probes
refused before unsafe mutation/server startup. MCP transport and synthetic
Beads lifecycle checks passed. No skipped or synthetic check establishes real
model execution, independent review, native admission or human approval.

The pack step completed, producing a 161-file candidate preserved at
`/Users/Shared/great-cto-full-ci-candidate-g7psmI/great-cto-3.48.0.tgz`, SHA-256
`99be49033092c3b9ae626d767a52e451cd538f0fe2cf162d27d8679c4e01ec34`.
This is package creation evidence, not successful delivered-runtime closure
or release approval. Existing archives were preserved; installation, defaults,
release and merge state were not changed.

## Cross-run cleanup boundary

The old board-gate startup called `sweepStrays`, scanning process cwd values
and deleting temporary directories by a shared prefix. The full run reported
zero processes killed and one directory removed; its exact path was not logged
and recovery is unproved. A prefix is not proof of exclusive ownership.

The sweeper and its only call are removed. Other reap/rmTemp/reapAndClean APIs
retain their existing signatures and behavior; this change is not a universal
OS process-ownership certificate. Board-gate fixture directories now use
exclusive canonical private roots with repeated cleanup identity checks.
Cleanup refuses unknown roots. An unsuccessful owned-group reap fails the test
and retains its roots instead of deleting underneath a possibly live board.
Startup failures can still retain roots; a later run has no authority to sweep
them. The helper's group behavior is not proof against every PID reuse or
same-UID race.

Five actual board-gate tests pass after the change. The preservation regression
holds an independently owned matching-prefix child/root alive, imports the
helper and verifies they remain untouched; separate ownership regressions cover
directory/symlink replacement and widened permissions. All eighteen remaining
caller test files passed 128/128 with zero skips; manual import review found no
other consumer of the removed sweeper. They use unchanged reap APIs. The
generated architecture map was refreshed and its sync check now passes.
After [static-bootstrap/random-key remediation](2026-10-03-session-end-smoke-isolation.md),
the unchanged scanner gate reports 83, zero Critical and the same 35 historically
reviewed High entries, with no new exceptions. Guardian/probe remediation and
full-current-CI/delivered-runtime proof remain open.
Source/browser fixtures do not establish deployed UI or
production gate execution. The full epic remains open.

## Process-cause diagnostic follow-up

A sequential-file run of the three failing library files completed 33/33 with
zero skips, including the actual Chromium refusal scenarios and separate-process
controller matrix. This does not explain their historical full-CI failures.
The old controller diagnostic retained only a null exit code and empty output;
it cannot prove a timeout, startup failure or descendant termination.

Extraction, CLI and controller process diagnostics now retain bounded error code,
signal, outcome, wall timestamps and monotonic elapsed milliseconds. Private error
messages are excluded. Existing private output capture and 30-second limits are
unchanged. Timeout and output-limit classifications require the corresponding
process API error codes; duration alone is not causal evidence. Every record
explicitly leaves descendant quiescence unverified. These diagnostics do not grant
admission, cleanup authority, artifact provenance, benchmark eligibility or gate
approval. Historical evidence is preserved, not retroactively reclassified.

The affected caller suite passes 10/10 without skips, including actual missing
executable, nonzero exit, 30-second timeout, output overflow and signal cases.
The classification-only unit cases are not substituted for these native process
checks. Controller construction/selection passed in a separate process; neither
this scoped run nor a scanner pass closes the three historical full-CI failures.
