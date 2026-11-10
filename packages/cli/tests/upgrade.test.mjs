// Consumer admission refusals use isolated children, never the operator's HOME.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const dist = path.resolve(import.meta.dirname, '../dist');
function fixture(t, installed = true) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-upgrade-refusal-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  const settings = path.join(home, '.claude/settings.json'); fs.mkdirSync(path.dirname(settings), { recursive: true }); fs.writeFileSync(settings, '{"enabledPlugins":{"existing@local":true}}\n');
  if (installed) for (const name of ['superpowers', 'beads']) {
    const dir = path.join(home, '.claude/plugins/cache/local', name, '1.0.0'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'keep.md'), 'operator bytes\n');
  }
  const bin = path.join(root, 'bin'), calls = path.join(root, 'git-calls'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nprintf "called\\n" >> "$CALLS_FILE"\nexit 1\n', { mode: 0o755 });
  return { root, home, calls, env: { ...process.env, HOME: home, USERPROFILE: home, PATH: bin + path.delimiter + process.env.PATH, CALLS_FILE: calls, GREAT_CTO_NO_UPDATE_CHECK: '1', GREAT_CTO_UPDATE_CHECK_NO_SPAWN: '1', GREAT_CTO_TELEMETRY: 'off' } };
}
function inventory(root) {
  const result = [];
  function walk(dir) { for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name), stat = fs.lstatSync(file), relative = path.relative(root, file);
    if (stat.isDirectory()) { result.push([relative, 'directory']); walk(file); }
    else result.push([relative, fs.readFileSync(file).toString('base64')]);
  } }
  walk(root); return result;
}
for (const installed of [false, true]) for (const route of ['upgradePlugin', 'upgradeAll', 'installCompanionPlugin', 'installAllCompanions']) {
  test(`${route} refuses ${installed ? 'existing' : 'missing'} companions before process, cache, settings or overlays`, t => {
    const f = fixture(t, installed), before = inventory(f.home);
    const source = `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
      let calls=0; cp.execFileSync=cp.spawnSync=()=>{calls++;throw Error('forbidden process before admission')}; syncBuiltinESMExports();
      const c=await import(process.argv[1]);
      const u=await import(process.argv[2]);
      const route=process.argv[3]; const plugin=c.COMPANION_PLUGINS[0];
      const result=route==='upgradePlugin'?await u.upgradePlugin(plugin):route==='upgradeAll'?await u.upgradeAll():route==='installCompanionPlugin'?c.installCompanionPlugin(plugin):c.installAllCompanions();
      process.stdout.write(JSON.stringify({calls,result}));`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', source,
      pathToFileURL(path.join(dist, 'companion.js')).href, pathToFileURL(path.join(dist, 'upgrade.js')).href, route], { env: f.env, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 0, child.stderr);
    const value = JSON.parse(child.stdout); assert.equal(value.calls, 0);
    const results = Array.isArray(value.result) ? value.result : [value.result];
    assert.equal(results.length, route.endsWith('All') || route === 'installAllCompanions' ? 2 : 1);
    for (const result of results) { assert.equal(result.status, 'skipped'); assert.match(result.reason, /UNSUPPORTED.*admission/i); }
    assert.deepEqual(inventory(f.home), before);
  });
}
for (const target of [null, 'superpowers', 'beads']) test(`CLI upgrade ${target ?? '(default)'} fails closed without mutation or git`, t => {
  const f = fixture(t), before = inventory(f.home);
  const child = spawnSync(process.execPath, [path.join(dist, 'main.js'), 'upgrade', ...(target ? [target] : []), '--no-telemetry'], { env: f.env, encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 1, child.stdout + child.stderr);
  assert.match(child.stdout + child.stderr, /UNSUPPORTED.*admission/i);
  assert.equal(fs.existsSync(f.calls), false);
  assert.deepEqual(inventory(f.home), before);
});
