Decision: BLOCKED

# Security review — execution-claims (`scripts/lib/execution-claims.mjs`) and its wiring

verdict_quality: substantive

Scope: `scripts/lib/execution-claims.mjs`, `scripts/hooks/subagent-stop-completion.mjs`
(the `execution:` rung added in `0fe884bb`), and the verdict-writing path that
feeds it: `scripts/log-verdict.sh`, `scripts/lib/verdict-record.mjs`
(`parseVerdictLine`, `--emit`). Reviewed at commit `0fe884bb` on `main`.

## Claim under test

> A command claim from a verdict is only ever run if it matches one of four
> fixed SHAPES (`node --test <paths>`, `npm test`, `npm run <script>`, `bash
> scripts/<name>.sh`); anything containing a shell metacharacter is refused
> outright; and none of this runs unless `GREAT_CTO_VERIFY_EXECUTION=1`. Given
> that, running the claim grants no capability the claiming agent didn't
> already have via Bash.

**Verdict: the claim does not hold, on two independent axes, both proven
against the real, unmodified module — not hypothesized.**

1. **Every one of the four allowed shapes is a full arbitrary-code-execution
   primitive**, because the allowlist constrains the *shape of the argv
   string*, not the *content of what that argv points at* — and in three of
   four shapes, that content is exactly what an attacker (or a compromised /
   prompt-injected agent) controls: `package.json` scripts, a `.sh` file's
   body, or a "test" file's top-level code. This is true with
   `GREAT_CTO_VERIFY_EXECUTION=1` and *no other bypass* — it is what the
   feature does when used exactly as documented.
2. **The hook does not check who is stopping against who wrote the claim.**
   `freshestVerdictLine()` reads the newest `.log` file across the *entire*
   `.great_cto/verdicts/` directory, regardless of which subagent is
   currently stopping and regardless of whether the agent that authored that
   line ever held Bash. Any agent whose tool set includes Write (not Bash)
   can plant a hand-written JSON verdict line under an unrelated agent's
   name, and the next SubagentStop from *any* agent will re-run it. This is
   the actual widening the review was asked to characterize plainly: it is
   not "the agent already had Bash" — it is "whoever could Write a file
   anywhere under `.great_cto/verdicts/` now has unattended code execution,
   whether or not that agent, or the one whose stop triggered the run, was
   ever granted Bash."

The one mitigation that *is* load-bearing as claimed: the
`GREAT_CTO_VERIFY_EXECUTION=1` gate. It is a single, correctly-placed
condition (`subagent-stop-completion.mjs:189`) and I found no path around it.
Everything below assumes that flag is set — which is precisely the state the
feature is built to be run in, and the state its own commit message frames as
the next rung of enforcement projects should adopt.

---

## Findings

### [Critical] `node --test` shape: Node CLI flags pass `isPathish` and give unconditional code execution before any test runs

- **Location**: `scripts/lib/execution-claims.mjs:57-59` (`isPathish`), used at
  line 51 to validate every argument after `node --test`.
- **Problem**: `isPathish` is `/^[\w./*-]+$/` with a `..`-exclusion. This
  class also matches Node.js's own long-form flags — `--require`,
  `--experimental-loader`, `--import`, `--test-reporter` — none of which
  contain a character `isPathish` excludes. Node's `--test` runner accepts
  these interleaved with positional test-file arguments, and each one loads
  an arbitrary local module's top-level code *before* any test executes.
  The claimed defense ("An allowlist of command SHAPES … `node` alone would
  permit `node -e '<anything>'`, which is a shell by another name") reasoned
  about `-e`/`--eval` and stopped there; it did not check what else
  `isPathish`'s character class admits.
- **Evidence**: passed (the vulnerable path executes cleanly and reports success)
  ```
  $ mkdir -p /tmp/poc && cd /tmp/poc
  $ cat > evil-require.mjs <<'EOF'
  import { writeFileSync } from 'node:fs';
  writeFileSync('PWNED-VIA-REQUIRE.txt', 'arbitrary code executed at require-time\n');
  EOF
  $ cat > harmless-test.mjs <<'EOF'
  import { test } from 'node:test';
  test('noop', () => {});
  EOF
  $ node -e '
  import("/Users/avelikiy/development/Personal/great_cto/scripts/lib/execution-claims.mjs")
    .then(({ parseCommandClaim, checkExecution }) => {
      const claim = parseCommandClaim({ tests: "node --test --require ./evil-require.mjs harmless-test.mjs" });
      console.log("shape accepted:", JSON.stringify(claim));
      const r = checkExecution({ tests: claim.value }, { cwd: process.cwd() });
      console.log(JSON.stringify(r));
    });'
  shape accepted: {"key":"tests","value":"node --test --require ./evil-require.mjs harmless-test.mjs","argv":["node","--test","--require","./evil-require.mjs","harmless-test.mjs"],"shape":"node --test"}
  {"status":"passed","exitCode":0,"counts":{"pass":1,"fail":0},"why":"the check ran and passed","ok":true, ...}
  $ ls PWNED-VIA-REQUIRE.txt
  -rw-r--r--  1 avelikiy  wheel  40 ... PWNED-VIA-REQUIRE.txt
  ```
  `checkExecution` — the exact function `subagent-stop-completion.mjs:190`
  calls — reports `status: "passed"`, i.e. the verdict is accepted as backed,
  while having executed attacker-supplied code as a side effect of loading
  the "test."
- **Why Critical**: no shell metacharacter is used, so `SHELL_META` never
  fires; the shape allowlist explicitly accepts this argv as `node --test`.
  There is no second gate. The only precondition is
  `GREAT_CTO_VERIFY_EXECUTION=1`, which is the feature's normal-use state.
- **Fix direction**: reject any argument in the `node --test` shape that
  starts with `-` (test file paths never do), or resolve each argument
  against Node's own flag table and reject known-flag collisions explicitly —
  denylisting individual flags will re-lose to the next one Node adds.

### [Critical] `npm test` / `npm run <script>` shapes: the "no shell" property is about the outer call only — `package.json` script bodies run through npm's own shell, completely unconstrained by this module

- **Location**: `scripts/lib/execution-claims.mjs:52-53` (shape match), the
  module's own docstring at lines 27-28 ("No shell, ever … A metacharacter
  anywhere refuses the claim").
- **Problem**: `npm test` and `npm run <script>` are the *most innocuous,
  most likely-to-occur-organically* claims an agent would write — this is
  precisely the string a QA agent recording `tests=npm test` produces with no
  malicious intent at all. `execFileSync('npm', ['test'], { shell: false })`
  is faithfully shell-free at the level this module controls, but `npm`
  itself, once invoked, spawns the `scripts.test` value through a shell
  internally (documented npm behavior: `npm-run-script` always interprets the
  script string via `/bin/sh -c` / `cmd.exe`). The entire `SHELL_META` +
  `shell: false` design constrains the *verdict string*; it has no view of,
  and no effect on, `package.json`, which is ordinary repo content editable
  by any contributor, any merged PR, or any agent's Write/Edit tool.
- **Evidence**: passed
  ```
  $ mkdir -p /tmp/poc2 && cd /tmp/poc2
  $ cat > package.json <<'EOF'
  {"name":"poc","version":"1.0.0","scripts":{"test":"touch PWNED-VIA-NPM-SCRIPT.txt; echo done"}}
  EOF
  $ node -e '
  import("/Users/avelikiy/development/Personal/great_cto/scripts/lib/execution-claims.mjs")
    .then(({ checkExecution }) => {
      const r = checkExecution({ tests: "npm test" }, { cwd: process.cwd() });
      console.log(JSON.stringify(r));
    });'
  {"status":"passed","exitCode":0,"counts":null,"why":"the check ran and passed","ok":true, ...}
  $ ls PWNED-VIA-NPM-SCRIPT.txt
  -rw-r--r--  1 avelikiy  wheel  0 ... PWNED-VIA-NPM-SCRIPT.txt
  ```
- **Why Critical**: this requires no unusual claim string at all — the
  benign, expected, documented usage (`tests=npm test`) is the exploit.
  Anyone who can influence `package.json` in the target repo (a malicious PR,
  a compromised dependency's postinstall step that rewrites scripts, or a
  prompt-injected agent that edits the file) gets code execution the next
  time *any* agent's routine `npm test` verdict is re-run.
- **Fix direction**: this shape cannot be made safe by tightening the verdict
  string — the danger is entirely in file content this module never
  inspects. Either drop `npm test`/`npm run` as re-runnable shapes, or pin
  execution to a lockfile-hash-verified, CI-only checkout where
  `package.json` is not agent-writable between the commit that produced the
  verdict and the re-run.

### [Critical] The re-run is not scoped to the stopping agent, or to the agent that authored the claim — any Write-capable agent gets unattended code execution regardless of its own Bash grant

- **Location**: `scripts/hooks/subagent-stop-completion.mjs:104-120`
  (`freshestVerdictLine`) and its call site at line 179-191. The function
  scans every `*.log` under `.great_cto/verdicts/` and returns the newest
  entry system-wide; nothing in `main()` filters by the identity of the
  subagent whose `SubagentStop` fired, and `stdin` (which does carry
  `transcript_path`) is read only for cost accounting, never for identity.
- **Problem**: the module's own risk framing — "the agent already has Bash,
  so this grants no new capability" — is only true for the agent whose own
  action is being re-run, and only if that specific agent actually holds
  Bash in that session. Neither condition is checked. A subagent restricted
  to Write (a doc-writer, a read-only reviewer with a Write exception for its
  own report, or an agent limited by the harness's own permission profile)
  can drop a hand-crafted JSON verdict line under *any* filename in
  `.great_cto/verdicts/`, and the very next `SubagentStop` — from a
  completely unrelated agent, possibly one that itself never touched that
  file — triggers execution of that line's claim.
- **Evidence**: passed (full chain, using the shipped module functions)
  ```
  $ mkdir -p /tmp/poc3/.great_cto/verdicts && cd /tmp/poc3
  $ TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  $ echo "{\"v\":1,\"ts\":\"$TS\",\"agent\":\"innocuous-doc-writer\",\"verdict\":\"DONE\",\"meta\":{\"tests\":\"node --test --require ./evil-require.mjs harmless-test.mjs\"}}" \
      > .great_cto/verdicts/innocuous-doc-writer.log
  $ GREAT_CTO_DIR=/tmp/poc3/.great_cto node -e '
  (async () => {
    const mod = await import("/Users/avelikiy/development/Personal/great_cto/scripts/hooks/subagent-stop-completion.mjs");
    const fresh = mod.freshestVerdictLine(process.env.GREAT_CTO_DIR + "/verdicts", 5*60*1000, Date.now());
    console.log("freshest verdict picked up (belongs to agent):", fresh.agent);
    const { checkExecution } = await import("/Users/avelikiy/development/Personal/great_cto/scripts/lib/execution-claims.mjs");
    console.log(JSON.stringify(checkExecution(fresh.meta, { cwd: "/tmp/poc3" })));
  })();'
  freshest verdict picked up (belongs to agent): innocuous-doc-writer
  {"status":"passed","exitCode":0,"counts":{"pass":1,"fail":0},"why":"the check ran and passed","ok":true, ...}
  $ ls /tmp/poc3/PWNED-VIA-REQUIRE.txt
  -rw-r--r--  1 avelikiy  wheel  40 ... PWNED-VIA-REQUIRE.txt
  ```
  This is `subagent-stop-completion.mjs`'s own `freshestVerdictLine` and
  `execution-claims.mjs`'s own `checkExecution` — the exact functions wired
  into `main()` — run back to back with no modification, on a verdict line
  authored under an agent name that is not the one whose stop is being
  processed.
- **Why Critical**: this is the answer to "does it widen the boundary or only
  move it" — **it widens it.** Before this hook, "wrote a file" and
  "executed code" were different actions with a human commit/merge or an
  explicit Bash tool call in between. After it, on any project with
  `GREAT_CTO_VERIFY_EXECUTION=1` set, "wrote a file under
  `.great_cto/verdicts/`" *is* "executed code," and the identity/permission
  checks a downstream user may have configured for their subagents (the
  entire reason a team would restrict some agents to Write-only) are not
  consulted anywhere in this path. For users who are not the author — who
  may run great_cto with tighter per-agent tool grants than the author's own
  environment, where security-officer itself holds full Bash by default —
  this silently reopens exactly the boundary those grants were drawn to
  close, and it does so invisibly: the advisory/enforce messages
  (`subagent-stop-completion.mjs:196-199`) report "ran and passed/failed,"
  never that code execution occurred or on whose behalf.
- **Fix direction**: bind the check to the *specific* agent whose
  `SubagentStop` fired (available from the hook's own stdin payload, e.g. via
  `subagent_type`, the same field `normalizeAgent()` already reads
  elsewhere), and refuse to execute a claim written under a different agent's
  log file. This does not fully close Finding 1/2 above, but it removes the
  cross-agent trust escalation, which is a distinct and independently
  fixable bug from the shape-allowlist gaps.

### [High] `bash scripts/<name>.sh` shape: filename shape is checked, file content is not

- **Location**: `scripts/lib/execution-claims.mjs:54` — the regex constrains
  only the *path string* (`^scripts\/[\w./-]+\.sh$`, no `..`); nothing reads
  or checks the file's content, provenance, or whether it matches the
  version that was actually reviewed/committed.
- **Problem**: this is consistent with the feature's stated purpose
  ("re-run the check") and I am not claiming the shape itself is wrong to
  allow — but it means any actor who can write to `scripts/*.sh` in the
  target repo (again: a PR, a compromised dependency install step, a
  prompt-injected agent's Edit call) fully controls what this shape executes,
  with the *filename* being the only thing this module ever verifies. There
  is no check that the file is unmodified since the commit the verdict was
  written against, or even that it is tracked by git at all.
- **Evidence**: passed — the execution primitive is the same one proven for
  Finding 2 (`checkExecution` runs whatever `execFile` is pointed at); shown
  here is that the shape's own parser places no constraint beyond the
  filename string:
  ```
  $ node -e '
  import("/Users/avelikiy/development/Personal/great_cto/scripts/lib/execution-claims.mjs")
    .then(({ parseCommandClaim }) => {
      console.log(JSON.stringify(parseCommandClaim({ tests: "bash scripts/anything-a-pr-can-add.sh" })));
    });'
  {"key":"tests","value":"bash scripts/anything-a-pr-can-add.sh","argv":["bash","scripts/anything-a-pr-can-add.sh"],"shape":"bash scripts/<name>.sh"}
  ```
  `parseCommandClaim` accepts any filename under `scripts/*.sh` unconditionally
  and hands it straight to `execFile` — confirming the shape check never
  inspects what that file contains.
- **Why High not Critical**: requires write access to `scripts/*.sh` in the
  target repo specifically, a narrower precondition than Finding 2's
  "anyone who can influence `package.json`."

---

## Hypotheses

Not executed as a standalone reproduction; recorded for the fix design, not
listed as findings.

- **Child process inherits full parent environment.**
  `scripts/lib/execution-claims.mjs:104-107` — `runClaim`'s `exec(...)` call
  passes `cwd`, `timeout`, `encoding`, `stdio`, `shell`, and no `env:` key, so
  Node's default (full inheritance of `process.env`) applies. Not run/verified
  here — inferred from reading the options object, cross-checked against
  Node's documented default for `child_process.execFileSync`. Secondary to
  Findings 1-3 (which already grant full code execution) but relevant to the
  fix: a least-privilege child environment would reduce blast radius even for
  a legitimate `npm test` run whose unmodified dependencies turn out to be
  compromised.

- **`SHELL_META` is not load-bearing.**
  `scripts/lib/execution-claims.mjs:42`, `76-78` — since
  `execFileSync(..., { shell: false })` never invokes a shell for the outer
  command, none of `SHELL_META`'s characters can have shell meaning through
  this path regardless of whether the check exists; the shape regexes at
  lines 51-54 already exclude every character in `SHELL_META` from every
  position they govern. Not independently executed as a test — inferred
  from reading the regexes together. Worth recording because the module's
  own docstring calls it one of "three constraints, all of them load-bearing"
  (line 25), which overstates what it does: the constraint actually carrying
  weight is the shape allowlist, and Findings 1-3 show that allowlist does
  not constrain what it needs to.

- **Windows: `npm`/`bash` via `execFile` without a shell likely fails
  closed, not open.** `scripts/lib/execution-claims.mjs:102-118`. Node's
  `child_process.execFile`/`execFileSync` without `shell: true` cannot
  directly invoke `.cmd`/`.bat` shims, which is how `npm` is installed on
  Windows — documented Node.js behavior, not run here (no Windows host
  available). If that holds, the practical effect is `ENOENT`, caught by
  `runClaim`'s generic catch branch (`execution-claims.mjs:108-116`, which
  treats anything other than `SIGTERM`/`ETIMEDOUT` as `status: 'failed'`) —
  i.e. it fails closed (blocks completion) rather than open. Worth a
  correctness note regardless of the security verdict: an infra fault
  (`npm` not resolvable) would get reported as "the check ran and failed,"
  sending an operator to debug a nonexistent failing test rather than a
  missing shim — the same class of mislabeling the module explicitly built
  the `not_run`/timeout branch to avoid for the timeout case, left uncovered
  here.

---

## Trust-boundary answer, stated plainly (as requested)

**This module widens the trust boundary; it does not merely relocate it.**
Two separate widenings, both demonstrated above:

1. **Shape → content gap.** The allowlist governs the shape of a string that
   was never the risk; the risk was always in file content (`package.json`,
   `*.sh`, test files) this module has no visibility into and applies zero
   integrity check to. An agent's Bash grant was never the relevant
   boundary here — a human's merge/review of `package.json` and `scripts/`
   was, and this hook bypasses that boundary by design (that's what "re-run
   the check" means), with no compensating check that what's on disk now is
   what was reviewed then.
2. **Agent-identity gap.** The hook re-runs the *freshest verdict in the
   whole directory*, not the stopping agent's own claim. Any Write-capable
   agent — including one deliberately never granted Bash — gets the
   equivalent of a one-shot unattended Bash call, attributed to whichever
   agent happens to stop next.

For the author's own environment, both gaps are invisible, because every
agent here already holds full Bash (this review's own tool grant included) —
so "no new capability" reads as true by coincidence, not by the module's
design. **For a downstream user who is not the author** — anyone who scopes
subagent permissions more tightly than this repo's own dev setup, which is
the entire reason permission scoping exists — turning on
`GREAT_CTO_VERIFY_EXECUTION=1` silently restores full code execution to every
agent regardless of that scoping, the moment any one of them can write a file
under `.great_cto/verdicts/`, `package.json`, or `scripts/*.sh`. That is a
materially different, worse guarantee than "agents that already have Bash
gain no new capability," and it is the guarantee the feature currently ships
with.

## Recommendation

Do not enable `GREAT_CTO_VERIFY_EXECUTION=1` by default or recommend it in
onboarding docs until at minimum: (a) `node --test` rejects any `-`-prefixed
argument, (b) the hook binds execution to the specific agent whose
`SubagentStop` fired rather than the freshest log directory-wide, and (c) a
decision is made and documented about whether `npm test`/`npm run` should be
re-runnable shapes at all, given Finding 2 requires no adversarial claim
string whatsoever. Findings 1-3 are independent bugs; fixing one does not
fix the others.
