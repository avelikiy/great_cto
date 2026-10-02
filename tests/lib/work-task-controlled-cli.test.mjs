import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
const repo = resolve(import.meta.dirname, '../..');
test('real controlled CLI hands off ownership, persists criteria/run link and replays without dispatch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-controlled-task-'));
  try {
    const root = join(dir, 'project'), store = join(dir, 'tasks'), runs = join(dir, 'runs'), bin = join(dir, 'codex'), marker = join(dir, 'calls'); mkdirSync(root);
    execFileSync('git', ['init', '-q', root]); writeFileSync(join(root, 'README.md'), 'fixture\n');
    execFileSync('git', ['-C', root, 'add', 'README.md']);
    execFileSync('git', ['-C', root, '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
    writeFileSync(bin, `#!/usr/bin/env node
const fs = require('node:fs'), args = process.argv.slice(2);
if (args[0] === '--version') { console.log('fixture'); process.exit(0); }
if (args[0] === 'auth') { console.log(JSON.stringify({ loggedIn: true, authMethod: 'fixture' })); process.exit(0); }
let prompt = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => prompt += c);
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.TASK_TEST_CALLS, JSON.stringify({ prompt, lease: process.env.GREAT_CTO_WORK_LEASE || null }) + '\\n');
  const reply = prompt.includes('independent verifier') ? { state: 'verified', checks: ['fixture'], findings: [] }
    : { verdict: 'BLOCKED', summary: 'Fixture lacks requested implementation', meta: {}, files: [] };
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(reply) } }));
});\n`, { mode: 0o755 });
    const env = { ...process.env, GREAT_CTO_TASKS_DIR: store, GREAT_CTO_CODEX_RUNS_DIR: runs, GREAT_CTO_CODEX_BIN: bin, TASK_TEST_CALLS: marker, DO_NOT_TRACK: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' };
    const cli = args => spawnSync(process.execPath, [join(repo, 'packages/cli/index.mjs'), ...args, '--dir', root], { encoding: 'utf8', env, timeout: 20000 });
    const op = randomUUID(), args = ['run', 'Export CSV', '--host', 'codex', '--allow', 'docs', '--accept', 'Authorized rows only', '--operation', op];
    const result = cli(args); assert.equal(result.status, 2, result.stderr);
    const status = cli(['status', '--host', 'codex', '--json']); assert.equal(status.status, 0, status.stderr);
    const data = JSON.parse(status.stdout), task = data.tasks[0];
    assert.ok(task.links.runs.length === 1, result.stderr); assert.equal(data.runs[0].id, task.links.runs[0]);
    assert.deepEqual(task.acceptance, ['Authorized rows only']); assert.equal(task.operations[0].state, 'host_returned');
    const calls = readFileSync(marker, 'utf8'); assert.match(calls, /Authorized rows only/); assert.match(calls, /"lease":null/);
    const replay = cli(args); assert.equal(replay.status, 2, replay.stderr);
    assert.equal(readFileSync(marker, 'utf8'), calls); assert.equal(JSON.parse(replay.stdout).taskId, task.taskId);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
