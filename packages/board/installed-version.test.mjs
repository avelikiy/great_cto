import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installedBoardVersion } from './lib/installed-version.mjs';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'board-version-'));
const previousHome = process.env.HOME;
process.env.HOME = home;
after(() => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  fs.rmSync(home, { recursive: true, force: true });
});
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
};
const registryFile = path.join(home, '.claude/plugins/installed_plugins.json');
const settingsFile = path.join(home, '.claude/settings.json');
function installation(market, version, name = 'great_cto') {
  const installPath = path.join(home, '.claude/plugins/cache', market, name, version);
  write(path.join(installPath, '.claude-plugin/plugin.json'), { name, version });
  write(path.join(installPath, 'packages/board/server.mjs'), 'fixture');
  return { scope: 'user', version, installPath };
}
function state(plugins, enabledPlugins) {
  write(registryFile, { version: 2, plugins });
  write(settingsFile, { enabledPlugins });
}
const read = () => installedBoardVersion({ home });

test('enabled marketplace beats disabled local registration and unpublished newer cache', () => {
  const market = installation('great-cto', '3.64.0');
  const local = installation('local', '3.63.5');
  installation('local', '99.0.0');
  state({ 'great_cto@great-cto': [market], 'great_cto@local': [local] },
    { 'great_cto@great-cto': true, 'great_cto@local': false });
  assert.deepEqual(read(), { installed: '3.64.0', installedSource: 'claude-user-registry', installedReason: null });
});

test('local registration and kebab-case marketplace are supported without cache guessing', () => {
  for (const [key, name] of [['great_cto@local', 'great_cto'], ['great-cto@official', 'great-cto']]) {
    state({ [key]: [installation('selected', '3.100.0', name)] }, { [key]: true });
    assert.equal(read().installed, '3.100.0');
  }
});

test('conflicting enabled installations and duplicate user entries are unknown', () => {
  const a = installation('one', '3.64.0'), b = installation('two', '3.65.0');
  state({ 'great_cto@one': [a], 'great_cto@two': [b] }, { 'great_cto@one': true, 'great_cto@two': true });
  assert.equal(read().installedReason, 'ambiguous-installation');
  state({ 'great_cto@one': [a, a] }, { 'great_cto@one': true });
  assert.equal(read().installedReason, 'ambiguous-registration');
  state({ 'great_cto@one': [a], 'great_cto@two': [a] }, { 'great_cto@one': true, 'great_cto@two': true });
  assert.equal(read().installedReason, 'ambiguous-installation', 'equal versions still do not identify a selected registration');
});

test('unrelated and disabled broken registrations cannot hide the selected installation', () => {
  state({ 'great_cto@selected': [installation('selected', '3.64.0')],
    'great_cto@local': 'broken', 'unrelated@market': null },
  { 'great_cto@selected': true, 'great_cto@local': false, 'unrelated@market': true });
  assert.equal(read().installed, '3.64.0');
});

test('missing, malformed, disabled, scoped and partial installations never claim parity', () => {
  fs.writeFileSync(registryFile, '{');
  assert.equal(read().installed, null);
  fs.rmSync(registryFile);
  assert.equal(read().installed, null);
  const entry = installation('valid', '3.64.0');
  for (const enabled of [{}, { 'great_cto@valid': false }, { 'great_cto@valid': 'true' }]) {
    state({ 'great_cto@valid': [entry] }, enabled);
    assert.equal(read().installed, null);
  }
  for (const invalid of [null, {}, { ...entry, scope: 'project' }, { ...entry, version: 'unknown' },
    { ...entry, installPath: 'relative' }, { ...entry, version: '3.65.0' },
    { ...entry, installPath: path.join(home, 'missing') }]) {
    state({ 'great_cto@valid': [invalid] }, { 'great_cto@valid': true });
    assert.equal(read().installed, null);
  }
  state({ 'great_cto@valid': 'invalid' }, { 'great_cto@valid': true });
  assert.equal(read().installed, null);
  state({ 'great_cto@valid': [entry] }, { 'great_cto@valid': true });
  fs.rmSync(path.join(entry.installPath, 'packages/board/server.mjs'));
  assert.equal(read().installedReason, 'incomplete-installation');
  for (const registry of [null, [], {}, { version: 1, plugins: {} }, { version: 2, plugins: [] }]) {
    write(registryFile, registry);
    assert.equal(read().installed, null);
  }
  state({}, {});
  fs.writeFileSync(settingsFile, '{');
  assert.equal(read().installed, null);
  write(settingsFile, { enabledPlugins: [] });
  assert.equal(read().installed, null);
});

test('actual API preserves all four directional states and re-reads registry updates', async () => {
  const { dispatch } = await import('./lib/routes.mjs');
  const { BUILD_VERSION } = await import('./lib/config.mjs');
  const [major, minor, patch] = BUILD_VERSION.split('.').map(Number);
  assert.ok(Number.isInteger(major));
  const lower = patch > 0 ? `${major}.${minor}.${patch - 1}` : `${major}.${minor - 1}.999`;
  for (const [version, stale] of [[BUILD_VERSION, 'no'], [`${major + 1}.0.0`, 'behind'], [lower, 'ahead'], [null, 'unknown']]) {
    state(version ? { 'great_cto@selected': [installation('selected', version)] } : {},
      version ? { 'great_cto@selected': true } : {});
    let status, headers, body;
    await dispatch({ method: 'GET', headers: {} }, {
      writeHead(s, h) { status = s; headers = h; }, end(text) { body = JSON.parse(text); },
    }, new URL('http://localhost/api/version'), home);
    assert.equal(status, 200);
    assert.equal(headers['Cache-Control'], 'no-store');
    assert.equal(body.installed, version);
    assert.equal(body.stale, stale);
    assert.equal(body.version, BUILD_VERSION);
    assert.ok(!JSON.stringify(body).includes(home), 'do not disclose installation paths');
  }
});
