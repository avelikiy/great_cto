// scripts/ctrf-to-allure.mjs: every CTRF status maps to an Allure status that
// does not blur it, and the files land where Allure reads them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toAllure } from '../../scripts/ctrf-to-allure.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/ctrf-to-allure.mjs');
const doc = {
  reportFormat: 'CTRF',
  results: {
    tool: { name: 'board tests' },
    tests: [
      { name: 'passes', status: 'passed', duration: 5, start: 100, stop: 105, filePath: '/x/a.test.mjs' },
      { name: 'fails', status: 'failed', duration: 2, start: 106, stop: 108, filePath: '/x/a.test.mjs', message: 'one is not two', trace: 'at a.test.mjs:3' },
      { name: 'skipped', status: 'skipped', duration: 0, start: 109, stop: 109, filePath: '/x/b.test.mjs', message: 'no browser' },
      { name: 'later', status: 'pending', duration: 0, start: 110, stop: 110, filePath: '/x/b.test.mjs', suite: 'group' },
    ],
  },
};

test('each CTRF status keeps its meaning in Allure, with suites as labels', () => {
  const by = Object.fromEntries(toAllure(doc).map((r) => [r.name, r]));
  assert.equal(by.passes.status, 'passed');
  assert.equal(by.fails.status, 'failed');
  assert.deepEqual(by.fails.statusDetails, { message: 'one is not two', trace: 'at a.test.mjs:3' });
  assert.equal(by.skipped.status, 'skipped', 'a skip is never reported as passed');
  assert.equal(by.later.status, 'skipped');
  assert.ok(by.later.labels.some((l) => l.name === 'tag' && l.value === 'todo'));
  assert.ok(by.later.labels.some((l) => l.name === 'subSuite' && l.value === 'group'));
  assert.ok(by.passes.labels.some((l) => l.name === 'parentSuite' && l.value === 'board tests'));
  assert.equal(by.passes.historyId, toAllure(doc)[0].historyId, 'the same test keeps its history id across runs');
  assert.notEqual(by.passes.uuid, toAllure(doc)[0].uuid);
});

test('the CLI writes one result file per test, and refuses an empty input', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrf-allure-'));
  try {
    const report = path.join(dir, 'r.ctrf.json');
    fs.writeFileSync(report, JSON.stringify(doc));
    const out = path.join(dir, 'allure-results');
    const ok = spawnSync(process.execPath, [SCRIPT, out, report], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(fs.readdirSync(out).filter((f) => f.endsWith('-result.json')).length, 4);
    const empty = path.join(dir, 'e.ctrf.json');
    fs.writeFileSync(empty, JSON.stringify({ results: { tests: [] } }));
    assert.equal(spawnSync(process.execPath, [SCRIPT, path.join(dir, 'o2'), empty]).status, 1, 'zero results is not a report');
    assert.equal(spawnSync(process.execPath, [SCRIPT]).status, 64);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
