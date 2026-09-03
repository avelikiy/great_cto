// Which guards run where CI actually runs — and which only look like they do.
//
// Bought by a finding rather than a design. `artifact-lint --enforce` was wired
// in exactly one place, `.github/workflows/runtime-ci.yml`, and GitHub Actions
// has been billing-locked for weeks: every run fails in seconds with no logs.
// So the check was configured, correct, and had not executed once. Six
// structural errors accumulated over nineteen days behind it.
//
// Worse in the same sweep: `.github/workflows/security-tests.yml` invoked
// `tests/security/run-all.sh`, deleted on 2026-05-23 with the subsystem it
// tested. For eighty-six days the repository had a workflow named
// `security-tests` that was not failing its tests — it was failing on
// `No such file` — while PROJECT.md cited it as evidence CI was configured.
//
// A check that never runs is invisible in exactly the way a check that runs and
// passes is: both are silent. This makes the difference audible.
//
// Three states, never two
// -----------------------
//   parity            the workflow runs it and so does ci-local
//   remote-by-design  it belongs on a runner and is named here with its reason
//   actions-only      a guard that should run locally and does not  → blocks
//   broken            it invokes a file that does not exist          → blocks
//
// `remote-by-design` is an explicit list with a stated reason per entry, not a
// pattern that quietly absorbs whatever it happens to match. An allowlist
// nobody has to justify is how the next guard goes missing.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Commands that genuinely belong on a remote runner, each with the reason.
 *
 * The point of this module is NOT that everything should run locally. Matrix
 * builds across operating systems, publishing from a clean checkout, and
 * probing the package as published are real work that a laptop cannot stand in
 * for. The point is that a *correctness gate* which exists only remotely is not
 * a gate.
 */
export const REMOTE_BY_DESIGN = Object.freeze([
  { match: /npm publish|jsr publish|gh release|actions\/|softprops/i, why: 'publishes or releases — must run from a clean runner, not a laptop' },
  { match: /great-cto@latest|canary\.sh/i, why: 'probes the package as published — the local tree is the wrong subject' },
  { match: /apt-get|sudo |playwright install|npm ci\b|actions\/setup/i, why: 'runner provisioning, not a check' },
  { match: /cyclonedx|sbom/i, why: 'produces a release artifact for upload; nothing to assert locally' },
  { match: /announce|awesome-list|scorecard|canary-report/i, why: 'scheduled reporting, not a gate' },
  // Shell plumbing is NOT listed here. It is the fallback in `classify`, so that
  // this list stays what it claims to be: commands somebody decided belong on a
  // runner, each with the decision attached.
]);

/** A command worth asking about at all: it can fail, and failing would mean something. */
const INTERESTING = /^(node|bash|python3|npm run|npx)\s+\S/;

/**
 * The repo-relative script a command INVOKES, or null.
 *
 * Narrowed over several passes against the real workflows, because the first
 * version reported thirty findings and most were noise. What it now refuses to
 * treat as an invoked script, and why each one mattered:
 *
 *   - a glob (`tests/*.test.mjs`) — a pattern, not a file; `existsSync` on it is
 *     always false and always meaningless
 *   - anything outside the repo (`/tmp/canary.sh`, `~/.great_cto/projects.json`)
 *     — created or consumed during the run; the local tree cannot answer for it
 *   - a leftover from `${{ … }}` interpolation (`}}/main/scripts/canary.sh`)
 *   - a token that follows a flag (`--output-file sbom.cdx.json`) — that is an
 *     argument's value, usually an OUTPUT, and an output not existing yet is
 *     the normal case rather than a defect
 *
 * Only the first positional token is considered, which is the honest reading of
 * "invokes": `node X args…` invokes X.
 */
export function referencedPath(cmd) {
  const toks = String(cmd).trim().split(/\s+/);
  let i = 1;
  if (/^(npm|npx)$/.test(toks[0])) i = 2;            // `npm run X`, `npx pkg`
  for (; i < toks.length; i++) {
    const tok = toks[i];
    if (tok.startsWith('-')) return null;            // a flag before any script: nothing is invoked
    if (tok.includes('*') || tok.includes('{') || tok.includes('}')) return null;
    if (tok.includes('$')) return null;
    if (tok.startsWith('/') || tok.startsWith('~')) return null;
    if (!/\.(mjs|js|sh|py|ts)$/.test(tok)) return null;
    // A bare filename (`node index.mjs`) is resolved against the step's
    // `working-directory`, which this reader does not track. Guessing it means
    // repo root reported five phantom "does not exist" findings for a file that
    // is simply at `packages/cli/index.mjs`. Not reporting is the honest answer:
    // an unverifiable reference is not a broken one.
    if (!tok.includes('/')) return null;
    return tok;
  }
  return null;
}

/**
 * Every `run:` command in a workflow file.
 *
 * A line-based reader rather than a YAML parser, because `packages/board` holds
 * this repository to zero runtime dependencies and a parser for one field is not
 * worth breaking that for. It handles both `run: <cmd>` and `run: |` blocks,
 * using indentation to find where a block ends.
 */
export function runCommands(yamlText) {
  const out = [];
  const lines = String(yamlText ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Three dialects, because being blind to one is the defect this file
    // exists to catch, one level up:
    //   GitHub     run: <cmd>
    //   Cirrus     <name>_script: <cmd>        (gone, kept — see above)
    //   CircleCI   command: <cmd>              under a `run:` mapping
    // Matching only the first meant a config was loaded and every command in
    // it ignored, which looks exactly like a config with no findings.
    const m = lines[i].match(/^(\s*)-?\s*(?:run|command|[a-z0-9_]*script):\s*(\|[-+]?|>|)(.*)$/);
    if (!m) continue;
    const [, indent, block, inline] = m;

    if (!block && inline.trim()) { out.push(inline.trim()); continue; }

    // Two shapes follow a bare key: a literal block (`|`), whose lines are the
    // script, and a YAML list, whose items are. Both are indented deeper than
    // the key, so the same walk collects them; list items shed their dash.
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') continue;
      const lead = line.match(/^(\s*)/)[1];
      if (lead.length <= indent.length) { i = j - 1; break; }
      let item = line.trim().replace(/^-\s*/, '');

      // CircleCI's `run:` is a MAPPING, not a command: the block under it holds
      // `name:` and `command:` keys, so the raw lines arrive as
      // "command: bash scripts/x.sh" and "name: Build CLI".
      //
      // Left as-is, that prefix made classify() read EVERY CircleCI command as
      // remote-by-design — sanctioned, and silently skipped. The config was
      // read, 61 lines were extracted, and not one of them could ever produce a
      // finding. A parity check that loads a file and ignores its contents is
      // indistinguishable from one that finds nothing wrong, which is the
      // failure this whole file exists to prevent, one level up.
      //
      // Two mutations were needed to see it: the first pointed at a script that
      // does not exist, which parity skips for good reason, and passing looked
      // like proof.
      if (/^name:\s/.test(item)) continue;                 // a label, not a command
      item = item.replace(/^command:\s*(\|[-+]?|>)?\s*/, '');
      if (!item) continue;

      out.push(item);
      i = j;
    }
  }
  return out;
}

/**
 * The local runners' text, with every `npm run <name>` they invoke replaced by
 * what that script actually executes.
 *
 * Without this, `ci-local.sh` running `npm run test:e2e` — whose body is
 * `node ../../tests/run-archetype-e2e.mjs` — reads as not running that file at
 * all. The tempting fix was to name the path in a ci-local comment so the text
 * match would find it, which is writing a comment to make a check pass: the
 * shape GUARD-R3 exists to forbid. Resolving the indirection is the honest
 * version of the same fix.
 *
 * Only scripts the runners actually call are expanded. Appending every script
 * in every package.json would claim parity for work nothing invokes.
 *
 * @param {string} text        the concatenated local runner scripts
 * @param {Array<{name:string,scripts:object}>} manifests
 */
export function expandNpmScripts(text, manifests = []) {
  let out = String(text ?? '');
  for (const m of String(text ?? '').matchAll(/npm run ([\w:-]+)/g)) {
    for (const man of manifests) {
      const body = man?.scripts?.[m[1]];
      if (body) out += `\n${body}`;
    }
  }
  return out;
}

/** Classify one workflow command against what ci-local runs. */
export function classify(cmd, { ciLocalText = '', exists = existsSync } = {}) {
  const path = referencedPath(cmd);

  // Asked first, and deliberately: a command naming a file that is not there is
  // broken whatever else is true of it. Reaching the allowlist first would let
  // a dead workflow be excused as remote-by-design, which is how `security-tests`
  // survived eighty-six days looking configured.
  if (path && !exists(path)) {
    return { state: 'broken', why: `invokes ${path}, which does not exist` };
  }

  if (path && ciLocalText.includes(path)) {
    return { state: 'parity', why: `a local runner runs ${path}` };
  }

  // The named allowlist is consulted BEFORE the plumbing fallback. Reversed, an
  // `npm publish` reported as "shell plumbing inside a step" — the right verdict
  // carried by a reason that was simply false, which is the shape the
  // `fabricated-cause` lesson rule exists to catch.
  for (const rule of REMOTE_BY_DESIGN) {
    if (rule.match.test(cmd)) return { state: 'remote-by-design', why: rule.why };
  }

  if (!INTERESTING.test(cmd)) {
    return { state: 'remote-by-design', why: 'shell plumbing inside a step, not a command of its own' };
  }

  // Without an identifiable repo script there is nothing to port and nothing to
  // name — a shell fragment inside a step is not a guard that went missing.
  // Reporting those produced twenty-odd findings reading `runs in a workflow and
  // nowhere ci-local reaches` with no subject, which is how a check earns the
  // reputation that gets it ignored.
  if (!path) return { state: 'remote-by-design', why: 'no repo script invoked — shell inside a step' };

  return { state: 'actions-only', why: `${path} runs in a workflow and nowhere ci-local reaches` };
}

/**
 * The whole comparison.
 *
 * @param {{workflows: Array<{name:string,text:string}>, ciLocalText: string, exists?: Function}} o
 */
export function parity({ workflows = [], ciLocalText = '', exists = existsSync } = {}) {
  const findings = [];
  for (const wf of workflows) {
    for (const cmd of runCommands(wf.text)) {
      const c = classify(cmd, { ciLocalText, exists });
      if (c.state === 'parity' || c.state === 'remote-by-design') continue;
      findings.push({ workflow: wf.name, cmd, ...c });
    }
  }
  // Deduplicate: one command repeated across a matrix is one finding, not six.
  const seen = new Set();
  const unique = findings.filter((f) => {
    const k = `${f.state}::${f.cmd}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    state: unique.length ? 'gaps' : 'parity',
    broken: unique.filter((f) => f.state === 'broken'),
    actionsOnly: unique.filter((f) => f.state === 'actions-only'),
  };
}

/** Lines a human can act on. */
export function describeParity(p) {
  if (!p) return '';
  if (p.state === 'parity') return 'every workflow guard either runs in ci-local or is named remote-by-design';
  const lines = [];
  for (const f of p.broken) lines.push(`  broken       ${f.workflow}: ${f.why}`);
  for (const f of p.actionsOnly) lines.push(`  actions-only ${f.workflow}: ${f.why}`);
  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  // Every remote CI definition, not just GitHub's.
  //
  // This read `.github/workflows` and nothing else, which was correct while
  // that was the only remote runner. `.cirrus.yml` arrived when the account's
  // billing lock disabled Actions, and it was invisible here — so a guard
  // declared only in Cirrus would have satisfied a parity check that never
  // looked at it. A parity check blind to one of the two runners is the defect
  // it exists to catch, one level up.
  const workflows = [];

  const WF_DIR = '.github/workflows';
  if (existsSync(WF_DIR)) {
    for (const f of readdirSync(WF_DIR)) {
      if (!/\.ya?ml$/.test(f)) continue;
      try { workflows.push({ name: f, text: readFileSync(join(WF_DIR, f), 'utf8') }); }
      catch { /* a file that vanished between listing and reading is not a parity gap */ }
    }
  }

  // Single-file runners. Cirrus was here and is gone — it shut down on
  // 2026-06-01 — but the list stays plural on purpose: the whole reason this
  // block exists is that a second runner arrived once and was invisible, and
  // the next one will arrive the same way.
  for (const f of ['.cirrus.yml', '.cirrus.yaml', '.circleci/config.yml', '.circleci/config.yaml']) {
    if (!existsSync(f)) continue;
    try { workflows.push({ name: f, text: readFileSync(f, 'utf8') }); }
    catch { /* same */ }
  }

  if (!workflows.length) {
    console.log('guard-parity: no remote CI definitions found — nothing to compare.');
    process.exit(0);
  }

  // The local side is not one file. `ci-local.sh` is the per-commit gate, but
  // `loop-local.sh` is the periodic one — it runs the holdout evals and the
  // drift check, which cost about $46 and have no business in a per-commit
  // gate. Comparing against ci-local alone reported both as missing when they
  // run locally every cycle: measuring one runner and calling it "local".
  const LOCAL_RUNNERS = ['scripts/ci-local.sh', 'scripts/loop-local.sh'];
  let ciLocalText = '';
  const readRunners = [];
  for (const r of LOCAL_RUNNERS) {
    try { ciLocalText += readFileSync(r, 'utf8') + '\n'; readRunners.push(r); }
    catch { /* recorded by its absence from readRunners below */ }
  }
  if (!readRunners.length) {
    // Not "no gaps". With no local side there is nothing to compare against,
    // and reporting parity here would be the exact defect this module removes.
    console.error(`guard-parity: could not read any of ${LOCAL_RUNNERS.join(', ')} — comparison not possible, which is not the same as parity`);
    process.exit(2);
  }

  const manifests = [];
  for (const p of ['package.json', 'packages/cli/package.json', 'packages/board/package.json']) {
    try { manifests.push(JSON.parse(readFileSync(p, 'utf8'))); }
    catch { /* a workspace without a manifest resolves no scripts, which is not a gap */ }
  }
  ciLocalText = expandNpmScripts(ciLocalText, manifests);

  const p = parity({ workflows, ciLocalText });
  console.log(`guard-parity: ${workflows.length} workflow(s) against ${readRunners.join(' + ')}`);
  console.log(describeParity(p));
  if (process.argv.includes('--json')) console.log(JSON.stringify(p, null, 2));

  const blocking = p.broken.length + p.actionsOnly.length;
  process.exit(process.argv.includes('--strict') && blocking ? 1 : 0);
}
