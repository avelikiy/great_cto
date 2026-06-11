// tests/board-surface.test.mjs — PLAN-ui-split P1: the surface boundary.
//
// One engine, two faces: the builder board and the operator console. A server
// started with --surface console must not serve the dev board (UI or API); an
// operator's invite token must never open builder routes in ANY mode; and an
// invited operator acts only inside their own tenant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'packages', 'board', 'server.mjs');

function pickPort() { return 38000 + Math.floor(Math.random() * 2000); }

function makeEnv() {
  const home = mkdtempSync(join(tmpdir(), 'gcto-surface-'));
  mkdirSync(join(home, '.great_cto'), { recursive: true });
  const project = mkdtempSync(join(tmpdir(), 'gcto-surface-proj-'));
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  return { home, project };
}

function startBoard(port, { surface, home, project } = {}) {
  const args = [SERVER, '--no-open'];
  if (surface) args.push('--surface', surface);
  return spawn(process.execPath, args, {
    cwd: project,
    env: {
      ...process.env,
      PORT: String(port),
      HOME: home,
      GREAT_CTO_OPERATORS_PATH: join(home, '.great_cto', 'operators.json'),
      GREAT_CTO_RUNS_DIR: join(home, '.great_cto', 'autopilot-runs'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
}

function killTree(p) {
  try { process.kill(-p.pid, 'SIGKILL'); } catch {}
  try { p.kill('SIGKILL'); } catch {}
}

async function waitUp(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/autopilot/health`);
      if (r.status > 0) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`board did not start on ${port}`);
}

async function http(port, path, init) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual', ...init });
  const txt = await r.text();
  let body; try { body = JSON.parse(txt); } catch { body = txt; }
  return { status: r.status, headers: r.headers, body };
}

test('console surface serves ONLY the operator console', async () => {
  const { home, project } = makeEnv();
  const port = pickPort();
  const board = startBoard(port, { surface: 'console', home, project });
  try {
    await waitUp(port);
    // the console's world is up
    assert.equal((await http(port, '/autopilot.html')).status, 200, 'console page serves');
    assert.equal((await http(port, '/api/autopilot/runs')).status, 200, 'console API serves');
    // "/" routes operators to the console, not the dev board
    const root = await http(port, '/');
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/autopilot.html');
    // the dev board does not exist on this surface
    for (const p of ['/index.html', '/api/tasks', '/api/inbox', '/api/doc?path=README.md', '/api/agent/status', '/api/gates/x']) {
      const r = await http(port, p);
      assert.ok(r.status === 404 || r.status === 302, `${p} must be absent (got ${r.status})`);
      if (r.status === 302) assert.equal(r.headers.get('location'), '/autopilot.html');
    }
    // the ingest webhook (how cases arrive) still works on the console surface
    const ing = await http(port, '/api/autopilot/ingest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vertical: 'rcm' }),
    });
    assert.equal(ing.status, 200, `ingest must work on console surface: ${JSON.stringify(ing.body)}`);
  } finally { killTree(board); rmSync(home, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('an operator invite token never opens builder routes (both mode)', async () => {
  const { home, project } = makeEnv();
  const port = pickPort();
  const board = startBoard(port, { home, project });   // default surface: both
  try {
    await waitUp(port);
    // default mode still serves the dev board (local builder unaffected)
    assert.equal((await http(port, '/api/tasks')).status, 200, 'builder API up in both mode');
    // admin mints an invite (coder signs rcm cases)
    const inv = await http(port, '/api/autopilot/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin', operatorRole: 'coder', tenant: 'acme' }),
    });
    assert.equal(inv.status, 200, JSON.stringify(inv.body));
    const tok = inv.body.invite.token;
    // the token opens the console world…
    assert.equal((await http(port, `/api/autopilot/runs?token=${tok}`)).status, 200);
    // …and NOTHING else
    for (const p of ['/api/tasks', '/api/inbox', '/api/doc?path=README.md', '/api/pipeline', '/api/memory']) {
      const sep = p.includes('?') ? '&' : '?';
      const r = await http(port, `${p}${sep}token=${tok}`);
      assert.equal(r.status, 404, `${p} must 404 with an operator token (got ${r.status})`);
    }
  } finally { killTree(board); rmSync(home, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('an invited operator signs only their own tenant\'s cases', async () => {
  const { home, project } = makeEnv();
  const port = pickPort();
  const board = startBoard(port, { home, project });
  try {
    await waitUp(port);
    // two cases: one in tenant 'acme', one in tenant 'default' — same vertical
    const mk = async (tenant) => {
      const r = await http(port, '/api/autopilot/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical: 'rcm', role: 'admin', tenant }),
      });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return r.body.run;
    };
    const mine = await mk('acme');
    const theirs = await mk('default');
    // operator: coder @ acme
    const inv = await http(port, '/api/autopilot/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin', operatorRole: 'coder', tenant: 'acme' }),
    });
    const tok = inv.body.invite.token;
    // cross-tenant sign → 403
    const cross = await http(port, '/api/autopilot/approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: theirs.id, token: tok, by: 'Op' }),
    });
    assert.equal(cross.status, 403, `cross-tenant approve must 403: ${JSON.stringify(cross.body)}`);
    assert.match(String(cross.body.error), /another tenant/);
    // own-tenant sign → allowed (not a tenant rejection)
    const own = await http(port, '/api/autopilot/approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mine.id, token: tok, by: 'Op' }),
    });
    assert.notEqual(own.status, 403, `own-tenant approve must not 403: ${JSON.stringify(own.body)}`);
    // bulk: the foreign case is denied, not signed
    const bulk = await http(port, '/api/autopilot/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', ids: [theirs.id], token: tok }),
    });
    assert.equal(bulk.status, 200);
    assert.equal(bulk.body.denied, 1, `bulk must deny the foreign case: ${JSON.stringify(bulk.body)}`);
  } finally { killTree(board); rmSync(home, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});
