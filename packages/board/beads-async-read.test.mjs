import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { bdCache } from './lib/state.mjs';
const fixture = fileURLToPath(new URL('./fixtures/fake-bd-controlled.mjs', import.meta.url));
async function setup(t, mode = 'hold') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-async-read-'));
  const cwd = path.join(root, 'project');
  fs.mkdirSync(path.join(cwd, '.beads'), { recursive: true });
  process.env.GREAT_CTO_BD_BIN = fixture;
  process.env.FAKE_BD_CONTROL_ROOT = root;
  process.env.FAKE_BD_CONTROL_MODE = mode;
  const mod = await import(`./lib/beads.mjs?async=${Date.now()}-${Math.random()}`);
  t.after(() => {
    for (const key of ['GREAT_CTO_BD_BIN', 'FAKE_BD_CONTROL_ROOT', 'FAKE_BD_CONTROL_MODE']) delete process.env[key];
    bdCache.clear();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, cwd, ...mod };
}
async function waitFor(fn, budget = 5000) {
  const end = performance.now() + budget;
  while (!fn() && performance.now() < end) await new Promise(r => setTimeout(r, 25));
  assert.ok(fn(), 'fixture observation exceeded its fixed deadline');
}
test('concurrent cold readers join one subprocess and wait for real tasks', async t => {
  const f = await setup(t);
  let settled = 0;
  const pending = [f.getTasksAsync(f.cwd), f.getTasksAsync(f.cwd)].map(p => p.then(x => { settled++; return x; }));
  await waitFor(() => fs.existsSync(path.join(f.root, 'project.started')));
  assert.equal(settled, 0);
  assert.equal(fs.readFileSync(path.join(f.root, 'project.started'), 'utf8').trim().split('\n').length, 1);
  assert.throws(() => f.getTasksCached(f.cwd), /loading/);
  fs.writeFileSync(path.join(f.root, 'project.release'), 'release');
  for (const tasks of await Promise.all(pending)) assert.equal(tasks[0].id, 'FIXTURE-1');
});
test('a cold read invalidated while in flight refuses rather than returning false empty', async t => {
  const f = await setup(t);
  const pending = f.getTasksAsync(f.cwd);
  const refused = assert.rejects(pending, /snapshot changed/);
  await waitFor(() => fs.existsSync(path.join(f.root, 'project.started')));
  f.bdCacheInvalidate(f.cwd);
  fs.writeFileSync(path.join(f.root, 'project.release'), 'release');
  await refused;
  assert.equal(bdCache.has(f.cwd), false);
});
test('read deadline escalates to KILL for owned TERM-resistant group', { timeout: 30000 }, async t => {
  const f = await setup(t, 'hang');
  const refused = assert.rejects(f.getTasksAsync(f.cwd), /timed out/);
  await waitFor(() => fs.existsSync(path.join(f.root, 'project.descendant')));
  const leader = Number(fs.readFileSync(path.join(f.root, 'project.started'), 'utf8').trim());
  const descendant = Number(fs.readFileSync(path.join(f.root, 'project.descendant'), 'utf8'));
  await refused;
  const dead = pid => { try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; } };
  await waitFor(() => dead(leader) && dead(descendant));
  assert.equal(bdCache.has(f.cwd), false);
  assert.match(f.bdFailureFor(f.cwd), /timed out/);
});
test('oversized output refuses without publishing a snapshot', async t => {
  const f = await setup(t, 'oversize');
  await assert.rejects(f.getTasksAsync(f.cwd), /output exceeded limit/);
  assert.equal(bdCache.has(f.cwd), false);
});
test('background refreshes are limited to four owned reads', async t => {
  const f = await setup(t);
  const dirs = Array.from({ length: 5 }, (_, i) => path.join(f.root, `lane${i}`));
  for (const dir of dirs) fs.mkdirSync(path.join(dir, '.beads'), { recursive: true });
  const pending = dirs.map(dir => f.getTasksAsync(dir));
  try {
    await waitFor(() => dirs.slice(0, 4).every(dir => fs.existsSync(path.join(f.root, path.basename(dir) + '.started'))));
    assert.equal(fs.existsSync(path.join(f.root, 'lane4.started')), false);
  } finally {
    for (const dir of dirs) fs.writeFileSync(path.join(f.root, path.basename(dir) + '.release'), 'release');
    for (const tasks of await Promise.all(pending)) assert.equal(tasks[0].id, 'FIXTURE-1');
  }
});
test('concurrent tasks.md-only readers all receive the supported fallback', async t => {
  const f = await setup(t, 'fail');
  fs.rmSync(path.join(f.cwd, '.beads'), { recursive: true, force: true });
  fs.mkdirSync(path.join(f.cwd, '.great_cto'));
  fs.writeFileSync(path.join(f.cwd, '.great_cto', 'tasks.md'), '# Tasks\n\n- [ ] MD-1: Keep fallback readable\n');
  const answers = await Promise.all([f.getTasksAsync(f.cwd), f.getTasksAsync(f.cwd), f.getTasksAsync(f.cwd)]);
  for (const tasks of answers) assert.ok(tasks.length > 0);
});
for (const mode of ['hang', 'leader-exit']) test(`actual owner SIGKILL closes ${mode} read through IPC disconnect`, async t => {
  const f = await setup(t, mode);
  const owner = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/beads-read-owner.mjs', import.meta.url))], {
    cwd: f.cwd, env: { ...process.env }, stdio: 'ignore'
  });
  let leader, descendant, worker;
  const dead = pid => { try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; } };
  try {
    await waitFor(() => fs.existsSync(path.join(f.root, 'project.descendant')));
    leader = Number(fs.readFileSync(path.join(f.root, 'project.started'), 'utf8').trim());
    descendant = Number(fs.readFileSync(path.join(f.root, 'project.descendant'), 'utf8'));
    worker = Number(fs.readFileSync(path.join(f.root, 'project.worker'), 'utf8'));
    const exited = once(owner, 'exit');owner.kill('SIGKILL');await exited;
    await waitFor(() => dead(leader) && dead(descendant) && dead(worker));
  } finally {
    // Fixed captured fixture PIDs only; cleanup is not the preceding assertion.
    try { owner.kill('SIGKILL'); } catch {}
    for (const pid of [leader, descendant, worker]) if (pid && !dead(pid)) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }
});
test('queued read expires within the original budget without spawning a fifth group', { timeout: 30000 }, async t => {
  const f = await setup(t, 'hang');
  const dirs = Array.from({ length: 5 }, (_, i) => path.join(f.root, `queued${i}`));
  for (const dir of dirs) fs.mkdirSync(path.join(dir, '.beads'), { recursive: true });
  const settled = dirs.map(dir => assert.rejects(f.getTasksAsync(dir), /timed out|exited/));
  await waitFor(() => dirs.slice(0, 4).every(dir => fs.existsSync(path.join(f.root, path.basename(dir) + '.descendant'))));
  await Promise.all(settled);
  assert.equal(fs.existsSync(path.join(f.root, 'queued4.started')), false);
  assert.match(f.bdFailureFor(dirs[4]), /waiting for a slot/);
  const captured = dirs.slice(0, 4).flatMap(dir => ['started', 'descendant', 'worker'].map(suffix =>
    Number(fs.readFileSync(path.join(f.root, path.basename(dir) + '.' + suffix), 'utf8').trim())));
  await waitFor(() => captured.every(pid => { try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; } }));
});
