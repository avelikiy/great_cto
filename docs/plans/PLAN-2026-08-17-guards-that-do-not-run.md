# PLAN — A guard wired to a CI that cannot run is a guard nobody has

**Stale after:** 2027-02-13

Found while pushing something else. The pre-push hook printed six structural
errors from `artifact-lint`, warn-only, and the obvious question was why they
had been allowed to accumulate. The answer was not that nobody looked. It is
that `--enforce` is wired in exactly one place — `.github/workflows/runtime-ci.yml`
— and GitHub Actions has been billing-locked for weeks. Every run since is
`failure` in a few seconds with no logs.

So the check is configured, correct, and has not executed.

## What is actually dead

| Guard | Exists | In `ci-local` | Runs |
|---|---|---|---|
| `artifact-lint --enforce` | yes | no | **no** |
| `coverage-gate.mjs` | yes | no | **no** |
| `eval-drift` (holdout×3) | yes | no | **no** |
| `tests/security/run-all.sh` | **no** | no | **no** |

The last row is the worst of them and the least like the others.
`tests/security/run-all.sh` was deleted on 2026-05-23 by `5ca0de60`, the commit
that removed the runtime governance proxy. That commit deleted two of the
proxy's workflows and left `security-tests.yml` — 167 lines that install the
proxy CLI, bootstrap its config, start its console, and then run a file that
no longer exists.

For eighty-six days the repository has had a workflow named `security-tests`.
It has not been failing its tests. It has been failing on `No such file`, and
`PROJECT.md` still lists it as evidence that CI is configured.

## Why this is the session's own subject

Today's work removed three instances of one defect: a document that stopped
being true reading as fresh, a stand-down on one eval reading as a stand-down
on four, a date the parser lost reading as a date nobody wrote. Each is the
same shape — **a thing that did not happen looking exactly like a thing that
did.**

These guards are that shape at the level of the guards themselves. Worse,
because a check that never runs is invisible in precisely the way a check that
runs and passes is: both are silent.

## Requirements

- **GUARD-R1** — every guard that gates correctness must run in `ci-local`,
  the only CI that executes on this machine. Being wired to GitHub Actions is
  not the same as running.
- **GUARD-R2** — a workflow that invokes a file which does not exist must not
  be allowed to read as a configured check. Either the file returns or the
  workflow goes; a third state where the name survives and the substance does
  not is what produced this finding.
- **GUARD-R3** — enabling enforcement must not be done by making today's
  failures invisible. The six structural errors are fixed first, then the gate
  is turned on; the reverse order would tune the check to the errors.
- **GUARD-R4** — the next guard to drift must be caught by a check rather than
  by someone noticing. A comparison of what the workflows run against what
  `ci-local` runs, reported, so an Actions-only guard is visible the day it
  appears.

## Scope

- `scripts/ci-local.sh` — gains the ported guards.
- `.github/workflows/security-tests.yml` — deleted. Its subsystem was removed
  in v2.22.1; there is nothing to port.
- The six structural errors: `docs/adr/ADR-010-pipeline-position-pull-view.md`
  (cites `scripts/lib/pipeline-core.mjs`, which has never existed — the file is
  `pipeline-position.mjs`), `docs/architecture/ARCH-judge-provenance.md`,
  `docs/architecture/ARCH-pipeline-position.md`,
  `docs/design/DESIGN-readme-landing-review.md`.
- A new check for GUARD-R4.

## Not doing

- Not restoring the governance proxy or its tests. It was removed deliberately.
- Not porting the release, canary, npm-publish or telemetry workflows. Those
  are genuinely CI-shaped work (matrix across OS, publishing from a clean
  runner) and belong where they are; the point is not that everything should be
  local, it is that a *correctness gate* which only exists remotely is not a
  gate.
- Not fixing GitHub Actions billing. That is the owner's, and this plan exists
  precisely so the answer does not depend on it.

## Status

Planned, and being implemented in the same session it was found — the errors it
describes are accumulating now, not hypothetically.
