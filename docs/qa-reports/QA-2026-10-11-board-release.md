# QA: board read-path release and remaining runtime blocker

Date: 2026-10-11. Tracking: great_cto-932g.7, great_cto-932g.7.5 and great_cto-932g.9.
This report separates source verification, distribution, installation and actual runtime health.

## Approved and shipped source

PR #178 merged as `72133dfb26b046925ab0915a25da71fac5685bd3`; PR #179 as
`4de34255211cb1a14176a58b888fdd03eee9566c`. The combined application tree is
byte-identical to canonical candidate `48c4f88e288c3be04588e330444e3d79933f9b73`.
Release commit: `d8cc2f95ba1d2f209a0d8956acaf030872be32ce`, version 3.62.1.
The release-only delta updates manifests, version pins and release notes, not application code.

The exact candidate's complete canonical gate is GREEN: root/hooks/board 1385,
library 3321, eval 242, docs 76, browser 15, CLI 369, archetype E2E 34;
pipeline L1-L5 36. Suites overlap and are not a unique-test sum. Fifteen checks
remain NOT CHECKED: six optional library checks and nine pipeline external actions.
Canonical log SHA256:
`61e8abad7dee636777f413d858e4798daa6e5bd58f3ac7d804790f4b08e21638`.

Independent exact-head re-review found no new actionable blockers and confirmed
closure of all three previously reproduced P2 findings. Reviewer independently
ran seven targeted cases: 7 PASS, 0 FAIL, 0 SKIP. A separate stdout backpressure
regression fails on the preceding worker and passes with output drained before
terminal IPC and owned-group cleanup. Historical red runs are retained privately.

CLI TypeScript build and docs-reference checks passed. Release metadata/runtime
checks: 49 PASS, 0 FAIL, one opt-in live case NOT CHECKED. The fresh npm consumer
ran 15 actual packaged worker/SSE checks and one cold HTTP check without failures
or skips. No paid-model execution or production deployment is inferred.

## Distribution and installation

[GitHub Release](https://github.com/avelikiy/great_cto/releases/tag/v3.62.1)
published at 2026-10-11T10:57:47Z. npm accepted publication, then initially
returned 404 while processing. A subsequent registry read confirmed 3.62.1;
downloaded bytes match the tested archive. There was no repeated publish or
overwrite of immutable 3.62.0.

Package: 181 files; SHA1 `0efdb6d854c434743238d04eba851b53831b157b`;
SHA256 `7b6f394d81f323dd0500bf4ff7d067d3a752d665f229a198dd112e90b8a292d6`.
Registry integrity:
`sha512-lZFwPHU6CQWH6I551rvw10zxVIgcPM5qHMlJ7j8gSRQgmvOkfReWHvMpCz+2hhCupz1snWvwtj7aClWpnvY3ow==`.

Native Claude marketplace/plugin refresh, native Codex marketplace upgrade and
the terminal CLI confirmed 3.62.1. Active Claude marketplace selection remains
unchanged; the inactive local registration was updated without enabling duplicate
hooks or refreshing managed global agent files. Old caches and a registry backup
are retained. Codex reports installed/enabled 3.62.1 with the official Git origin;
its MCP pin is `great-cto@3.62.1`. Worker hashes agree across source and both host
caches. These checks do not prove hot-loading into already-running model sessions.

## Runtime: FAIL, not healthy

The board initially answered with running=installed=3.62.1 and stale=no, bound to
loopback and loaded from the active marketplace artifact. Live selected-project
Usage displayed project-attributed data and English UI text; no operator data or
screenshots are included here.

The planned 20-minute runtime probe stopped at its first Inbox timeout (3 seconds),
followed by version-endpoint timeouts. No sustained-health pass is claimed. A native
sample shows the HTTP main thread inside synchronous process execution under an
array mapping operation. The owned unhealthy board instance was stopped after
diagnostic evidence was captured; it is not left serving a claimed healthy release.

The exact installed receipt module reproduced the remaining blocking path in an
isolated, bounded, read-only process: 571 synchronous Git calls completed before
the 20-second deadline, primarily per-file hash-object reads; the receipt had not
finished. A new real HTTP fixture against installed 3.62.1 fails on the same held
receipt/cheap-endpoint condition. Follow-up candidate processing on the same private
tree obtained a receipt in 655 ms; this is one-path evidence, not a population
speedup estimate or installed-runtime proof. The retained file map remains capped;
the dirty digest still covers all readable untracked content. Candidate rollout
requires its own gate/review and authority and is not part of released 3.62.1.

## Announcement boundary

[Announce Release run](https://github.com/avelikiy/great_cto/actions/runs/38133827740)
failed before executing steps. GitHub's annotation reports an account billing lock.
This requires owner resolution; no local social-posting workaround or successful
announcement delivery is claimed. npm/JSR publish workflows remain disabled;
npm was published explicitly, and no JSR release is claimed.

The article remains a draft. Public blog publication is a separate action.
