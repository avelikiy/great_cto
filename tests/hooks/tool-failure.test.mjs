// Validates the failed-session-mining capture machinery (great_cto-5ap Phase 5 / great_cto-8us):
// the PostToolUse hook scripts/hooks/tool-failure.mjs must log every failure shape to
// .great_cto/tool-failures.log (the ground truth continuous-learner Step 0 mines) and stay
// SILENT on success. A silent miss here would starve the whole mining pipeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '../../scripts/hooks/tool-failure.mjs');

function run(payload) {
  const projectDir = mkdtempSync(join(tmpdir(), 'toolfail-'));
  mkdirSync(join(projectDir, '.great_cto'), { recursive: true });
  const r = spawnSync('node', [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    cwd: projectDir,
  });
  const logPath = join(projectDir, '.great_cto', 'tool-failures.log');
  const lines = existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean) : [];
  return { exit: r.status, lines, entry: lines[0] ? JSON.parse(lines[0]) : null };
}

// ── failures are captured (all 3 documented payload shapes + bash signals) ──
test('is_error:true → logged with tool+input+error', () => {
  const { lines, entry } = run({ tool_name: 'Bash', tool_input: { command: 'git push' }, is_error: true, tool_response: 'fatal: not a repo' });
  assert.equal(lines.length, 1);
  assert.equal(entry.tool, 'Bash');
  assert.equal(entry.input, 'git push');
  assert.ok(entry.error.includes('fatal'));
  assert.ok(entry.ts, 'has timestamp');
});

test('flat {error} shape → logged', () => {
  const { lines, entry } = run({ tool_name: 'Read', tool_input: { file: '/x' }, error: 'ENOENT no such file' });
  assert.equal(lines.length, 1);
  assert.ok(entry.error.includes('ENOENT'));
});

test('nested {result:{error}} shape → logged', () => {
  const { lines, entry } = run({ tool_name: 'Edit', tool_input: { path: 'a.ts' }, result: { error: 'string not found' } });
  assert.equal(lines.length, 1);
  assert.ok(entry.error.includes('not found'));
});

test('bash "Exit code N" in output → logged', () => {
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: 'Exit code 1' }).lines.length, 1);
});

test('PermissionDenied in output → logged', () => {
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'cat /root/x' }, output: 'permission denied' }).lines.length, 1);
});

// ── silence on success / non-failures (no false positives) ──────────────────
test('clean success → NOT logged (silent)', () => {
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'ls' }, is_error: false, tool_response: 'a.txt b.txt' }).lines.length, 0);
});

test('BLOCKED: 0 (zero blocked) → NOT logged (not a real failure)', () => {
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'scan' }, tool_response: 'BLOCKED: 0 findings' }).lines.length, 0);
});

test('empty / malformed stdin → no crash, no log', () => {
  assert.equal(run('').lines.length, 0);
  assert.equal(run('not json{{').lines.length, 0);
});

// ── log format is what continuous-learner Step 0 expects: JSON line {ts,tool,input,error} ──
test('every logged line is valid JSON with the 4 mining fields', () => {
  const { entry } = run({ tool_name: 'Bash', tool_input: { command: 'x' }, is_error: true, tool_response: 'boom' });
  assert.deepEqual(Object.keys(entry).sort(), ['error', 'input', 'tool', 'ts']);
});
