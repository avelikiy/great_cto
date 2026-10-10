# QA: stacked Skills release 3.60.0

Date: 2026-10-10. Tracking: great_cto-f33n.6.
Scope: PR #173 project-scoped Usage, #175 English formatting, #176 read-only
multi-host Skills inventory. No evidence-ledger implementation or unrelated PR.

## Source and review

Full local gate source: 6afe445b8f2049dc410cd4165917a935a121632f.
Merged main: 6bb5eb3ad74d696fc4fbf250769641e7510e2a69. Its complete tree was
compared with the tested source using git diff --exit-code; no difference.
All three pull requests are confirmed MERGED on GitHub. New feature and merge
commits use avelikiy as author and committer, with the GitHub noreply address.

[Independent review](REVIEW-2026-10-10-skills-release.md) records the initial
BLOCKED verdict, reproduced regressions, corrections and fresh APPROVED
application review at 5db1d3ea. Application packages/scripts were compared with
the final candidate and are byte-identical. A separate fresh read-only Claude
Code review APPROVED the final test/doc delta at 6afe445b (session
f9ec1d6a-1cb9-4502-8898-d359788639ea). Neither review executed tests or certified
publication. Snyk reported SUCCESS on the three candidate PR heads.

## Complete local gate

Command: bash scripts/ci-local.sh --e2e. Node v22.14.0, macOS.
Process exit: 0. Complete private log SHA-256:
ec2ae978e868ec733d14303a604b589b7a834ae0f11a9597aa5c267c397f6f7f.
Raw machine logs and reviewer transport envelopes are not committed.

| Main suite | Passed | Failed | Not executed |
| --- | ---: | ---: | ---: |
| Root, hooks and board | 1,336 | 0 | 0 |
| Shared libraries | 2,579 | 0 | 4 |
| Eval unit tests | 238 | 0 | 0 |
| Documentation | 76 | 0 | 0 |
| Real browser board scenarios | 14 | 0 | 0 |
| Pipeline L1-L5 | 55 | 0 | 1 |
| CLI unit tests | 362 | 0 | 0 |
| Archetype scenarios | 34 | 0 | 0 |

These are executions within separate suites, not a claim of 4,694 unique
tests: some preflight and pipeline checks repeat unit coverage. TypeScript
build, CLI pack, structural checks, synchronization, lint, layout and contrast
gates also passed. HOL policy passed at score 82: zero Critical, 35 High
reviewed against the existing false-positive baseline, nine Medium, eight Info.
Passing policy does not mean the scanner emitted no findings.

The four library skips are opt-in live scenarios: offline Docker isolation,
real failing assertion/repair/controller flow, live build/export/release smoke,
and real Claude Code plus Codex workers in a frozen QA/security wave. They
remain NOT CHECKED. L1 separately skips an obsolete pytest suite absent from
this repository; committed Node board tests cover the current surface.
The local gate's skip summary counts four, while L1 prints its additional skip
in its own summary. This report retains both rather than hiding the fifth.

Relevant GitHub test/publish workflows are disabled. Local gate evidence and
external Snyk status are not represented as a green GitHub Actions run.

## Failures retained

Earlier runs found a stale generated architecture map, missing output in the
installed 3.59.1 CLI cache, an ADR test fixture in the wrong directory, unlinked
QA reports, incomplete marketplace runtime fixtures, missing Skills contrast
coverage and two cold-load browser assertions racing initialization. Each was
corrected and the complete gate rerun. No assertion, contrast threshold or
mandatory test was removed to produce the passing result. The original
implementation's 490/13/4 counts remain historical evidence, not this release
gate's counts.

## Package and delivery

The source gate passed before the version-only bump. Release preparation must
repeat manifest/pin checks, the four package-file checks, TypeScript build,
archive generation and an isolated consumer probe on the actual 3.60.0 archive.
That probe must import the bundled Skills module outside the source checkout,
check its seeded document hash, boot the bundled board, verify both hosts'
project-isolated token counts and verdict aliases, and reject unknown projects.

Registry publication, dist-tag propagation and a fresh registry download are
not yet certified by this revision of the report. Operator localhost:3141 and
installed host plugins are separate deployments, not implied by an npm release.

## Remaining boundaries

Nonblocking application follow-ups are great_cto-f33n.7 (attribution coverage
and partial-source recovery) and great_cto-f33n.8 (Outcomes cache saturation and
ambiguous-alias exclusion counters). Remaining test hardening is tracked in
great_cto-f33n.10: data-aware readiness beyond the initialization floor,
remaining fixed pauses and hermetic contrast fixtures.

No security-gate exception is used. Inventory presence is not enabled/loaded
state, trust, upstream verification or measured task-quality improvement.
This release does not certify 100% host compatibility or a live-model benchmark.
