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

// The card's own CSS classes must exist. The first version used `class="warn"`
// five times and `var(--warn, …)` once; the token was caught by the css-tokens
// guard, the CLASS by nothing — those spans rendered as ordinary prose, so
// "declared codex, but unavailable here" looked exactly like a normal line.
test('every class and token the Harnesses card emits is declared in the stylesheet', () => {
  const html = readFileSync(path.join(HERE, 'public', 'index.html'), 'utf8');
  const card = html.slice(html.indexOf('async function renderHarnesses()'), html.indexOf('async function renderTierBadge()'));
  assert.ok(card.length > 500, 'found the renderer');

  for (const cls of new Set([...card.matchAll(/class="([a-z0-9 _-]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean))) {
    assert.match(html, new RegExp(`\\.${cls}\\s*[,{]`), `class .${cls} is used by the card but declared nowhere`);
  }
  for (const tok of new Set([...card.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))) {
    assert.match(html, new RegExp(`^\\s*${tok}\\s*:`, 'm'), `token ${tok} is used by the card but declared nowhere`);
  }
});
