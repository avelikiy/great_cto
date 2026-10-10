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

The source gate passed before the version-only bump. After synchronization to
3.60.0, TypeScript build and structural validation passed again. The combined
documentation, Codex manifest/pin and document-link checks passed 90 tests;
the package-file checks passed four. Neither focused run failed or skipped.

The actual prepublication archive contains 160 files, 749,457 compressed bytes
and 2,383,254 unpacked bytes. Archive SHA-256:
286634994fb1b379ad439e318d191701a54c76a9cd58cfa3c88ef0b2d2477fbe.
Archive integrity:
sha512-NPFqz2jdCH8OF8blq7Tlx8Sb6ndKbqjOHIWRafYYTiEhSUn6iKNAWJ7DHXQCxAAIVf7VSN3LYttvVakeme3J0w==.

An isolated consumer probe on that archive passed: CLI version 3.60.0,
standalone bundled Skills import, seeded document hash match, bundled board
version 3.60.0, Skills API, two-project statistics isolation for both hosts,
owned-versus-foreign verdict alias isolation and 404 for unknown selections.
Its temporary HOME, registry, project data and board port were independent of
the operator installation. No skill instructions were executed.

The first metadata wrapper could not parse lifecycle output preceding npm's
JSON; npm pack itself succeeded. The parser was corrected, the archive was
regenerated and the actual artifact verified. No production source changed.

Release source/tag: 5cca27d21f0ab922be56b6ebdfe7a6a5282aef69 / v3.60.0.
The release commit only changes synchronized version files and changelog;
application code remains the tested candidate. The tag was pushed and its
peeled remote revision checked against that commit.

npm publish accepted the verified tarball. Registry processing initially
returned 404 and retained latest=3.59.1; this was not reported as completed
delivery or retried as another publish. Subsequent online npm reads confirmed
version 3.60.0 and latest=3.60.0. A download using a new empty npm cache matched
both the full SHA-512 integrity above and the SHA-256 of the prepublication
archive. A fresh npm install of great-cto@3.60.0 into a temporary consumer prefix
passed the same standalone CLI/board, Skills/hash, two-host project statistics,
verdict-alias and unknown-selection checks.

That consumer install used --ignore-scripts: it verifies the delivered runtime,
not host-plugin setup or execution of postinstall on the operator machine.
Local postinstall fixture coverage is part of the earlier full source gate.

[GitHub Release](https://github.com/avelikiy/great_cto/releases/tag/v3.60.0)
is published, not draft or prerelease, at 2026-10-10T10:05:52Z.
[npm version](https://www.npmjs.com/package/great-cto/v/3.60.0) is available.
Relevant GitHub publish workflows remained disabled; npm delivery was manual,
not inferred from the tag push or a workflow status.

Operator localhost:3141 was read back as 3.59.1 and was not restarted or replaced.
Installed Claude Code/Codex plugins were not upgraded to 3.60.0. These are
separate deployments, not implied by the npm release. Old caches are preserved.

## Remaining boundaries

Nonblocking application follow-ups are great_cto-f33n.7 (attribution coverage
and partial-source recovery) and great_cto-f33n.8 (Outcomes cache saturation and
ambiguous-alias exclusion counters). Remaining test hardening is tracked in
great_cto-f33n.10: data-aware readiness beyond the initialization floor,
remaining fixed pauses and hermetic contrast fixtures.

No security-gate exception is used. Inventory presence is not enabled/loaded
state, trust, upstream verification or measured task-quality improvement.
This release does not certify 100% host compatibility or a live-model benchmark.
