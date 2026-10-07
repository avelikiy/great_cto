// The board that moved into a deleted release worktree (3.58.1). A test board
// started with `--port 3177` took :3141 instead — the flag its own usage line
// documents was ignored — in a scratch worktree; the release's restart kept that
// cwd; after the worktree was removed the board wrote its view log there and
// recreated the directory, titling the page with the dead worktree's name.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portFrom } from './lib/config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, 'server.mjs');
const RESTART = join(HERE, '..', '..', 'scripts', 'lib', 'board-restart.sh');
const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const tmp = (p) => { const d = mkdtempSync(join(tmpdir(), p)); TMP.push(d); return d; };
const project = (p) => { const d = tmp(p); mkdirSync(join(d, '.great_cto')); writeFileSync(join(d, '.great_cto', 'PROJECT.md'), 'archetype: devtools\n'); return d; };

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

test('--port wins over BOARD_PORT and PORT, as the usage line says', () => {
  assert.equal(portFrom(['node', 'server.mjs', '--port', '3177'], { BOARD_PORT: '3141' }), 3177);
  assert.equal(portFrom(['node', 'server.mjs', '--port=3178'], {}), 3178);
  assert.equal(portFrom(['node', 'server.mjs'], { BOARD_PORT: '3150', PORT: '9' }), 3150);
  assert.equal(portFrom(['node', 'server.mjs'], { PORT: '3151' }), 3151);
  assert.equal(portFrom(['node', 'server.mjs'], {}), 3141);
  assert.equal(portFrom(['node', 'server.mjs', '--port', 'abc'], {}), 3141, 'a bad value is not a port');
});

test('a board started with --port listens there, not on BOARD_PORT', async () => {
  const want = await freePort();
  const other = await freePort();
  const cwd = project('gcto-cwd-port-');
  const home = tmp('gcto-cwd-home-');
  const proc = spawn(process.execPath, [SERVER, '--port', String(want), '--no-open'], {
    cwd, env: { ...process.env, HOME: home, BOARD_PORT: String(other), GREAT_CTO_NO_UPDATE_CHECK: '1' }, stdio: 'ignore',
  });
  try {
    let ok = false;
    for (let i = 0; i < 50 && !ok; i++) {
      await new Promise((r) => setTimeout(r, 100));
      ok = await fetch(`http://127.0.0.1:${want}/api/heartbeat`).then((r) => r.ok, () => false);
    }
    assert.ok(ok, `answers on --port ${want}`);
    assert.equal(await fetch(`http://127.0.0.1:${other}/api/heartbeat`).then(() => true, () => false), false, 'not on BOARD_PORT');
  } finally { proc.kill(); }
});

test('the board does not write its view log into a directory that is not a project', async () => {
  const port = await freePort();
  const cwd = tmp('gcto-cwd-notproject-');
  const home = tmp('gcto-cwd-home-');
  const proc = spawn(process.execPath, [SERVER, '--port', String(port), '--no-open'], {
    cwd, env: { ...process.env, HOME: home, GREAT_CTO_NO_UPDATE_CHECK: '1' }, stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (await fetch(`http://127.0.0.1:${port}/api/heartbeat`).then((r) => r.ok, () => false)) break;
    }
    const r = await fetch(`http://127.0.0.1:${port}/api/view`, {
      method: 'POST', headers: { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ view: 'decisions' }),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).recorded, false);
    assert.equal(existsSync(join(cwd, '.great_cto')), false, 'no .great_cto made in a non-project');
  } finally { proc.kill(); }
});

function homeCwd(oldCwd, { home, projects }) {
  return execFileSync('bash', ['-c', `. "${RESTART}"; board_home_cwd "$1"`, '_', oldCwd], {
    env: { ...process.env, HOME: home, GREAT_CTO_PROJECTS_FILE: projects }, encoding: 'utf8',
  }).trim();
}

test('a restart keeps a project cwd, and trades anything else for the latest registered project', () => {
  const home = tmp('gcto-cwd-home-');
  const keep = project('gcto-cwd-keep-');
  const older = project('gcto-cwd-older-');
  const latest = project('gcto-cwd-latest-');
  const gone = join(tmp('gcto-cwd-gone-'), 'wt-581');
  const projects = join(home, 'projects.json');
  writeFileSync(projects, JSON.stringify([
    { slug: 'older', path: older, last_activity: '2026-10-01T00:00:00Z' },
    { slug: 'latest', path: latest, last_activity: '2026-10-07T00:00:00Z' },
    { slug: 'missing', path: join(home, 'nope'), last_activity: '2026-10-09T00:00:00Z' },
  ]));
  assert.equal(homeCwd(keep, { home, projects }), keep, 'a project stays where it was');
  assert.equal(homeCwd(gone, { home, projects }), latest, 'a deleted worktree is not kept');
  assert.equal(homeCwd(tmp('gcto-cwd-scratch-'), { home, projects }), latest, 'a directory that is not a project is not kept');
  assert.equal(homeCwd('', { home, projects }), latest, 'no cwd known');
  assert.equal(homeCwd(gone, { home, projects: join(home, 'none.json') }), home, 'no registry: home');
});
