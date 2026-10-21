Result: PASS

# QA: task-first admin v2

Date: 2026-10-21. Independent QA of the implementation working tree on `codex/task-first-admin-v2`, based on `4f07c99e`. This report covers the read-only shell/cockpit integration specified in [ARCH-task-first-admin-v2](../architecture/ARCH-task-first-admin-v2.md), including the final allowlisted recorded-attempt-node delta, not a complete execution-DAG controller or a released/installed artifact. Verdict quality: moderate. Source code was read-only throughout this QA run; only this report was written. The parent owns the canonical full gate, task tracking and release authority. Initial results and subsequent final-candidate executions remain separate below. See also the separate [code review](REVIEW-task-first-admin-v2.md).

## Plan from actual code

The changed surfaces are the navigation wrapper, Work cockpit, project document readers/routes, bounded diagram viewer and Outcomes projection. Preserve the existing command composer and approval endpoints; exercise their callers through existing browser scenarios rather than infer compatibility from the labels.

| Critical path | Acceptance scenario | Executed coverage |
| --- | --- | --- |
| Navigation | Given an existing bookmark, when the operator opens it, then its panel remains usable after drawer close | Both legacy agent hashes, seven aliases, five primary destinations, mouse/keyboard navigation |
| Work and Decisions | Given task evidence or a gate, when the operator inspects/decides it, then missing evidence remains Unknown and existing scoped approval checks hold | Cockpit filters/tabs/reset, publication-confirmation unit fixture, actual blocked-task actions, gate ritual and wrong-name rejection |
| Knowledge boundary | Given selected-project documents and hostile paths, when the board reads/searches them, then foreign bytes are refused | Registered/unknown project, traversal, directory/file symlinks, descriptor replacement, growing/oversized file fixtures |
| Knowledge presentation | Given an original-language document with a declared diagram, when opened, then original content survives and the diagram is not labeled runtime execution | Real HTTP server and Chromium Markdown/diagram rendering, source fallback unit cases, title/path filtering |
| Insights | Given recorded task metadata and host logs, when inspecting outcomes/consumption, then missing acceptance metrics are not invented and foreign logs are excluded | Honest outcome unit assertions and real-server Claude Code/Codex usage fixture |
| Responsive accessibility | Given light/dark theme and desktop/mobile viewport, when navigating new screens, then one active panel remains and outer horizontal overflow is at most 1px | 1440/390px × light/dark × Knowledge/Outcomes/Work; existing keyboard, sidebar and phone-layout scenarios |

Thresholds: zero failed/skipped tests; no browser page errors in the new integration test; exact selected-project fixture attribution; no fabricated acceptance/cost/DAG state. No live models or external production systems are needed. No migration files appear in the staged diff. No new mutation framework is configured in the inspected root/CLI manifests.

## Execution evidence

### Focused tests: first run failed the documentation relation gate

**Evidence**: failed

```
$ node --test packages/board/admin-shell.test.mjs packages/board/knowledge.test.mjs packages/board/work-cockpit.test.mjs packages/board/work.test.mjs packages/board/work-view.test.mjs packages/board/task-inspector.test.mjs packages/board/usage-project-api.test.mjs packages/board/usage-project-ui.test.mjs packages/board/project-scope.test.mjs packages/board/acceptance-metrics.test.mjs packages/board/design-contract.test.mjs packages/board/english-ui.test.mjs tests/lib/docs-classify.test.mjs tests/lib/doc-links.test.mjs
not ok 86 - the orphan count is frozen, and only shrinks deliberately
  location: 'tests/lib/doc-links.test.mjs:90:1'
  error: '49 orphaned documents, up from 48 of 289. A new document must reference an existing one, or be referenced by one — newest orphan(s): docs/qa-reports/REVIEW-task-first-admin-v2.md'
1..106
# tests 106
# suites 0
# pass 105
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1250.389959
```

The new review document lacked a recognized Markdown relation. The consequence was a deterministic red documentation gate, not a runtime failure. The parent added explicit architecture/report relations; no test threshold was changed by QA. The operator checkout prefix in the excerpt's location is normalized to a repository-relative path for public documentation. Raw first run: `/tmp/gcto-admin-v2-focused-qa.log`.

### Focused tests after documentation relation fix: PASS

**Evidence**: passed

```
$ node --test packages/board/admin-shell.test.mjs packages/board/knowledge.test.mjs packages/board/work-cockpit.test.mjs packages/board/work.test.mjs packages/board/work-view.test.mjs packages/board/task-inspector.test.mjs packages/board/usage-project-api.test.mjs packages/board/usage-project-ui.test.mjs packages/board/project-scope.test.mjs packages/board/acceptance-metrics.test.mjs packages/board/design-contract.test.mjs packages/board/english-ui.test.mjs tests/lib/docs-classify.test.mjs tests/lib/doc-links.test.mjs
1..106
# tests 106
# suites 0
# pass 106
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1155.945791
```

A separate `node --test tests/lib/doc-links.test.mjs` rerun also returned 5 tests, 5 pass, 0 fail, 0 skipped. Final focused raw run: `/tmp/gcto-admin-v2-focused-qa-final.log`. The initial documentation failure is resolved, not omitted from history.

### Full real-browser suite: PASS

**Evidence**: passed

```
$ node --test tests/e2e/board.e2e.test.mjs tests/e2e/admin-shell.e2e.test.mjs
ok 1 - approved admin: five destinations, real docs, Mermaid fallback, aliases and mobile themes
ok 18 - Usage shows Claude Code and Codex side by side, from their own logs
1..18
# tests 18
# suites 0
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 43509.666792
```

These are all two files under `tests/e2e`. The suite started real isolated board servers and Chromium; no Playwright/server-unavailable skip occurred. The new test preserved Russian document text, rendered the bounded diagram subset, rejected an unknown project with 404, opened both old agent drawer links and closed them without losing the active panel. It checked 12 route/theme/width combinations. Existing scenarios exercised actual gate/blocked-task controls and both hosts' fixture session logs. Raw run: `/tmp/gcto-admin-v2-browser-qa.log`.

### Final recorded-attempt delta: fresh focused and browser proof

After the implementer added allowlisted historical attempt nodes and restricted the diagram renderer to LR, QA reran the affected tests and all focused/browser checks. Historical controller status remains distinct from present verification or acceptance.

**Evidence**: passed

```
$ node --test packages/board/work.test.mjs packages/board/work-view.test.mjs packages/board/work-cockpit.test.mjs packages/board/admin-shell.test.mjs
1..31
# tests 31
# suites 0
# pass 31
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 539.939

$ node --test packages/board/admin-shell.test.mjs packages/board/knowledge.test.mjs packages/board/work-cockpit.test.mjs packages/board/work.test.mjs packages/board/work-view.test.mjs packages/board/task-inspector.test.mjs packages/board/usage-project-api.test.mjs packages/board/usage-project-ui.test.mjs packages/board/project-scope.test.mjs packages/board/acceptance-metrics.test.mjs packages/board/design-contract.test.mjs packages/board/english-ui.test.mjs tests/lib/docs-classify.test.mjs tests/lib/doc-links.test.mjs
1..110
# tests 110
# suites 0
# pass 110
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1333.937083

$ node --test tests/e2e/board.e2e.test.mjs tests/e2e/admin-shell.e2e.test.mjs
1..18
# tests 18
# suites 0
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 44837.520667
```

Four new focused tests account for 106 → 110; this is a test-count delta, not line/branch coverage. Raw runs are `/tmp/gcto-admin-v2-final-attempt-qa.log`, `/tmp/gcto-admin-v2-final-focused-qa.log` and `/tmp/gcto-admin-v2-final-browser-qa.log`.

An additional ephemeral fixture used `buildFixture`, a registered isolated project/HOME, a real version-1 controlled-run store containing two different attempt IDs, the real `/api/work` response, and Chromium clicks on the run then Execution tab. Assertions verified two separate displayed nodes, stable run/attempt identity, host labels, escaped hostile role text, no private context and explicit limits on status/topology. A browser-rendered native-Claude/no-linked-run snapshot exercised the unknown fallback. The diagram check rejected TD instead of drawing it with misleading LR orientation.

**Evidence**: passed

```
$ node --input-type=module
{"result":"PASS","source":"real server /api/work and Chromium","recordedNodes":2,"stableAttemptIds":["first-attempt","second-attempt"],"runIdVisible":true,"hostBadges":["codex","claude-code"],"escapedLabel":true,"privateFieldAbsent":true,"verificationNotInferred":true,"dependencies":"unknown","nativeClaudeFallback":"unknown","TD":"unsupported","browserErrors":0}

$ shasum -a 256 packages/board/lib/work.mjs packages/board/public/assets/work-view.js packages/board/public/assets/diagram-view.js packages/board/public/assets/admin-shell.js
fb4a086aa830c4213ec3f65105efe55e842513702ee45f561d9bd4dc990df5dd  packages/board/lib/work.mjs
6d0cebe0b2084c45e7d764ba1cff54febc392d66997749b52829dde5b6f25ca3  packages/board/public/assets/work-view.js
6a40f74b976fd985ff553c89d2b2f96acec0b3e9a4792c03d79a5a31ab9e320b  packages/board/public/assets/diagram-view.js
87e85fe5acce5f02b38d879d9fa5944bc739bd3248c559b5cd0d95eec6beb6db  packages/board/public/assets/admin-shell.js
```

## Requirements traceability

| Requirement | Status | Evidence / boundary |
| --- | --- | --- |
| REQ-1 | COVERED | Five primary destinations, alias mappings and both legacy agent detail URLs; browser refresh/direct-entry exercised, enhanced back-stack behavior is not claimed |
| REQ-2 | COVERED | Work view/cockpit tests plus real-browser evidence and gate scenarios retain Unknown and exact confirmation guards |
| REQ-3 | COVERED | 13 Knowledge tests exercise listing/read/search project and filesystem boundaries; real browser reads the selected fixture |
| REQ-4 | COVERED | Bounded LR renderer and real browser show historical attempt nodes with stable identities; dependencies/topology remain explicitly unknown |
| REQ-5 | COVERED | Outcome entity unit assertions and project-scoped host-log browser scenario; no acceptance-rate or cost-per-accepted-task estimate is supplied |
| REQ-6 | COVERED | English UI regression, Russian browser locale/original-content scenario, keyboard/sidebar/mobile and new theme matrix |
| REQ-7 | PARTIAL / parent-owned | This report supplies independent focused/browser evidence. Canonical full gate and independent code review must be validated separately before delivery |

Six functional requirements covered; one delivery-process requirement remains outside this scoped run. There are six acceptance scenarios in this report mapped to automated tests; no separate Gherkin file was created under the report-only ownership restriction.

## Limits and unmeasured gates

- This is not pixel-parity acceptance against every approved prototype screen. Settings/Decisions/Consumption reuse existing panels; the shell/cockpit integration is additive.
- Execution shows recorded stages/events and up to 200 allowlisted historical attempt nodes with explicit missing dependency topology. Native Claude records without an explicitly linked controlled run remain unknown. This is not a complete DAG, workflow editor, audited retry/resume service or new host controller.
- Mermaid support is a bounded LR flowchart subset; TD/TB and other unsupported syntax remain source rather than an incorrectly oriented drawing. Complete Mermaid syntax and diagram zoom/fullscreen are not certified by these tests.
- Knowledge title/path filtering is exercised. Full-text search remains an API capability, not a newly demonstrated UI search workflow. Related-task/source-revision features require explicit source evidence; unrecorded values remain unknown.
- New Knowledge/Outcomes asynchronous generation checks were inspected; the focused Work/Usage suites execute reset/cross-project races. A new real-browser delayed-response race covering Knowledge and Outcomes was not run.
- Coverage percentage and delta: not measured. Mutation: not configured. No claim of quality improvement, token savings or matched-host benchmark results.
- Performance baseline/delta and aggregate-byte responsiveness: not measured. Browser-suite duration is test runtime, not p95 UI latency.
- Migration safety: N/A, no migration files in staged candidate. Rollback dry-run, security-officer sign-off, installed artifact check and production verification: not run in this report-only scope.
- No local admin restart, plugin install, merge, release or deployment occurred. Product delivery remains unverified until checked against the actual published/installed artifact.

## Current verdict

PASS for the final tested read-only slice after the documentation relation fix and recorded-attempt delta: focused 110/110, full browser 18/18, affected attempt/diagram tests 31/31, zero skips in each. The separate real-server/Chromium attempt fixture also passed with zero page errors. No unresolved failure remains in these executions. The parent must validate the canonical full gate and separate review/security requirements on the final candidate. Do not promote this scoped result into full-product/DAG, release or installed-artifact acceptance.
