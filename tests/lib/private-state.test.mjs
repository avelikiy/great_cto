import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stateHome } from '../../packages/cli/src/state-home.mjs';
import { readPrivateState, writePrivateState } from '../../packages/cli/src/private-state.mjs';
import { getVapidKeys } from '../../packages/board/push-adapter.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-private-state-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('state namespace preserves empty/unset default but refuses relative roots', () => {
  assert.equal(stateHome({}, '/fixture/home'), '/fixture/home/.great_cto');
  assert.equal(stateHome({ GREAT_CTO_HOME: '' }, '/fixture/home'), '/fixture/home/.great_cto');
  assert.equal(stateHome({ GREAT_CTO_HOME: '/fixture/isolated/../state/' }), '/fixture/state');
  for (const root of ['relative', './state', '~/.great_cto', ' ', '/state\0bad']) {
    assert.throws(() => stateHome({ GREAT_CTO_HOME: root }), /absolute dedicated state directory/);
  }
});

test('board and CLI resolver agree across distinct working directories', (t) => {
  const root = fixture(t);
  const state = path.join(root, 'state');
  const board = new URL('../../packages/board/lib/config.mjs', import.meta.url).href;
  const helper = new URL('../../packages/cli/src/state-home.mjs', import.meta.url).href;
  for (const cwd of [root, os.tmpdir()]) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
      const b = await import(${JSON.stringify(board)});
      const c = await import(${JSON.stringify(helper)});
      console.log(JSON.stringify([b.GREAT_CTO_DIR,c.stateHome()]));
    `], { cwd, env: { ...process.env, GREAT_CTO_HOME: state }, encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), [state, state]);
  }
  const denied = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(board)})`], {
    cwd: root, env: { ...process.env, GREAT_CTO_HOME: 'relative' }, encoding: 'utf8', timeout: 5000 });
  assert.notEqual(denied.status, 0);
  assert.equal(fs.existsSync(path.join(root, 'relative')), false);
});

test('relocated global store cannot register as a project, including aliases and old entries', (t) => {
  const root = fixture(t);
  const stateParent = path.join(root, 'global');
  const state = path.join(stateParent, '.great_cto');
  const project = path.join(root, 'real-project');
  for (const dir of [stateParent, project]) {
    fs.mkdirSync(path.join(dir, '.great_cto'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.great_cto/PROJECT.md'), 'name: fixture\narchetype: web-service\n');
  }
  const alias = path.join(root, 'global-alias');
  fs.symlinkSync(stateParent, alias);
  const registry = path.join(state, 'projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: 'old-global', path: stateParent }] }));
  const module = new URL('../../packages/board/lib/projects.mjs', import.meta.url).href;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const m = await import(${JSON.stringify(module)});
    const rejected = [${JSON.stringify(stateParent)},${JSON.stringify(alias)}].map(d=>m.autoRegisterProject(d));
    m.autoRegisterProject(${JSON.stringify(project)});
    await m.discoverProjects();
    console.log(JSON.stringify({rejected,projects:m.listProjects().map(p=>p.path)}));
  `], { cwd: root, env: { ...process.env, GREAT_CTO_HOME: state, GREAT_CTO_PROJECTS_FILE: registry,
    GREAT_CTO_DISCOVERY_ROOT: root }, encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.deepEqual(result.rejected, [null, null]);
  assert.deepEqual(result.projects, [project]);
});

test('private read/write/append tighten existing file without chmod of its parent', (t) => {
  const root = fixture(t);
  fs.chmodSync(root, 0o755);
  const file = path.join(root, 'secret.json');
  fs.writeFileSync(file, 'first', { mode: 0o666 });
  assert.equal(readPrivateState(file), 'first');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  writePrivateState(file, 'second');
  writePrivateState(file, '\nthird', true);
  assert.equal(fs.readFileSync(file, 'utf8'), 'second\nthird');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(root).mode & 0o777, 0o755, 'existing parent is not repurposed');
});

test('private file helpers refuse symlink and special targets without touching outside bytes', (t) => {
  const root = fixture(t);
  const outside = path.join(root, 'outside');
  fs.writeFileSync(outside, 'unchanged', { mode: 0o644 });
  const alias = path.join(root, 'alias');
  fs.symlinkSync(outside, alias);
  assert.throws(() => writePrivateState(alias, 'replacement'), /regular file/);
  assert.throws(() => readPrivateState(alias), /regular file/);
  assert.throws(() => writePrivateState(root, 'replacement'), /regular file/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'unchanged');
  assert.equal(fs.statSync(outside).mode & 0o777, 0o644);
});

test('VAPID private keys persist with mode600 and existing keys are tightened, not regenerated', (t) => {
  const root = fixture(t);
  const file = path.join(root, 'vapid-keys.json');
  const before = getVapidKeys(file);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.chmodSync(file, 0o644);
  const after = getVapidKeys(file);
  assert.equal(after.privateKey.d, before.privateKey.d);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
