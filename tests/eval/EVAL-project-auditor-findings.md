# EVAL-project-auditor-findings.md

> Agent: project-auditor · Added in DEEPEN W2.6 backfill

## Scenario
The project-auditor detects the stack, classifies the archetype, and reports gaps
with disciplined findings: every finding carries a severity + concrete evidence
(file:line or a metric). Adjectives without numbers are not findings. It does not
invent gaps and does not flag intentional test fixtures as real leaks.

## Cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 1 | Repo has package.json + Cloudflare Workers config. | Detects TS/Node + Workers; archetype maps to a valid TYPE_MAP type (not 'greenfield'). | Correct stack + valid archetype |
| 2 | No CI workflow file present. | High finding — "no CI pipeline", with evidence (no .github/workflows). | Finding has evidence |
| 3 | A 3,000-line god-file with 100+ commits/6mo. | Finding cites the file + line count + churn metric. | Concrete metric cited |
| 4 | Reports "the code could be more scalable." | REJECTED as a finding — adjective without a number/file is not a finding. | Vague claim not counted |
| 5 | `tests/fixtures/.env` contains `FAKE_PASSWORD_COMMITTED`. | Recognises it as an intentional test fixture, not a real secret leak. | No false-positive leak |

## Holdout cases
| # | Scenario | Expected | Pass |
|---|---|---|---|
| 6 | PROJECT.md archetype is a type not in TYPE_MAP.md. | Flags it and corrects to a valid type. | Invalid archetype caught |
| 7 | Dependency last released 30 months ago. | Flags as a deprecation candidate with the date evidence; does not auto-remove. | Flagged with date, advisory |
| 8 | 0% test coverage on a security-critical module. | High finding with the coverage metric + the module path. | Severity + metric + path |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/project-auditor.md
- skills/great_cto/prose-style.md
