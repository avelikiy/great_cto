/** Restricted Claude Code subprocess for controller-owned, read-only proposals. */
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const PROPOSAL_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    verdict: { type: 'string' }, summary: { type: 'string' }, meta: { type: 'object' },
    files: { type: 'array', items: { type: 'object', properties: {
      path: { type: 'string' }, before: { type: ['string', 'null'] }, content: { type: 'string' },
    }, required: ['path', 'before', 'content'] } },
  },
  required: ['verdict', 'summary', 'meta', 'files'],
});

export function detectClaude({ bin = process.env.GREAT_CTO_CLAUDE_BIN || 'claude', run = spawnSync } = {}) {
  const version = run(bin, ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (version.error || version.status !== 0) return { state: 'absent', why: 'Claude Code CLI is unavailable' };
  const auth = run(bin, ['auth', 'status', '--json'], { encoding: 'utf8', timeout: 10000 });
  let status;
  try { status = JSON.parse(auth.stdout || '{}'); } catch { status = {}; }
  return { state: auth.status === 0 && status.loggedIn === true ? 'available' : 'no-auth',
    version: String(version.stdout || '').trim(), auth: status.authMethod || null,
    why: status.loggedIn === true ? '' : 'Claude Code is not logged in; run claude auth login' };
}

export function parseClaudeResult(raw) {
  let body;
  try { body = JSON.parse(String(raw || '')); } catch { return { state: 'unreadable', finalText: null, errors: ['Claude returned invalid JSON'], usage: null }; }
  const result = body.structured_output && typeof body.structured_output === 'object' && !Array.isArray(body.structured_output)
    ? JSON.stringify(body.structured_output) : body.result;
  if (body.is_error || body.type !== 'result' || typeof result !== 'string' || !result.trim()) {
    return { state: 'unreadable', finalText: null, errors: [String(body.error || body.result || 'Claude returned no result')], usage: null };
  }
  return { state: 'ok', finalText: result, text: result, errors: [],
    usage: body.usage || null, model: body.model || null };
}

export function runClaudeExec({ prompt, cwd, timeoutMs = 300000, bin = process.env.GREAT_CTO_CLAUDE_BIN || 'claude', onEvent = null }) {
  return new Promise(resolve => {
    const deadline = performance.now() + timeoutMs;
    // Safe mode removes hooks, skills, plugins and project instructions. Restricted
    // mode confines file tools to cwd. The tools allow only inspection; the
    // controller remains the sole writer and gate owner.
    const streaming = typeof onEvent === 'function';
    const args = ['--print', '--output-format', streaming ? 'stream-json' : 'json', ...(streaming ? ['--verbose'] : []), '--no-session-persistence',
      '--safe-mode', '--restricted', '--strict-mcp-config', '--tools', 'Read,Glob,Grep',
      '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--json-schema', PROPOSAL_SCHEMA];
    const group = process.platform !== 'win32';
    const proc = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], detached: group });
    let out = '', err = '', settled = false, timedOut = false, stdinError = null;
    let observationHealth = 'ok', line = '', dropping = false;
    const observationLimit = 1024 * 1024;
    const observeLine = value => {
      if (!value.trim()) return;
      try {
        const event = JSON.parse(value);
        if (!event || typeof event !== 'object' || Array.isArray(event)) { observationHealth = 'degraded'; return; }
        const pending = onEvent(event);
        if (pending && typeof pending.then === 'function') {
          // Observations are synchronous: do not create an untracked writer lifetime.
          observationHealth = 'degraded'; Promise.resolve(pending).catch(() => {});
        }
      } catch { observationHealth = 'degraded'; }
    };
    const observeChunk = chunk => {
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf('\n', offset), end = newline < 0 ? chunk.length : newline;
        if (!dropping) {
          const part = chunk.slice(offset, end);
          if (Buffer.byteLength(line, 'utf8') + Buffer.byteLength(part, 'utf8') > observationLimit) {
            line = ''; dropping = true; observationHealth = 'degraded';
          } else line += part;
        }
        if (newline < 0) break;
        if (!dropping) observeLine(line);
        line = ''; dropping = false; offset = newline + 1;
      }
    };
    const finish = result => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
    const kill = () => {
      try { if (group && proc.pid) process.kill(-proc.pid, 'SIGKILL'); else proc.kill('SIGKILL'); }
      catch { try { proc.kill('SIGKILL'); } catch { /* process already exited */ } }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', bytes => { out += bytes; if (streaming) observeChunk(bytes); });
    proc.stderr.on('data', bytes => { err += String(bytes); });
    const inputFailed = error => {
      stdinError ||= typeof error?.code === 'string' ? error.code : 'STDIN_ERROR';
      kill(); // incomplete input must not produce an accepted proposal
    };
    proc.stdin.on('error', inputFailed);
    proc.on('error', error => finish({ state: 'unreadable', finalText: null, errors: [String(error.message)], usage: null, code: null }));
    proc.on('close', code => {
      if (group && proc.pid) { try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* gone */ } }
      if (streaming && line && !dropping) observeLine(line);
      // Final execution parsing is independent of the bounded observer and its callback.
      let final = out;
      if (streaming) {
        final = '';
        for (const candidate of out.split('\n')) {
          try { if (JSON.parse(candidate)?.type === 'result') final = candidate; } catch { /* observer reports malformed lines */ }
        }
      }
      const parsed = parseClaudeResult(final);
      if (err.trim()) parsed.errors.push(err.trim().slice(-4000));
      if (stdinError) {
        parsed.state = 'unreadable'; parsed.text = null; parsed.finalText = null;
        parsed.errors.push(`prompt transport failed: ${stdinError}`);
      }
      if (performance.now() >= deadline) timedOut = true;
      if (timedOut) { parsed.state = 'unreadable'; parsed.text = null; parsed.finalText = null; parsed.errors.push(`timed out after ${timeoutMs}ms`); }
      finish({ ...parsed, code, timedOut, ...(streaming ? { observationHealth } : {}) });
    });
    try { proc.stdin.end(prompt); } catch (error) { inputFailed(error); }
  });
}
