# QA: focused domain experience

Date: 2026-10-16.
Status: canonical R4 passed with 15 NOT_CHECKED; independent code review APPROVE.
Base: `26504e20c8d38309632ddabf460393415c833b36`.
Decision: [ADR-034](../adr/ADR-034-focused-domain-experience.md).
Tracking: great_cto-e76b, great_cto-v53m, great_cto-e76b.1.

## Scope

Reversible Fleet presentation over the unchanged installed role catalog and
required-reviewer policy. Project focus includes eight existing core role names
and project-required reviewers, not eight mandatory executions. Unknown policy
restores catalog visibility. Missing installed required roles are named; required
retired roles stay visible. Other attention remains in its catalog-wide view.
Reviewer and roster requests reject stale project scopes and request generations.

The benchmark plan command emits an anonymous design, not preregistration,
receipts or observations. Thirty-six slots cover three task proposals, two
hosts, two arms and three repetitions. Models, budgets and source/scorer/holdout
pins are null. Existing preregistration validation refuses this design.
No native host invocation or paid benchmark occurred. Separate private source
inspection and synthetic holdout proposals are not benchmark observations and
are not included in this public candidate.

## Executed verification

- Domain evidence/admission/benchmark, plan, focused Fleet and documentation:
  158 passed, zero failures/skips.
- Complete board suite with one file worker: 552 passed, zero failures/skips.
- Complete Chromium board suite R2: 16 passed, zero failures/skips.
  Includes focus/core/required membership, unrelated-role exclusion, full
  catalog access, Enter keyboard activation and unknown-policy fallback.
- Sidebar geometry/typography/icon/accessibility checks passed at 1440, 1000
  and 375px. Synthetic-fixture sidebar screenshots inspected at desktop/phone.
  Their empty installed roster is not evidence about an operator installation.
  Production CSS, colors and spacing were not changed.
- TypeScript CLI build passed. Resolver/package-closure tests passed 22/22,
  zero skips, with one file worker.
- Focus/plan/document-link follow-up passed 16/16, zero skips.
- Artifact lint found no structural errors and one preexisting freshness warning.
  Reference architecture-map regeneration accounts for the additional board test.

Counts overlap between selections and are not a unique-test total.

## Retained failures

Initial Chromium run had 15 passes and one failure: sidebar accessibility still
asserted the previous default Needs attention. New Project focus default was
selected. Updated expected selection, retaining geometry, typography, hover,
keyboard and breakpoint assertions; targeted replay passed 2/2, then full R2
passed 16/16. No timeout or CSS assertion was relaxed.

Initial package test invocation used concurrent file workers: 21 passed and one
failed with bundler chmod ENOENT in the shared generated output. Both test files
invoke the same bundler output; a subsequent single-worker run passed 22/22.
Parallel output isolation remains open as great_cto-jkiy. The failing run is not
relabeled green; this feature does not claim to fix that test isolation.

## Delivery and experiment boundaries

### Canonical R1 and lifecycle fixture correction

`bash scripts/ci-local.sh --e2e --serial` at `b8bbc82e` exited 1.
Root/hooks/board: 1443 passed; libraries: 3424 passed, one failed, six skipped;
eval: 242 passed; docs: 76 passed; Chromium: 16 passed; pipeline: 36 passed,
nine NOT_CHECKED; CLI: 375 passed; archetypes: 34 passed. These overlapping
suite counts are not a unique-test total. Fifteen opt-in/native checks remain
NOT_CHECKED. Raw log SHA256:
`c2cab319ddf39d29630f0082182fe248757fc5d438ab786a3480019725c5cdcf`.

The sole failure was the unchanged Codex timeout fixture: `child.pid` did not
exist after the real 800ms deadline. The unchanged file replay reproduced it
(14 passed, one failed, zero skipped). Instrumented launches with both external
stdin draining and shell-built-in draining sometimes missed even their first
instruction before 800ms. This does not establish an OS startup cause or prove
descendant cleanup; the external-drain-only hypothesis was rejected.

The corrected test separates two obligations without changing production code:
the real 800ms watchdog remains bounded by the original 5000ms return assertion;
a separate actual OS child is admitted and verified alive before advancing only
the mocked setTimeout clock to 799 then 800ms. Date, setInterval and OS processes
remain real. Actual close is bounded to 5000ms, and child absence is asserted
before fixture cleanup. The emitted partial PASS must never become an answer.
This is not a claim that the second case measures real 800ms scheduling.

Corrected file replay: 16 passed, zero failed/skipped. A disposable negative
control replacing both process-group kills with CLI-only kills failed at
`child held stdout open after timeout`, as required. Production runner bytes
were not changed. Both corrected cases also passed inside canonical R2.

### Canonical R2 crossed host sleep cycles

Full serial R2 at `19e46520` exited 1. Root/hooks/board: 1443 passed;
libraries: 3423 passed, three failed, six skipped; eval: 242 passed;
docs: 76 passed; Chromium: 16 passed; CLI: 375 passed; archetypes: 34 passed.
Pipeline executed checks passed with nine NOT_CHECKED; six opt-in library
checks were skipped. No native readiness is implied. Raw log SHA256:
`ba70851e03b3f13cfc6afe4d1e8bd24b7ad90f9fdb45f69c5de8f90cd818098a`.

Failures: adaptive benchmark collector fixture expected done but was blocked;
adaptive Git executable-boundary fixture hit Git ETIMEDOUT; API compatibility
hidden scorer rejected a changed candidate receipt before scoring. These files
and their production paths are unchanged from the base. macOS power logs show
repeated sleep/darkwake intervals during this run, ending at 17:23 local time;
individual test durations reached tens of minutes. Sleep overlap is observed,
not proof of each failure cause. Exact-file replay while awake is required,
followed by a new full gate. No assertion, deadline or skip policy was relaxed.
The unchanged three-file awake replay passed 60/60, zero failures/skips in
193727ms. A command-scoped idle-sleep assertion was active. This is a successful
replay, not proof of each earlier failure cause or a substitute for full R3.

### Canonical R3 and Stop-hook fixture admission

R3 at `94dbb930` exited 1 with a command-scoped idle-sleep assertion active.
Root/hooks/board: 1442 passed, one failed, zero skipped. Libraries: 3426 passed,
zero failed, six skipped. Eval 242, docs 76, Chromium 16, CLI 375 and archetypes
34 passed. Pipeline executed checks passed with nine NOT_CHECKED. The three
R2 failures passed unchanged in this full run. Raw log SHA256:
`64ab5e251ff9d8e0c6714878fbdb65336e3614bb6b6cb59ee91463131296c6c4`.

The sole R3 failure was the unchanged Stop-typecheck deadline fixture: missing
PID file after 1073ms. Its unchanged isolated replay passed 16/16. Missing
admission evidence cannot prove cleanup, regardless of this replay result.
Test-only correction retains the actual one-second hook deadline and original
five-second return bound, notice and nonblocking assertions. A separate real
checker/child group is verified alive before advancing only setTimeout to 999
then 1000 virtual ms. Real liveness is checked before cleanup, bounded to one
second, as in the original case. Production hook bytes remain unchanged.
Corrected file: 17 passed, zero failures/skips. A disposable checker-only-kill
mutation failed at `checker group survived the deadline`, before cleanup,
as required. Both pairs then passed inside full R4 below.

### Canonical R4

`caffeinate -i bash scripts/ci-local.sh --e2e --serial` at `c267c288`
completed with exit 0. The temporary assertion prevents idle sleep only; it
does not alter test deadlines or production behavior. Root/hooks/board: 1444
passed, zero failures/skips. Libraries: 3426 passed, zero failures, six skipped.
Eval 242, docs 76, Chromium 16, CLI 375 and archetypes 34 passed. Pipeline
executed checks passed with nine NOT_CHECKED. Total 15 NOT_CHECKED is not proof
of native model execution, delivery or full operator readiness. Raw log SHA256:
`c0fcfad44e539c0dd560b9e5a0b27eecdd1258851c59e49dc0e8f226ce4bd8ca`.
Earlier failed attempts remain recorded above. Independent review is next.

### Independent read-only review

Separate reviewer APPROVE at `6f6777c9112ef4ce143e23205c8e62d5c9b567dc`
against base `26504e20c8d38309632ddabf460393415c833b36`; no actionable
blockers in the entire 12-file diff. Only this QA report changed after the
canonical gate commit. Reviewer independently ran Fleet, pilot plan and both
timeout suites: 44 passed, zero failures/skips. Both disposable CLI/checker-only
kill mutation controls produced their expected failures before cleanup; raw R4
SHA256 matched. Review checkout remained unchanged.

Review covered required/retired/missing reviewer visibility, unknown-policy
fallback, stale project/request responses, catalog-wide attention access,
anonymous unexecuted matrix and both admitted-child lifecycle tests. Production
dispatch, permissions and reviewer enforcement remain unchanged. Private
overlays/holdout proposals were outside this review and were not inspected.
This approves the code candidate only, not experiment outcomes or distribution.

No role deletion, dispatch reduction, permission change, default domain activation,
merge, release or operator installation. The installed operator board separately
responded running=installed=3.63.5, stale=no; that does not install this candidate.
Core/pack quality differences, acceptance rates and cost per accepted task remain
Unknown. Three task clusters and repeated runs would be exploratory evidence,
not broad industry certification or clinical efficacy.

Native pilot still needs executable hidden holdouts, independent scorer freeze,
pinned models/policies, verified workspace/receipt isolation, measured per-trial
and aggregate spend caps, and explicit launch authority. Independent code review
is complete; green canonical verification and review do not authorize merge,
release or installation.

VERDICT: BLOCKED reason="code candidate verified and independently approved; separate merge/release authority pending; native pilot remains separate"
