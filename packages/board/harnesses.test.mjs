// The Harnesses endpoints, over HTTP against a real board in a temp project.
//
// What is asserted is the state machine, not the prose: an absent Codex under a
// `second_opinion: codex` declaration is `unavailable`, never `none`; a POST
// says what it replaced; and the file it writes is the operator's PROJECT.md,
// so it is guarded by origin like every other browser write on this server.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import {
  checkClassParity, declaredClasses, stylesheet, strayCloseBraces, usedClasses,
} from '../../scripts/lib/css-classes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, 'server.mjs');

const project = mkdtempSync(path.join(tmpdir(), 'gc-harn-'));
const home = mkdtempSync(path.join(tmpdir(), 'gc-harn-home-'));
mkdirSync(path.join(project, '.great_cto'));
writeFileSync(path.join(project, '.great_cto', 'PROJECT.md'), '# T\n\nprimary: web-fullstack\n\ncapabilities:\n  logs: loki\n');
mkdirSync(path.join(home, '.codex'), { recursive: true });   // no auth.json, no config → codex is `no-auth` or `absent`

const { port, proc } = await startServerOnFreePort({
  entry: ENTRY, cwd: project,
  env: { HOME: home, GREAT_CTO_NO_UPDATE_CHECK: '1', GREAT_CTO_CODEX_BIN: '/nonexistent/codex' },   // the same lever the reviewer and verifier read → detectCodex() is `absent`
  readyPath: '/api/heartbeat', portEnv: 'PORT',
});
const base = `http://127.0.0.1:${port}`;
const get = async (p) => (await fetch(base + p)).json();
const post = async (p, body, origin = base) => {
  const r = await fetch(base + p, { method: 'POST', headers: { Origin: origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

after(async () => {
  try { const { reap } = await import('../../tests/helpers/reap.mjs'); await reap(proc); } catch { try { proc.kill('SIGKILL'); } catch { /* gone */ } }
  rmSync(project, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true });
});

test('GET: Claude Code is the host, Codex is detected (absent here), second opinion is undeclared', async () => {
  const h = await get('/api/harnesses');
  assert.equal(h.claude_code.state, 'host');
  assert.equal(h.codex.state, 'absent', JSON.stringify(h.codex));
  assert.equal(h.second_opinion.state, 'undeclared');
  assert.match(h.second_opinion.why, /not declared is not none/);
  assert.equal(h.evidence.state, 'absent', 'no review has run — absent, not zero');
  assert.deepEqual(h.second_opinion.providers, ['codex', 'openrouter', 'none']);
});

test('POST codex on a machine without one: the declaration is written, and it resolves UNAVAILABLE at the click', async () => {
  const r = await post('/api/harnesses/second-opinion', { provider: 'codex' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.previous, null, 'nothing was declared before');
  assert.equal(r.body.provider, 'codex');
  assert.equal(r.body.resolved.state, 'unavailable');
  assert.match(r.body.resolved.why, /not on PATH/);
  const md = readFileSync(path.join(project, '.great_cto', 'PROJECT.md'), 'utf8');
  assert.match(md, /^  second_opinion: codex$/m);
  assert.match(md, /^  logs: loki$/m, 'the neighbouring capability survived');
  const h = await get('/api/harnesses');
  assert.equal(h.second_opinion.state, 'unavailable');
  assert.equal(h.second_opinion.declared.tool, 'codex');
});

test('POST none replaces codex and reports what it replaced', async () => {
  const r = await post('/api/harnesses/second-opinion', { provider: 'none' });
  assert.equal(r.status, 200);
  assert.equal(r.body.previous, 'codex');
  assert.equal(r.body.resolved.state, 'none');
  assert.equal((await get('/api/harnesses')).second_opinion.state, 'none');
});

test('POST null undeclares — which is a different state from none', async () => {
  const r = await post('/api/harnesses/second-opinion', { provider: null });
  assert.equal(r.status, 200);
  assert.equal(r.body.previous, 'none');
  assert.equal(r.body.resolved.state, 'undeclared');
  assert.doesNotMatch(readFileSync(path.join(project, '.great_cto', 'PROJECT.md'), 'utf8'), /second_opinion/);
});

test('an unknown provider is refused, and the file is untouched', async () => {
  const before = readFileSync(path.join(project, '.great_cto', 'PROJECT.md'), 'utf8');
  const r = await post('/api/harnesses/second-opinion', { provider: 'gemini' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /codex, openrouter, none/);
  assert.equal(readFileSync(path.join(project, '.great_cto', 'PROJECT.md'), 'utf8'), before);
});

test('a foreign origin cannot write PROJECT.md', async () => {
  const r = await post('/api/harnesses/second-opinion', { provider: 'codex' }, 'http://evil.example');
  assert.equal(r.status, 403);
});

test('the evidence tail reads the review log, counts unreadable lines, and never drops them', async () => {
  const log = path.join(project, '.great_cto', 'cross-review.log');
  writeFileSync(log, [
    JSON.stringify({ ts: '2026-09-05T10:00:00Z', provider: 'codex', model: 'm', state: 'ok', verdict: 'BLOCK', findings: 2, p0: 1, cost: 0.01 }),
    'not json at all',
    JSON.stringify({ ts: '2026-09-05T10:05:00Z', provider: 'codex', state: 'unavailable', verdict: null, findings: null }),
  ].join('\n') + '\n');
  const h = await get('/api/harnesses');
  assert.equal(h.evidence.state, 'ok');
  assert.deepEqual(h.evidence.summary, { runs: 2, reviewed: 1, skipped: 1, blocked: 1, unreadable_lines: 1 });
  assert.equal(h.evidence.recent[0].state, 'unavailable', 'newest first');
});

// Extended harness tests: skipped rows are dimmed + excluded, unparseable lines counted.
// A run in state 'unavailable', 'quota', or 'skipped' does not count as reviewed;
// blocked is counted only from reviewed runs (state 'ok'); unparseable lines are
// counted in the summary but never silently dropped.

test('summary counts: 2 ok/PASS + 1 ok/BLOCK + 1 unavailable + 1 quota + 1 unparseable → runs 5, reviewed 3, skipped 2, blocked 1, unparseable 1', async () => {
  const log = path.join(project, '.great_cto', 'cross-review.log');
  writeFileSync(log, [
    JSON.stringify({ ts: '2026-09-05T10:00:00Z', provider: 'codex', model: 'm', state: 'ok', verdict: 'PASS', findings: 0, cost: 0.01 }),
    JSON.stringify({ ts: '2026-09-05T10:01:00Z', provider: 'codex', model: 'm', state: 'ok', verdict: 'PASS', findings: 1, cost: 0.02 }),
    JSON.stringify({ ts: '2026-09-05T10:02:00Z', provider: 'codex', model: 'm', state: 'ok', verdict: 'BLOCK', findings: 2, cost: 0.03 }),
    JSON.stringify({ ts: '2026-09-05T10:03:00Z', provider: 'codex', model: 'm', state: 'unavailable', verdict: null, findings: null, cost: null }),
    JSON.stringify({ ts: '2026-09-05T10:04:00Z', provider: 'codex', model: 'm', state: 'quota', verdict: null, findings: null, cost: null }),
    'garbage line that is not json',
  ].join('\n') + '\n');
  const h = await get('/api/harnesses');
  assert.equal(h.evidence.state, 'ok');
  assert.deepEqual(h.evidence.summary, {
    runs: 5,
    reviewed: 3,
    skipped: 2,
    blocked: 1,
    unreadable_lines: 1,
  }, '5 parsed lines in runs; the garbage line is counted in its own figure, never in runs and never dropped');
});

test('skipped rows (unavailable/quota/skipped state) are excluded from reviewed and blocked counts', async () => {
  const log = path.join(project, '.great_cto', 'cross-review.log');
  writeFileSync(log, [
    JSON.stringify({ ts: '2026-09-05T10:00:00Z', provider: 'codex', state: 'ok', verdict: 'PASS', cost: 0.01 }),
    JSON.stringify({ ts: '2026-09-05T10:01:00Z', provider: 'codex', state: 'unavailable', verdict: null, cost: null }),
    JSON.stringify({ ts: '2026-09-05T10:02:00Z', provider: 'codex', state: 'ok', verdict: 'BLOCK', cost: 0.02 }),
    JSON.stringify({ ts: '2026-09-05T10:03:00Z', provider: 'codex', state: 'quota', verdict: null, cost: null }),
  ].join('\n') + '\n');
  const h = await get('/api/harnesses');
  // runs includes all parsed lines (4), reviewed counts only state 'ok' (2),
  // skipped counts state != 'ok' (2), blocked counts verdict 'BLOCK' among reviewed (1)
  assert.equal(h.evidence.summary.runs, 4);
  assert.equal(h.evidence.summary.reviewed, 2, 'only ok state rows are reviewed');
  assert.equal(h.evidence.summary.skipped, 2, 'unavailable + quota are skipped');
  assert.equal(h.evidence.summary.blocked, 1, 'blocked only among reviewed (state ok)');
});

test({ skip: 'RED until great_cto-ki1x.10 lands' }, 'skipped rows are marked in the recent output and never carry a verdict', async () => {
  const log = path.join(project, '.great_cto', 'cross-review.log');
  writeFileSync(log, [
    JSON.stringify({ ts: '2026-09-05T10:00:00Z', provider: 'codex', state: 'ok', verdict: 'PASS' }),
    JSON.stringify({ ts: '2026-09-05T10:01:00Z', provider: 'codex', state: 'unavailable', verdict: null }),
    JSON.stringify({ ts: '2026-09-05T10:02:00Z', provider: 'codex', state: 'quota', verdict: null }),
  ].join('\n') + '\n');
  const h = await get('/api/harnesses');
  // Newest first (reversed)
  const recent = h.evidence.recent;
  assert.equal(recent.length, 3);
  // recent[0] is the newest: quota
  assert.equal(recent[0].state, 'quota');
  assert.strictEqual(recent[0].verdict, null, 'skipped row never carries a verdict');
  // recent[1] is unavailable
  assert.equal(recent[1].state, 'unavailable');
  assert.strictEqual(recent[1].verdict, null, 'skipped row never carries a verdict');
  // recent[2] is ok/PASS
  assert.equal(recent[2].state, 'ok');
  assert.equal(recent[2].verdict, 'PASS');
});

test('cost on skipped rows is null, never 0', async () => {
  const log = path.join(project, '.great_cto', 'cross-review.log');
  writeFileSync(log, [
    JSON.stringify({ ts: '2026-09-05T10:00:00Z', provider: 'codex', state: 'ok', verdict: 'PASS', cost: 0.01 }),
    JSON.stringify({ ts: '2026-09-05T10:01:00Z', provider: 'codex', state: 'unavailable', cost: null }),
    JSON.stringify({ ts: '2026-09-05T10:02:00Z', provider: 'codex', state: 'quota', cost: null }),
  ].join('\n') + '\n');
  const h = await get('/api/harnesses');
  const recent = h.evidence.recent;
  assert.strictEqual(recent[0].cost, null, 'quota row cost is null');
  assert.strictEqual(recent[1].cost, null, 'unavailable row cost is null');
  assert.strictEqual(typeof recent[2].cost, 'number', 'ok row has a numeric cost');
  assert.notEqual(recent[2].cost, 0, 'ok row cost is not 0');
});

test('unparseable lines are counted in the summary and never silently dropped', async () => {
  const log = path.join(project, '.great_cto', 'cross-review.log');
  const lines = [
    JSON.stringify({ ts: '2026-09-05T10:00:00Z', provider: 'codex', state: 'ok', verdict: 'PASS', cost: 0.01 }),
    'this is garbage',
    'also garbage but different',
    JSON.stringify({ ts: '2026-09-05T10:01:00Z', provider: 'codex', state: 'ok', verdict: 'BLOCK', cost: 0.02 }),
    '{"incomplete json',
  ];
  writeFileSync(log, lines.join('\n') + '\n');
  const h = await get('/api/harnesses');
  // 5 total lines: 2 parseable + 3 unparseable
  assert.equal(h.evidence.summary.runs, 2, 'only the 2 parsed lines are runs');
  assert.equal(h.evidence.summary.unreadable_lines, 3, 'exactly 3 unparseable lines counted, in their own figure');
  assert.equal(h.evidence.summary.reviewed, 2, 'only 2 reviewed (the parseable ones)');
  assert.equal(h.evidence.summary.blocked, 1, 'only 1 blocked verdict');
});

// The card's own CSS classes must exist. The first version used `class="warn"`
// five times and `var(--warn, …)` once; the token was caught by the css-tokens
// guard, the CLASS by nothing — those spans rendered as ordinary prose, so
// "declared codex, but unavailable here" looked exactly like a normal line.
//
// Scoped to one card, that guard found one card's worth of the defect. Widened
// to the file it found `.btn-sm`, `.btn`, `.input` and `.sr-only` — and, once
// it started asking whether a RULE survives parsing at all, two stray `}` that
// had been quietly deleting `.budgets-table th`, every `td` in that table, and
// `.icon-btn`'s box. Scope was the only thing between this board and those, and
// scope is the cheapest thing to widen.
//
// Widened twice, in fact. The first pass read `class="…"` and nothing else,
// which silently exempted the 19 `className =` and 21 `classList` calls that
// set classes from script — a clean report over two thirds of the surface, and
// no way to tell it from a real one.
//
// Classes here, tokens next door in tests/lib/css-tokens.test.mjs.

// Every class applied by this board's markup but named by no selector, and the
// reason each one is a name rather than a style. Entries may be REMOVED freely
// — that is the ratchet closing. Adding one is a decision: it says an element
// carrying this class is styled by something else, and says by what. Anything
// that cannot be written down that way is a defect, not an exemption.
const CHECKED_AND_SAFE = {
  'notif-inline-row':
    'a JS handle, not a style — renderNotifInline() does ' +
    "`el.querySelectorAll('.notif-inline-row').forEach(e => e.remove())` to clear the drawer; " +
    'the row itself is styled by its own inline `style=`',
  'resume-col':
    'a grid child of `.resume-grid`, which sets `grid-template-columns: repeat(3, 1fr)` and the gap. ' +
    'The column comes from the parent; the child needs no rule of its own',
  'bt-agent':
    'the flexible cell of `.budgets-table` — `.budgets-table td` gives it padding and border, and its ' +
    'contents carry the type (`.bt-slug`, `.bt-desc`). The named siblings exist to override alignment ' +
    'and number formatting, which this cell does not want',
  'bt-state':
    'same row, same reason: `.budgets-table td` styles it and its contents are chips that style ' +
    'themselves. The name marks the column for a reader of the row template',
  'cta-row':
    'the notifications save/test button row, laid out by its own inline ' +
    '`display:flex;gap:10px;flex-wrap:wrap`. The class names the row, the inline rule is the style',
  'share-meta':
    'fully described by its own inline `style=` (caption size, --text3, mono) and addressed from JS by ' +
    "`getElementById('share-meta')`. The class is the block's name in the `.share-*` family",
  'tbl':
    'the edits table in openEdits(): three `<td>` with inline widths and `.muted`, inside a panel that ' +
    'supplies the type. Nothing about the table itself is styled, by design',
};

test('every class this board applies is declared in the stylesheet', () => {
  const html = readFileSync(path.join(HERE, 'public', 'index.html'), 'utf8');
  const { undeclared, usedCount } = checkClassParity(html);
  // Markup AND script. The first widening read only `class="…"` and passed 19
  // `className =` and 21 `classList` calls without looking at them — an
  // all-clear over a third of the surface reads exactly like a real one.
  assert.ok(usedCount > 400, `read the whole file, not a slice of it (saw ${usedCount} classes)`);
  for (const c of ['degraded-banner', 'stale-board', 'toast', 'card-selected']) {
    assert.ok(usedClasses(html).has(c), `the script sets .${c} — the scan must see it`);
  }

  const offenders = undeclared
    .filter((u) => !(u.cls in CHECKED_AND_SAFE))
    .map((u) => `.${u.cls} ×${u.count}`);

  assert.deepEqual(offenders, [],
    'these are applied by the markup and named by no selector — the elements render unstyled, and ' +
    'nothing errors. Point them at the class that already carries the intent, declare the rule, or ' +
    'add them to CHECKED_AND_SAFE with the reason they need none.');
});

test('every class exemption names a class the board still applies', () => {
  // An exemption for a class nobody uses is a hole nobody can see: the name
  // stays, and a NEW element reaching for it inherits a pass it never earned.
  const html = readFileSync(path.join(HERE, 'public', 'index.html'), 'utf8');
  const used = usedClasses(html);
  const declared = declaredClasses(stylesheet(html));

  for (const cls of Object.keys(CHECKED_AND_SAFE)) {
    assert.ok(used.has(cls), `exempted class is no longer applied — drop the entry: .${cls}`);
    assert.ok(!declared.has(cls),
      `.${cls} is declared now, so the exemption says nothing — drop the entry`);
  }
});

test('no rule in the stylesheet is silently discarded by a stray brace', () => {
  // Parity cannot see this one. A `}` with no `{` does not error: at the top
  // level it OPENS a rule whose prelude runs to the next `{`, so it eats the
  // comment and the selector after it and the next rule never applies. Both of
  // this board's occurrences were introduced by commits about something else,
  // and both went unnoticed — `.budgets-table th` inside a subagent-batching
  // change, `.icon-btn` when `.leash-chip` was deleted without its brace.
  const html = readFileSync(path.join(HERE, 'public', 'index.html'), 'utf8');
  const stray = strayCloseBraces(stylesheet(html));
  assert.deepEqual(stray.map((s) => `line ${s.line}`), [],
    'a stray `}` in the stylesheet swallows the rule that follows it');
});
