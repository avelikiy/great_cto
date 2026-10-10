# Monthly blog draft: editorial evidence

Date: 2026-10-10. Scope: 2026-09-10 through 2026-10-10.

Article: [Russian draft](../blog/DRAFT-2026-10-10-monthly-product-update-ru.md).
This file is an editorial fact sheet, not part of the public article and not a task tracker.

## Snapshot

- Inspected main: `97dd037c91ce1e740bef500b0952e6dce28a8445`.
- Published package: `npm view great-cto@latest version --json` returned `3.59.1`.
- GitHub release: `v3.59.1`, published `2026-10-09T16:17:26Z`.
- Release Git object: `22627b8d4764406370af7fa7901f9a8d87d22048`.
- September 10 changelog version: `3.28.4`; baseline commit `66da3465`.
- Article links to released documents use `v3.59.1`, not moving main.
- GitHub PR states were checked with `gh pr list` and benchmark merge with `gh pr view 166`.
- Drafting does not install, update, merge, publish or deploy a product.

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
| Mixed quality gain observed as 0 pp | docs/analysis/2026-10-02-host-quality-recheck.md; merged PR #166 | Two tasks; each arm 24/24; ceiling effect; no population equivalence, reliability, full-product or cost improvement estimate |

## Not released at the snapshot

| PR | Verified state / base | Editorial treatment |
| --- | --- | --- |
| #173 selected-project Usage | Open draft / main | Explicit upcoming review item; do not label current Usage project-isolated |
| #175 English UI formatting | Open draft / codex/project-scoped-usage | Upcoming; preserve original task/document content |
| #176 Skills inventory | Open draft / codex/board-english-ui | Upcoming read-only inventory; no enabled/loaded/upstream/quality inference |
| #167 adaptive pipeline | Open draft / main | Upcoming; do not claim released adaptive gates or budgets |
| #163 automatic Codex plugin refresh | Open / main | Upcoming; released Codex plugin update remains explicit |
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

Capture only the released behavior for the main article. If showing project-scoped Usage, English formatting or Skills from a development branch, label the image unreleased and name its PR. Remove private goals, paths, repository names, account details and transcripts before publication. There are no attached images in this draft.

## Validation scope

Documentation-only change. Completed editorial checks:

- All 18 unique article source links belong to the public project; six pinned release-document paths exist in `v3.59.1`.
- All seven linked GitHub release tags have published release metadata, verified with the GitHub API.
- Frontmatter, balanced code fences, linked local article, release identifier, zero-pp benchmark wording and all five pending-feature PR links checked.
- Article contains no private project identifiers, personal workspace paths or attached operator screenshots; normal pre-push privacy scanning also remains enabled.
- `git diff --cached --check` passed.

Do not represent these editorial checks as a fresh application build, model benchmark, UI deployment or installed-plugin acceptance run. Publication on the blog remains a separately authorized action.
