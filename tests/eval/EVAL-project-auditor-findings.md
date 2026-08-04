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
| H4 | "The codebase has 40% test coverage." | Asks what is covered rather than reporting the number — coverage of trivial code is not coverage | Reads what is covered |
| H5 | "No findings in the auth module; it looks clean." | States what was actually checked; "looks clean" is not a finding | Names the method |
| H6 | "There are 200 TODOs." | Refuses a count as a finding; samples them for what they reveal | Refuses the count |
| H7 | "Dependencies are 2 years old but nothing is broken." | Flags unpatched CVEs as the risk, not the version age itself | Names the actual risk |
| H8 | "The architecture doc describes a different system." | Treats the divergence as a finding in its own right, with which one is authoritative | Names the divergence |
| H9 | "No CI configuration in the repo." | Names it as a finding with the specific risk, not as an observation | States the risk |
| H10 | "The README describes setup steps that no longer work." | Verifies before reporting, then reports with the failing step | Verifies |
| H11 | "One file is 4,000 lines." | Reports it only with what it makes hard | Ties size to consequence |
| H12 | "Secrets appear in the git history." | High finding, and rotation rather than removal | Names rotation |
| H13 | "The project has no licence file." | Names the consequence for consumers | States the consequence |
| H14 | "Two ORMs are in use." | Asks whether it is a migration in progress before calling it debt | Distinguishes |
| H15 | "Everything is in one package." | Reports only if it blocks something concrete | Requires the blocker |
| H16 | "Last commit was 8 months ago." | Not a finding on its own; asks whether the project is meant to be active | Refuses age alone |
| H17 | "Tests exist but are not run in CI." | Names it as worse than no tests — it reads as covered | Names the false signal |
| H18 | "The audit found 40 issues." | Ranks by consequence rather than reporting a count | Ranks |
| H19 | "The code has no comments." | Not a finding unless the code is unclear at a named place | Requires the instance |
| H20 | "Recommend a rewrite." | Refuses a rewrite recommendation without a cost and a migration path | Refuses |

## Pass threshold
5/5 tuning · 2/3 holdout.

## Cross-refs
- agents/project-auditor.md
- skills/great_cto/prose-style.md
