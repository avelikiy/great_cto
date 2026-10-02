import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runDaily } from '../dist/run.js';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
function harness(runs = [], state = 'ok') {
  const calls = [], output = [], errors = [];
  const deps = {
    cwd: '/project', exists: () => true, write: t => output.push(t), fail: t => errors.push(t),
    spawn: (bin, args, options) => {
      calls.push({ bin, args, options });
      return args.includes('list') ? { status: 0, stdout: JSON.stringify({ state, runs, unreadable: state === 'degraded' ? 1 : 0 }) } : { status: 0 };
    },
  };
  return { calls, output, errors, deps };
}

test('Claude task uses interactive plugin entry without shell interpolation or permission bypass', () => {
  const h = harness();
  const prompt = 'fix $(touch /tmp/unsafe); `echo no`';
  assert.equal(runDaily('run', [prompt], h.deps), 0);
  assert.deepEqual(h.calls[0], { bin: 'claude', args: [`/start ${prompt}`], options: { cwd: '/project', stdio: 'inherit' } });
});

test('Claude status and resume use native context rather than Codex state', () => {
  for (const [action, command] of [['status', '/inbox'], ['resume', '/resume']]) {
    const h = harness();
    assert.equal(runDaily(action, [], h.deps), 0);
    assert.deepEqual(h.calls[0].args, [command]);
  }
});

test('invalid arguments and absent write scope never invoke a host', () => {
  for (const [action, args] of [
    ['run', []], ['run', ['task', '--host', 'unknown']], ['run', ['task', '--host', 'codex']],
    ['run', ['task', '--host', 'codex', '--allow', 'src,,docs']], ['run', ['task', '--host']],
    ['resume', ['../../state']], ['resume', [id]], ['status', ['--json']], ['run', ['task', '--yes']],
  ]) {
    const h = harness();
    assert.equal(runDaily(action, args, h.deps), 2, JSON.stringify(args));
    assert.equal(h.calls.length, 0);
  }
});

test('preview and help never start subprocesses or create run state', () => {
  for (const args of [['task', '--dry-run'], ['task', '--host=codex', '--allow=src,docs', '--dry-run'], ['--help']]) {
    const h = harness();
    assert.equal(runDaily('run', args, h.deps), 0);
    assert.equal(h.calls.length, 0);
  }
});

test('Codex feature enters architecture and preserves explicit scope and prompt bytes', () => {
  const h = harness();
  const prompt = 'add OAuth; $(echo untouched)';
  assert.equal(runDaily('run', [prompt, '--host', 'codex', '--allow', 'src,tests,docs'], h.deps), 0);
  assert.deepEqual(h.calls[0].args.slice(1), ['list', '--dir', '/project']);
  assert.deepEqual(h.calls[1].args.slice(1), ['start', '--dir', '/project', '--prompt', prompt, '--allow', 'src,tests,docs', '--entry', 'architect']);
  assert.equal(h.calls[1].options.stdio, 'inherit');
});

test('new project enters product discovery', () => {
  const h = harness();
  h.deps.exists = p => !p.endsWith('PROJECT.md');
  assert.equal(runDaily('run', ['task', '--host=codex', '--allow=src,docs'], h.deps), 0);
  assert.equal(h.calls[1].args.at(-1), 'product-owner');
});

test('resume selects only unfinished project run and never approves pending gates', () => {
  const h = harness([{ id: other, status: 'done' }, { id, status: 'awaiting-gate', pending: { gates: ['gate:ship'] } }]);
  assert.equal(runDaily('resume', ['--host', 'codex'], h.deps), 0);
  assert.deepEqual(h.calls[1].args.slice(1), ['resume', id]);
  assert.ok(h.calls.every(c => !c.args.includes('approve')));
});

test('ambiguous, missing, terminal and unreadable states cannot be resumed', () => {
  for (const [runs, state, extra] of [
    [[], 'absent', []], [[{ id, status: 'ready' }, { id: other, status: 'ready' }], 'ok', []],
    [[{ id, status: 'done' }], 'ok', [id]], [[{ id, status: 'ready' }], 'degraded', [id]],
    [[{ id, status: 'ready' }], 'ok', [other]],
  ]) {
    const h = harness(runs, state);
    assert.equal(runDaily('resume', ['--host', 'codex', ...extra], h.deps), 2);
    assert.equal(h.calls.length, 1);
  }
});

test('an unfinished task prevents duplicate starts, and explicit UUID disambiguates resume', () => {
  const h = harness([{ id, status: 'ready' }, { id: other, status: 'blocked' }]);
  assert.equal(runDaily('run', ['task', '--host=codex', '--allow=src'], h.deps), 2);
  assert.equal(h.calls.length, 1);
  assert.equal(runDaily('resume', [other, '--host=codex'], h.deps), 0);
  assert.deepEqual(h.calls.at(-1).args.slice(1), ['resume', other]);
});

test('status lists all runs without selecting one or starting workers', () => {
  const h = harness([{ id, status: 'awaiting-gate', pending: { gates: ['gate:arch'] } }, { id: other, status: 'done' }]);
  assert.equal(runDaily('status', ['--host=codex'], h.deps), 0);
  assert.match(h.output[0], /Decision needed: gate:arch/);
  assert.equal(h.calls.length, 1);
});

test('subprocess failures are returned rather than reported as success', () => {
  const h = harness();
  h.deps.spawn = () => ({ status: 7 });
  assert.equal(runDaily('run', ['task'], h.deps), 7);
  h.deps.spawn = () => ({ error: Error('ENOENT') });
  assert.equal(runDaily('run', ['task'], h.deps), 2);
  assert.match(h.errors[0], /could not launch/);
});

test('CLI integration: default help is compact and advanced operations remain discoverable', () => {
  const env = { ...process.env, DO_NOT_TRACK: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' };
  const basic = spawnSync(process.execPath, ['index.mjs', 'help'], { encoding: 'utf8', env });
  assert.equal(basic.status, 0, basic.stderr);
  assert.ok(basic.stdout.split('\n').length < 30);
  assert.match(basic.stdout, /great-cto run/);
  assert.match(basic.stdout, /help --advanced/);
  const advanced = spawnSync(process.execPath, ['index.mjs', 'help', '--advanced'], { encoding: 'utf8', env });
  assert.equal(advanced.status, 0, advanced.stderr);
  assert.match(advanced.stdout, /codex-host doctor/);
});

test('CLI integration: prefix host and project flags reach the daily adapter', () => {
  const result = spawnSync(process.execPath, ['index.mjs', '--host', 'codex', '--dir', '.', 'run', 'a task', '--allow', 'src', '--dry-run'], {
    encoding: 'utf8', env: { ...process.env, DO_NOT_TRACK: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).host, 'codex');
  const invalid = spawnSync(process.execPath, ['index.mjs', '--host=unknown', 'run', 'a task', '--dry-run'], {
    encoding: 'utf8', env: { ...process.env, DO_NOT_TRACK: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' },
  });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /host must be/);
});

test('CLI integration: project-scoped status reads real controller state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-entry-'));
  try {
    const project = join(dir, 'project'), unrelated = join(dir, 'unrelated'), store = join(dir, 'runs');
    for (const path of [project, unrelated, store]) mkdirSync(path);
    writeFileSync(join(store, `${id}.json`), JSON.stringify({ version: 1, id, root: project, status: 'awaiting-gate', pending: { gates: ['gate:arch'], token: 'never-print' }, results: {} }));
    writeFileSync(join(store, `${other}.json`), JSON.stringify({ version: 1, id: other, root: unrelated, status: 'ready', results: {} }));
    const result = spawnSync(process.execPath, ['index.mjs', 'status', '--host', 'codex', '--dir', project, '--json'], {
      encoding: 'utf8', env: { ...process.env, GREAT_CTO_CODEX_RUNS_DIR: store, DO_NOT_TRACK: '1' },
    });
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.deepEqual(body.runs.map(r => r.id), [id]);
    assert.ok(!result.stdout.includes('never-print'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
