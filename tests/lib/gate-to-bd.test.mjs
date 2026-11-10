// scripts/gate-to-bd.mjs against a fake bd that keeps its issues in a JSON file,
// so "the second run comments instead of creating" is checked across processes,
// the way the gate will use it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fingerprint, normalise, priorityOf } from '../../scripts/gate-to-bd.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'gate-to-bd.mjs');

// A bd that understands exactly the three calls gate-to-bd makes.
const FAKE_BD = `#!/usr/bin/env node
const fs = require('fs');
const db = process.env.FAKE_BD_DB;
const s = fs.existsSync(db) ? JSON.parse(fs.readFileSync(db, 'utf8')) : { issues: [], comments: [] };
const a = process.argv.slice(2);
const save = () => fs.writeFileSync(db, JSON.stringify(s));
if (process.env.FAKE_BD_FAIL) { process.stderr.write('database locked'); process.exit(1); }
if (a[0] === 'list') {
  const label = a[a.indexOf('--label') + 1];
  process.stdout.write(JSON.stringify(s.issues.filter((i) => i.labels.includes(label) && i.status === 'open')));
} else if (a[0] === 'create') {
  const id = 'bd-' + (s.issues.length + 1);
  s.issues.push({ id, title: a[1], status: 'open', priority: a[a.indexOf('-p') + 1], labels: a[a.indexOf('-l') + 1].split(','), parent: a.includes('--parent') ? a[a.indexOf('--parent') + 1] : null });
  save(); process.stdout.write(id + '\\n');
} else if (a[0] === 'comments' && a[1] === 'add') {
  s.comments.push({ id: a[2], text: a[3] }); save();
} else { process.stderr.write('unexpected: ' + a.join(' ')); process.exit(3); }
`;

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-to-bd-'));
  const bd = path.join(dir, 'bd');
  fs.writeFileSync(bd, FAKE_BD, { mode: 0o755 });
  const db = path.join(dir, 'db.json');
  const report = (tests, name = 'board tests') => {
    const f = path.join(dir, `r-${Math.random().toString(36).slice(2)}.ctrf.json`);
    fs.writeFileSync(f, JSON.stringify({ reportFormat: 'CTRF', results: { tool: { name }, summary: {}, tests } }));
    return f;
  };
  const run = (args, env = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, GATE_BD: bd, FAKE_BD_DB: db, ...env } });
  const state = () => (fs.existsSync(db) ? JSON.parse(fs.readFileSync(db, 'utf8')) : { issues: [], comments: [] });
  return { dir, report, run, state, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const failing = (over = {}) => ({ name: 'inbox lists the gate', status: 'failed', message: 'expected 3 gates, got 0 (port 61234, /tmp/gcto-x1/abc)', filePath: '/repo/packages/board/work.test.mjs', ...over });

test('a failure creates one bug; the same failure next run adds a comment, not a second bug', () => {
  const s = sandbox();
  try {
    const first = s.run(['--parent', 'epic-1', '--commit', 'abc123', s.report([failing(), { name: 'ok one', status: 'passed' }])]);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(s.state().issues.length, 1);
    const bug = s.state().issues[0];
    assert.equal(bug.parent, 'epic-1');
    assert.ok(bug.labels.includes('gate-failure'));
    assert.ok(bug.labels.some((l) => /^fp-[0-9a-f]{10}$/.test(l)));

    // Next run: different port and temp dir in the message — the same failure.
    const second = s.run([s.report([failing({ message: 'expected 3 gates, got 0 (port 50001, /tmp/gcto-y9/def)' })])]);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(s.state().issues.length, 1, 'no duplicate bug');
    assert.equal(s.state().comments.length, 1);
    assert.equal(s.state().comments[0].id, bug.id);
  } finally { s.done(); }
});

test('a different failure of the same test is a different bug; one failure twice in a run is one bug', () => {
  const s = sandbox();
  try {
    const r = s.run([s.report([failing(), failing()]), s.report([failing({ message: 'TypeError: cannot read properties of undefined' })])]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(s.state().issues.length, 2);
  } finally { s.done(); }
});

test('--dry-run files nothing and says what it would do', () => {
  const s = sandbox();
  try {
    const r = s.run(['--dry-run', s.report([failing()])]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /would-create/);
    assert.equal(s.state().issues.length, 0);
  } finally { s.done(); }
});

test('when bd cannot file, the run says so and exits 2 — never a silent success', () => {
  const s = sandbox();
  try {
    const r = s.run([s.report([failing()])], { FAKE_BD_FAIL: '1' });
    assert.equal(r.status, 2);
    assert.match(r.stdout, /1 not filed/);
  } finally { s.done(); }
});

test('an unreadable report exits 2; no report argument is a usage error', () => {
  const s = sandbox();
  try {
    assert.equal(s.run([path.join(s.dir, 'missing.json')]).status, 2);
    assert.equal(s.run([]).status, 64);
  } finally { s.done(); }
});

test('fingerprint ignores run noise; priority follows the layer', () => {
  assert.equal(normalise('took 1234 ms on /private/var/folders/x/y'), 'took N ms on <tmp>');
  assert.equal(fingerprint(failing()), fingerprint(failing({ message: 'expected 4 gates, got 1 (port 1, /tmp/z)' })));
  assert.notEqual(fingerprint(failing()), fingerprint(failing({ name: 'another test' })));
  assert.equal(priorityOf({ name: 'x', filePath: 'packages/board/gate-tokens.test.mjs' }), 0);
  assert.equal(priorityOf({ name: 'x', filePath: 'tests/e2e/board.e2e.test.mjs' }), 1);
  assert.equal(priorityOf({ name: 'x', filePath: 'packages/board/work.test.mjs' }), 2);
});
