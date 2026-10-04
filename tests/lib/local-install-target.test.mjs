import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));

// Execute the real install preflight/sync section with fixture paths, never HOME.
function fixture(t, version) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'local-install-target-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const cache = path.join(root, 'cache');
  const marker = path.join(root, 'rsync-called');
  fs.mkdirSync(path.join(source, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(source, 'scripts/lib'), { recursive: true });
  fs.writeFileSync(path.join(source, '.claude-plugin/plugin.json'), JSON.stringify({ version }));
  const helper = path.join(repo, 'scripts/lib/local-install-target.mjs');
  if (fs.existsSync(helper)) fs.copyFileSync(helper, path.join(source, 'scripts/lib/local-install-target.mjs'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'rsync'), `#!/bin/sh\nprintf called > '${marker}'\n`, { mode: 0o755 });
  const script = fs.readFileSync(path.join(repo, 'scripts/install-local.sh'), 'utf8')
    .split('# Verify the files')[0]
    .replace(/^ROOT=.*$/m, `ROOT='${source}'`)
    .replace(/^CACHE_ROOT=.*$/m, `CACHE_ROOT='${cache}'`);
  const run = () => spawnSync('bash', ['-c', script], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  return { root, source, cache, marker, run };
}

for (const version of ['', '../..', '.', '/tmp/escape', '3.48.0/../../escape',
  undefined, null, 348, {}, '01.2.3', '3.48', '3.48.0\n', '3.48.0-01', 'v3.48.0']) {
  test(`installer refuses unsafe version ${JSON.stringify(version)} before writes`, (t) => {
    const f = fixture(t, version);
    const result = f.run();
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.existsSync(f.cache), false, 'must not create cache');
    assert.equal(fs.existsSync(f.marker), false, 'must not call rsync');
  });
}

for (const version of ['3.48.0', '3.48.1-rc.1+build.42']) {
  test(`installer accepts safe version ${version}`, (t) => {
    const f = fixture(t, version);
    const result = f.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.statSync(path.join(f.cache, version)).isDirectory(), true);
    assert.equal(fs.existsSync(f.marker), true);
  });
}

for (const target of ['cache', 'destination', 'dangling-destination', 'file-destination']) {
  test(`installer refuses ${target} redirection before sync`, (t) => {
    const f = fixture(t, '3.48.0');
    const outside = path.join(f.root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'sentinel'), 'unchanged');
    if (target === 'cache') fs.symlinkSync(outside, f.cache);
    else {
      fs.mkdirSync(f.cache);
      const dest = path.join(f.cache, '3.48.0');
      if (target === 'file-destination') fs.writeFileSync(dest, 'not a directory');
      else fs.symlinkSync(target === 'destination' ? outside : path.join(f.root, 'absent'), dest);
    }
    const result = f.run();
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.existsSync(f.marker), false);
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8'), 'unchanged');
  });
}

for (const manifest of ['missing', 'malformed']) {
  test(`installer refuses ${manifest} manifest before writes`, (t) => {
    const f = fixture(t, '3.48.0');
    const file = path.join(f.source, '.claude-plugin/plugin.json');
    if (manifest === 'missing') fs.unlinkSync(file);
    else fs.writeFileSync(file, '{broken');
    assert.notEqual(f.run().status, 0);
    assert.equal(fs.existsSync(f.cache), false);
    assert.equal(fs.existsSync(f.marker), false);
  });
}

test('preflight accepts an existing direct-child directory, not an activation approval', (t) => {
  const f = fixture(t, '3.48.0');
  fs.mkdirSync(path.join(f.cache, '3.48.0'), { recursive: true });
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.existsSync(f.marker), true);
});
