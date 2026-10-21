# Scoped security verification: task-first admin v2

Scoped security verdict: **APPROVED**. No confirmed P0/P1 vector was found in the inspected change. This report does not approve deployment or change `gate:ship`; the parent must finish the canonical gate and required acceptance checks before recording that decision. No gate, verdict log, commit, release or installation was performed by this reviewer.

Date: 2026-10-21. Candidate: staged `codex/task-first-admin-v2`, base `4f07c99e`. Verification used the working candidate, not an installed board. Verdict quality: substantive for this bounded security review, not a whole-product compliance audit.

## Scope and controls verified

| Boundary | Evidence | Result |
| --- | --- | --- |
| Registered project selection | `packages/board/lib/routes.mjs:126`, `:130`, `:2449`; all three document GET routes use the existing scoped-project policy and unknown selection returns 404 | Focused endpoint fixtures passed for registered, default and unregistered selections. |
| Traversal and symlinks | `packages/board/lib/docs.mjs:135`, `:154`; canonical root, descendant check, explicit `..` rejection and per-component symlink rejection | Directory/file/root-link escape fixtures passed; canonical server-root aliases remain supported. |
| Descriptor replacement and bounded reads | `packages/board/lib/docs.mjs:156`, `:159`, `:161`, `:164`, `:169` | Non-following/nonblocking open, regular-file/device/inode validation, path recheck, at most 1 MiB + 1 allocation and post-read size/time checks. Exact-size, growth and parent-directory replacement fixtures passed. |
| Markdown | `packages/board/public/index.html:7148`, `:7156`; Knowledge calls this renderer at `packages/board/public/assets/admin-shell.js:65` | Real Chromium used bundled marked/DOMPurify and the actual renderer function; tested script, iframe, inline handler, SVG handler and JavaScript link payloads were removed. |
| Diagram rendering | `packages/board/public/assets/diagram-view.js:6`, `:9`, `:26`, `:36` | Restricted grammar, 20,000-character/40-node/80-edge limits, escaped label text and refusal of active directives/cycles. Focused tests passed. No arbitrary Mermaid engine, eval, external script or diagram click handler introduced. |
| Project-switch late responses | `packages/board/public/assets/admin-shell.js:21`, `:23`, `:48`, `:63`; Work guard at `packages/board/public/assets/work-view.js:161` | Generation plus selected-project/request checks reject stale responses. Work reset test and independent delayed Knowledge-document harness passed. |
| Publication authority | `packages/board/public/assets/work-view.js:115`, `:142`, `:145`, `:148`, `:173` | Existing revision/approval preview, ticket, exact branch confirmation and project binding remain; repaint discards previews. New controls select a task/tab, not a wider publication scope. Routes diff adds no mutation endpoint. |

## Findings

No confirmed new exploitable P0/P1 findings. No secrets, tokens, document contents or private filesystem values are reproduced in this report.

## Executed evidence

**Evidence**: passed

```text
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

**Evidence**: passed

```text
$ node --input-type=module
Markdown hostile-payload browser check: {"scripts":0,"frames":0,"eventHandlers":0,"javascriptLinks":0,"pwned":0}
Knowledge delayed old-project document after reset: refused; selected project BETA retained
```

The second command was an inline, read-only verification harness: Chromium loaded bundled marked and DOMPurify plus the actual `mdToHtml` function; document-body selectors counted sanitized payload elements and executable attributes. All outbound browser requests were aborted. A VM then loaded the actual admin-shell module, held two document promises, switched project/reset, resolved the new project first and old project last, and asserted only the new content remained. The initial harness counted its own three injected scripts in the document head; it was corrected to inspect the payload container. That failed harness assertion was not an application vulnerability and is not represented as a successful initial run.

## Nonblocking observations

1. **Aggregate synchronous I/O remains a responsiveness limitation.** `packages/board/lib/docs.mjs:131`, `:164`, `:425` bound individual documents and index count; `packages/board/lib/knowledge.mjs:10`, `:29` independently bound source-map file count. The index can retain hundreds of MiB of text across its bounded pass. There is no explicit smaller aggregate-byte/deadline budget or directory-entry budget. An operator opening a sufficiently large registered repository can stall the local board while it scans. No measured production slowdown or unauthenticated remote exploit was established in this review. Add an aggregate scan budget and explicit partial-health fixtures as follow-up, not an invented High finding.
2. **HTML sanitization does not establish a no-network document policy.** `packages/board/public/index.html:7156` preserves the existing sanitized HTML profile, including image sources. New Knowledge link handling at `packages/board/public/assets/admin-shell.js:72` rewrites anchors, not images. A document can therefore retain an external image URL under the existing rendering policy. The independent XSS harness blocked all outgoing requests and does not prove absence of remote-resource requests in a normal board session. Decide whether remote images must be blocked/proxied; do not advertise network-isolated viewing on the current evidence.
3. **Not a complete graph-runtime migration.** `packages/board/public/assets/work-view.js:74` explicitly labels observations as lacking recorded dependencies. This avoids manufacturing execution evidence; arbitrary graph editing and retry authority are outside this slice.

## Limits and release boundary

### Final delta re-review: historical attempts

The final delta remains approved within this report's scope. `packages/board/lib/work.mjs:20` projects historical attempt nodes through an explicit nine-field allowlist: `runId`, `attemptId`, `role`, `host`, `number`, `phase`, `status`, `startedAt`, `finishedAt`. At `:24` it selects at most the latest 200 records; invalid identities are rejected instead of truncated into colliding IDs. Host values use an allowlist; role/phase/status are bounded strings; dates and attempt number are type-checked. Raw context, prompt, invocation, dispatch evidence, results and graph payloads are not copied. Task propagation at `:131` uses only the existing explicitly linked single-run projection; missing native-host observations stay unknown.

`packages/board/public/assets/work-view.js:74` bounds rendering to 200 nodes and escapes every displayed value and attribute. At `:81` controller status is explicitly historical, not current verification or task acceptance. No dependency edges, new capability, publication permission or mutation endpoint were added. `packages/board/public/assets/diagram-view.js:8` now accepts LR only, refusing TD/TB rather than presenting their layout with a different direction.

**Evidence**: passed

```text
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

These additional independently executed checks include exact projected-key allowlisting, absence of private fixture values, explicit single-run linkage, native-host unknown state, malformed IDs/hosts/numbers, truncation, escaped retry rendering, and preserved copy-only authority. The earlier 22-test run remains evidence for its inspected revision; this delta run is not represented as a full-gate rerun.

The canonical full gate is running under parent ownership; its outcome is not included as a pass here. No live production/admin instance, installed plugin, paid model, dependency CVE database, complete git-history secret scan, SOC 2 assessment or deployment was exercised. Existing local-origin/CSRF/publication endpoints were inspected for unchanged scope, not subjected to a new whole-product penetration test. No dependency or workflow file is changed by this candidate. This focused report must not be used as a standalone full-product CSO sign-off.

DONE: scoped security review APPROVED; confirmed new blockers P0:0 P1:0. gate:ship unchanged; parent owns final gate and delivery authority.
