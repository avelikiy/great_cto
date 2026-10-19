// GET /api/gates/:id/brief (ADR-036) against a real board and a real tree: the
// brief is bound to the tree its token was issued for, and it writes nothing.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { reap } from '../../tests/helpers/reap.mjs';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), 'server.mjs');
const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); TMP_DIRS.push(d); return d; };

function project() {
  const home = tmp('gcto-brief-home-');
  const dir = tmp('gcto-brief-proj-');
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(dir, 'app.js'), 'export const x = 1;\n');
  git('add', '.'); git('commit', '-q', '-m', 'init');
  writeFileSync(join(dir, 'app.js'), 'export const x = 2;\n');           // the change under review
  mkdirSync(join(dir, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(dir, '.great_cto', 'PROJECT.md'), 'archetype: web-service\n');
  writeFileSync(join(dir, '.great_cto', 'tasks.md'),
    '# Tasks\n\n| ID | Title | Status | Labels |\n|---|---|---|---|\n'
    + '| g-ship | gate:ship — release the thing | open | gate |\n');
  return { home, dir };
}

const api = async (port, path) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`);
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
};
const section = (b, key) => b.sections.find((s) => s.key === key);

test('the brief shows the change, says when the tree moved, and writes nothing', async () => {
  const p = project();
  const { port, proc } = await startServerOnFreePort({
    entry: SERVER, cwd: p.dir, readyPath: '/api/heartbeat', portEnv: 'BOARD_PORT',
    env: { HOME: p.home, GREAT_CTO_NO_UPDATE_CHECK: '1' },
  });
  try {
    await api(port, '/api/inbox');                                          // issues the token
    const tasksBefore = readFileSync(join(p.dir, '.great_cto', 'tasks.md'), 'utf8');

    const first = await api(port, '/api/gates/g-ship/brief');
    assert.equal(first.status, 200);
    assert.equal(first.body.moved, false);
    assert.deepEqual(section(first.body, 'change').files, ['app.js']);
    assert.equal(section(first.body, 'risk').reversibility, 'expensive');
    assert.equal(section(first.body, 'reviews').state, 'empty');
    assert.equal(section(first.body, 'touches').state, 'recorded');

    writeFileSync(join(p.dir, 'app.js'), 'export const x = 3;\n');      // the tree moves
    const second = await api(port, '/api/gates/g-ship/brief');
    assert.equal(second.body.moved, true);
    assert.deepEqual(second.body.sections[0].changed, ['app.js']);

    assert.equal(readFileSync(join(p.dir, '.great_cto', 'tasks.md'), 'utf8'), tasksBefore, 'a brief never changes a gate');
    assert.equal((await api(port, '/api/gates/nope/brief')).status, 404);
  } finally { await reap(proc); }
});
