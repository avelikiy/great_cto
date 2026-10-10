// Fixed test entrypoint: fixture paths are argv data, never executable text.
import os from 'node:os';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const [hook, home, record] = process.argv.slice(2);
const project = realpathSync(process.cwd()), root = resolve(project, '..');
assert.equal(realpathSync(home), join(root, 'fixture-home'));
assert.equal(realpathSync(record), join(root, 'calls.json'));
assert.equal(realpathSync(hook), hook);
const log = (kind, value) => {
  const calls = JSON.parse(readFileSync(record, 'utf8'));
  calls[kind].push(value); writeFileSync(record, JSON.stringify(calls));
};
os.homedir = () => home;
cp.spawnSync = (cmd, args) => {
  log('sync', { cmd, args });
  if (!['git', 'bd'].includes(cmd)) throw new Error('unexpected sync child refused');
  return { status: 1, stdout: '', stderr: '' };
};
cp.spawn = (cmd, args) => {
  const merge = cmd === 'node' && args.length === 1 && basename(args[0]) === 'lessons-merge.mjs';
  log('async', { merge });
  if (!merge) throw new Error('unexpected child refused');
  return { unref() {} };
};
cp.exec = cp.execFile = cp.execSync = cp.execFileSync = cp.fork = () => {
  log('async', { merge: false }); throw new Error('unexpected child refused');
};
syncBuiltinESMExports();
await import(pathToFileURL(hook).href);
