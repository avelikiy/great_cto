// A score must be absent when the evidence is absent (T5b).
//
// Half the designed weight of `overall` is executed evidence. When the suite
// never ran — or ran and produced output we cannot read — publishing a number
// dresses a structural floor up as a quality score. That is how a product whose
// suite exited 143 was published as 76 (B). See docs/benchmarks/RESCORE-2026-07-19.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assess, evaluateGate, combinedScore } from '../../scripts/lib/quality.mjs';

function makeProduct(name, pkg, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcto-q-${name}-`));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return dir;
}

test('no test script at all → overall is null, not a number', () => {
  const dir = makeProduct('notest', { name: 'x', version: '1.0.0', scripts: {} });
  try {
    const r = assess(dir);
    assert.equal(r.overall, null, 'overall must be null');
    assert.equal(r.grade, null, 'grade must be null');
    assert.notEqual(typeof r.overall, 'number');
    assert.ok(r.unmeasured, 'reports why it is unmeasured');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a suite that exits non-zero without a summary is unmeasured, not a failure score', () => {
  // Mirrors the coaching product: process died (SIGTERM) with no counts printed.
  const dir = makeProduct('crash', {
    name: 'x', version: '1.0.0', scripts: { test: 'node -e "process.exit(143)"' },
  }, { 'src/a.test.ts': '', 'e2e/x.spec.ts': '' });
  try {
    const r = assess(dir);
    assert.equal(r.tests.ran, false, 'must not claim the suite ran');
    assert.equal(r.overall, null, 'a crashed suite yields no score');
    assert.match(r.unmeasured, /report/, 'reason names the missing report');
    // The filename-based floor still sees the test files — which is exactly why
    // it must not be published on its own.
    assert.ok(r.floor > 0, 'floor still credits the files it can see');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a readable suite still produces a numeric score', () => {
  const dir = makeProduct('ok', {
    name: 'x', version: '1.0.0',
    scripts: { test: 'node -e "console.log(\'# tests 4\\n# pass 4\\n# fail 0\')"' },
  }, { 'src/a.test.ts': '' });
  try {
    const r = assess(dir);
    assert.equal(r.tests.ran, true);
    assert.equal(r.tests.total, 4);
    assert.equal(typeof r.overall, 'number', 'measured suite → real score');
    assert.ok(r.grade, 'and a grade');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('evaluateGate blocks a null score with an explanatory reason', () => {
  const g = evaluateGate(null, { min: 70 });
  assert.equal(g.ok, false, 'null must never pass');
  assert.match(g.reason, /no measurable test suite/i);
});

test('evaluateGate blocks undefined and NaN the same way', () => {
  for (const v of [undefined, NaN]) {
    const g = evaluateGate(v, { min: 70 });
    assert.equal(g.ok, false, `${String(v)} must not pass`);
    assert.match(g.reason, /no measurable/i);
  }
});

test('evaluateGate still passes a good numeric score', () => {
  assert.equal(evaluateGate(85, { min: 70 }).ok, true);
  assert.equal(evaluateGate(65, { min: 70 }).ok, false);
});

test('combinedScore itself is unchanged for measured input', () => {
  const c = combinedScore({ floor: 80, ceiling: 60, contracts: null });
  assert.equal(typeof c.overall, 'number');
});
