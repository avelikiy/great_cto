import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/codex-auto-update.sh');

function recordUpgrades({ codex }) {
  writeFileSync(codex, '#!/bin/sh\nif [ "$*" = "plugin marketplace list" ]; then\n  [ "${CODEX_FIXTURE_NO_MARKETPLACE:-}" = "1" ] && exit 0\n  printf "great-cto  %s\\n" "$CODEX_FIXTURE_MARKETPLACE"\nelse\n  printf "%s\\n" "$*" >> "$CODEX_FIXTURE_CALLS"\nfi\n');
}

test('refresh refuses unproven native activation before invoking the host', (t) => {
  const f = fixture(t);
  recordUpgrades(f);
  const result = spawnSync('sh', [script, 'refresh', f.codex], { env: f.env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /verified native activation is unsupported/);
  assert.throws(() => readFileSync(join(f.dir, 'upgrade.calls')));
});

test('refresh refuses a changed marketplace origin before any upgrade', (t) => {
  const f = fixture(t);
  recordUpgrades(f);
  execFileSync('git', ['-C', f.marketplace, 'remote', 'set-url', 'origin', 'https://example.com/untrusted.git']);
  const r = spawnSync('sh', [script, 'refresh', f.codex], { env: f.env, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /verified native activation is unsupported/);
  assert.throws(() => readFileSync(join(f.dir, 'upgrade.calls')));
});

test('refresh refuses a missing marketplace before any upgrade', (t) => {
  const f = fixture(t);
  recordUpgrades(f);
  f.env.CODEX_FIXTURE_NO_MARKETPLACE = '1';
  const r = spawnSync('sh', [script, 'refresh', f.codex], { env: f.env, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /verified native activation is unsupported/);
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
  return { dir, codex, marketplace, env: { ...process.env, HOME: dir, GREAT_CTO_CODEX_BIN: codex,
    CODEX_FIXTURE_MARKETPLACE: marketplace, CODEX_FIXTURE_CALLS: join(dir, 'upgrade.calls') } };
}

test('render uses the real Codex executable, XML-escapes it and schedules a six-hour host-managed refresh', (t) => {
  const { codex, env } = fixture(t);
  const xml = execFileSync('sh', [script, 'render'], { env, encoding: 'utf8' });
  assert.match(xml, /<string>\/bin\/sh<\/string>/);
  assert.ok(xml.includes(script));
  assert.match(xml, /<string>refresh<\/string>/);
  assert.match(xml, /<key>EnvironmentVariables<\/key><dict>\s*<key>PATH<\/key>/);
  assert.ok(xml.includes(codex.slice(0, codex.lastIndexOf('/')).replace('&', '&amp;')));
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

test('launchd PATH runs an env-node launcher with Node outside the system directories', (t) => {
  const f = fixture(t);
  const runtime = join(f.dir, 'runtime & tools');
  mkdirSync(runtime);
  symlinkSync(process.execPath, join(runtime, 'node'));
  f.env.PATH = [runtime, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  writeFileSync(f.codex, '#!/usr/bin/env node\nconst fs=require("node:fs"); const args=process.argv.slice(2);\nif(args.join(" ")==="plugin marketplace list") console.log("great-cto  "+process.env.CODEX_FIXTURE_MARKETPLACE);\nelse fs.appendFileSync(process.env.CODEX_FIXTURE_CALLS,args.join(" ")+"\\n");\n');
  const xml = execFileSync('sh', [script, 'render'], { env: f.env, encoding: 'utf8' });
  const path = xml.match(/<key>PATH<\/key><string>([^<]*)<\/string>/)?.[1].replaceAll('&amp;', '&');
  assert.ok(path?.startsWith(`${runtime}:`));
  assert.ok(xml.includes('runtime &amp; tools'));
  const refresh = spawnSync('/bin/sh', [script, 'refresh', f.codex], { env: { ...f.env, PATH: path }, encoding: 'utf8' });
  assert.equal(refresh.status, 1);
  assert.match(refresh.stderr, /verified native activation is unsupported/);
  assert.throws(() => readFileSync(join(f.dir, 'upgrade.calls')));
});

test('enable and disable refuse a foreign launch agent without replacing or removing it', (t) => {
  const f = fixture(t);
  const agentDir = join(f.dir, 'Library', 'LaunchAgents');
  mkdirSync(agentDir, { recursive: true });
  const plist = join(agentDir, 'com.great-cto.codex-auto-update.plist');
  const foreign = '<plist><dict><key>Label</key><string>foreign.timer</string></dict></plist>';
  writeFileSync(plist, foreign);
  const fakeUname = join(f.dir, 'uname');
  writeFileSync(fakeUname, '#!/bin/sh\necho Darwin\n', { mode: 0o755 });
  f.env.PATH = [f.dir, f.env.PATH].join(':');
  for (const action of ['enable', 'disable']) {
    const result = spawnSync('sh', [script, action], { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unexpected launch agent/);
    assert.equal(readFileSync(plist, 'utf8'), foreign);
  }
});

test('status reports disabled without creating any files', (t) => {
  const { dir, env } = fixture(t);
  assert.equal(execFileSync('sh', [script, 'status'], { env, encoding: 'utf8' }).trim(), 'disabled');
  assert.throws(() => readFileSync(join(dir, 'Library', 'LaunchAgents', 'com.great-cto.codex-auto-update.plist')));
});

test('enable refuses a new timer and disable removes only an existing owned timer', (t) => {
  const { dir, env } = fixture(t);
  const fakeUname = join(dir, 'uname');
  const fakeLaunchctl = join(dir, 'launchctl');
  writeFileSync(fakeUname, '#!/bin/sh\necho Darwin\n');
  writeFileSync(fakeLaunchctl, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${dir}/launchctl.calls"\n`);
  chmodSync(fakeUname, 0o755);
  chmodSync(fakeLaunchctl, 0o755);
  env.PATH = [dir, env.PATH].join(':');
  env.GREAT_CTO_LAUNCHCTL = fakeLaunchctl;
  const plist = join(dir, 'Library', 'LaunchAgents', 'com.great-cto.codex-auto-update.plist');

  const enable = spawnSync('sh', [script, 'enable'], { env, encoding: 'utf8' });
  assert.equal(enable.status, 1);
  assert.match(enable.stderr, /verified native activation is unsupported/);
  assert.throws(() => readFileSync(plist));
  assert.throws(() => readFileSync(join(dir, 'launchctl.calls')));
  mkdirSync(join(dir, 'Library', 'LaunchAgents'), { recursive: true });
  writeFileSync(plist, '<plist><dict><key>Label</key><string>com.great-cto.codex-auto-update</string></dict></plist>');
  assert.match(execFileSync('sh', [script, 'status'], { env, encoding: 'utf8' }), /enabled:/);
  assert.equal(execFileSync('sh', [script, 'disable'], { env, encoding: 'utf8' }).trim(), 'disabled');
  assert.throws(() => readFileSync(plist));
  assert.match(readFileSync(join(dir, 'launchctl.calls'), 'utf8'), /bootout gui\/\d+/);
  assert.doesNotMatch(readFileSync(join(dir, 'launchctl.calls'), 'utf8'), /bootstrap/);
  assert.doesNotMatch(readFileSync(join(dir, 'launchctl.calls'), 'utf8'), /kickstart/);
});

test('enable refuses an unconfigured great-cto marketplace', (t) => {
  const { dir, env, codex } = fixture(t);
  writeFileSync(codex, '#!/bin/sh\necho other-marketplace\n');
  const fakeUname = join(dir, 'uname');
  writeFileSync(fakeUname, '#!/bin/sh\necho Darwin\n');
  chmodSync(fakeUname, 0o755);
  env.PATH = [dir, env.PATH].join(':');
  const result = spawnSync('sh', [script, 'enable'], { env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /great-cto Git marketplace is not configured/);
});
