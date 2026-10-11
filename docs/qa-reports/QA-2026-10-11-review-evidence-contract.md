# QA: Shared review evidence contract, first implementation slice

Date: 2026-10-11
Scope: Beads great_cto-qnq6.1; [architecture decision](../adr/ADR-030-review-evidence-and-recovery.md)
Base: released main bfeafd0226795ae420559a98d19c88bfcbc947af
Status: independent source review approved; test stages passed; final scanner recheck pending

## Implemented behavior

Exact submitted UTF-8 diff/spec hashes, byte lengths and optional source/task
identity form a versioned input binding. The existing Codex/OpenRouter CLI logs
this binding without raw bodies. A pure host-neutral result normalizer checks
binding equality, availability, verdict and finding structure. It has no gate
authority and does not certify reviewer independence or finding truth.

Legacy findings require a unique exact verdict line. A concrete P0 overrides
PASS; malformed paths, lines or severities cannot approve. Missing verdicts
never derive PASS. Excess diff/spec input and empty diffs return SKIPPED instead
of silently reviewing a prefix or inventing approval. Existing advisory P1/P2
policy and log fields are retained.

## Focused verification

| Check | Result |
| --- | --- |
| review-contract, cross-model-review, provider, second-opinion-provider, witness tests | 44 passed; 0 failed; 0 skipped |
| scoped-review-reuse and attempt-effects tests | 53 passed; 0 failed; 0 skipped |
| doc-links tests after adding internal ADR references | 5 passed; 0 failed; 0 skipped |
| computed-style settling helper tests | 2 passed; 0 failed; 0 skipped |
| isolated sidebar browser scenario after helper repair | 1 passed; 0 failed; 0 skipped; not the full browser suite |
| node --check for both changed runtime modules | Passed |
| git diff --check | Passed |
| generated docs-reference --check after regeneration | Passed |

The CLI tests use a fake Codex executable. Pure normalization cases cover
Claude Code and Codex metadata but do not execute either native host.

## Canonical gate and repairs

The first `bash scripts/ci-local.sh --e2e` run exited 1, not a green verdict. It found
stale generated architecture-map counts, two witness assertions pointing to
the relocated legacy guard, and the new ADR being an orphan document. Repairs
regenerated the map, moved the witness to the actual executable guard and
linked the ADR to existing decisions. It also recorded an intermediate rgba
versus final rgb mismatch in the unchanged sidebar hover test. That test passed
in isolation before repair, so a deterministic production UI defect is not
claimed. Its one-shot animation snapshot was replaced with forced style
resolution and two stable observations across frames. A deterministic helper
fixture demonstrates the old reader returning an intermediate value; another
fixture rejects never-settled styles. Assertions are unchanged.

Initial main-stage counts: root/hooks/board 1402 passed and 2 witness failures;
libraries 3333 passed, 1 doc-link failure and 6 skipped; evals 242 passed;
docs 76 passed; browser 14 passed and 1 hover failure; CLI 369 passed;
archetypes 34 passed. These are diagnostic counts, not the repaired candidate's
approval. No assertion, limit or gate was removed. Focused remediation checks
above passed.

The second frozen-source run at `720c9908015f9c912e9013e4b2606ceb9a4bbdf7`
passed all source unit/browser stages but exited 1: the default pipeline suite
selected the operator's installed Claude plugin 3.62.2, whose CLI is missing
`dist/main.js`. Fifteen smoke checks failed. Both host cache directories have
a partial compiled CLI. This is tracked separately as Beads great_cto-6j5j;
neither installation was modified.

A third complete run on the same source used the supported explicit artifact
seam, not an operator reinstall:

```sh
GREAT_CTO_TEST_PLUGIN_DIR=/Users/avelikiy/.codex/worktrees/review-evidence-contract/great_cto bash scripts/ci-local.sh --e2e
```

It exited 0: root/hooks/board 1404 passed; libraries 3336 passed and 6 NOT
CHECKED; evals 242 passed; docs 76 passed; browser 15 passed; CLI 369 passed;
archetypes 34 passed; pipeline L1-L5 36 passed and 9 NOT CHECKED. No executed
check failed. These are candidate-source/artifact results, not proof that the
installed plugins are healthy, an npm tarball was verified, native models
executed successfully, or the release is ready. The 15 omitted checks remain
explicitly NOT CHECKED.

Logs: `/tmp/great-cto-review-contract-ci-rerun-20261011.log` (installed-artifact
failure) and `/tmp/great-cto-review-contract-ci-candidate-20261011.log` (explicit
candidate full gate). A separate L2-L5 diagnostic run passed 29 checks with
9 NOT CHECKED and deliberately omitted L1; it is not the canonical gate.

## Not established

Native Claude subprocess integration, structured model output, live two-host
review parity, task evidence UI, lease fencing, crash recovery, update rollback
and quality uplift are outside this first slice. No merge, npm/GitHub release, installed-plugin replacement or
localhost:3141 restart was performed.

## Independent review and corrective candidate

The authorized read-only reviewer examined PR181 at `6073d39c` and returned
REQUEST_CHANGES. A P1 finding showed `VERDICT : BLOCK` or a tab before the colon
being discarded beside a valid PASS. A malformed location plus named severity
was also discarded. A non-blocking observation showed sparse finding arrays
being accepted by JavaScript `every`.

New pure regressions failed before repair (5 passed, 2 failed). The parser now
rejects malformed verdict/finding attempts instead of dropping them, and the
normalizer materializes array slots before validation. The CLI fixture covers
space/tab verdict conflicts and the malformed finding too. The updated focused
suite passes 45 tests with no failures/skips. Earlier canonical results above
apply only to the earlier frozen source, not this correction. A new complete
candidate gate and independent re-review are required.

The combined contract/UI candidate `67d0e338` subsequently passed the full
canonical gate with exit 0: root/hooks/board 1409 passed; libraries 3337 passed
and 6 NOT CHECKED; evals 242; docs 76; browser 16; CLI 369; archetypes 34;
pipeline 36 passed and 9 NOT CHECKED. The explicit candidate artifact was used.
Log: `/tmp/great-cto-review-ui-full-20261011.log`. This certifies the
combined tree containing parent `6c47243d`, not a separate full run of that
parent or the installed plugins.

Independent read-only re-review approved parent `6c47243d` and UI `67d0e338`,
confirmed closure of the P1 and sparse-array issue, and independently passed
38 focused tests and one keyboard browser scenario, with no failures/skips.
It found a nonblocking P2: a valid finding mentioning `verdict` in the path or
issue lost its diagnostic data. A new regression reproduced this (6 passed,
1 failed), then matching a complete finding before malformed verdict attempts
repaired it. P0 still overrides PASS; malformed finding validation remains
unchanged. The narrow independent re-review approved `a173ecb6`, confirmed
closure of P2 and passed 31 tests plus six counterexamples. Our expanded
focused suite passed 41 tests with no failures/skips.

The complete corrected combined run at `02242bf6` exited 1 solely because HOL
mistook the QA log filename for a provider secret. Its matching substring was
the long filename segment beginning with the last two letters of task. This
was a log path, not a credential. All executed test stages passed with the
same counts as the preceding combined run; 15 remain NOT CHECKED. The log
was copied to `/tmp/great-cto-review-ui-recheck-20261011.log` and this report's
reference renamed. No scanner rule, baseline or exception was changed. The
scanner and documentation checks must be rerun on the documentation-only
repair; this failed full run is not relabelled as GREEN.
