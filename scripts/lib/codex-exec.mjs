/**
 * codex-exec — the Codex CLI as a subprocess, and whether one is here to run.
 *
 * Moved out of tests/eval/arm-codex.mjs the day Codex became a participant in
 * the pipeline rather than a thing the evals compare against. The parser and
 * runner are unchanged in behaviour; what is new is `detectCodex`, because a
 * second opinion that is silently absent reads exactly like a second opinion
 * that agreed.
 *
 * Three things a caller must be able to tell apart, and none may look like PASS:
 *   absent      no `codex` on PATH
 *   no-auth     a binary and no login — `codex exec` returns 400 on every model
 *   available   version, auth mode and the model it will run, read from disk
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * `codex exec --json` output → the answer, its cost, and what went wrong.
 *
 * Four states, and the last three are why this is not a one-liner:
 *
 *   ok          an agent message was produced
 *   empty       the stream parsed and carried no agent message
 *   unreadable  nothing in the stream parsed at all
 *   (errors)    non-fatal problems Codex reported mid-run, always surfaced
 *
 * `empty` returns `text: null`, never `""`. An empty answer graded as an answer
 * scores like a real one. `usage` is null when the turn did not report it — a
 * cost comparison that reads a missing measurement as zero makes one harness
 * look free.
 */
export function parseCodexStream(raw) {
  const messages = [];
  const errors = [];
  let usage = null;
  let parsedAny = false;

  for (const line of String(raw ?? '').split('\n')) {
    const s = line.trim();
    // The CLI interleaves human-readable lines with the JSON stream, so a line
    // that does not parse is noise to step over, not a failure.
    if (!s.startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(s); } catch { continue; }
    parsedAny = true;

    if (ev.type === 'turn.completed' && ev.usage) usage = ev.usage;
    const item = ev.item;
    if (!item) continue;
    if (item.type === 'agent_message' && typeof item.text === 'string') messages.push(item.text);
    // Codex reports recoverable problems as error items: a rejected plugin
    // config, a truncated skill budget. A verdict built over a degraded run is
    // a verdict about the wrong thing, so these always reach the caller.
    else if (item.type === 'error' && item.message) errors.push(String(item.message));
  }

  if (!parsedAny) return { state: 'unreadable', text: null, finalText: null, messages, usage: null, errors };
  if (!messages.length) return { state: 'empty', text: null, finalText: null, messages, usage, errors };
  // Preserve the historic aggregate for prose consumers such as cross-model
  // review, while making the protocol-final message explicit for JSON users.
  // A single implicit choice cannot serve both shapes safely.
  return { state: 'ok', text: messages.join('\n'), finalText: messages.at(-1), messages, usage, errors };
}

/**
 * Run one prompt through the Codex CLI and parse the result.
 *
 * The prompt goes on stdin: passing it as an argument alongside `-c` overrides
 * made the CLI wait on stdin instead, which looks exactly like a hung model.
 *
 * `sandbox` defaults to read-only: a reviewer that can write is not a reviewer.
 * `ephemeral` keeps the review out of the user's Codex session history.
 *
 * @returns the shape of `parseCodexStream`, plus `{ code, model }`
 */
export function runCodexExec({
  prompt, cwd, timeoutMs = 300000, bin = 'codex', model = null,
  sandbox = 'read-only', ephemeral = true, extraArgs = [],
}) {
  return new Promise((resolve) => {
    const args = ['exec', '--json', '--skip-git-repo-check'];
    if (sandbox) args.push('-s', sandbox);
    if (ephemeral) args.push('--ephemeral');
    if (model) args.push('-m', model);
    if (cwd) args.push('-C', cwd);
    args.push(...extraArgs, '-');

    // Its own process group, so a timeout stops the CLI AND whatever it started.
    // Killing only the CLI left its children running — the same orphan that kept
    // a release gate's test runner alive for a day (2026-09-10).
    const group = process.platform !== 'win32';
    const proc = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env }, detached: group });
    let out = '';
    let err = '';
    let timedOut = false;
    const killGroup = () => {
      try {
        if (group && proc.pid) process.kill(-proc.pid, 'SIGKILL');
        else proc.kill('SIGKILL');
      } catch { try { proc.kill('SIGKILL'); } catch { /* gone */ } }
    };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, timeoutMs);

    proc.stdout.on('data', (b) => { out += String(b); });
    proc.stderr.on('data', (b) => { err += String(b); });
    proc.on('error', (e) => {
      clearTimeout(timer);
      resolve({ state: 'unreadable', text: null, usage: null, errors: [String(e.message || e)], code: null, model, timedOut });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      // Best effort: a child the CLI left behind must not outlive the review.
      if (group && proc.pid) { try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* group already gone */ } }
      const parsed = parseCodexStream(out);
      // stderr is kept even on success: Codex writes warnings there that change
      // how a result should be read.
      // Retain complete recent diagnostics. Keeping the first 500 bytes cut a
      // shell-snapshot warning before its reason, so the caller could neither
      // classify the exact known fallback nor distinguish it from a sandbox
      // or validation failure.
      if (err.trim()) parsed.errors.push(err.trim().slice(-4000));
      // A run cut off by the clock may have printed a verdict before it was done.
      // That is a truncated answer, and a truncated answer is not an answer.
      if (timedOut) {
        parsed.errors.push(`timed out after ${timeoutMs}ms`);
        if (parsed.state === 'ok') parsed.state = 'unreadable';
      }
      resolve({ ...parsed, code, model, timedOut });
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

/** Kept under the old name for the eval arm. */
export const runCodexArm = (opts) => runCodexExec({ ...opts, sandbox: opts.sandbox ?? null, ephemeral: opts.ephemeral ?? false });

/**
 * What a Codex install on this machine is, from three readings — pure, so the
 * three states can be tested without a Codex.
 *
 * @param {{versionOut:string|null, authJson:string|null, configToml:string|null}} r
 *   `null` for a reading that could not be taken (binary absent, file missing).
 * @returns {{state:'absent'|'no-auth'|'available', version:string|null,
 *            auth:string|null, model:string|null, why:string}}
 */
export function codexStatusFrom({ versionOut, authJson, configToml }) {
  if (versionOut == null) {
    return { state: 'absent', version: null, auth: null, model: null, why: 'codex is not on PATH — npm i -g @openai/codex' };
  }
  const version = (String(versionOut).match(/(\d+\.\d+\.\d+)/) || [])[1] ?? null;

  let auth = null;
  if (authJson != null) {
    try { auth = JSON.parse(authJson)?.auth_mode ?? (JSON.parse(authJson)?.tokens ? 'chatgpt' : null); }
    catch { auth = null; }
  }
  // config.toml may name the model on its own line; a `[profiles.x]` table
  // below can name others, so only the first top-level `model =` counts.
  let model = null;
  if (configToml != null) {
    const top = String(configToml).split(/^\[/m)[0];
    model = (top.match(/^\s*model\s*=\s*"([^"]+)"/m) || [])[1] ?? null;
  }

  if (!auth) {
    return { state: 'no-auth', version, auth: null, model, why: 'codex is installed but not logged in — run `codex login`' };
  }
  return { state: 'available', version, auth, model, why: '' };
}

/** The three readings, taken. */
// `GREAT_CTO_CODEX_BIN` is the one lever for all three consumers — reviewer,
// verifier, board — so a test (or an operator with two Codex installs) points
// them at the same binary, and so an absent Codex can be simulated without
// stripping PATH of the node that runs the server.
export function detectCodex({ bin = process.env.GREAT_CTO_CODEX_BIN || 'codex', home = homedir() } = {}) {
  let versionOut = null;
  try {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0) versionOut = String(r.stdout || r.stderr || '');
  } catch { /* absent */ }
  const read = (p) => { try { return existsSync(p) ? readFileSync(p, 'utf8') : null; } catch { return null; } };
  return codexStatusFrom({
    versionOut,
    authJson: read(join(home, '.codex', 'auth.json')),
    configToml: read(join(home, '.codex', 'config.toml')),
  });
}
