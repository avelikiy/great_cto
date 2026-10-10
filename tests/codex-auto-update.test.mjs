import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/codex-auto-update.sh');

function recordUpgrades({ dir, codex, marketplace }) {
  writeFileSync(codex, `#!/bin/sh\nif [ "$*" = 'plugin marketplace list' ]; then\n  printf '%s\\n' 'great-cto  ${marketplace}'\nelse\n  printf '%s\\n' "$*" >> '${dir}/upgrade.calls'\nfi\n`);
}

test('refresh validates origin and delegates the upgrade to Codex', (t) => {
  const f = fixture(t);
  recordUpgrades(f);
  execFileSync('sh', [script, 'refresh', f.codex], { env: f.env });
  assert.equal(readFileSync(join(f.dir, 'upgrade.calls'), 'utf8'), 'plugin marketplace upgrade great-cto --json\n');
});

test('refresh refuses a changed marketplace origin before any upgrade', (t) => {
  const f = fixture(t);
  recordUpgrades(f);
  execFileSync('git', ['-C', f.marketplace, 'remote', 'set-url', 'origin', 'https://example.com/untrusted.git']);
  const r = spawnSync('sh', [script, 'refresh', f.codex], { env: f.env, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /does not point to the expected GitHub repository/);
  assert.throws(() => readFileSync(join(f.dir, 'upgrade.calls')));
});

test('refresh refuses a missing marketplace before any upgrade', (t) => {
  const f = fixture(t);
  writeFileSync(f.codex, `#!/bin/sh\nif [ "$*" = 'plugin marketplace list' ]; then exit 0; fi\nprintf '%s\\n' "$*" >> '${f.dir}/upgrade.calls'\n`);
  const r = spawnSync('sh', [script, 'refresh', f.codex], { env: f.env, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not configured/);
  assert.throws(() => readFileSync(join(f.dir, 'upgrade.calls')));
});

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'great-cto-auto-update-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const marketplace = join(dir, 'marketplace');
  mkdirSync(marketplace);
  execFileSync('git', ['-C', marketplace, 'init', '-q']);
  execFileSync('git', ['-C', marketplace, 'remote', 'add', 'origin', 'https://github.com/avelikiy/great_cto.git']);
  const codex = join(dir, 'codex & test');
  writeFileSync(codex, `#!/bin/sh\nprintf 'great-cto  ${marketplace}\\n'\n`);
  chmodSync(codex, 0o755);
  return { dir, codex, marketplace, env: { ...process.env, HOME: dir, GREAT_CTO_CODEX_BIN: codex } };
}

test('render uses the real Codex executable, XML-escapes it and schedules a six-hour host-managed refresh', (t) => {
  const { codex, env } = fixture(t);
  const xml = execFileSync('sh', [script, 'render'], { env, encoding: 'utf8' });
  assert.match(xml, /<string>\/bin\/sh<\/string>/);
  assert.ok(xml.includes(script));
  assert.match(xml, /<string>refresh<\/string>/);
  assert.match(xml, /<key>StartInterval<\/key><integer>21600<\/integer>/);
  assert.ok(xml.includes(codex.replace('&', '&amp;')));
  assert.ok(!xml.includes('<string>' + codex + '</string>'));
});

test('missing Codex binary fails closed without creating a launch agent', (t) => {
  const { dir, env } = fixture(t);
  env.GREAT_CTO_CODEX_BIN = join(dir, 'missing');
  const result = spawnSync('sh', [script, 'render'], { env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /codex executable not found/);
});

test('status reports disabled without creating any files', (t) => {
  const { dir, env } = fixture(t);
  assert.equal(execFileSync('sh', [script, 'status'], { env, encoding: 'utf8' }).trim(), 'disabled');
  assert.throws(() => readFileSync(join(dir, 'Library', 'LaunchAgents', 'com.great-cto.codex-auto-update.plist')));
});

test('enable registers a user timer, and disable removes only that timer', (t) => {
  const { dir, env } = fixture(t);
  const fakeUname = join(dir, 'uname');
  const fakeLaunchctl = join(dir, 'launchctl');
  writeFileSync(fakeUname, '#!/bin/sh\necho Darwin\n');
  writeFileSync(fakeLaunchctl, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${dir}/launchctl.calls"\n`);
  chmodSync(fakeUname, 0o755);
  chmodSync(fakeLaunchctl, 0o755);
  env.PATH = `${dir}:${env.PATH}`;
  env.GREAT_CTO_LAUNCHCTL = fakeLaunchctl;
  const plist = join(dir, 'Library', 'LaunchAgents', 'com.great-cto.codex-auto-update.plist');

  assert.match(execFileSync('sh', [script, 'enable'], { env, encoding: 'utf8' }), /enabled:/);
  assert.match(readFileSync(plist, 'utf8'), /<key>RunAtLoad<\/key><true\/>/);
  assert.match(execFileSync('sh', [script, 'status'], { env, encoding: 'utf8' }), /enabled:/);
  assert.equal(execFileSync('sh', [script, 'disable'], { env, encoding: 'utf8' }).trim(), 'disabled');
  assert.throws(() => readFileSync(plist));
  assert.match(readFileSync(join(dir, 'launchctl.calls'), 'utf8'), /bootstrap gui\/\d+/);
});

test('enable refuses an unconfigured great-cto marketplace', (t) => {
  const { dir, env, codex } = fixture(t);
  writeFileSync(codex, '#!/bin/sh\necho other-marketplace\n');
  const fakeUname = join(dir, 'uname');
  writeFileSync(fakeUname, '#!/bin/sh\necho Darwin\n');
  chmodSync(fakeUname, 0o755);
  env.PATH = `${dir}:${env.PATH}`;
  const result = spawnSync('sh', [script, 'enable'], { env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /great-cto Git marketplace is not configured/);
});
