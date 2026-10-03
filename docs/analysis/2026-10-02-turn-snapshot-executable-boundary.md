# Executable-helper boundary for diagnostic turn snapshots

The [complete controlled receipt boundary](2026-10-02-controlled-receipt-boundary.md)
does not isolate the automatic `snapshotTurn` call in the controller's `finally`.
Snapshotting stages through a private index, creates diagnostic commits and
updates private turn refs. Those operations must not launch project-configured
executables, including when the worker failed and no result was accepted.

## Confirmed paths and child-local protection

Actual temporary repositories demonstrated execution of clean/process filters,
filesystem-monitor commands, reference-transaction hooks and diff textconv.
External diff was already disabled for patches; its positive witness and
non-execution regression remain. The first red run had seven failures out of
eight tests, but one was an invalid signing witness, not a demonstrated signing
vulnerability. The corrected signing witness selects a fixture-only OpenPGP
program and explicit `-S`; current plumbing `commit-tree` does not automatically
inherit `commit.gpgsign` in the tested Git version.

Every child Git operation used by this module now disables fsmonitor, points
`core.hooksPath` at the platform null device and sets `commit.gpgsign=false`.
Patch/diff commands include both `--no-ext-diff` and `--no-textconv`. Index
operations `read-tree`, `add`, `reset` and `write-tree` suppress configured clean
and process filters and their required flag. Suppressing only `add` was
insufficient: real tests found filter execution during the path reset even with
`--no-refresh`.

Filter discovery reads names only, not configured command values. It is bounded
to 64 KiB, five seconds and 128 distinct filter names. Unreadable or oversized
filter discovery refuses the snapshot rather than proceeding with executable
defaults. Child Git commands also have a five-second deadline. A failed
diagnostic snapshot does not mint a verified stage, receipt or approval.

These overrides are passed on the specific child command line. No repository,
global Git configuration or parent environment is changed. Operator commit/push
hooks, signing preferences and native Claude pipeline hooks remain active on
their normal paths. This is not a bypass for a product/security/release gate.

Git documents per-command hook suppression through
[core.hooksPath](https://git-scm.com/docs/git-config#Documentation/git-config.txt-corehooksPath)
and the execution of
[reference-transaction hooks](https://git-scm.com/docs/githooks#_reference_transaction)
on reference updates. Tests verify those behaviors against actual local Git,
not only configuration declarations.

## Test plan and evidence boundary

| Area | Actual-Git integration requirement |
| --- | --- |
| Clean filter | Ordinary hash invokes marker; snapshot preserves unfiltered fixture blob, HEAD, user index and worktree without marker |
| Required process filter | Ordinary hash launches fixture process; snapshot succeeds without process launch |
| Filesystem monitor | Ordinary index read invokes marker; snapshot does not |
| Reference hook | Ordinary ref update invokes marker; snapshot creation and private-ref pruning do not |
| Signing | Explicit fixture-only signing invokes marker; diagnostic snapshot does not; no prior implicit-signing vulnerability claimed |
| Patch readers | Ordinary diff invokes external/textconv witness; turnPatch and turnDiff do not |
| Configuration cap | 129 configured filters refuse snapshot and create no turn refs |
| Controller finally | Combined helpers are not invoked after either a verified callback worker or a thrown worker; an actual turn is recorded with zero approvals |

The controller integration uses callbacks, not provider calls. It proves the
automatic path, not Claude/Codex connectivity or independent benchmark scoring.
Existing activity exclusions, ignored-runtime behavior, private-index semantics,
race-safe turn refs and operator index/HEAD preservation remain required.

This is targeted helper suppression, not an OS sandbox or a claim about every
future Git helper. The Git executable and host are trusted; same-user concurrent
configuration changes, malicious filesystem topology and submodule boundaries
are not comprehensively isolated here. Built-in attribute conversions are not
arbitrary process filters and are not disabled by this change. Ignored-file
content and filtered historical objects are not retroactively authenticated.

No benchmark eligibility, installed-artifact provenance, human approval,
default policy, release or merge authority is added.
