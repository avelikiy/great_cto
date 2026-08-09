// readVerdicts feeds metrics, cost, the pipeline strip, the inbox, resume and
// agent statistics — six surfaces from one read — and it returned [] on every
// kind of failure. An unreadable verdict directory therefore arrived at all six
// as "this project has not run anything": a different claim from "I could not
// look", and a confident one.
//
// Both review agents independently ranked this the first thing to fix, for the
// same reason: one honest function un-blinds six panels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readVerdicts, readVerdictsWithHealth } from './lib/verdicts.mjs';
import { dispatch } from './lib/routes.mjs';

function project({ verdictsDirIsFile = false, lines = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-vh-'));
  fs.mkdirSync(path.join(dir, '.great_cto'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.great_cto', 'PROJECT.md'), 'primary: devtools\nslug: probe\n');
  const vd = path.join(dir, '.great_cto', 'verdicts');
  if (verdictsDirIsFile) fs.writeFileSync(vd, '');
  else {
    fs.mkdirSync(vd, { recursive: true });
    if (lines) fs.writeFileSync(path.join(vd, 'architect.log'), lines.join('\n') + '\n');
  }
  return dir;
}
const clean = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };

test('an unreadable verdict directory is named, not reported as an empty project', () => {
  const dir = project({ verdictsDirIsFile: true });
  try {
    const h = readVerdictsWithHealth(dir);
    assert.equal(h.verdicts.length, 0);
    assert.match(h.unread, /could not be listed/);
  } finally { clean(dir); }
});

test('a healthy project reports nothing', () => {
  const dir = project({ lines: ['{"v":1,"ts":"2026-08-08T10:00:00Z","agent":"architect","verdict":"APPROVED","project":"probe"}'] });
  try {
    const h = readVerdictsWithHealth(dir);
    assert.equal(h.verdicts.length, 1);
    assert.equal(h.unread, null, 'a clean read must be silent, or the signal becomes noise');
  } finally { clean(dir); }
});

test('unparseable lines beside readable ones are noise, not degradation', () => {
  // A half-written append is the normal state of a file being written to.
  const dir = project({ lines: ['{"v":1,"ts":"2026-08-08T10:00:00Z","agent":"architect","verdict":"APPROVED","project":"probe"}', '{"half-writ'] });
  try {
    const h = readVerdictsWithHealth(dir);
    assert.equal(h.verdicts.length, 1);
    assert.equal(h.unreadableLines, 1, 'counted');
    assert.equal(h.unread, null, 'but not reported — something was read');
  } finally { clean(dir); }
});

test('unparseable lines and nothing else IS worth saying out loud', () => {
  // This is the project that looks empty for a reason.
  // Not `garbage`: the legacy space dialect is deliberately permissive and
  // parses a bare word as <ts> with an empty verdict. Genuinely unparseable is
  // malformed JSON and JSON that fails validation.
  const dir = project({ lines: ['{"half-writ', '{"v":1}'] });
  try {
    const h = readVerdictsWithHealth(dir);
    assert.equal(h.verdicts.length, 0);
    assert.match(h.unread, /could not be parsed/);
  } finally { clean(dir); }
});

test('the eight existing callers still get a plain array', () => {
  // The health report is additive; changing the shape would have meant touching
  // metrics, cost, pipeline, inbox, resume, share, fleet and alerts at once.
  const dir = project({ lines: ['{"v":1,"ts":"2026-08-08T10:00:00Z","agent":"a","verdict":"DONE","project":"probe"}'] });
  try {
    assert.ok(Array.isArray(readVerdicts(dir)));
    assert.ok(Array.isArray(readVerdicts(project({ verdictsDirIsFile: true }))), 'and does not throw on a broken one');
  } finally { clean(dir); }
});

test('all four formerly blind endpoints now say when the read failed', async () => {
  const broken = project({ verdictsDirIsFile: true });
  const healthy = project({ lines: ['{"v":1,"ts":"2026-08-08T10:00:00Z","agent":"a","verdict":"DONE","project":"probe"}'] });
  const call = async (route, cwd) => {
    const url = new URL(`http://x${route}`);
    const h = {};
    const res = { setHeader(k, v) { h[k] = v; }, writeHead(c, hh) { Object.assign(h, hh || {}); }, end() {}, on() {}, write() {} };
    await dispatch({ method: 'GET', url: route, on() {}, headers: {} }, res, url, cwd);
    return h['X-Board-Degraded'];
  };
  try {
    for (const route of ['/api/metrics', '/api/cost', '/api/pipeline', '/api/inbox']) {
      assert.ok(await call(route, broken), `${route} must report a failed read`);
      assert.equal(await call(route, healthy), undefined, `${route} must stay silent when healthy`);
    }
  } finally { clean(broken); clean(healthy); }
});
