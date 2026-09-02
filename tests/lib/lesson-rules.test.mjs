// Lessons that fire mechanically, instead of asking anyone to remember them.
//
// The rule pack's history IS its test suite: the first sweep flagged 341 sites,
// 338 of them false — the one-line probe idiom, a catch that responds with a
// 400, cleanup-then-honest-null, a config map that happened to be named DENY.
// Each false-positive class below is a real site from this codebase that the
// first cut flagged and the rule had to learn to leave alone. A rule nobody
// trusts gets worked around, and a worked-around guard protects nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRules, catchBlocks, tryCatchPairs, RULES, brief } from '../../scripts/lib/lesson-rules.mjs';

const js = (text) => runRules(text, 'x.mjs');
const ids = (findings) => findings.map((f) => f.rule);

// ── catchBlocks: the textual parser under everything ────────────────────────

test('catchBlocks finds bindings, bodies and lines without an AST', () => {
  const src = `try { a(); } catch (err) { fix(err); }\ntry { b(); } catch { }\n`;
  const blocks = catchBlocks(src);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].binding, 'err');
  assert.match(blocks[0].body, /fix\(err\)/);
  assert.equal(blocks[1].binding, null);
  assert.equal(blocks[1].line, 2);
});

test('catchBlocks survives nested braces', () => {
  const src = `try { a(); } catch (e) { if (x) { y({ z: 1 }); } }`;
  assert.match(catchBlocks(src)[0].body, /z: 1/);
});

// ── fabricated-cause: the pipeline-wake incident ────────────────────────────

test('a catch that reports a quoted cause without reading the error is flagged', () => {
  // The incident verbatim, in shape: bound `e`, never read, and a confident
  // explanation that turned out to be a guess about a ReferenceError.
  const src = `try { a(); } catch (e) {
    wake = { recorded: false, why: 'pipeline-wake unavailable in this board build' };
  }`;
  assert.deepEqual(ids(js(src)), ['fabricated-cause']);
});

test('reading the error clears it — the message is now about the error', () => {
  const src = `try { a(); } catch (e) {
    wake = { recorded: false, why: String(e?.message || e) };
  }`;
  assert.deepEqual(js(src), []);
});

test('a bindingless catch cannot fabricate — it claims nothing about the error', () => {
  const src = `try { a(); } catch {
    wake = { recorded: false, why: 'store not initialised yet' };
  }`;
  assert.ok(!ids(js(src)).includes('fabricated-cause'));
});

// ── silent-catch: narrowed three times, each cut a real site ────────────────

test('multi-statement recovery in the dark is flagged', () => {
  const src = `try { a(); } catch (e) {
    state = rebuild();
    cache.clear();
    retries = 0;
  }`;
  assert.deepEqual(ids(js(src)), ['silent-catch']);
});

test('the one-line probe idiom is this codebase\'s accepted shape', () => {
  // First cut flagged 323 of these. alerts.mjs:30, beads.mjs:64, everywhere.
  assert.deepEqual(js(`try { return JSON.parse(x); } catch { return {}; }`), []);
});

test('a catch that responds IS handling (worker.js shape)', () => {
  const src = `try { body = await req.json(); }
  catch { return json({ error: "invalid_json" }, 400); }`;
  assert.deepEqual(js(src), []);
});

test('a catch that writes the failure to a stream is reporting (mcp-server shape)', () => {
  const src = `try { req = JSON.parse(t); } catch {
    const resp = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
    process.stdout.write(JSON.stringify(resp) + '\\n');
    return;
  }`;
  assert.deepEqual(js(src), []);
});

test('recording the failure into the result is reporting (artifact-claims shape)', () => {
  const src = `try { st = stat(full); } catch {
    missing.push(c);
    continue;
  }`;
  assert.deepEqual(js(src), []);
});

test('cleanup then an honest null is not work in the dark (memory-filter shape)', () => {
  const src = `try { return await go(); } catch {
    clearTimeout(timer);
    return null;
  }`;
  assert.deepEqual(js(src), []);
});

test('a comment saying why swallowing is right clears it', () => {
  const src = `try { a(); } catch {
    state = rebuild();
    cache.clear(); /* a stale cache after a failed read is worse than a cold one */
  }`;
  assert.deepEqual(js(src), []);
});

test('a rethrow is not a swallow', () => {
  const src = `try { a(); } catch (e) {
    cleanup();
    rollback();
    throw new Error('transaction failed');
  }`;
  assert.ok(!ids(js(src)).includes('silent-catch'));
});

// ── exclusion-without-why: one finding per list, at the declaration ─────────

test('an exclusion list with no stated reason is flagged once, not per entry', () => {
  const src = `const SKIP = new Set(['node_modules', 'dist',
  'build', 'coverage',
]);`;
  const f = js(src);
  assert.deepEqual(ids(f), ['exclusion-without-why']);
  assert.equal(f[0].line, 1, 'at the declaration, where the fix goes');
});

test('a comment within three lines above the list is the justification', () => {
  const src = `// Dependency and build output — not this project's own writing.
const SKIP = new Set(['node_modules', 'dist']);`;
  assert.deepEqual(js(src), []);
});

test('a JSDoc tail above the declaration counts (detect.ts shape)', () => {
  const src = ` * Skips node_modules, .git, dist.
 */
function f() {
  const SKIP = new Set(["node_modules", ".git"]);
}`;
  assert.deepEqual(js(src), []);
});

test('a config MAP named DENY is not an exclusion list (prose-slop shape)', () => {
  const src = `const DENY_FIX = Object.freeze({
  'SLOP-OPENER': 'cut it',
});`;
  assert.deepEqual(js(src), []);
});

test('a bash EXCLUDE_PATHS array is covered too', () => {
  const bash = `EXCLUDE_PATHS=(
  "scripts/hooks/pre-push.sh"
)`;
  const f = runRules(bash, 'guard.sh');
  assert.deepEqual(ids(f), ['exclusion-without-why']);
  const ok = `# self-matches its own pattern definitions
EXCLUDE_PATHS=(
  "scripts/hooks/pre-push.sh"
)`;
  assert.deepEqual(runRules(ok, 'guard.sh'), []);
});

// ── The pack as a whole ─────────────────────────────────────────────────────

test('every rule carries the incident that bought it', () => {
  for (const r of RULES) {
    assert.ok(r.lesson && r.lesson.length > 40,
      `${r.id}: a rule without a story gets deleted by the next person who finds it inconvenient`);
  }
});

test('rules do not fire on markdown', () => {
  assert.deepEqual(runRules('catch (e) { x = { why: "some long reason here" }; }', 'notes.md'), []);
});

test('the brief tells the agent to fix it now, with file:line', () => {
  const f = js(`try { a(); } catch (e) {\n  out = { why: 'a fabricated explanation' };\n}`);
  const b = brief(f, 'scripts/lib/x.mjs');
  assert.match(b, /scripts\/lib\/x\.mjs:\d+/);
  assert.match(b, /Fix these now/);
  assert.equal(brief([], 'x.mjs'), null, 'no findings, no noise');
});

// ── work-in-try-success-after ───────────────────────────────────────────────
//
// The gate-approve decision-log bug (2026-09-01) was invisible to silent-catch
// twice over: the catch carried `/* best-effort */`, which exempts, AND the
// catch was empty, so the statement count never applied either. silent-catch
// counts the CATCH; this shape puts the work in the TRY and leaves the catch
// with nothing to count.

test('work in the try, an empty catch, and success announced after — the gate-approve shape', () => {
  const f = js(`
async function approve(id, action, reason) {
  let via = 'beads';
  try {
    appendDecisionLog({
      ts: new Date().toISOString(),
      project: projectSlug,
      action, id, title,
      reason: reason || '',
    });
  } catch { /* best-effort */ }
  return { ok: true, via };
}`);
  assert.ok(ids(f).includes('work-in-try-success-after'),
    'the write may not have happened and the caller is told it did');
});

test('a flag that travels out with the answer is reporting, not swallowing', () => {
  // The honest form of the same shape, live in routes.mjs: the 200 is truthful
  // because the body carries `measured: false`. Flagging this would teach people
  // to delete the flag — the opposite of the lesson.
  const f = js(`
function handler() {
  let historyRead = false;
  try {
    const rows = load(histPath);
    for (const r of rows) parse(r);
    normalise(rows);
    historyRead = true;
  } catch { /* reported below as unmeasured */ }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ measured: historyRead, rows }));
  return true;
}`);
  assert.ok(!ids(f).includes('work-in-try-success-after'));
});

test('returning what actually happened clears it', () => {
  // The fix that shipped: the catch records the failure and the caller gets it.
  const f = js(`
async function approve(id) {
  let decision;
  try {
    appendDecisionLog({ ts: now(), project: p, action: a, id, title: t });
    decision = { logged: true };
  } catch (err) {
    log.warn('approve landed but was not logged: ' + err.message);
    decision = { logged: false, why: String(err.message) };
  }
  return { ok: true, decision };
}`);
  assert.ok(!ids(f).includes('work-in-try-success-after'));
});

test('a short probe is not work in the dark', () => {
  // Two statements is a probe, which is this codebase's accepted shape — the
  // same line silent-catch draws, for the same reason.
  const f = js(`
function readMaybe(p) {
  try {
    const raw = readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch { /* absent */ }
  return true;
}`);
  assert.ok(!ids(f).includes('work-in-try-success-after'));
});

test('a rethrowing catch is not silent — the caller still learns', () => {
  const f = js(`
function f() {
  try {
    const a = one();
    const b = two(a);
    three(b);
  } catch (e) { throw e; }
  return { ok: true };
}`);
  assert.ok(!ids(f).includes('work-in-try-success-after'));
});

test('no success claim afterwards, no finding — the shape needs both halves', () => {
  const f = js(`
function f() {
  try {
    const a = one();
    const b = two(a);
    three(b);
  } catch { }
  return { ok: false, why: 'unknown' };
}`);
  assert.ok(!ids(f).includes('work-in-try-success-after'));
});

test('tryCatchPairs pairs a try with its own catch, and skips try/finally', () => {
  const pairs = tryCatchPairs(`
try { a(); } catch (e) { b(); }
try { c(); } finally { d(); }
try { e(); } catch { }
`);
  assert.equal(pairs.length, 2, 'try/finally has no catch to pair');
  assert.equal(pairs[0].binding, 'e');
  assert.equal(pairs[1].binding, null);
});

test('the success claim must be in the SAME function, not the next one', () => {
  // packages/cli/src/detect.ts: a loop that skips unreadable files, followed by
  // an unrelated helper whose `return true` is about something else entirely.
  // A fixed look-ahead window walked out of one function and into the next and
  // read that as this try's success claim.
  const f = js(`
function collectRegions(tfFiles) {
  for (const p of tfFiles) {
    try {
      const txt = readFileSync(p, 'utf-8').slice(0, 50000);
      for (const [re, kw] of regionPatterns) {
        if (re.test(txt)) kws.add(kw);
      }
    } catch { /* skip */ }
  }
  return Array.from(kws).sort();
}

function safeGlob(dir, pattern) {
  if (pattern.test(dir)) return true;
  return false;
}`);
  assert.ok(!ids(f).includes('work-in-try-success-after'),
    'the `return true` belongs to safeGlob, not to the loop above it');
});
