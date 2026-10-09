import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { beginWork, finishWork, mutateWorkTask, readWorkTask } from '../../scripts/lib/work-tasks.mjs';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { reap } from '../../tests/helpers/reap.mjs';
const dir = mkdtempSync(join(tmpdir(), 'gcto-publication-board-')), root = join(dir, 'project'), home = join(dir, 'home'), store = join(home, 'tasks');
mkdirSync(root); mkdirSync(home);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'commit.gpgsign', 'false');
writeFileSync(join(root, '.gitignore'), '.great_cto/\n'); writeFileSync(join(root, 'README.md'), 'Base\n'); git('add', '.'); git('commit', '-qm', 'base');
git('remote', 'add', 'origin', 'https://github.com/example/fixture.git'); git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD').trim());
git('checkout', '-qb', 'feature'); mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src', 'feature.txt'), 'Feature result\n'); git('add', '.'); git('commit', '-qm', 'feature');
const options = { root, store }, work = beginWork({ root, host: 'claude-code', goal: 'Deliver feature', acceptance: ['Check feature'], authority: { writeScope: ['src'] } }, options);
const taskId = work.task.taskId; finishWork(taskId, work.operation.operationId, 0, options); work.lease.release();
mutateWorkTask(taskId, t => { t.phase = 'verified'; t.outcome = { kind: 'delivery', state: 'verified', artifacts: [], criteria: [], receipt: treeReceipt(root) }; }, options);
const { port, proc } = await startServerOnFreePort({ entry: new URL('./server.mjs', import.meta.url).pathname,
  cwd: root, env: { HOME: home, GREAT_CTO_TASKS_DIR: store, GREAT_CTO_NO_UPDATE_CHECK: '1' }, readyPath: '/api/heartbeat', portEnv: 'PORT' });
after(async () => { await reap(proc); rmSync(dir, { recursive: true, force: true }); });
const base = `http://127.0.0.1:${port}`, url = base + '/api/work/publication-preview?task=' + taskId;
let ticket;
test('HTTP committed-task GET preview is read-only, bounded and issues a local confirmation ticket', async () => {
  const revision = readWorkTask(taskId, options).revision;
  const [a, b] = await Promise.all([fetch(url, { headers: { Origin: base } }), fetch(url, { headers: { Origin: base } })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 429]);
  const preview = await (a.status === 200 ? a : b).json();
  assert.equal(preview.taskId, taskId); assert.equal(preview.revision, revision);
  assert.match(preview.patch, /Feature result/); assert.match(preview.approval, /^[0-9a-f]{64}$/);
  ticket = preview.ticket; assert.match(ticket, /^[0-9a-f-]{36}$/);
  assert.equal(readWorkTask(taskId, options).revision, revision);
  const work = await (await fetch(base + '/api/work')).json();
  assert.equal(work.entries.find(e => e.taskId === taskId).publicationPreview, true);
  assert.equal((await fetch(url, { method: 'POST', headers: { Origin: base } })).status, 405);
  assert.equal((await fetch(url + '&project=unknown')).status, 404);
  assert.equal(git('ls-remote', '--heads', '.').includes('refs/heads/feature'), true);
});
test('HTTP publication refuses missing/cross origin and unknown project before executing a worker', async () => {
  const write = base + '/api/work/publication';
  assert.equal((await fetch(write)).status, 405);
  for (const headers of [{}, { Origin: 'http://evil.test' }]) assert.equal((await fetch(write, { method: 'POST', headers, body: '{}' })).status, 403);
  assert.equal((await fetch(write + '?project=unknown', { method: 'POST', headers: { Origin: base }, body: '{}' })).status, 404);
  assert.equal((await fetch(write, { method: 'POST', headers: { Origin: base }, body: 'x'.repeat(2049) })).status, 409);
  assert.equal((await fetch(write, { method: 'POST', headers: { Origin: base }, body: JSON.stringify({ ticket, branch: 'wrong', confirm: 'publish-draft-pr' }) })).status, 409);
});
test('HTTP preview refuses stale content without returning patch bytes', async () => {
  writeFileSync(join(root, 'src', 'feature.txt'), 'Not reviewed\n');
  const response = await fetch(url); assert.equal(response.status, 409);
  const body = await response.json(); assert.equal(body.patch, undefined);
  assert.doesNotMatch(JSON.stringify(body), /Not reviewed/);
  const request = { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, branch: 'feature', confirm: 'publish-draft-pr' }) };
  assert.equal((await fetch(base + '/api/work/publication', request)).status, 409);
  assert.equal(readWorkTask(taskId, options).publication, undefined);
  assert.equal((await fetch(base + '/api/work/publication', request)).status, 409); // consumed capability, no automatic retry
});
