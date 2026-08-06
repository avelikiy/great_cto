#!/usr/bin/env node
/**
 * execution-claims — was the check the agent cites actually run, and did it pass?
 *
 * Why this exists
 * ---------------
 * The rung below this one (artifact-claims) asks whether a named document
 * exists. It cannot catch the failure that actually happened: qa-engineer
 * recorded `coverage=100%` after running about a third of the suite, and
 * code-reviewer approved a change without re-running anything. Both claims were
 * sincere. Neither was checked, because reading a claim and believing it is not
 * a check.
 *
 * So this rung re-runs the command and compares the result to the claim. It is
 * the only way to tell "the tests pass" from "the agent believes the tests pass".
 *
 * Running agent-written strings is the whole risk
 * -----------------------------------------------
 * The command comes out of a verdict file that agents write. Executing it turns
 * a reporting channel into an execution channel. The agent already has Bash, so
 * this grants no new capability — but a hook that runs whatever a log says is a
 * different and worse thing than an agent running its own commands, because
 * nobody is watching this one.
 *
 * Three constraints, all of them load-bearing:
 *
 *   1. No shell, ever. execFile with an argv array. No pipes, redirection,
 *      substitution, chaining — a metacharacter anywhere refuses the claim.
 *   2. An allowlist of command SHAPES, not of prefixes. `node --test <paths>`,
 *      `npm test`, `npm run <script>`, `bash scripts/<name>.sh`. Anything else
 *      is refused, and refusal is a failure to verify, not a pass.
 *   3. A time budget. A hook that can hang is an outage, so a run that exceeds
 *      it is `not_run` — an unknown, which does not pass.
 *
 * Verdicts use the proof-status vocabulary the repo already defines: passed,
 * failed, not_run, refused. Both unknowns block, same as everywhere else here.
 */

import { execFileSync } from 'node:child_process';

/** Anything that would need a shell to mean what it says. */
const SHELL_META = /[;&|<>$`(){}\[\]!*?~\n\r\\'"]/;

/**
 * Command shapes this module will run.
 *
 * Shapes rather than prefixes: `node` alone would allow `node -e '<anything>'`,
 * which is a shell by another name. Each entry states exactly what may follow.
 */
const ALLOWED = [
  { name: 'node --test', match: (a) => a[0] === 'node' && a[1] === '--test' && a.length > 2 && a.slice(2).every(isPathish) },
  { name: 'npm test', match: (a) => a[0] === 'npm' && a[1] === 'test' && a.length === 2 },
  { name: 'npm run <script>', match: (a) => a[0] === 'npm' && a[1] === 'run' && a.length === 3 && /^[\w:-]+$/.test(a[2]) },
  { name: 'bash scripts/<name>.sh', match: (a) => a[0] === 'bash' && a.length === 2 && /^scripts\/[\w./-]+\.sh$/.test(a[1]) && !a[1].includes('..') },
];

function isPathish(s) {
  return /^[\w./*-]+$/.test(s) && !s.includes('..');
}

/**
 * A command claim from verdict meta → {key, argv, shape} or a refusal.
 *
 * Looks at keys that name a check (`tests`, `check`, `checks`, `verify`) whose
 * value looks like a command rather than a count — `tests=33` is a claim for the
 * rung above, `tests=node --test tests/lib/x.test.mjs` is one for this rung.
 */
export function parseCommandClaim(meta) {
  const KEYS = ['tests', 'test', 'check', 'checks', 'verify', 'cmd'];
  for (const key of KEYS) {
    const raw = meta?.[key];
    if (raw == null) continue;
    const value = String(raw).trim();
    if (!value || !/\s/.test(value)) continue;          // `tests=33` — a count, not a command

    if (SHELL_META.test(value)) {
      return { key, value, refused: 'contains shell metacharacters — this runs without a shell, so it would not mean what it says' };
    }
    const argv = value.split(/\s+/);
    const shape = ALLOWED.find((s) => s.match(argv));
    if (!shape) {
      return { key, value, refused: `not an allowed command shape (${ALLOWED.map((s) => s.name).join(', ')})` };
    }
    return { key, value, argv, shape: shape.name };
  }
  return null;
}

/** node --test TAP output → {pass, fail} when it says so. */
export function parseCounts(output) {
  const pass = String(output).match(/^# pass (\d+)$/m);
  const fail = String(output).match(/^# fail (\d+)$/m);
  if (!pass && !fail) return null;
  return { pass: pass ? Number(pass[1]) : null, fail: fail ? Number(fail[1]) : null };
}

/**
 * Run an allowed command and report what happened.
 *
 * @returns {{status:'passed'|'failed'|'not_run', exitCode:number|null, counts:object|null, why:string}}
 */
export function runClaim(argv, { cwd = process.cwd(), timeoutMs = 120_000, exec = execFileSync } = {}) {
  let output = '';
  try {
    output = exec(argv[0], argv.slice(1), {
      cwd, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false,
    });
  } catch (e) {
    // A timeout is not a failing test — it is a check that did not complete, and
    // reporting it as `failed` would send someone to debug the wrong thing.
    if (e?.signal === 'SIGTERM' || e?.code === 'ETIMEDOUT') {
      return { status: 'not_run', exitCode: null, counts: null, why: `the check did not finish within ${Math.round(timeoutMs / 1000)}s` };
    }
    const out = `${e?.stdout ?? ''}${e?.stderr ?? ''}`;
    return { status: 'failed', exitCode: e?.status ?? null, counts: parseCounts(out), why: `the check ran and failed (exit ${e?.status ?? '?'})` };
  }
  return { status: 'passed', exitCode: 0, counts: parseCounts(output), why: 'the check ran and passed' };
}

/**
 * The whole rung: does the verdict's own check back the verdict?
 *
 * A success verdict with a failing check is the case this exists for. A refusal
 * to run the claim is `not_run`, which does not pass — a command this module
 * will not execute is a claim nobody verified.
 */
export function checkExecution(meta, { cwd = process.cwd(), timeoutMs = 120_000, exec, run = runClaim } = {}) {
  const claim = parseCommandClaim(meta);
  if (!claim) return { status: 'absent', ok: true, why: 'the verdict names no command to re-run' };
  if (claim.refused) {
    return { status: 'refused', ok: false, claim, why: `will not run \`${claim.value}\` — ${claim.refused}` };
  }
  const r = run(claim.argv, { cwd, timeoutMs, exec });
  return { ...r, ok: r.status === 'passed', claim };
}

/** One line an operator can act on, or null when the check backed the verdict. */
export function explainExecution(result) {
  if (!result || result.ok) return null;
  const cmd = result.claim ? `\`${result.claim.value}\`` : 'the declared check';
  if (result.status === 'refused') return `${result.why}. Name a check this can re-run, or record the result yourself and drop the claim.`;
  if (result.status === 'not_run') return `${cmd} — ${result.why}. An unfinished check is not a passing one.`;
  const counts = result.counts ? ` (${result.counts.fail} failing)` : '';
  return `the verdict reports success but ${cmd} fails${counts}. Fix the check or change the verdict — the two cannot both stand.`;
}
