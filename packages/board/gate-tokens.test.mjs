// A gate approval from the board is bound to one request and one tree (ADR-024 §1).
//
// POST /api/gates/:id closed a gate, logged it, woke the pipeline and — with sharing
// on — republished the public report, guarded by the Host allowlist and the Origin
// check alone. No token, no expiry, no check that the tree was still the one on the
// screen; and the typed-name ritual for expensive gates lived only in the page.
//
// Now each pending gate /api/inbox returns carries a token minted for it and bound to
// the tree state when the board first showed it. The server refuses an approval
// without that token, with a used or expired one, for an expensive or unclassified
// gate without the typed name, or after the tree changed. A refused approval writes
// nothing: no gate change, no decision line, no wake.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { reap } from '../../tests/helpers/reap.mjs';
import { treeReceipt, receiptHash } from '../../scripts/lib/receipt.mjs';
import { readWake } from '../../scripts/lib/pipeline-wake.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, 'server.mjs');
const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) rmSync(d, { recursive: true, force: true }); });
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); TMP_DIRS.push(d); return d; };

/**
 * A git project with no beads store and gate rows in tasks.md — the path the handler
 * takes when beads is absent, which is a path the product genuinely has.
 * gate:plan is routine, gate:ship expensive, gate:mystery unclassified (gate-reversibility.mjs).
 */
function project() {
  const home = tmp('gcto-tok-home-');
  const dir = tmp('gcto-tok-proj-');
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(dir, 'app.js'), 'export const x = 1;\n');
  git('add', '.'); git('commit', '-q', '-m', 'init');
  mkdirSync(join(dir, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(dir, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  writeFileSync(join(dir, '.great_cto', 'tasks.md'),
    '# Tasks\n\n| ID | Title | Status | Labels |\n|---|---|---|---|\n'
    + '| g-plan | gate:plan — decomposition | open | gate |\n'
    + '| g-plan2 | gate:plan — second | open | gate |\n'
    + '| g-ship | gate:ship — release the thing | open | gate |\n'
    + '| g-myst | gate:mystery — nobody judged this | open | gate |\n');
  return { home, dir };
}

async function board(p, env = {}) {
  const { port, proc } = await startServerOnFreePort({
    entry: SERVER, cwd: p.dir, readyPath: '/api/heartbeat', portEnv: 'BOARD_PORT',
    env: { HOME: p.home, GREAT_CTO_NO_UPDATE_CHECK: '1', ...env },
  });
  return { port, proc };
}
const api = async (port, path, init) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
};
const post = (port, id, body) => api(port, `/api/gates/${id}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const tokensOf = async (port) => Object.fromEntries(((await api(port, '/api/inbox')).body.pending_gates || []).map((g) => [g.id, g.token]));
const gateStatus = (p, id) => (readFileSync(join(p.dir, '.great_cto', 'tasks.md'), 'utf8').split('\n').find((l) => l.includes(`| ${id} |`)) || '').split('|')[3]?.trim();
const decisions = (p) => { const f = join(p.dir, '.great_cto', 'decisions.md'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };

test('every pending gate the inbox returns carries its own token', async () => {
  const p = project();
  const { port, proc } = await board(p);
  try {
    const t = await tokensOf(port);
    for (const id of ['g-plan', 'g-plan2', 'g-ship', 'g-myst']) assert.match(t[id] || '', /^[0-9a-f-]{36}$/, `${id} has a token`);
    assert.notEqual(t['g-plan'], t['g-plan2'], 'tokens are per gate, not per page');
    const again = await tokensOf(port);
    assert.equal(again['g-plan'], t['g-plan'], 'listing again does not rotate a live token');
  } finally { await reap(proc); }
});

test('an approval without the right token changes nothing', async () => {
  const p = project();
  const { port, proc } = await board(p);
  try {
    const t = await tokensOf(port);
    for (const [why, body] of [
      ['no token', { action: 'approve' }],
      ['another gate’s token', { action: 'approve', token: t['g-plan2'] }],
      ['a made-up token', { action: 'approve', token: '00000000-0000-4000-8000-000000000000' }],
    ]) {
      const r = await post(port, 'g-plan', body);
      assert.equal(r.status, 403, `${why} is refused`);
    }
    assert.equal(gateStatus(p, 'g-plan'), 'open', 'the gate did not move');
    assert.doesNotMatch(decisions(p), /g-plan/, 'and no decision was recorded');
    // The module's own reader, not a guessed path: a wrong path would pass whatever happened.
    assert.equal(readWake(p.dir).pending, false, 'and nothing woke the pipeline');
  } finally { await reap(proc); }
});

test('the right token approves once; the second use is refused', async () => {
  const p = project();
  const { port, proc } = await board(p);
  try {
    const t = await tokensOf(port);
    const first = await post(port, 'g-plan', { action: 'approve', token: t['g-plan'] });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.match(decisions(p), /g-plan/);
    const replay = await post(port, 'g-plan', { action: 'approve', token: t['g-plan'] });
    assert.equal(replay.status, 403, 'a token is consumed by its first use');
  } finally { await reap(proc); }
});

test('approving one gate does not invalidate the tokens of the others', async () => {
  // An approval writes the pipeline's own files — the gate row in tasks.md, the
  // decision log, the wake record, the token store. None of that is the code under
  // review. Bound to the whole tree, the first approval would make every other open
  // gate read "tree changed"; the binding covers the project outside .great_cto/.
  const p = project();
  const { port, proc } = await board(p);
  try {
    const t = await tokensOf(port);
    assert.equal((await post(port, 'g-plan', { action: 'approve', token: t['g-plan'] })).status, 200);
    assert.equal(readWake(p.dir).pending, true, 'that approval did write its wake');
    const second = await post(port, 'g-plan2', { action: 'approve', token: t['g-plan2'] });
    assert.equal(second.status, 200, `the second gate is still approvable: ${JSON.stringify(second.body)}`);
  } finally { await reap(proc); }
});

test('an expired token is refused', async () => {
  const p = project();
  // Test seam: tokens older than this many ms are expired (production: 24 h).
  const { port, proc } = await board(p, { GREAT_CTO_GATE_TOKEN_TTL_MS: '300' });
  try {
    const t = await tokensOf(port);
    await new Promise((r) => setTimeout(r, 500));
    const r = await post(port, 'g-plan', { action: 'approve', token: t['g-plan'] });
    assert.equal(r.status, 403);
    assert.match(JSON.stringify(r.body), /expired/i, 'and says why');
    assert.equal(gateStatus(p, 'g-plan'), 'open');
  } finally { await reap(proc); }
});

test('the tree changed after the gate was shown: approval refused with the path, rejection accepted', async () => {
  const p = project();
  const { port, proc } = await board(p);
  try {
    const t = await tokensOf(port);
    writeFileSync(join(p.dir, 'app.js'), 'export const x = 2;\n');
    const approve = await post(port, 'g-plan', { action: 'approve', token: t['g-plan'] });
    assert.equal(approve.status, 409, 'an approval of yesterday’s view is not an approval of today’s');
    assert.match(JSON.stringify(approve.body), /app\.js/, 'it names what changed');
    assert.equal(gateStatus(p, 'g-plan'), 'open');
    const reject = await post(port, 'g-plan', { action: 'reject', token: t['g-plan'], reason: 'changed' });
    assert.equal(reject.status, 200, 'refusing to stop is never the safe side');
  } finally { await reap(proc); }
});

test('an expensive or unclassified gate needs the typed gate name, checked by the server', async () => {
  const p = project();
  const { port, proc } = await board(p);
  try {
    const t = await tokensOf(port);
    assert.equal((await post(port, 'g-ship', { action: 'approve', token: t['g-ship'] })).status, 403, 'no typed name');
    assert.equal((await post(port, 'g-ship', { action: 'approve', token: t['g-ship'], confirm: 'gate:plan' })).status, 403, 'the wrong name');
    assert.equal(gateStatus(p, 'g-ship'), 'open', 'refusals did not consume the gate');
    const ok = await post(port, 'g-ship', { action: 'approve', token: t['g-ship'], confirm: 'gate:ship' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await post(port, 'g-myst', { action: 'approve', token: t['g-myst'] })).status, 403, 'unclassified is treated as expensive');
  } finally { await reap(proc); }
});

test('a token binds to the project outside .great_cto/ — the pipeline’s own writes do not move it', async () => {
  // What a token is bound to: the tree a reviewer would look at. Minting a token and
  // approving a gate both write into .great_cto/ (token store, gate row, decision log,
  // wake). Those must not change the binding; a change to the project's code must.
  const p = project();
  const binding = () => receiptHash(treeReceipt(p.dir, { exclude: ['.great_cto'] }));
  const before = binding();
  const { port, proc } = await board(p);
  try {
    const t = await tokensOf(port);
    assert.ok(existsSync(join(p.dir, '.great_cto', 'gate-tokens.json')), 'tokens are stored beside the project state');
    assert.equal(binding(), before, 'minting did not move the binding');
    assert.equal((await post(port, 'g-plan', { action: 'approve', token: t['g-plan'] })).status, 200);
    assert.equal(binding(), before, 'nor did an approval’s own writes');
    writeFileSync(join(p.dir, 'app.js'), 'export const x = 3;\n');
    assert.notEqual(binding(), before, 'but a change to the code does');
  } finally { await reap(proc); }
});
