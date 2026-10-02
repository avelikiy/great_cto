import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const repo = resolve(import.meta.dirname, '../..');
test('real CLI persists native hook observations and resumes exactly once with receipt replay', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-native-task-'));
  try {
    const root = join(dir, 'project'), bin = join(dir, 'bin'), store = join(dir, 'tasks'), marker = join(dir, 'calls.jsonl');
    mkdirSync(root); mkdirSync(bin);
    writeFileSync(join(bin, 'claude'), `#!/usr/bin/env node\n(async () => {
      const fs = require('node:fs');
      const { observeWorkSession } = await import(${JSON.stringify(pathToFileURL(join(repo, 'scripts/lib/work-tasks.mjs')).href)});
      const args = process.argv.slice(2), session_id = args[1];
      fs.appendFileSync(process.env.TASK_TEST_CALLS, JSON.stringify(args) + '\\n');
      observeWorkSession({ cwd: process.cwd(), session_id, hook_event_name: 'UserPromptSubmit', prompt: args[2] });
      observeWorkSession({ cwd: process.cwd(), session_id, hook_event_name: 'Stop' });
    })().catch(e => { console.error(e); process.exitCode = 2; });\n`, { mode: 0o755 });
    const env = { ...process.env, PATH: bin + ':' + process.env.PATH, GREAT_CTO_TASKS_DIR: store, TASK_TEST_CALLS: marker, DO_NOT_TRACK: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' };
    const cli = args => spawnSync(process.execPath, [join(repo, 'packages/cli/index.mjs'), ...args, '--dir', root], { encoding: 'utf8', env });
    const started = cli(['run', 'Export CSV', '--accept', 'Authorized rows only']); assert.equal(started.status, 0, started.stderr);
    const status = cli(['status', '--json']); assert.equal(status.status, 0, status.stderr);
    const t = JSON.parse(status.stdout).tasks[0]; assert.equal(t.goal, 'Export CSV'); assert.equal(t.phase, 'waiting');
    assert.deepEqual(t.acceptance, ['Authorized rows only']); assert.ok(t.metrics.timeToObservedStartMs >= 0);
    const op = randomUUID(), args = ['resume', '--task', t.taskId, '--revision', String(t.revision), '--operation', op];
    const resumed = cli(args); assert.equal(resumed.status, 0, resumed.stderr);
    assert.equal(cli(args).status, 0); // stale revision is part of the original receipt and replays safely
    const calls = readFileSync(marker, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(calls.length, 2); assert.equal(calls[0][0], '--session-id');
    assert.deepEqual(calls[1], ['--resume', calls[0][1], '/resume']);
    assert.match(calls[0][2], /Authorized rows only/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
