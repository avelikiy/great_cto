// ADR-023, the last step: see on the board what an agent turn changed.
//
// The turns are recorded by the Stop / SubagentStop hooks as git refs. These pin the
// two routes that read them — on the real server, over a real repository — and the
// page functions that draw them. A turn's diff is file content, so every line of it
// is escaped before it reaches the page: a file holding `<script>` is text here.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { reap } from '../../tests/helpers/reap.mjs';
import { snapshotTurn } from '../../scripts/lib/turn-snapshot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, 'server.mjs');
const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) rmSync(d, { recursive: true, force: true }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); TMP_DIRS.push(d); return d; };
const SESSION = '0b6f3f1e-6c1e-4d0a-9d6b-2f1f0e9a7c11';

function project({ git = true } = {}) {
  const d = tmp('gcto-turnsview-');
  mkdirSync(join(d, '.great_cto'), { recursive: true });
  writeFileSync(join(d, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  if (!git) return d;
  const run = (...a) => execFileSync('git', a, { cwd: d, stdio: ['ignore', 'pipe', 'ignore'] });
  run('init', '-q'); run('config', 'user.email', 't@t'); run('config', 'user.name', 't');
  writeFileSync(join(d, 'app.js'), 'export const x = 1;\n');
  run('add', '.'); run('commit', '-q', '-m', 'init');
  snapshotTurn(d, { session: SESSION, env: {} });
  writeFileSync(join(d, 'app.js'), 'export const x = 2; // <script>alert(1)</script>\n');
  snapshotTurn(d, { session: SESSION, env: {} });
  return d;
}

async function board(cwd) {
  const { port, proc } = await startServerOnFreePort({
    entry: SERVER, cwd, env: { HOME: tmp('gcto-turnsview-home-'), GREAT_CTO_NO_UPDATE_CHECK: '1' },
    readyPath: '/api/heartbeat', portEnv: 'BOARD_PORT',
  });
  return { port, proc };
}
const get = async (port, path) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: r.status, body: await r.json() };
};

// ── the routes ──────────────────────────────────────────────────────────────

test('/api/turns lists the project’s sessions, and /api/turns/diff returns one turn', async () => {
  const d = project();
  const { port, proc } = await board(d);
  try {
    const list = await get(port, '/api/turns');
    assert.equal(list.status, 200);
    assert.equal(list.body.state, 'live');
    assert.equal(list.body.sessions[0].session, SESSION);
    assert.equal(list.body.sessions[0].turns, 2);

    const diff = await get(port, `/api/turns/diff?session=${SESSION}&turn=1`);
    assert.equal(diff.status, 200);
    assert.equal(diff.body.state, 'ok');
    assert.deepEqual(diff.body.paths, ['app.js']);
    assert.match(diff.body.patch, /\+export const x = 2;/);
  } finally {
    await reap(proc);
  }
});

test('bad input is 400, a turn that does not exist is 404, and a project without git says none', async () => {
  const d = project();
  const { port, proc } = await board(d);
  try {
    assert.equal((await get(port, '/api/turns/diff?session=../heads/main&turn=0')).status, 400);
    assert.equal((await get(port, `/api/turns/diff?session=${SESSION}&turn=abc`)).status, 400);
    assert.equal((await get(port, `/api/turns/diff?session=${SESSION}&turn=99`)).status, 404);
  } finally {
    await reap(proc);
  }
  const bare = project({ git: false });
  const b = await board(bare);
  try {
    const list = await get(b.port, '/api/turns');
    assert.equal(list.status, 200);
    assert.equal(list.body.state, 'none', 'no git is "none", not an empty history');
    assert.ok(list.body.why);
  } finally {
    await reap(b.proc);
  }
});

// ── the page ────────────────────────────────────────────────────────────────

const html = readFileSync(join(HERE, 'public', 'index.html'), 'utf8');
function pageFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `the page defines ${name}()`);
  return html.slice(start, html.indexOf('\n}\n', start) + 2);
}
const load = (...names) => new Function(`${names.map(pageFunction).join('\n')}\nreturn { ${names.join(', ')} };`)();

test('a turn’s diff is escaped — file content is text on the page, never markup', () => {
  const { renderTurnDiff } = load('esc', 'renderTurnDiff');
  const out = renderTurnDiff({
    state: 'ok', paths: ['app.js'], truncated: true,
    patch: '+export const x = 2; // <script>alert(1)</script>\n-old "quoted" & <b>bold</b>\n',
  });
  assert.ok(!out.includes('<script>'), 'a <script> in a file must not become a script');
  assert.ok(!out.includes('<b>bold</b>'));
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(out, /app\.js/);
  assert.match(out, /cut|truncated/i, 'a cut patch says so');
});

test('the turns panel says when there is nothing to show, and lists sessions newest first', () => {
  const { renderTurns } = load('esc', 'renderTurns');
  assert.match(renderTurns({ state: 'none', why: 'not a git repository' }), /not a git repository/);
  assert.match(renderTurns({ state: 'live', sessions: [] }), /no turn snapshots/i);
  const out = renderTurns({ state: 'live', sessions: [
    { session: 'aaaa1111-0000-0000-0000-000000000000', turns: 3, newestTurn: 2, newestAt: Date.parse('2026-09-15T10:00:00Z') },
    { session: 'bbbb2222-0000-0000-0000-000000000000', turns: 1, newestTurn: 0, newestAt: Date.parse('2026-09-14T10:00:00Z') },
  ] });
  assert.ok(out.indexOf('aaaa1111') < out.indexOf('bbbb2222'), 'in the order the server gave');
  assert.match(out, /showTurnDiff\(/, 'each turn opens its diff');
  const xss = renderTurns({ state: 'live', sessions: [{ session: 'x"><img src=x onerror=alert(1)>', turns: 1, newestTurn: 0, newestAt: 0 }] });
  assert.ok(!xss.includes('<img'), 'a session name is escaped too');
});

test('a session name reaches showTurnDiff exactly, even with a quote in it — the handler cannot be broken out of', () => {
  // The server only returns names matching [A-Za-z0-9_-], but the page must not rely on
  // that: esc() turns ' into &#39;, which the browser decodes BEFORE the handler runs.
  const { renderTurns } = load('esc', 'renderTurns');
  const nasty = "x');alert(1);//";
  const out = renderTurns({ state: 'live', sessions: [{ session: nasty, turns: 1, newestTurn: 0, newestAt: 0 }] });
  const attr = out.match(/onclick="([^"]*)"/)?.[1];
  assert.ok(attr, 'a turn button with an onclick handler');
  const decoded = attr.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const calls = [];
  let alerted = false;
  new Function('showTurnDiff', 'alert', decoded)((s, n) => calls.push([s, n]), () => { alerted = true; });
  assert.equal(alerted, false, 'the session name ran as code');
  assert.deepEqual(calls, [[nasty, 0]], 'the handler received the session name exactly');
});

test('the page asks for a turn’s diff by session and turn, for the current project', () => {
  const fn = pageFunction('showTurnDiff');
  assert.match(fn, /\/api\/turns\/diff\?session=\$\{encodeURIComponent\(session\)\}&turn=\$\{encodeURIComponent\(turn\)\}/);
  assert.match(fn, /pqs\(\)/, 'scoped to the selected project');
  assert.match(html, /id="turns-panel"/, 'the panel is on the page');
  assert.match(pageFunction('refreshPipeline'), /loadTurns\(\)/, 'and it loads with the pipeline');
});
