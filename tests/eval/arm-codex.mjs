// The Codex arm of the eval runner.
//
// Why a second arm at all
// -----------------------
// The runner calls an API — Anthropic or OpenRouter — which measures a MODEL.
// Comparing Claude Code against Codex is a different question: the two harnesses
// budget context, batch tool calls and count tokens differently, so routing both
// through one API shim measures the shim rather than either of them.
//
// Method borrowed (not code — that repository ships no licence) from
// phuryn/experiments' five-models-three-harnesses: each model in its own native
// CLI, one task battery, deterministic grading wherever the task admits it.
//
// The parser is separate from the call so the wire format can be tested without
// spending a turn — the shape below is taken from a real run of
// `codex exec --json`.

import { spawn } from 'node:child_process';

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
 * scores like a real one, which is the silent failure this repository keeps
 * removing. `usage` is null when the turn did not report it — a cost comparison
 * that reads a missing measurement as zero makes one harness look free.
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
    // config, a truncated skill budget. An eval scored over a degraded run is a
    // number about the wrong thing, so these always reach the caller.
    else if (item.type === 'error' && item.message) errors.push(String(item.message));
  }

  if (!parsedAny) return { state: 'unreadable', text: null, usage: null, errors };
  if (!messages.length) return { state: 'empty', text: null, usage, errors };
  return { state: 'ok', text: messages.join('\n'), usage, errors };
}

/**
 * Run one prompt through the Codex CLI and parse the result.
 *
 * The prompt goes on stdin: passing it as an argument alongside `-c` overrides
 * made the CLI wait on stdin instead, which looks exactly like a hung model.
 *
 * @returns the shape of `parseCodexStream`, plus `{ code }`
 */
export function runCodexArm({ prompt, cwd, timeoutMs = 300000, bin = 'codex' }) {
  return new Promise((resolve) => {
    const proc = spawn(bin, ['exec', '--json', '--skip-git-repo-check', '-'], {
      cwd, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);

    proc.stdout.on('data', (b) => { out += String(b); });
    proc.stderr.on('data', (b) => { err += String(b); });
    proc.on('error', (e) => {
      clearTimeout(timer);
      resolve({ state: 'unreadable', text: null, usage: null, errors: [String(e.message || e)], code: null });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const parsed = parseCodexStream(out);
      // stderr is kept even on success: Codex writes warnings there that change
      // how a result should be read.
      if (err.trim()) parsed.errors.push(err.trim().slice(0, 500));
      resolve({ ...parsed, code });
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}
