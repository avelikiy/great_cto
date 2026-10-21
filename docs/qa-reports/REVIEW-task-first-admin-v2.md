# Independent review: task-first admin v2

Incremental final re-review from the earlier working-tree assessment on base `4f07c99e`: reviewed the new execution-attempt projection and renderer changes after verifying the previously reported fixes. Large overall change: the initial size helper reported 245 reviewable lines in four tracked files, but did not count the then-untracked implementation, architecture and test files. The actual review includes those files; the initial helper result is not the total review scope. Heaviest additions are the document-boundary tests and architecture contract. The additive, read-only integration is a reasonable slice; it is not a complete graph controller or a completed visual rewrite of every screen.

Date: 2026-10-21. Reviewer: independent code-reviewer. Branch: `codex/task-first-admin-v2`. Base: `4f07c99e`. Reviewed working-tree edits, including focused fixes made after the initial finding. Source code, remote state and installed board were not changed by the reviewer. Only this report and the Beads finding were written.

## Verdict

**APPROVED for the scoped code-review stage after the reproduced P1 was fixed.** No unresolved P0/P1 found in the reviewed code. This is not full-gate, merge, release, installation or deployment approval. The parent owns the canonical gate and complete browser acceptance.

| Severity | Initially found | Unresolved blocking |
| --- | ---: | ---: |
| P0 | 0 | 0 |
| P1 | 1 | 0 |
| P2 | 2 | 0 in the inspected fixes |

## Findings

### [P1] Legacy agent deep link cleared the active content panel

- **Location**: `packages/board/public/assets/admin-shell.js:92` (fixed wrapper); original unconditional initial routing was line 108 before the fix.
- **Problem**: Initial `#agents/architect` was passed to the legacy switcher as a panel name. The switcher removed every active panel and selected a nonexistent panel. Fleet preload later opened the agent drawer, but closing it left a blank workspace.
- **Evidence**: passed
  ```
  $ node --input-type=module
  {"hash":"#agents/architect","activePanels":[],"drawerOpen":true}
  after closing drawer: {"activePanels":[],"hash":""}
  ```
  The initial fixture run loaded the real board server using `buildFixture`, opened the deep link with Playwright, inspected `.panel.active`, then called `closeAgentDrawer()`. After the implementer's fix, the identical direct-link scenario returned:
  ```
  $ node --input-type=module
  {"hash":"#agents/architect","activePanels":["panel-agents"],"drawerOpen":true}
  after closing drawer: {"activePanels":["panel-agents"],"hash":""}
  {"hash":"#agents/architect","activePanels":["panel-agents"],"drawerOpen":true}
  after closing drawer: {"activePanels":["panel-agents"],"hash":""}
  ```
  The final two-case rerun loaded `#agents/architect` and `#/fleet/architect` independently; the latter is normalized to the canonical agent drawer hash. Both retained the Executors panel after close.
- **Why it matters**: Existing bookmarked agent links could leave the operator without a working content screen after inspecting an agent.
- **Recommended fix**: Resolve the agent URL to the Executors base panel before preserving its drawer identity; retain the regression in the browser suite.
- **Status**: Fixed. Beads: `great_cto-r9fo`. Reviewer independently verified both legacy direct-link forms after the final fix. The earlier intermediate `#/fleet/<slug>` failure is superseded by this final successful rerun, not hidden as an initial pass.

### [P2] Knowledge index hid unreadable and truncated state

- **Location**: `packages/board/public/assets/admin-shell.js:48` through `:50`; `packages/board/lib/docs.mjs:472`.
- **Problem**: The original renderer ignored index state, truncation and per-document `readState`, and looked for a nonexistent aggregate `unreadable` field. Oversized files looked like ordinary readable entries; an unreadable index could look empty.
- **Evidence**: passed
  ```
  $ node --input-type=module
  {"total":1,"truncated":false,"state":null,"unreadable":null,"entry":[{"title":"large","readState":"too-large"}]}
  missing root: {"total":0,"truncated":false,"groups":[],"state":"unreadable"}
  ```
  Inspection of the focused fix shows explicit unreadable-index rejection, a truncation label and unreadable/oversized entry labels. An index-request generation also prevents older same-project index responses from replacing newer requests.
- **Why it matters**: Missing observations must not appear to be a complete project inventory or an empty project.
- **Recommended fix**: Consume the actual fields and retain fixtures for unreadable, oversized and truncated results.
- **Status**: Fixed in inspected source; complete browser coverage remains the parent's gate.

### [P2] Public operator docs described the old navigation

- **Location**: `docs/DETAILS.md:62`; `docs/COMMANDS.md:158`; changed shell route table `packages/board/public/assets/admin-shell.js:5`.
- **Problem**: Public operator documentation still directed users to the removed Tools navigation, contradicting the five-section shell (paraphrase). Historical design artifacts are not treated as current operator docs.
- **Evidence**: passed
  ```
  $ git diff -- docs/DETAILS.md docs/COMMANDS.md
  -The board's **Usage** screen (Tools → Usage) shows Claude Code and Codex side by
  +The board's **Insights → Consumption** screen shows Claude Code and Codex side by
  ```
  The same diff updates the `/board` entry to Work, Decisions, Knowledge, Insights and Settings, and states the Mermaid/source and acceptance limitations.
- **Why it matters**: Operators otherwise receive two incompatible navigation descriptions.
- **Recommended fix**: Update current public usage instructions; preserve historical proposal documents as history.
- **Status**: Fixed.

## What the change does well

- Canonical project resolution now covers all three document endpoints. Descriptor validation, non-following opens, bounded buffers, inode checks and symlink tests materially improve the previous lexical containment boundary.
- Markdown uses the existing DOMPurify path; the new bounded diagram subset escapes labels and refuses active directives, oversized input and cyclic unsupported graphs. Unknown syntax remains readable source.
- Work keeps host-controller command semantics. Publication preview and confirmation controls remain in the selected Overview, retain revision binding and do not gain merge/release/deploy authority.
- Outcomes explicitly excludes standalone runs/closed issues from tracked tasks and refuses to invent acceptance rate or cost per accepted task from role verdicts.
- Project generations protect the new document/outcome reads against cross-project late responses.

## Supported scope and limitations

Implemented: five primary destinations, real task selection/filtering and three detail tabs, project document index/read/title filtering, narrow static flowchart rendering with source fallback, outcome metadata projection, retained consumption/ledger and technical panels. The final delta adds historical attempt nodes from a single explicitly linked controlled run: at most the latest 200 records, stable unshortened IDs within the admitted bound, allowlisted metadata fields, escaped browser output and explicit incomplete/truncated state.

Not implemented by this slice: an actual execution DAG with recorded causal dependencies, arbitrary Mermaid syntax, complete task-bound actual spend/acceptance/time-to-acceptance metrics, arbitrary graph editing/retry controls, a newly designed Decisions implementation, or a replacement settings backend. Execution honestly renders historical attempt nodes and observations and states that dependencies are not recorded. Native Claude sessions without a controlled-run link retain unknown attempts rather than being joined by title or timing. Do not market it as a complete graph-runtime migration.

The existing subscription/API-price distinctions remain important; no host quality ranking or task-quality improvement was established by these tests.

## Observations and follow-up

- `knowledgeMap` and `listDocs` are synchronous and individually bounded by file count and size, but still permit a substantial aggregate read. Architecture asks for aggregate-byte/partial-health protection; a smaller total-byte budget and responsiveness fixture would strengthen this. No measured production regression was established here, so this is not a blocker.
- Final diagram fix now admits LR only; TD/TB stays readable as unsupported source rather than being silently misrendered horizontally. Direction chevrons were added to the declared edges. No active syntax or dynamic interpreter was added.
- Browser back/forward behavior inherits replaceState routing rather than a new navigable history stack; do not claim enhanced history semantics without a dedicated acceptance scenario.
- External Markdown images retain the existing renderer behavior. If the intended document contract is no third-party network requests, add explicit remote-image policy and tests rather than treating HTML sanitization as network isolation.

## Verification

Independent targeted suite after the focused changes:

```
$ node --test packages/board/admin-shell.test.mjs packages/board/knowledge.test.mjs packages/board/work-cockpit.test.mjs
1..22
# tests 22
# suites 0
# pass 22
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

These tests cover project resolution, symlink/path containment, descriptor replacement, byte bounds, declared status, route aliases, honest outcome semantics, cockpit filters/tabs and reset races. Real fixture Chromium independently reproduced and verified the fix for the P1 above. No live model execution, installed-plugin changes or production checks were run. Canonical full gate and the complete browser suite are delegated to the parent; they are not silently counted as reviewer passes.

Final focused delta suite was run independently after reading `lib/work.mjs`, its existing run reader and the new rendering/tests:

```
$ node --test packages/board/work.test.mjs packages/board/work-cockpit.test.mjs packages/board/admin-shell.test.mjs
1..24
# tests 24
# suites 0
# pass 24
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

The delta's allowlist excludes prompt/context/result/invocation fields, admits only recognized host values, and does not expose attempt status as current verification. No newly blocking issue was found. The run-to-task propagation still requires the existing explicit single-run link, and no publication capability or approval contract changed in this delta.

Cross-model: skipped, no distinct model-family invocation was performed in this read-only review. No source mutation of authentication, payment, migration or production configuration was introduced in the reviewed diff.
