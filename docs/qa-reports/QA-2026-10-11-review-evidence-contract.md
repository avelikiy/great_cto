# QA: Shared review evidence contract, first implementation slice

Date: 2026-10-11
Scope: Beads great_cto-qnq6.1; [architecture decision](../adr/ADR-030-review-evidence-and-recovery.md)
Base: released main bfeafd0226795ae420559a98d19c88bfcbc947af
Status: focused checks passed; canonical rerun pending

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
above passed. A fresh full rerun is still required.

## Not established

Native Claude subprocess integration, structured model output, live two-host
review parity, task evidence UI, lease fencing, crash recovery, update rollback
and quality uplift are outside this first slice. No independent reviewer has
approved it. No merge, npm/GitHub release, installed-plugin replacement or
localhost:3141 restart was performed.
