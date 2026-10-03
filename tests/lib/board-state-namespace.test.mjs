import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const configUrl = new URL('../../packages/board/lib/config.mjs', import.meta.url).href;
const projectsUrl = new URL('../../packages/board/lib/projects.mjs', import.meta.url).href;
const readersUrl = new URL('../../packages/board/lib/data-readers.mjs', import.meta.url).href;
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'great-cto-board-namespace-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'ambient'), scope = join(root, 'scope'), state = join(root, 'state');
  for (const dir of [join(home, '.great_cto'), scope, state]) mkdirSync(dir, { recursive: true });
  const registry = join(home, '.great_cto', 'projects.json');
  writeFileSync(registry, '{"projects":[]}\n');
  const prefix = `import os from 'node:os';import{syncBuiltinESMExports}from'node:module';os.homedir=()=>${JSON.stringify(home)};syncBuiltinESMExports();`;
  const run = (code, extraEnv = {}) => spawnSync(process.execPath, ['--input-type=module', '-e', prefix + code], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C', GREAT_CTO_HOME: state, ...extraEnv },
    encoding: 'utf8', timeout: 5000, maxBuffer: 65536,
  });
  return { root, home, scope, state, registry, run };
}
test('board global state paths share CLI namespace and preserve explicit file overrides', t => {
  const f = fixture(t);
  const code = `const c=await import(${JSON.stringify(configUrl)});console.log(JSON.stringify([c.GREAT_CTO_DIR,c.PROJECTS_FILE,c.SHARE_STATE_FILE,c.VAPID_KEYS_FILE,c.PUSH_SUBS_FILE,c.NOTIF_HISTORY_FILE]));`;
  const r = f.run(code);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [f.state, ...['projects.json','board-share.json','vapid-keys.json','push-subscriptions.json','notif-history.json'].map(name => join(f.state, name))]);
  const override = f.run(code, { GREAT_CTO_PROJECTS_FILE: join(f.root, 'registry.json'), GREAT_CTO_NOTIF_HISTORY_FILE: join(f.root, 'history.json') });
  assert.equal(override.status, 0, override.stderr);
  const paths = JSON.parse(override.stdout);
  assert.equal(paths[1], join(f.root, 'registry.json'));
  assert.equal(paths[5], join(f.root, 'history.json'));
  const normal = f.run(code, { GREAT_CTO_HOME: '' });
  assert.equal(normal.status, 0, normal.stderr);
  assert.equal(JSON.parse(normal.stdout)[0], join(f.home, '.great_cto'));
});

test('actual scoped discovery registers only fixture projects and leaves ambient registry unchanged', t => {
  const f = fixture(t);
  for (const dir of [join(f.scope, 'included'), join(f.home, 'work', 'excluded')]) {
    mkdirSync(join(dir, '.great_cto'), { recursive: true });
    writeFileSync(join(dir, '.great_cto', 'PROJECT.md'), 'primary: web-service\n');
  }
  const r = f.run(`const p=await import(${JSON.stringify(projectsUrl)});const n=await p.discoverProjects();console.log(JSON.stringify({n,scope:p.getDiscoveryScope(),registry:p.readProjectsRegistry()}));`, { GREAT_CTO_DISCOVERY_ROOT: f.scope });
  assert.equal(r.status, 0, r.stderr);
  const value = JSON.parse(r.stdout);
  assert.equal(value.n, 1);
  assert.deepEqual(value.scope, { roots: [f.scope], includeClaudeProjects: false });
  assert.deepEqual(value.registry.projects.map(p => p.path), [join(f.scope, 'included')]);
  assert.equal(readFileSync(f.registry, 'utf8'), '{"projects":[]}\n');
});

test('global memory layers read the selected namespace, not ambient lessons', t => {
  const f = fixture(t);
  writeFileSync(join(f.state, 'lessons.md'), 'scoped fixture lessons');
  writeFileSync(join(f.home, '.great_cto', 'lessons.md'), 'ambient fixture lessons');
  const r = f.run(`const d=await import(${JSON.stringify(readersUrl)});console.log(JSON.stringify(d.getMemory(${JSON.stringify(f.scope)}).layers.filter(l=>l.scope==='global')));`);
  assert.equal(r.status, 0, r.stderr);
  const layers = JSON.parse(r.stdout);
  assert.equal(layers.length, 3);
  assert.deepEqual(layers.map(l => l.path), ['decisions.md','preferences.md','lessons.md'].map(name => join(f.state, name)));
  assert.equal(layers.find(l => l.id === 'g-lessons').content, 'scoped fixture lessons');
  assert.equal(layers.find(l => l.id === 'g-lessons').displayPath, '$GREAT_CTO_HOME/lessons.md');
  assert.equal(readFileSync(join(f.home, '.great_cto', 'lessons.md'), 'utf8'), 'ambient fixture lessons');
});

test('invalid explicit discovery scope refuses without falling back or writing registry', t => {
  const f = fixture(t);
  const file = join(f.root, 'not-directory'); writeFileSync(file, 'fixture');
  for (const scope of ['relative', join(f.root, 'missing'), file]) {
    const r = f.run(`const p=await import(${JSON.stringify(projectsUrl)});await p.discoverProjects();`, { GREAT_CTO_DISCOVERY_ROOT: scope });
    assert.notEqual(r.status, 0);
    assert.equal(existsSync(join(f.state, 'projects.json')), false);
    assert.equal(readFileSync(f.registry, 'utf8'), '{"projects":[]}\n');
  }
});

test('unset and empty discovery scope keep original home roots and Claude lookup', t => {
  const f = fixture(t);
  for (const extra of [{}, { GREAT_CTO_DISCOVERY_ROOT: '' }]) {
    const r = f.run(`const p=await import(${JSON.stringify(projectsUrl)});console.log(JSON.stringify(p.getDiscoveryScope()));`, extra);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), { roots: ['work','dev','development','code','projects','src'].map(name => join(f.home, name)).concat([join(f.home, 'Documents', 'projects'), f.home]), includeClaudeProjects: true });
  }
});
