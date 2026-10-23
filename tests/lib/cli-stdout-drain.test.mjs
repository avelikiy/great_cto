import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { listCodexRuns } from '../../scripts/lib/codex-host-state.mjs';
import { beginWork, finishWork, listWorkTasks, publicWorkTask } from '../../scripts/lib/work-tasks.mjs';

const repo = resolve(import.meta.dirname, '../..');
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-stdout-drain-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'project'), runs = join(dir, 'runs'), tasks = join(dir, 'tasks');
  mkdirSync(root); mkdirSync(runs, { mode: 0o700 });
  const id = randomUUID(), reason = 'Synthetic status evidence. '.repeat(4096);
  writeFileSync(join(runs, `${id}.json`), JSON.stringify({ version: 1, id, root, status: 'blocked', reason, active: null, results: {} }), { mode: 0o600 });
  const env = { ...process.env, GREAT_CTO_CODEX_RUNS_DIR: runs, GREAT_CTO_TASKS_DIR: tasks,
    DO_NOT_TRACK: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' };
  const invoke = args => spawnSync(process.execPath, args, { encoding: 'utf8', env });
  return { root, runs, tasks, reason, invoke };
}

test('controller list flushes JSON larger than a pipe buffer before exiting', t => {
  const f = fixture(t), expected = listCodexRuns({ root: f.root, store: f.runs });
  assert.ok(Buffer.byteLength(JSON.stringify(expected)) > 8192);
  const result = f.invoke([join(repo, 'scripts/codex-pipeline.mjs'), 'list', '--dir', f.root]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), expected);
});

test('daily Codex status preserves the complete large controller response through both processes', t => {
  const f = fixture(t), expected = listCodexRuns({ root: f.root, store: f.runs });
  const result = f.invoke([join(repo, 'packages/cli/index.mjs'), 'status', '--host', 'codex', '--dir', f.root, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { schemaVersion: 1, state: expected.state, runs: expected.runs, tasks: [] });
});

test('native task status flushes large JSON without invoking the controlled host', t => {
  const f = fixture(t);
  const work = beginWork({ root: f.root, host: 'claude-code', goal: f.reason,
    authority: { mode: 'native-interactive', writeScope: null } }, { store: f.tasks });
  try { finishWork(work.task.taskId, work.operation.operationId, 0, { store: f.tasks, root: f.root }); }
  finally { work.lease.release(); }
  const listing = listWorkTasks(f.root, { store: f.tasks });
  const expected = { schemaVersion: 1, state: listing.state, tasks: listing.tasks.map(publicWorkTask) };
  assert.ok(Buffer.byteLength(JSON.stringify(expected)) > 8192);
  const result = f.invoke([join(repo, 'packages/cli/index.mjs'), 'status', '--host', 'claude-code', '--dir', f.root, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), expected);
});
