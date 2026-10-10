# Monthly blog draft: editorial evidence

Date: 2026-10-10. Scope: 2026-09-10 through 2026-10-10.

Article: [Russian draft](../blog/DRAFT-2026-10-10-monthly-product-update-ru.md).
This file is an editorial fact sheet, not part of the public article and not a task tracker.

[October deployment follow-up](../qa-reports/QA-2026-10-10-october-deployment.md)
records installation evidence and the remaining candidate gates.

## Current delivery snapshot: 3.61.0

- Published package: fresh registry queries returned latest=3.61.0 and exact-version integrity matching the tested archive.
- Release/tag source: `11e8774a1f1ac31cad3284d3b2835e0b1e6dacd8`; GitHub release published at 2026-10-10T14:02:45Z.
- PR #163 merged at `cf12f95c583a00fd483086748044cd922cb86f61`; tested candidate and merge trees are identical. Version-bump application directories remained unchanged.
- Fresh registry consumer verified CLI version, standalone inventory, document hash and manifest. The downloaded archive is byte-identical to the tested local archive. Details: [updater release QA](../qa-reports/QA-2026-10-10-updater-release.md).
- Both Claude registrations, enabled Codex plugin and user-prefix CLI report 3.61.0. Repeated board readback returned version=installed=3.61.0, stale=no. New sessions/hook trust remain distinct from artifact installation.
- New launchd helper's first run ended with exit 0, updated marketplace and no errors. Six-hour recurring execution is not yet observed; installer also refreshed Codex, so exclusive version-transition attribution is not established.
- Migration from an already-loaded legacy job with no plist required exact-label local repair. That edge is a tracked bug, not silently represented as shipped automatic repair.
- Later live board probes timed out at 5s/10s for version and 3s for HTML. Exact-board restart restored initial48.6ms/5ms responses, but the replacement stalled again after about17minutes. A private preload on the second restart identifies inboxElsewhere -> getInbox -> getTasks -> bdList -> spawnSync, one actual call19379.18ms. This proves one blocking request path, not the exclusive cause of previous indefinite stalls; installed source is unchanged. P1 great_cto-932g.7 remains open; no permanent latency fix is claimed.
- PR #167 is not released. Full canonical272b6a4a gate ended exit1: libraries3296pass3fail6skip, pipeline candidate-preflight refused a private dist/dist assembly error. c33ae765 restores Bash3.2 and literal-path handling, narrows the broker fault fixture to the actual fixed DOM-refusal completion, and keeps all admission/ownership/deadline assertions. Focused repair35pass0fail2live skips; both actualChromium broker checks passed. A new correctly assembled private candidate is under canonical full-gate verification; no canonical pass or fresh independent application approval is claimed.

## Historical delivery snapshot: 3.60.0

- Inspected main: `2f395516faea94d060adda0cd6ebd949bc7b8fcf`.
- Published package: fresh `npm view great-cto@latest version --json` returned `3.60.0`.
- GitHub release: `v3.60.0`, published `2026-10-10T10:05:52Z`.
- Release Git object: `5cca27d21f0ab922be56b6ebdfe7a6a5282aef69`.
- September 10 changelog version: `3.28.4`; baseline commit `66da3465`.
- Historical release-document links retain `v3.59.1`; the new inventory contract is pinned to `v3.60.0`. The QA report links to main because its postpublication verification was added after the tag.
- GitHub PR states were checked with `gh pr list` and benchmark merge with `gh pr view 166`.
- This deployment follow-up installed 3.60.0 into local Claude Code and Codex caches. Independent board readback returned version=installed=3.60.0 and stale=no; live Usage and Skills/filter navigation were inspected. Deployment does not prove hot-loading into pre-existing model sessions. The initial installer-started board disappeared; a detached restart was verified afterwards.
- A fresh focused source run passed 31 Usage/English/Skills checks with zero failures or skips. The complete release gate and independent reviews are recorded in the release QA report; no new live model benchmark is claimed.

## Claims and boundaries

| Article claim | Primary source | Interpretation |
| --- | --- | --- |
| Controlled Codex lifecycle and local turn diffs | CHANGELOG 3.29.0; docs/HOST-CODEX.md | Released; ordinary Codex sessions are not controller runs |
| Concurrent mixed-host review | CHANGELOG 3.47.0; docs/HOST-CODEX.md | Released; same input snapshot; controller writes sequentially; implementation is not concurrent shared-tree editing |
| Context packet budget is 64 KiB | ADR-026; scripts/lib/codex-pipeline.mjs `CONTEXT_BUDGET_BYTES` | Implemented; packets are in the external run store; hashes checked before dispatch |
| Optional independent architectural drafts | ADR-025; agents/architect.md council step | Native architect workflow; opt-in; unavailable members visible; Codex subscription cost is unknown, not zero |
| 43 commands reduced to 21, then three daily entry points | CHANGELOG 3.40.0 and 3.48.0 | Advanced commands remain; resume does not approve gates |
| Shared task identity and lease | Shared work task specification; CHANGELOG 3.48.0 | Managed operations only; no exclusion guarantee for unrelated native sessions |
| Required domain reviewers and stale/negative verdict refusals | CHANGELOG 3.30.0, 3.31.0, 3.32.0 | Gate implementations are host-specific; no universal 100% compatibility claim |
| Quotes checked against sources and role eval coverage | CHANGELOG 3.39.0 and 3.30.0 | Dataset presence is not live model validation |
| Six Codex safety guards and optional offline Docker checks | CHANGELOG 3.42.0; docs/HOST-CODEX.md | Hooks require host trust; optional Docker executor is not required for the whole product; skipped checks are not passing checks |
| 72 agents; Solidity audit and package | CHANGELOG 3.49.0 and 3.51.0 | Tool-dependent workflow; not checked is not clean; no compliance/security certification |
| Task cockpit and consistent navigation | CHANGELOG 3.59.0; ADR-028 | Released read-side projection; no PTY or second controller |
| Dual-host usage and local accounting | CHANGELOG 3.53.0, 3.54.0, 3.58.0, 3.59.0 | List-price equivalent, not subscription invoice; Claude plan data requires opt-in recorder; background scanning does not prove all stalls fixed |
| Draft PR publication | CHANGELOG 3.59.0; ADR-028 | Clean, committed, managed and verified task only; explicit approval; live GitHub acceptance remains unverified |
| Self-contained installed board runtime | CHANGELOG 3.59.1 | Gate policy no longer imports ignored CLI build; not an entirely dependency-free product |
| Selected-project Usage and English formatting | CHANGELOG 3.60.0; PR #173/#175; release QA | Released and installed; unresolved attribution excluded, existing linked worktrees only; original user content preserved |
| Read-only multi-host Skills inventory | ADR-029; PR #176; release QA | Released and installed; document-only hash; no loaded/enabled, upstream trust or task-quality inference; partial scans remain partial |
| Optional macOS Codex plugin refresh | CHANGELOG 3.61.0; HOST-CODEX.md; PR #163; updater release QA | Released and enabled locally; origin revalidated every refresh; schedule is not upgrade evidence; follows Git ref, not npm latest; no automatic gate approval or hot-load claim |
| Mixed quality gain observed as 0 pp | docs/analysis/2026-10-02-host-quality-recheck.md; merged PR #166 | Two tasks; each arm 24/24; ceiling effect; no population equivalence, reliability, full-product or cost improvement estimate |

## Feature delivery at the updated snapshot

| PR | Verified state / base | Editorial treatment |
| --- | --- | --- |
| #173 selected-project Usage | Merged / shipped 3.60.0 | Describe released project-attributed statistics and attribution limitations |
| #175 English UI formatting | Merged / shipped 3.60.0 | Released; preserve original task/document content |
| #176 Skills inventory | Merged / shipped 3.60.0 | Released read-only inventory; no enabled/loaded/upstream/quality inference |
| #167 adaptive pipeline | Open draft / main | Upcoming; do not claim released adaptive gates or budgets |
| #163 automatic Codex plugin refresh | Merged / shipped 3.61.0 | Released opt-in macOS schedule, independent of npm CLI; first refresh checked, recurring six-hour tick not yet observed |
| #143–148 canonical evidence ledger chain | Open stacked PRs | Not described as shipped architecture; existing task/run stores remain authoritative |
| #170 completion invocation evidence | Open draft / main | Do not imply all verdicts already have verified immutable invocation identity |

Some source reports retain historical pre-merge text. PR #166 is currently merged despite the report's original draft-status footer. The article uses the numerical results, not that stale footer. HOST-CODEX.md retains an older sentence about routes arriving in a subsequent package; CHANGELOG 3.47.0 establishes shipment. The article therefore avoids copying that sentence or prescribing a version-specific route command from it.

## Editorial choices

- Lead with workflow and user-visible consequences, not release count.
- Distinguish deterministic checks, model verifier, human decision and delivery.
- Avoid claiming measured speedup, cheaper delivery, 100% dual-host parity or general code-quality uplift.
- Do not repeat benchmark examples predating this month as newly measured results.
- Do not call roadmap ledger features current architecture.
- Do not imply every ordinary Codex session follows the complete pipeline.
- Keep draft-PR live-acceptance and known board latency boundaries visible.
- All screenshots supplied from real private projects are excluded.

## Illustrations for an eventual publication

Use a synthetic public demo project, not an operator's real workspace:

1. Work task cockpit: criterion, current stage, evidence and pending decision.
2. Harness: a mixed-host review wave and the resulting verifier/gate state.
3. Usage: two host panels, clearly marked sample data and price semantics.

Capture released 3.61.0 behavior for project-scoped Usage, English formatting and Skills. Label remaining adaptive development behavior unreleased and name its PR. Remove private goals, paths, repository names, account details and transcripts before publication. There are no attached images in this draft.

## Validation scope

Documentation-only change. Completed editorial checks:

- All 18 unique article source links belong to the public project; six pinned release-document paths exist in `v3.59.1`.
- All seven linked GitHub release tags have published release metadata, verified with the GitHub API.
- Frontmatter, balanced code fences, linked local article, release identifier, zero-pp benchmark wording and all five pending-feature PR links checked.
- Article contains no private project identifiers, personal workspace paths or attached operator screenshots; normal pre-push privacy scanning also remains enabled.
- `git diff --cached --check` passed.

The original editorial checks above are historical. Follow-ups verify published 3.60.0 and 3.61.0 metadata, artifact delivery and independent local readback. The new 3.61.0 updater section links released source and delivery QA; adaptive work stays explicitly unreleased. These checks do not replace release QA or add a live model benchmark. Publication on the blog remains a separately authorized action.
