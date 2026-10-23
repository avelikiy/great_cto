# Monthly blog draft: editorial evidence

Date: 2026-10-10. Updated: 2026-10-15. Scope: 2026-09-10 through 2026-10-10, with dated delivery addenda through 3.63.5.

Article: [Russian draft](../blog/DRAFT-2026-10-10-monthly-product-update-ru.md).
This file is an editorial fact sheet, not part of the public article and not a task tracker.

[October deployment follow-up](../qa-reports/QA-2026-10-10-october-deployment.md)
records installation evidence and the remaining candidate gates.

## Current delivery snapshot: 3.63.5, October 15 addendum

- PR191 merged normally as `c28b24f65e433b321a0db23af1d9ba9e8fad30f7`; merge tree matches independently approved `88ff4bcca00d93bb6dd837b8e4ef0dc39a1be473`. Critical/High/Medium findings: none. Public role names and bytes, exclusion/refusal fixtures and actual archive Usage ownership were independently checked. PR186 cache selection and its test-only hover admission change are included.
- Release commit/tag target `26504e20c8d38309632ddabf460393415c833b36`; annotated tag object `511351499a3d605e857cf64f8be4d1bd934d1118`. Commit/tag author and authenticated GitHub release author are avelikiy; GitHub Release is non-draft/non-prerelease, published `2026-10-15T19:16:26Z`. Automatic pre-tag identity refusal is not implemented by this release.
- Canonical serial R2 at `3efec20d`: root1435, libraries3422, eval242, docs76, browser16, CLI375, archetypes34, pipeline36 passed;6library+9pipeline checks NOT CHECKED. Final QA/resolver-comment delta changed no executable body and was included in independent approval. Counts overlap across suites. R1 fixture missing-PID cause remains Unknown; no deadline or orphan cap was weakened.
- Exact3.63.5 package checks: TypeScript/CLI375 passed,0skip; release/documentation checks104 passed,1explicit live-Docker skip. The first archive-browser harness invocation selected the wrong nested server path and skipped all16cases; that diagnostic was rejected. Corrected harness ran all16against extracted archive server,16passed,0skip. No server rebuild occurred during that run.
- Registry archive downloaded from npm with a cache-busting query after initial canonical-URL404responses; bytes equal tested tarball. SHA256 `e6762d9b807666b856575b8769832d0a4bb657adda809c6defa0b3647d0f91ec`,260files including72public roles. Fresh registry consumer/controller smoke passed12construction cases and8refusals. No OIDC attestation, native provider execution or benchmark eligibility is claimed.
- Active Claude marketplace registration, disabled local Claude alias and installed/enabled Codex plugin report3.63.5; enabled flags preserved. Codex Git clone timed out twice at30seconds. Successful native marketplace refresh used command-scoped Git URL rewriting to the clean, exact release checkout as local transport, not a persistent source change. Configured marketplace source remains GitHub main. No claim that existing host sessions hot-loaded the update.
- Operator board restarted from published3.63.5 CLI, selecting installed marketplace3.63.5 server. HTTP readback running=installed=3.63.5, stale=no. Read-only browser Harness and Usage succeeded; rendered project cells matched each selected project, no fallback banner or console errors. After all full gates completed, sustained probe passed900072ms:16samples,48HTTPrequests across version/projects/tasks, same PID, no timeout/non200/degraded Tasks; maximum observed endpoint response15ms. This is one installed local instance, not cause analysis of earlier disappearances, which remain Unknown. Ordinary `npm exec --ignore-scripts --package=great-cto@3.63.5 -- great-cto --version` also returned3.63.5.
- Announce Release run38792543151 failed before execution: GitHub annotation states the account is locked due to billing. Do not describe this announcement or disabled npm/JSR workflows as successful; npm publication was manual. No paid/native paired benchmark or default domain activation occurred.

## Historical delivery snapshot: 3.63.4, October 14 addendum

- Published main/tag source `454c62106c1b373d1a5a2bf9c7b34bdc76f633c5`; PR185 merged as `5cbb86e1b1319ec810e2c61f8899b154fbeb56f1`. Fresh GitHub API read confirms v3.63.4 is a published, non-draft, non-prerelease release at 2026-10-14T17:45:40Z. PR184 and PR185 are MERGED. PR181 is MERGED; PR182 is CLOSED without a merge commit, so do not attribute delivery to a PR182 merge.
- Published changelog pins review evidence/task panel to3.63.0, invocation completion to3.63.1, non-project hook state refusal to3.63.2, candidate domain packs to3.63.3 and explicit shared-controller admission to3.63.4. Sources are tagged ADR030, ADR032, ADR033 and the tagged domain QA history. Packs0.1.0 are candidates, not executed product tests or certification; no private overlay content is published.
- Reviewed executable candidate4c8c0ef5 passed canonical --e2e --serial: root1435, libraries3416, eval242, docs76, browser16, CLI369, archetypes34; fifteen NOT CHECKED remain. Repeat independent approval ran64 focused checks with no skips. Earlier default-mode failures are retained, not retrospectively classified as green or fully explained by load.
- Downloaded npm3.63.4 tarball SHA256 `8e76779bdc2ba0bb28105286ca696e61a248c97e5a217c86fac1ebbd2acdc1fd`;188 entries; extracted registry smoke12 construction cases and8 refusals. Manual npm publication, no OIDC provenance claim. Native provider calls were not part of this smoke.
- Actual Codex installed/enabled inventory and both local/active Claude registrations reported3.63.4. Board HTTP version=installed=3.63.4, stale=no. Browser Harness and project-only Usage render successfully. This is a fresh scoped runtime check, not a new20-minute sustained probe, zero historical hook failures, hot-loading into existing sessions or quality uplift.
- After release, mixed-marketplace lookup could choose an old board despite a newer installed cache. PR186 merged as `7f9febd8cebdd693e6e66b045f0de9c4a68ab653` after green canonical R3 and independent APPROVE of final head `1d9077d2841cbf22bc11ba9fd77dd6bac451dce0`. Its code is not in published3.63.4. The subsequent3.63.5 release candidate was not tagged or published: actual autonomous tarball browser validation found a distinct missing-data packaging failure. Fresh npm and board HTTP still report3.63.4; local plugins were not changed by this attempted release.
- Unpublished3.63.5 archive SHA256 `b1dc0505262ac5b13f273cfb2171bbee3eecb824cab41567160837a2e4d56e91`,188 files. Fresh TypeScript/CLI375 and documentation/runtime/package contracts100 passed with zero skips. Isolated consumer/controller smoke passed12 construction cases and8 refusals. Full browser tests ran the extracted archive server, not rebuilt source:15 passed,1 failed,0 skipped. Usage failed the `senior-dev great_cto` ownership assertion because `boardAgentNames()` reads relative `agents/`, absent from the bundled runtime. Module import closure alone does not verify data dependencies. The release is blocked pending a separate packaging fix and its gates/review. No provider benchmark or default domain activation occurred.
- No native paired domain benchmark was launched. Both baseline and pack arms still require executable frozen holdouts, independent scorer, verified isolation, explicit launch and measured shared-budget compliance. Doctor availability is not trial evidence. Missing cost/time/token values remain unknown.

## Historical delivery snapshot: 3.62.2, October 11 addendum

- PR #180 merged normally as `abd3e35559be56395e2b5e76ac8f60b1e3495388`, tree identical to independently reviewed `16bc030c`. Release metadata commit `bfeafd0226795ae420559a98d19c88bfcbc947af`; [GitHub release](https://github.com/avelikiy/great_cto/releases/tag/v3.62.2) published 2026-10-11T12:06:01Z.
- Canonical gate passed with 15 NOT CHECKED; independent re-review passed nine targeted checks, all three P2 findings mitigated, Snyk SUCCESS. Counts and evidence are in [receipt release QA](../qa-reports/QA-2026-10-11-board-receipt-release.md).
- npm registry archive matches tested bytes: SHA256 `54628706f267b100e8ee774b20295314a42e5b764c3237a232525d0b9cd447b2`, 184 files. Fresh registry consumer passed four actual HTTP, 15 worker/SSE and one cold HTTP check, without failures or skips.
- Native plugin inventories and local CLI report 3.62.2. The board runs from the active installed marketplace artifact on loopback, running=installed and stale=no. Sustained verification completed PASS: 1200 seconds, 25 samples, 125 concurrent-sample requests, no restarts/timeouts/degraded task responses; lighter endpoint maximum 1057 ms, Tasks maximum 428 ms. A separate receipt read returned HTTP 200 in 1478 ms. This is one-instance local health, not universal compatibility or model quality.
- Selected-project Usage and Harness were checked in the browser. Missing attributable Codex history is not proof of no Codex activity, and host detection is not proof of a cross-model review.
- Release announcement run [38137991843](https://github.com/avelikiy/great_cto/actions/runs/38137991843) could not start because of the GitHub billing lock. Public article publication remains separate.

## Historical delivery snapshot: 3.62.1

- PR #178 and #179 merged through normal gates and independent exact-head review. Release commit `d8cc2f95ba1d2f209a0d8956acaf030872be32ce`; [GitHub release](https://github.com/avelikiy/great_cto/releases/tag/v3.62.1) published 2026-10-11T10:57:47Z.
- npm registry archive matches the tested archive: SHA256 `7b6f394d81f323dd0500bf4ff7d067d3a752d665f229a198dd112e90b8a292d6`. Both host plugin inventories and local CLI independently report 3.62.1. Existing host sessions require restart; installation is not hot-loading proof.
- Canonical reviewed candidate passed with 15 NOTCHECKED. Packaged worker/SSE checks passed 15 cases and isolated cold HTTP passed one case. These do not establish sustained operator runtime health.
- Actual operator sustained probe failed on its first sample: Inbox timed out at 3 seconds, then version timed out at 3 seconds. The owned board was stopped. No successful 20-minute run is claimed.
- Exact installed receipt reproduction completed 571 synchronous Git calls in 20 seconds without finishing. An isolated optimized receipt took 655 ms on the same tree. This is a diagnosis and focused measurement, not a published latency guarantee or a quality benchmark.
- [PR #180](https://github.com/avelikiy/great_cto/pull/180) is a separate unreleased candidate. Its source verification, review and rollout must not inherit #178/#179 approval.
- Release announcement workflow could not start because GitHub reported an account billing lock. npm/GitHub distribution succeeded; automatic announcement did not.
- Details: [October 11 release and runtime QA](../qa-reports/QA-2026-10-11-board-release.md).

## Historical delivery snapshot: 3.62.0

- PR #167 merged at ddb55ae3f1f7ff3bb6708e4f2eccf50f231f4018; its tree is identical to reviewed head351cab93. Release commit08a95f4b2e79f690d145730f9a38dfba08920975 changes synchronized versions, release notes and five synthetic screenshots, not application runtime.
- GitHub Release v3.62.0 published2026-10-10T18:14:40Z. Normal main/tag pushes completed with privacy and existing security checks; no new public-term exception or baseline entry.
- Exact8542e41e canonical gate exited0: root1360, libraries3320pass6skip, eval242, docs76, browser14, CLI369, archetypes34, candidate36pass9skip. Counts overlap. Complete log SHA25699972f581bcf4ef90935491b506fce2fd4c09ed7a565b0919df5ce0553ecc44f. Independent approval is experimental-only, not production or live quality certification.
- Release build and112focused package/version/documentation checks passed0fail0skip; fresh five synthetic screenshots and screenshot freshness passed. Archive178files, SHA2566b108f2d868a17c114ba3d523d791d137fa627bf52d7008bbbf3f97809e4f159; pinned extracted CLI/controller construction smoke passed12cases/8refusals, zero dispatch or approvals, providerCalls=null, benchmarkEligible=false.
- npm publish returned+great-cto@3.62.0 with a processing notice. Initial exact-version registry requests returned404, then fresh metadata returned3.62.0 and latest3.62.0. Registry archive SHA256 and integrity match the tested archive. A fresh isolated consumer installation with lifecycle scripts disabled reports3.62.0; downloaded-archive CLI/controller smoke passed12cases/8refusals and178-file inventory.
- Actual isolated consumer board servedHTTP200 for version,HTML andprojects. Beads is a fixed empty synthetic adapter and discovery/state scopes are private; this proves standalone delivered runtime, not operator-board latency, real model execution or Beads performance.
- Both Claude user registrations and installed/enabled Codex plugin independently report3.62.0. User-prefix CLI is3.62.0, installed from the tested archive with lifecycle scripts disabled. Prior3.61CLI archive and plugin caches retained. Existing sessions need restart/hook review; no hot-loading claim.
- No board listener was present before the scoped start. InstalledCLI board ensure started it; actual /api/version returnedHTTP200 with version=installed=3.62.0, stale=no in1.148s. Subsequent HTML probe timed out at5s with zero bytes. P1 great_cto-932g.7 remains open; no healthy sustained UI or fixed latency claim.
- Later probes recovered without another restart: versionHTTP2001.231ms andHTMLHTTP2003.342ms. This is current availability, not sustained health, exclusive startup-cause diagnosis or permanent Beads latency repair.

## Historical delivery snapshot: 3.61.0

- Published package: fresh registry queries returned latest=3.61.0 and exact-version integrity matching the tested archive.
- Release/tag source: `11e8774a1f1ac31cad3284d3b2835e0b1e6dacd8`; GitHub release published at 2026-10-10T14:02:45Z.
- PR #163 merged at `cf12f95c583a00fd483086748044cd922cb86f61`; tested candidate and merge trees are identical. Version-bump application directories remained unchanged.
- Fresh registry consumer verified CLI version, standalone inventory, document hash and manifest. The downloaded archive is byte-identical to the tested local archive. Details: [updater release QA](../qa-reports/QA-2026-10-10-updater-release.md).
- Both Claude registrations, enabled Codex plugin and user-prefix CLI report 3.61.0. Repeated board readback returned version=installed=3.61.0, stale=no. New sessions/hook trust remain distinct from artifact installation.
- New launchd helper's first run ended with exit 0, updated marketplace and no errors. Six-hour recurring execution is not yet observed; installer also refreshed Codex, so exclusive version-transition attribution is not established.
- Migration from an already-loaded legacy job with no plist required exact-label local repair. That edge is a tracked bug, not silently represented as shipped automatic repair.
- Later live board probes timed out at 5s/10s for version and 3s for HTML. Exact-board restart restored initial48.6ms/5ms responses, but the replacement stalled again after about17minutes. A private preload on the second restart identifies inboxElsewhere -> getInbox -> getTasks -> bdList -> spawnSync, one actual call19379.18ms. This proves one blocking request path, not the exclusive cause of previous indefinite stalls; installed source is unchanged. P1 great_cto-932g.7 remains open; no permanent latency fix is claimed.
- PR #167 is not released. Prior canonical272b6a4a gate exited1; that red evidence is retained. Complete c33ae765 gate exited0 with libraries3300pass0fail6skip, candidate pipeline36pass0fail9skip, root/hooks/board1360pass0skip, eval242/docs76/browser14/CLI369/archetypes34 all passing. Canonical verdict was GREEN WITH15SKIPPED, not full paid-model/production readiness. Actual candidate MCP/SSE,HMAC401/200,11BoardAPIs and isolated realBeads lifecycle ran. Complete log SHA25608b3ccf79113a73206e107485bfab5ae9021b227a31b94b74891688ada8898d7. Existing assertions/deadlines remain, the complete source inventory is retained. Independent c33 review returned REQUEST_CHANGES for one P1 Git helper execution boundary. The exact735554b98021681ce54f38641c0fb5ede5c8cce4 fix passed84focused author tests0fail0skip and an independent read-only delta review APPROVED it after actual ephemeral Git probes. Its fresh full canonical replay is pending; an interrupted prior735 attempt has no verdict. Fresh Snyk on735 is SUCCESS. No inherited canonical approval, adaptive merge or release is claimed.

## Historical adaptive follow-up

Adaptive follow-up: complete canonical735 replay exited1 with a single orphan
document failure, libraries3316pass1fail6skip. Other suites: root1360,
eval242,docs76,browser14,CLI369,archetypes34,candidate36pass9skip. Red log
SHA2562ec7f61b4964832ef031abbc2a13d46942cbd979a1b4738c19ce2520b2a50c0f
is retained, not replaced by focused green. The docs-only1babcab2 integrates
main16d and connects both QA reports to existing contracts; frozen count48
unchanged. Focused81pass0fail0skip. Application delta excluding QA files is
zero against independently approved735. Complete canonical1b replay exited1:
libraries3314pass3fail6skip; root1360,eval242,docs76,browser14,CLI369,
archetypes34 all passed; candidate36pass0fail9skip. Full log SHA256
4eac057aa8bea5fbbe0bc6215435fe788acee1fd97ff6600e3690d5e8b647e32.
Reds: raw owner-kill457, helper scorer-kill557 and helper-kill558, all captured
tree closure before fallback. Six raw-owner diagnostic repetitions each passed1,
two helper crash cases passed2 and paired lifecycle files passed30/0fail/0skip.
No diagnostic pass replaces canonical red or identifies original surviving PIDs.
Independent delivery verdict REQUEST_CHANGES: raw/scorer abrupt-death teardown
is unimplemented, ADR028 Proposed; helper-kill has implemented disconnect/finally
unwind and must keep its strict assertion. Author added bounded pre-fallback
failure metadata in two test files only, preserving deadlines/closure assertions
and explicitly asserting no completed result after owner SIGKILL. No runtime
repair, weakened gate or new full-source approval is claimed. Fresh Snyk on1b
is SUCCESS. No167merge/release claim.

Post-instrumentation diagnostic tests/lib inventory at 9eed8808 completed with
3297 passed, 0 failed, 6 skipped; scripts/lib separately passed 20 without failures
or skips. This is not a new canonical gate. The three target cases passed,
failure metadata did not fire, and the original surviving process/cause is Unknown.
Logs SHA2568e38479be9dfa2e7879ada4c54c6b9b4df33b24cf42ecab0c616551ecffc59e4
and6059346b234066fa624403e9d127d318059aeba10fe567f28844598cf3a6c6bb.
A private real-Node/synthetic-scratch negative measured one surviving child after
actual parent SIGKILL, sampler liveProcesses=1, false authority flags and a fixed
private caller fault/PRESERVED instead of quiescent. This is not Chromium,
production automatic refusal, cleanup admission or a committed regression;
it does not clear canonical failures. Log SHA-256:
0b5894a947708e3969e4fa689781b2921827b8a7d94215e9e9fe63d7acf8487f.

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
| #167 adaptive pipeline | Merged / shipped3.62.0 GitHub and npm; installed locally | Experimental opt-in; preserved mandatory floors and shared local budgets; 15not checked; no production guardian/cleanup guarantee |
| #163 automatic Codex plugin refresh | Merged / shipped 3.61.0 | Released opt-in macOS schedule, independent of npm CLI; first refresh checked, recurring six-hour tick not yet observed |
| #143–148 canonical evidence ledger chain | State not refreshed in this addendum | Not described as shipped canonical ledger; read-only task evidence does not replace task/run stores |
| #170 completion invocation evidence | Fresh GitHub API: MERGED; shipped3.63.1 | Host IDs bind concurrent same-role invocation; missing IDs retain explicitly unverified isolation |
| #181 review evidence/task panel | Fresh GitHub API: MERGED; shipped3.63.0 | Exact input binding, normalized verdict and read-only recorded/unknown task evidence, not new approvals |
| #184 domain pack foundation | Fresh GitHub API: MERGED; shipped3.63.3 | Five explicit-only0.1.0 candidate packs; no native model quality result |
| #185 shared domain admission | Fresh GitHub API: MERGED; shipped3.63.4 | Explicit policy, fresh drift/expiry checks and data-only packets; permissions and gates unchanged |
| #186 board cache selection | MERGED after gate and independent APPROVE; shipped3.63.5 | Available complete-cache selection; initial failed npm candidate retained as history |
| #191 autonomous board role data | MERGED after canonical R2 and independent APPROVE; shipped3.63.5 | Exact public role file closure and unknown-prefix refusal; archive browser16/16, no host-loading claim |

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

Capture released3.63.5 behavior using synthetic fixtures. Label adaptive/domain behavior experimental opt-in and do not imply paid-model execution or production cleanup guarantees. Remove private goals, paths, repository names, account details and transcripts before publication. There are no attached images in this draft.

## Validation scope

Documentation-only change. Completed editorial checks:

- All 18 unique article source links belong to the public project; six pinned release-document paths exist in `v3.59.1`.
- All seven linked GitHub release tags have published release metadata, verified with the GitHub API.
- Frontmatter, balanced code fences, linked local article, release identifier, zero-pp benchmark wording and all five pending-feature PR links checked.
- Article contains no private project identifiers, personal workspace paths or attached operator screenshots; normal pre-push privacy scanning also remains enabled.
- `git diff --cached --check` passed.

The original editorial checks above are historical. Follow-ups verify published3.60/3.61metadata and3.62GitHub/npm metadata, downloaded archive identity, fresh isolated consumer and scoped installation. The dated3.62.2 snapshot includes its20-minute sustained probe; that is not a sustained measurement of3.63.4. October14 adds exact release/tag sources, downloaded registry identity, installed plugin inventories and scoped browser/runtime readback. These checks do not replace release QA or add a live model benchmark. Publication on the blog remains a separately authorized action.

October14 editorial validation: docs suite76/76 passed without failures or skips;
artifact-lint --enforce found no structural errors (one preexisting undated brief
warning). Five unique v3.63.4 article source paths exist in that exact tag.
Frontmatter version/date, code fence balance, NOT CHECKED and no-domain-benchmark
wording were checked. Fresh GitHub API reads verified release metadata and
PR170/181/184/185 MERGED; PR182 CLOSED without merge. No operator screenshots or
private overlay content were added. This is documentation validation, not a
new full runtime gate or blog publication.

October15 delivery addendum separates published3.63.5 from the earlier failed
candidate, retains exact package/source hashes and explicitly excludes native
benchmark/quality claims. Editorial checks:76documentation tests passed,0skips;
artifact lint has0structural errors and1preexisting freshness warning.
Frontmatter/version/date, balanced fences, absence of personal workspace paths,
NOT CHECKED/no-native-benchmark wording and the new tagged QA source were verified.
No operator screenshot, private overlay or raw local statistics were added.

VERDICT: DONE — Draft refreshed through published and locally verified3.63.5; historical failed candidates and Unknown boundaries retained. Blog publication remains separate.
