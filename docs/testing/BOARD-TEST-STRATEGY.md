# TEST-STRATEGY-board

> Written 2026-11-04 · applies `skills/test-strategy` · scope: the great_cto board
> (`packages/board`): the local web admin that orchestrates and shows the pipeline.

Related: [the end-to-end strategy for great_cto itself](TEST-STRATEGY-end-to-end.md),
[the E2E plan](E2E-PLAN.md), [the board API](../BOARD-API.md),
[local CI/CD](../LOCAL-CICD.md).

## 1. What the system is, and where the risk lives

| Part | What it is | Size today |
|---|---|---|
| Backend | Zero-dependency Node server `server.mjs` + `lib/*.mjs` (routes, readers, SSE, workers) | 194 + 2,514 lines in `routes.mjs` alone |
| API | JSON routes under `/api/*`, SSE stream, two write paths that matter (gate decisions, task create) | **57 routes** |
| Frontend | One inline single-page app `public/index.html` + `share.html`, vanilla JS, no build step | 10,608 + 1,194 lines, 160 event handlers |
| Integrations | `bd` (Beads) CLI, git, the filesystem of every registered project, Claude/Codex transcripts, OpenRouter key check, Web Push, the Cloudflare share Worker, the MCP server | 8 external seams |

The risk does not live in pure logic. It lives in three places, and every bug class
the gate log has recorded so far falls into one of them:

1. **A read that fails is shown as "empty".** `bd` times out, a file is unreadable,
   git refuses, and the board draws "0 tasks" instead of "not read". This is the
   product's core promise (an honest picture of the pipeline) failing silently.
2. **A wired endpoint with an unwired button, or the reverse.** 3.27.1 shipped blocked
   tasks that could be opened and not decided: the endpoint existed, the button did not.
3. **A write that is not guarded.** Gate approval is the one irreversible action the
   board performs; token, confirm, staleness and host checks are the whole safety story.

### Measured gaps (2026-11-04, literal grep of route strings in tests)

| Measure | Value |
|---|---|
| Routes with **no test referencing them at all** | **19 of 57** — e.g. `/api/receipt`, `/api/sessions`, `/api/notifications`, `/api/push/subscribe`, `/api/change-tier`, `/api/portfolio`, `/api/memory` |
| Routes never touched by a browser test | 44 of 57 |
| Board unit/integration test files | 77 (`packages/board/*.test.mjs`) |
| Browser test files | 7 (`tests/e2e/*.e2e.test.mjs`), 23 cases, 17 of them in one file |
| Line or mutation coverage of `lib/` | not measured |
| API contract (schema) checks | none; `BOARD-API.md` is prose |

A literal grep under-counts routes built from template strings; the number is a floor
for "untested", not an exact figure. The first task of the plan replaces it with a
measured route map (§6).

## 2. Pyramid ratio

The board is a **web-app** archetype (request → read → render), but with no database:
its "integration" seams are processes and files. Chosen ratio:

| Layer | Share | Why this and not the default 60/30/10 |
|---|---|---|
| Unit (pure `lib/` functions) | 45% | Little pure logic; most functions are readers whose behaviour is defined by what they read |
| Integration (server + fakes for `bd`, git, fs) | 35% | The failure classes in §1 live at seams, so the seam layer is weighted up |
| API contract + security | 10% | 57 routes and one irreversible write deserve their own layer, not a corner of integration |
| Browser E2E | 10% | Only the journeys and the button-to-endpoint wiring; everything else is cheaper below |

Plus two non-functional checks that are gates, not layers: accessibility and a
performance budget (§3.6).

## 3. Per layer: what, how, with what

### 3.1 Backend (unit + integration)

**Tool:** `node:test` (already used; zero dependency, matches the server's own rule).

What to cover, by equivalence class rather than by example:

| Unit | Classes | Boundaries |
|---|---|---|
| Every reader (`data-readers`, `beads`, `verdicts`, `receipt-read`, `transcripts`, `usage-report`) | read ok · source missing · source unreadable · source malformed · source slow | empty file, one record, the size cap, a record at the cap |
| `bd` access (`beads.mjs`, `bd-read-worker.mjs`) | ok · exits non-zero · hangs · killed by SIGTERM · schema newer than expected | timeout exactly at the cap, cap + 1 ms |
| Gate tokens (`gate-tokens.mjs`) | valid · expired · reused · for another gate · missing | expiry second, clock skew |
| SSE (`sse.mjs`) | connect · reconnect with Last-Event-ID · client gone mid-write | 0 clients, many clients |
| Cost and usage aggregation | normal · zero cost · unknown model · mixed currencies of record | the 1000× sanity ratio that once read 7,638× |

**Rule for every reader (from `failed-read-is-not-empty`):** a test that makes the
source fail and asserts the reader returns an explicit `unreadable`/`unknown` state,
never `[]`. A scan test fails the build on a `catch` that returns an empty collection
without a `display-only:` note.

**Property-based candidates** (`fast-check`, dev-only dependency, used in tests only):
- path resolution in `/api/doc`: for any generated path, the resolved file is inside
  the project root (no traversal);
- `plan-date.mjs` and date bucketing: bucketing is total and order-preserving;
- receipt/verdict parsing: `parse(serialize(x))` round-trips.

**Mutation score:** Stryker (`@stryker-mutator/core` with the `command` runner, so it
drives `node --test`). Not in every gate: it runs weekly and on any change to
`gate-tokens.mjs`, `routes.mjs` gate handlers, `beads.mjs`, `receipt-read.mjs`.
Target **≥ 60%** on those files; the first run sets the baseline.

**Line coverage:** `node --test --experimental-test-coverage` (built into Node 22), reported, with
a floor only on the four files above. Coverage is the cheap proxy; mutation is the truth.

### 3.2 API

Four checks, from cheapest to strongest:

1. **Route inventory test.** Parses the route table from `routes.mjs` and fails when a
   route has no entry in the contract and no test. This turns "19 untested routes" into
   a list the build refuses to grow.
2. **Route checks in Hurl.** One `.hurl` file per route group (`tests/api/*.hurl`):
   status, content type, the fields `BOARD-API.md` promises, and the error codes.
   Plain text, reviewed like code, JUnit output into the same report.
3. **Contract.** `BOARD-API.md` becomes a machine-readable OpenAPI 3.1 file
   (`docs/board-api.openapi.yaml`), the prose table is generated from it. Every route is
   called against a fixture project and its response validated against the schema
   (a small validator in the test, no runtime dependency in the server).
4. **Property-based API fuzzing:** Schemathesis against the OpenAPI file and a
   board started on a fixture. It finds 500s, schema violations and crashes on inputs
   nobody wrote by hand. Runs in the full gate (`--e2e`), not `--quick`.

**Security cases.** Most already exist; a first pass of this strategy missed them because
it searched for the wrong strings. Where each one lives:

| Case | Expected | Test |
|---|---|---|
| Gate POST without token / with reused token / expired token | 403 `refused-token` / `refused-expired` | `gate-tokens.test.mjs` |
| Approve expensive gate without typed `confirm` | 403 `refused-confirm` | `gate-tokens.test.mjs` |
| Project changed since the gate was listed | 409 `refused-stale` with `changed` paths | `gate-tokens.test.mjs` |
| Request with a foreign `Host` (DNS rebinding) | refused by the host allowlist | `host-allowlist.test.mjs` |
| `/api/doc` traversal, absolute paths, symlink out of the root | refused, never file bytes | `knowledge.test.mjs` |
| `/api/router-key` | never returns the key, only a fingerprint | `router-key-verify.test.mjs` |
| A write from another site, **on every route and every write method** | 403 before any handler | `api-sweep.test.mjs` (new) |
| **Every route** with missing parameters, unknown project, traversal-shaped ids, bad numbers, a body that is not JSON | a 4xx or a state, never 5xx, never a hang | `api-sweep.test.mjs` (new) — its first run found `POST /api/projects/register` answering 500 to a non-JSON body |

### 3.3 Frontend

The board is one HTML file with no framework, so component testing means rendering
the real page against a fixture project.

| Check | Tool | Status |
|---|---|---|
| Static: no CDN, English UI, CSS classes declared, type scale, contrast | node:test source scans | exists |
| Rendered layout signature (fonts, anchors, overflow) instead of pixel diffs | `tests/lib/layout-snapshot.test.mjs` | exists |
| **Every control is wired:** on every destination, an inline handler calls only functions that exist, and any other control has a listener on it or an ancestor below `<body>` (read through the DevTools protocol) | `tests/e2e/controls-wired.e2e.test.mjs`. It does not click: 143 controls include gate approvals, and pressing them belongs to the journeys | **in place** |
| No console errors or unhandled rejections on any tab | Playwright `pageerror` + `console` listener on all 10 destinations, same test | **in place** |
| Degraded states render as "not read", not as empty | Playwright with a fixture whose `bd` fails | partial (`degraded-ui.test.mjs`) |
| Accessibility (WCAG 2.2 AA rules) per tab, desktop and 375 px, light and dark | axe-core injected into the page (already a devDependency), `tests/e2e/a11y.e2e.test.mjs` | **in place**; 4 serious violations baselined in `a11y-baseline.json` and filed as bugs |
| Mobile: 375 px, no horizontal scroll, drawer works | Playwright viewport | exists for some tabs |

Pixel diffs stay out, for the reason already written in `ci-local.sh`: fonts rasterise
differently on macOS and Linux, so a PNG baseline is flaky by construction. If a visual
diff is ever needed, it runs in one pinned Linux container and only for the design
approval step (`design-approval-all-projects`), not as a merge gate.

### 3.4 Integrations

Each seam gets a **fake** (deterministic, in `packages/board/fixtures/`) for the gate and
a **contract check against the real thing** run less often, so the fake cannot drift.

| Seam | Fake for the gate | Real-thing check |
|---|---|---|
| `bd` CLI | `fake-bd-*.sh`, `fake-bd-controlled.mjs` (exist): ok, fail, slow, hang | weekly: the same reader suite against the installed `bd` on a scratch `.beads` |
| git | temp repos built in the test | same tests, real git, always (git is local) |
| Project filesystem | `scripts/lib/screenshot-fixture.mjs` project | — |
| Claude / Codex transcripts | recorded transcript fixtures (redacted) | on release: one real session file read without error |
| OpenRouter key verify | local HTTP stub returning 200/401/timeout | manual, on key change only (costs nothing, but needs a real key) |
| Web Push | stub push service; assert payload and VAPID headers | manual, one real notification before a release that touches push |
| Cloudflare share Worker | `wrangler dev` (local workerd) with the Worker's own tests | after deploy: `deploy-landed` check of the live URL |
| MCP server (`mcp-server.mjs`) | stdio client in node:test: list tools, call each read tool on a fixture | — |

### 3.5 End-to-end

Playwright, driven from `node:test` (as today), against a board started from the
**installed package**, not the source tree, on release candidates: `npm pack` →
install into a temp prefix → start → run. Day-to-day runs use the source tree.

Golden journeys (each one test, each step asserts both the UI and the API state):

1. Fresh install, no projects → empty state that says how to register → register a project → it appears.
2. Open a project → Work tab shows tasks from `bd` → open a task → history loads.
3. **Gate decision:** a pending gate in Inbox → open brief (all seven sections render or
   say `unknown`) → approve with token → gate disappears, decision log has it.
4. Reject a gate with a reason → reason is recorded.
5. Stale gate: change the project after listing → approve → the UI shows `refused-stale`
   and the changed paths, nothing is approved.
6. `bd` breaks mid-session → every affected panel says "not read", none says "0".
7. Live updates: a new verdict file appears → the SSE stream updates the pipeline view without reload.
8. Knowledge: search a document → open → Mermaid renders or falls back.
9. Usage and cost for 30 days match the fixture totals.
10. Share a view → the share page renders the same numbers.
11. Mobile 375 px: navigate all five destinations through the drawer.
12. Settings: store an OpenRouter key → only the fingerprint is ever shown.

On failure: Playwright trace (`trace: 'retain-on-failure'`), screenshot and the server
log are kept next to the report (§4).

### 3.6 Non-functional gates

| Gate | Tool | Budget |
|---|---|---|
| Accessibility | `@axe-core/playwright` | zero `serious`/`critical` violations per tab |
| Cold start | existing `boot-responsiveness` / `http-cold-read` tests | first byte < 1 s with a slow `bd` |
| Hot routes | `autocannon` on `/api/work`, `/api/inbox`, `/api/sse` connect | p95 < 200 ms on the fixture, no error under 20 concurrent clients |
| Page | Lighthouse CI on the fixture board (local, no server upload) | performance ≥ 80, no regressions > 5 points |

## 4. Reports

One run produces one verdict, readable by a person and by the agents:

| Output | Producer | Where |
|---|---|---|
| Per-test results | `scripts/lib/ctrf-reporter.mjs`, a zero-dependency node:test reporter writing CTRF (Common Test Report Format) JSON; every browser test is driven from node:test, so one reporter covers both layers | `.great_cto/test-results/<suite>.ctrf.json`, written by `ci-local.sh` (**in place**) |
| Human report + verdict | Allure 3 over all suites (**next**); `allure quality-gate` sets the exit code (max failures, min test count, so an empty run cannot pass). Playwright HTML report with traces for debugging | `.great_cto/test-results/allure/`, `…/playwright/` |
| Gate line | `ci-local.sh` step summary: passed / failed / **skipped with why** | the gate log |
| Board panel | the board itself reads `ctrf.json` and shows the last run per suite | new, small |

A skip is reported as "not checked", never folded into "passed": the gate already does
this and the merged summary must keep it.

## 5. Bugs and fixes

**Tracker:** Beads (`bd`) is the source of truth for work, as for everything else in
this repository. GitHub issues are for bugs a user reports or can see in a release;
they are written in English and linked to the `bd` task.

**Filing is automatic, deduplicated, and never silent:**

1. A failed gate step writes a **failure fingerprint**: suite + test name + first
   assertion line + normalised error message.
2. `scripts/gate-to-bd.mjs` (new) looks the fingerprint up: open bug exists → add a
   comment with the run and increment the count; none → `bd create -t bug` with the
   test, the error, the trace path and the commit.
3. Priority from the failing layer: security case or gate-decision journey → P0;
   other E2E or contract → P1; unit → P2.
4. A test that fails and then passes on retry in the same commit is a **flake**: it is
   quarantined (skipped with a `bd` bug that has an owner and a date), not retried
   until green. Quarantine expires; an expired quarantine fails the gate.

**Fix flow (the orchestrator's own agents):**

| Step | Who | Done when |
|---|---|---|
| Name the cause: false test, broken gate, real regression, flaky | `ci-resolver` | written in the bug |
| Reproduce as a failing test first | `senior-dev` (TDD) | the new test is red on the current code |
| Fix | `senior-dev` | the test is green, the full gate is green |
| Review | `code-reviewer` (+ `security-officer` for gate/token code) | verdict recorded |
| Close | `bd close` with the commit and the gate run | the fingerprint does not recur for 7 days |

The reproducing test stays in the suite: every fixed bug leaves a regression test behind.

## 6. Rollout

| # | Step | Done when |
|---|---|---|
| 1 | Route inventory test + measured route map | the build lists every untested route and refuses new ones — **done 2026-11-04** |
| 2 | Security cases of §3.2 | all pass in `--quick` — **done 2026-11-04**: mapped to existing tests, plus the all-route sweep |
| 3 | CTRF reports from the gate, `gate-to-bd.mjs` with dedupe (`GATE_FILE_BUGS=1`) | a deliberately failing test creates one bug, a second run comments on it — **done 2026-11-04, proven on the real tracker** |
| 4 | "Every control is wired" + global console-error check | runs on all destinations — **done 2026-11-04**: 10 destinations, up to 143 controls per view; proven to fail on a renamed handler and on a button with no handler |
| 5 | Golden journeys 1–12 | all green in `--e2e` |
| 6 | axe per tab, desktop and 375 px | zero serious/critical — **gate in place 2026-11-04**: no new violation passes; 4 existing ones baselined and filed |
| 7 | OpenAPI file + contract validation + Schemathesis | 57/57 routes in the contract |
| 8 | Stryker baseline on the four critical files | score recorded, target set |
| 9 | Installed-package E2E on release candidates | wired into the release chain |
| 10 | Performance budgets | numbers recorded, then enforced |

## 7. Tool choice

Surveyed on 2026-11-04: about 70 open-source candidates, 60 checked against the GitHub
API for activity and licence. Hard constraint: everything runs in the local gate with no
SaaS account (GitHub Actions are not available to this repository).

| Need | Chosen | Rejected, and why |
|---|---|---|
| Browser E2E | **Playwright** (in use) | Cypress, WebdriverIO, TestCafe: nothing Playwright lacks here |
| Writing and repairing E2E specs | **Playwright test agents** (planner / generator / healer) via Claude Code | browser-use, Stagehand, Skyvern, agent-browser: agents, not gates — non-deterministic verdicts and a per-run LLM cost |
| Exploratory passes that file bugs | Playwright MCP / Chrome DevTools MCP driven by `qa-engineer` | — |
| JSON route checks | **Hurl** (plain-text files, JUnit output, one binary) | Newman (Postman lock-in), Karate (JVM), Pact (one consumer only) |
| API fuzzing | **Schemathesis**, after the OpenAPI file exists | Dredd (archived), Step CI (inactive since 2024) |
| Accessibility | **@axe-core/playwright** | pa11y-ci (URL lists, weak for a single-page app) |
| Visual | rendered-layout signature (in use); Playwright `toHaveScreenshot` only in a pinned Linux container for design approval | Lost Pixel (archived), Argos (review UI is SaaS), BackstopJS (redundant) |
| Performance | **Lighthouse CI** (`lhci assert`) for the page, **autocannon** for routes, **size-limit** for `index.html` bytes | k6 (good, but AGPL and a Go binary; revisit if load tests grow) |
| Mutation | **StrykerJS** with the `command` runner over `node --test`, nightly | — |
| Flakes | Playwright retries + `--fail-on-flaky-tests`; history in CTRF | BuildPulse, Trunk, Currents: SaaS |
| Report format | **CTRF** JSON from every tool | — |
| Human report + pass/fail | **Allure 3** (`allure quality-gate`, never `allure generate`, which does not gate) + Playwright HTML/trace | ReportPortal, SonarQube (servers to run), Allure 2 (Java) |
| Bug filing | **`scripts/gate-to-bd.mjs`** (ours, ~150 lines over CTRF) | no maintained open-source tool does this; GitHub Actions reporters need Actions |

## 8. Quarantine list

Empty at the time of writing. Every entry here names its `bd` bug and its expiry date.
