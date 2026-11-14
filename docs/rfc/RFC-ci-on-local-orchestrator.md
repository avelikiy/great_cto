# RFC: run great_cto CI on the owner's local CI orchestrator

- Status: **Draft 2026-11-14.** Direction approved by the owner; adapter implemented, not yet proven on a real run (§9).
- Scope: where great_cto's gate, tests and builds execute; how merge and release chains read the result.
- Not in scope: what the gate checks. `scripts/ci-local.sh` stays the single definition of the gate.

## 1. Decision and its boundary

The owner decided to execute great_cto's CI, tests and builds on a CI orchestrator of the owner's own
(a macOS daemon on a Mac mini that runs GitHub-Actions-syntax workflows on the host,
in macOS VMs, with simulators and Maestro) and to stop using hosted CI.

**GitHub stays the code host.** The public repository, pull requests, releases and the signed
npm publish route of ADR-045 are unchanged. Only *execution* of checks moves.
This is listed again in §10 as a decision for the owner to confirm.

## 2. What runs where today

| Check | Command | Runner | Who requires it |
|---|---|---|---|
| Full gate (~60 steps: lib, board, eval, docs tests; board e2e in a browser; pipeline suite L1–L5; CLI build, tests, pack; Allure gate) | `scripts/ci-local.sh --e2e --jobs=N` | a remote Linux host over ssh (`remote-gate.sh`), before that the developer Mac (`gate-any.sh`) | merge and release chains: `gate rc=0` in `gate-<label>.out` before merge, tag or publish |
| Single test file / lint | `remote-test.sh <sha> <label> '<cmd>'` | the same Linux host | agents, ad hoc |
| `cli-ci`, `plugin-ci`, `runtime-ci` workflows | `node --test …`, structural checks | GitHub Actions — **state `active`, but Actions are billing-locked; nothing executes** | `scripts/lib/guard-parity.mjs` compares them with ci-local |
| 8 other workflows (announce, canary, evals, publish, scorecard, …) | — | GitHub Actions, `disabled_manually` | nobody |
| Linux/macOS canary of the published package, eval drift, awesome-list | `.circleci/config.yml`, cron on `main` only | hosted CircleCI | reporting; nothing gates on it |
| Awesome-list check | launchd, weekly | developer Mac | report only |
| Eval drift | launchd, monthly, $80 guard | developer Mac | report only |
| Maestro / Maestro Cloud | — | **not used by great_cto itself.** Agents and skills (`mobile-release`, `e2e-test-engineer`, `release-manager`) describe local `maestro test` against the installed build; no file references Maestro Cloud | — |

## 3. How the orchestrator works (the parts that matter here)

Facts read from its source and API contract:

- **Pipelines** are GitHub Actions YAML: jobs, steps, `needs`, `if`, matrix, `env`, `timeout-minutes`
  (default 360), a workflow-level `concurrency`. Supported actions include `actions/checkout`,
  `actions/setup-node`, `actions/cache`, `actions/upload-artifact`; any other action fails its step.
- **Inline workflows**: `POST /v1/runs` with `yaml` (scope `workflows:inline`) runs text that is not
  committed in `.github/workflows`. Such a run cannot be rerun with `rerun`.
- **Execution** is on the Mac host by default, each step in its own process group with a clean
  environment; `runs-on: tart` gives a macOS VM. An agent key running a non-default branch without
  the `runs:branches` scope is forced into a VM without secrets.
- **Checkout** is a local clone of the project's repository at the resolved commit; the daemon fetches
  the ref from GitHub first when the project has `github` set. A commit that is on no ref of the remote
  cannot run on such a project.
- **Binding to a commit**: the run records `sha` and `git_ref`; a submitted `sha` must be the tip of
  `ref` or an ancestor of it.
- **Statuses**: a run is `running | succeeded | failed | cancelled`; a job additionally `blocked,
  queued, timed_out, skipped, lost`. **A run whose every job was skipped ends `succeeded`.**
- **Queueing**: a resource broker (CPU, RAM, a `heavy` slot, simulators, …). `concurrency:` without
  `cancel-in-progress` *cancels* older queued runs of the group ("superseded"). The way to serialize
  without dropping runs is the per-project limit `gg project limit <name> 1`.
- **Results**: job logs over `GET /v1/jobs/{id}/log` (paged by `X-Log-Offset`, `X-Job-Done`); tests
  from JUnit XML artifacts or its own web-test action (TAP is not parsed); artifacts via upload-artifact.
- **GitHub commit statuses** are posted only if the Mac holds a GitHub token secret; there is no
  per-project switch.
- **Failure handling**: a daemon restart marks running jobs `lost` and re-queues them up to 2 attempts;
  timeouts end `timed_out`; cancel ends `cancelled`.

## 4. Target design

```
merge/release chain
  └─ node scripts/ci-orchestrator.mjs <sha> <label> --ref <ref>
       ├─ reads ci/orchestrator/gate.yml FROM <sha> (git show), not from the working tree
       ├─ POST /v1/runs {project: great_cto, ref, sha, yaml, event: push, idempotency_key}
       ├─ refuses if the orchestrator resolved another sha
       ├─ follows GET /v1/runs/{id}?wait=60 until the run ends
       ├─ reads the gate job's full log
       └─ writes gate-<label>.out + gates/<label>.log (same contract as gate-any.sh)
orchestrator (Mac mini)
  └─ job "gate": checkout → setup-node 22 → isolated HOME → npm ci, CLI build,
     playwright chromium, install-local → bash scripts/ci-local.sh --e2e --jobs=8
```

- **The pipeline lives at `ci/orchestrator/gate.yml`, outside `.github/workflows`**, so GitHub does not list
  it as an active Actions workflow. Submitting it inline from the gated commit keeps "the pipeline
  that ran" under review with the code.
- **The job runs `scripts/ci-local.sh` unchanged.** Moving runners changes where, not what.
- **Isolated HOME** inside the job's temp directory: L5 checks what is installed in `~/.claude`, and
  the gate must never read or change the host user's installation. `install-local.sh` installs into
  that HOME.
- **Browsers**: the orchestrator exports a shared `PLAYWRIGHT_BROWSERS_PATH`; the job installs
  Chromium there once and reuses it.

### 4.1 Mapping of each current check

| Current | On the orchestrator |
|---|---|
| `gate-any.sh` / `remote-gate.sh <wt\|sha> <label>` | `node scripts/ci-orchestrator.mjs <sha> <label> [--ref …]` — same `.out` contract |
| `remote-test.sh <sha> <label> '<cmd>'` | not ported in this change; follow-up: a second inline pipeline taking the command as an input |
| board e2e (Playwright) | inside the gate job, Chromium from the shared browser path |
| pipeline suite L1–L5 | inside the gate job, against the isolated HOME |
| GitHub `cli-ci` / `plugin-ci` / `runtime-ci` | superseded by the gate (ci-local already runs every command they run); removal is §10 decision 2 |
| CircleCI canaries, eval drift, awesome-list | unchanged by this RFC; §10 decision 3 |
| launchd awesome-list / eval-drift | unchanged (reports, not gates) |
| Mobile flows (for projects great_cto builds) | guidance stays "local `maestro test` on the installed build"; the orchestrator's own Maestro action is a runner for it, Maestro Cloud is not used |

## 5. Merge guards and release chains

A chain reads one thing: `gate rc=N` in `gate-<label>.out`, with `HEAD <sha>` naming the gated commit.
The adapter keeps that contract, so a chain switches runner by switching one command. The rc is 0
**only** when all of these hold:

1. the orchestrator's submit answer names the same `sha` the adapter resolved;
2. the run ended `succeeded` **and** the job `gate` ended `succeeded` (not `skipped`, not missing);
3. the gate log's `HEAD <sha>` line names that same commit;
4. the log carries `CI-LOCAL: ALL GATES GREEN`.

`GREEN, N TEST(S) SKIPPED` is rc 5 unless `--allow-skips` is passed on purpose: a skip is "not
checked", and the adapter is the first runner where that distinction is enforced rather than read.

**Merge results.** The chains gate the merge of the PR head into `main` before `gh pr merge
--match-head-commit`. The orchestrator can only run commits on a remote ref, so the chain passes
`--ref refs/pull/<N>/merge` and the SHA GitHub computed for it, and keeps its existing guards: base is
`main`, `origin/main` did not move during the gate, the PR head did not move. Gating the local merge
commit instead needs either pushing it to a `gate/*` branch or a plain-folder project on the Mac;
both are listed as options in §10.

## 6. Queueing: two gates never run at once

- The owner sets `gg project limit great_cto 1` on the Mac: newer runs wait, none is dropped.
- The pipeline deliberately has **no** `concurrency:` group: without `cancel-in-progress` the
  orchestrator cancels older *queued* runs of the group, which would silently drop a chain's gate.
- The job takes the `heavy` slot, so it is admitted against mobile builds instead of competing with
  them for cores.
- The idempotency key `great-cto-gate-<sha>-<label>` makes a retried submit return the same run.

## 7. Failure modes

| What happens | Adapter answer |
|---|---|
| `CI_ORCH_URL` / `CI_ORCH_TOKEN` not set | rc 2, `STOP: … the gate did not run` |
| listener down, TLS failure, 4xx on submit (unknown project, missing scope, security refusal) | rc 2 |
| listener lost mid-run (5 consecutive errors, 15 s apart) | rc 2; the run is left as it is |
| no verdict within `--timeout-min` (default 150) | rc 3 |
| job `timed_out` on the orchestrator | rc 3 |
| run cancelled | rc 4 |
| daemon restarted during the job | the orchestrator re-queues the `lost` job once; if it ends `lost`/`failed`, rc 1 |
| all jobs skipped, gate job skipped or missing, log without banner or for another commit | rc 6 |
| `ci/orchestrator/gate.yml` missing in the commit | rc 6, nothing submitted |

**Daemon down means no merge.** No path falls back to another runner silently; the chain stops and
says why. Falling back is a human decision (§8).

## 8. Rollback

`remote-gate.sh` (remote Linux host) and `gate-any.sh` stay in place and keep the same output
contract. Rolling back is switching the chain's gate command back; nothing in the repository depends
on the orchestrator. The adapter and `ci/orchestrator/gate.yml` can be removed in one commit.

## 9. Proof required before the chains switch

1. One full gate through the orchestrator on `main`'s head, green, with the log and duration.
2. The same SHA through the current runner, for comparison of result and duration.
3. One deliberately red commit (a failing assertion on a scratch branch) through the orchestrator: rc 1.

Until all three are recorded here, chains keep `remote-gate.sh`.

## 10. Decisions for the owner

1. **Confirm the boundary**: GitHub remains code host, PRs, releases and the ADR-045 publish route;
   only execution moves.
2. **Remove** `.github/workflows/cli-ci.yml`, `plugin-ci.yml`, `runtime-ci.yml` (listed `active`,
   never executing, superseded by the gate) — or disable them like the other eight. `guard-parity.mjs`
   reads them, so removal comes with a parity update in the same change.
3. **CircleCI** (`.circleci/config.yml`: published-package canaries, eval drift, awesome-list):
   keep, move to the orchestrator as scheduled runs, or remove.
4. **Register the project on the Mac** (admin only): `gg project add great_cto --git
   https://github.com/avelikiy/great_cto` with `github` set, `gg project limit great_cto 1`, and a key
   whose projects include `great_cto` with `workflows:inline`. A non-agent key (`gg token create`) is
   not forced into a VM for PR merge refs; an agent key needs `runs:branches` or runs those in a VM.
5. **Merge results**: gate `refs/pull/N/merge` (no push needed) or push the local merge commit to a
   `gate/*` branch first.
6. **GitHub commit statuses**: the orchestrator posts commit statuses named after the workflow only if the Mac
   holds a GitHub token secret. Decide whether great_cto PRs should show them.

## 11. Requests for the orchestrator (not implemented here)

1. Distinguish "every job skipped" from `succeeded` in the run status.
2. Parse TAP (`node --test` default output) into `/v1/runs/{id}/tests`.
3. Queue, not cancel, older runs of a `concurrency:` group without `cancel-in-progress` — or document
   `project limit 1` as the way to serialize.
4. A per-project switch for GitHub commit statuses.
5. A way to install Playwright browsers into the shared path (a setup action).
6. `sha`, `git_ref`, `workflow` in the OpenAPI `Run` schema (the API already returns them).
7. Rerun for inline workflows, or keeping inline YAML for repeats.
8. Running a commit that is on no remote ref (a bundle upload), for gating a local merge result.
