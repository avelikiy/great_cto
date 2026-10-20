// The demo seed writes into a sandbox HOME, never the operator's ~/.great_cto.
//
// scripts/seed-demo.mjs used `process.env.HOME`, so `npm run demo:seed`
// overwrote the real global decisions.md with seven demo ADRs, added four demo
// global patterns that /crystallize reads, a demo digest, a demo verdict log
// and a demo project in the board registry — demo data in the layer every
// session of every project reads. Found five months later, by a reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The operator's home, by any of its names. A demo script may name none of them.
const REAL_HOME = /process\.env\.HOME\b|\bhomedir\s*\(|\bos\.homedir\b|['"`]~\//;
const reachesRealHome = (src) => REAL_HOME.test(src);

test('seed-demo and record-demo never reach the real home directory', () => {
  for (const f of ['scripts/seed-demo.mjs', 'scripts/record-demo.mjs']) {
    assert.equal(reachesRealHome(fs.readFileSync(path.join(ROOT, f), 'utf8')), false, f);
  }
});

test('record-demo starts the board with the sandbox HOME the seed wrote', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/record-demo.mjs'), 'utf8');
  assert.match(src, /HOME:\s*DEMO_HOME/);
  const seed = fs.readFileSync(path.join(ROOT, 'scripts/seed-demo.mjs'), 'utf8');
  assert.match(seed, /const DEMO_HOME = join\(ROOT, ['"]\.home['"]\)/);
});

test('the scan catches a script that uses the real home', () => {
  assert.equal(reachesRealHome('const GREAT_CTO = join(process.env.HOME, ".great_cto");'), true);
  assert.equal(reachesRealHome('const h = os.homedir();'), true);
  void os;
});
