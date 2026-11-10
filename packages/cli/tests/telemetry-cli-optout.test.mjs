import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('CLI --no-telemetry overrides explicit opt-in without changing stored consent', t => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-telemetry-argv-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.great_cto'));
  const config = path.join(home, '.great_cto/telemetry.json');
  const consent = '{"enabled":true}\n'; fs.writeFileSync(config, consent);
  const entry = fileURLToPath(new URL('../index.mjs', import.meta.url));
  const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home,
    GREAT_CTO_TELEMETRY: 'on', GREAT_CTO_TELEMETRY_DRYRUN: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' };
  const run = args => spawnSync(process.execPath, [entry, ...args], { env, encoding: 'utf8', timeout: 15000 });
  const control = run(['version']);
  assert.equal(control.status, 0, control.stderr);
  assert.match(control.stderr, /\[telemetry\] would-send:/, 'positive control must reach the telemetry funnel without sending HTTP');
  for (const args of [['--no-telemetry', 'version'], ['version', '--no-telemetry']]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, control.stdout);
    assert.doesNotMatch(result.stderr, /\[telemetry\] would-send:/);
    assert.equal(fs.readFileSync(config, 'utf8'), consent);
  }
});
