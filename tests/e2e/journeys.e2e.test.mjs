// Golden journeys of docs/testing/BOARD-TEST-STRATEGY.md §3.5 that no other
// browser test walks: each one is a thing an operator does from start to
// finish, and every step is checked twice — on the page, and in the API or on
// disk behind it. A page that says "rejected" over a gate that is still open is
// the failure these exist to catch.
//
// Covered elsewhere and not repeated here: 3 (approve ritual and brief) and 9
// (Usage) and 11 (phone width) in board.e2e, 8 (Mermaid fallback) in
// admin-shell.e2e.
//
// Nothing here leaves the machine. The OpenRouter check is pointed at a local
// stub, the operator's own OPENROUTER_API_KEY is blanked for the board, and
// the share journey renders the report locally instead of publishing it.
//
// Every journey SKIPS — "not checked, not passed" — when Playwright or
// Chromium is missing (tests/helpers/board-page.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { openBoard } from '../helpers/board-page.mjs';
import { buildFixture } from '../../scripts/lib/screenshot-fixture.mjs';

const FAKE_BD = fileURLToPath(new URL('../helpers/fake-bd-journeys.mjs', import.meta.url));
// The board inherits the runner's environment; a real key there would be the
// one shown, and the one sent to OpenRouter.
const NO_REAL_KEY = { OPENROUTER_API_KEY: '', OPENROUTER_MODEL: '' };

const json = async (b, route) => (await fetch(`${b.url}${route}`)).json();
/** Answer every dialog: prompts get `answer(message)`, confirms are accepted. Returns the messages seen. */
function answerDialogs(page, answer = () => '') {
  const seen = [];
  page.on('dialog', (d) => { seen.push({ type: d.type(), message: d.message() }); d.accept(d.type() === 'prompt' ? answer(d.message()) : undefined); });
  return seen;
}
const typedName = (message) => (/Type (\S+) to approve/.exec(message) || [])[1] || '';
async function until(fn, what, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await fn(); if (last) return last; await new Promise((r) => setTimeout(r, 150)); }
  assert.fail(`timed out after ${ms} ms waiting for ${what}`);
}
/** A Beads world the test controls: tasks, a failure switch, and the history file. */
function fakeBeads(dir, tasks, history = []) {
  const state = path.join(dir, '.fake-bd.json');
  fs.writeFileSync(state, JSON.stringify({ broken: false, tasks }));
  fs.mkdirSync(path.join(dir, '.beads'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.beads', 'interactions.jsonl'), history.map((h) => JSON.stringify(h)).join('\n') + (history.length ? '\n' : ''));
  return {
    env: { GREAT_CTO_BD_BIN: FAKE_BD, FAKE_BD_STATE: state },
    read: () => JSON.parse(fs.readFileSync(state, 'utf8')),
    set: (patch) => fs.writeFileSync(state, JSON.stringify({ ...JSON.parse(fs.readFileSync(state, 'utf8')), ...patch })),
  };
}
const bdTask = (id, title, status, extra = {}) => ({
  id, title, status, priority: 1, labels: [], issue_type: 'task', created_at: '2026-11-01T09:00:00Z', updated_at: '2026-11-03T09:00:00Z', ...extra,
});

// ── 1 ───────────────────────────────────────────────────────────────────────
test('journey 1: no projects, the board says so, a project registered from Settings appears', { timeout: 120000 }, async (t) => {
  let fresh;
  const b = await openBoard({
    prefix: 'gcto-j1-', register: false, waitForProject: false,
    // The board starts in a directory that is not a project, with an empty registry.
    seed: (dir) => fs.rmSync(path.join(dir, '.great_cto'), { recursive: true, force: true }),
  });
  if (b.skip) return t.skip(b.skip);
  try {
    const { page } = b;
    assert.deepEqual(await json(b, '/api/projects'), [], 'the registry starts empty');
    // The project to register is created after the board is up: a project that
    // already sits under HOME at start is discovered without anyone registering it.
    fresh = buildFixture(path.join(b.home, 'acme-new'));
    await page.evaluate(() => renderProjMenu(''));
    assert.match(await page.locator('#proj-menu-list .proj-menu-empty').textContent(), /No projects registered yet/,
      'the project switcher says there are none');

    // Settings → General is where a project is registered from, the way an operator gets there.
    await page.locator('#topbar-settings-btn').click();
    await page.getByRole('button', { name: 'General', exact: true }).first().click();
    const input = page.locator('#settings-register-path');
    await input.waitFor({ timeout: 15000 });
    await input.fill(fresh);
    const posted = page.waitForResponse((r) => r.url().includes('/api/projects/register') && r.request().method() === 'POST');
    await page.locator('#panel-settings button', { hasText: /^Register$/ }).click();
    const reply = await (await posted).json();
    assert.equal(reply.ok, true, `register answered ${JSON.stringify(reply)}`);

    const listed = await json(b, '/api/projects');
    assert.ok(listed.some((p) => p.path === fs.realpathSync(fresh) || p.path === fresh), `the API lists the new project: ${JSON.stringify(listed)}`);
    await until(async () => /acme-new/.test(await page.locator('#panel-settings').innerText()), 'Settings to list the registered project');
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

// ── 2 ───────────────────────────────────────────────────────────────────────
test('journey 2: Work shows the tasks bd holds, and a task opens with its history', { timeout: 120000 }, async (t) => {
  const history = [
    { id: 'acme-9z', ts: '2026-11-02T10:00:00Z', actor: 'senior-dev', action: 'status_changed', from: 'open', to: 'in_progress' },
    { id: 'acme-9z', ts: '2026-11-03T11:00:00Z', actor: 'qa-engineer', action: 'status_changed', from: 'in_progress', to: 'blocked' },
    { id: 'acme-1a', ts: '2026-11-03T12:00:00Z', actor: 'senior-dev', action: 'commented' },
  ];
  const b = await openBoard({
    prefix: 'gcto-j2-',
    seed: (dir) => fakeBeads(dir, [
        bdTask('acme-9z', 'Refund webhook drops the idempotency key', 'blocked'),
        bdTask('acme-1a', 'Checkout: idempotency key on every payment intent', 'in_progress'),
      ], history),
  });
  if (b.skip) return t.skip(b.skip);
  try {
    const { page } = b;
    const tasks = await json(b, '/api/tasks');
    assert.deepEqual(tasks.map((x) => x.id).sort(), ['acme-1a', 'acme-9z'], 'the API serves what bd holds');
    assert.ok(await page.evaluate(() => allTasks.some((x) => x.id === 'acme-9z')), 'and so does the page');

    const api = await json(b, '/api/tasks/acme-9z/history');
    assert.equal(api.events.length, 2, 'the API returns this task\'s two events and not the other task\'s');

    await page.evaluate(() => switchTab('decisions', document.querySelector('[data-tab="decisions"]')));
    const row = page.locator('.inbox-row').filter({ hasText: 'Refund webhook drops the idempotency key' }).first();
    await row.waitFor({ timeout: 15000 });
    await row.click();
    const timeline = page.locator('#side-timeline');
    await until(async () => (await timeline.locator('.tl-event').count()) === 2, 'the side panel timeline to show two events');
    const text = await timeline.innerText();
    assert.match(text, /activity/i);
    assert.match(text, /senior-dev/);
    assert.match(text, /in_progress → blocked/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

// ── 4 ───────────────────────────────────────────────────────────────────────
test('journey 4: a gate rejected with a reason is blocked, logged with the reason, and is no longer pending', { timeout: 120000 }, async (t) => {
  const b = await openBoard({ prefix: 'gcto-j4-', route: '#/decisions' });
  if (b.skip) return t.skip(b.skip);
  try {
    const { page } = b;
    await page.evaluate(() => switchTab('decisions', document.querySelector('[data-tab="decisions"]')));
    const gate = page.locator('.inbox-row[data-gate-id="acme-3c"]');
    await gate.waitFor({ timeout: 15000 });
    const reason = 'retry wrapper still drops the idempotency key (acme-f1)';
    const dialogs = answerDialogs(page, () => reason);
    const posted = page.waitForResponse((r) => /\/api\/gates\/acme-3c/.test(r.url()));
    await gate.locator('button', { hasText: /^Reject/ }).click();
    const reply = await (await posted).json();
    assert.equal(reply.ok, true, `reject answered ${JSON.stringify(reply)}`);
    assert.equal(reply.action, 'reject');
    assert.ok(dialogs.some((d) => d.type === 'prompt' && /Reason/.test(d.message)), 'the reason was asked for');

    const log = await json(b, '/api/decisions?limit=5');
    const entry = log.find((d) => d.id === 'acme-3c');
    assert.ok(entry, `the decision log has the rejection: ${JSON.stringify(log)}`);
    assert.match(entry.verdict, /reject/i);
    assert.equal(entry.reason, reason, 'with the reason the operator typed');
    assert.match(fs.readFileSync(path.join(b.dir, '.great_cto', 'tasks.md'), 'utf8'), /\| acme-3c \|[^\n]*\| blocked \|/, 'the gate row is blocked on disk');

    const inbox = await json(b, '/api/inbox');
    assert.ok(!(inbox.pending_gates || []).some((g) => g.id === 'acme-3c'), 'the API no longer lists it as pending');
    assert.ok((inbox.blocked || []).some((g) => g.id === 'acme-3c'), 'it is listed as blocked');
    await until(() => page.evaluate(() => !(window.__inboxData?.pending_gates || []).some((g) => g.id === 'acme-3c')),
      'the page to drop it from the pending gates');
    // The page still draws the rejected gate with Approve and Reject buttons (it
    // is a gate, and now a blocked one); those cannot succeed without a token.
    // Filed as a bug; not asserted either way here.
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

// ── 5 ───────────────────────────────────────────────────────────────────────
test('journey 5: a gate approved after the project changed is refused, names the changed file, and approves nothing', { timeout: 120000 }, async (t) => {
  const b = await openBoard({
    prefix: 'gcto-j5-', route: '#/decisions',
    // A git project, so the approval token is bound to its tree.
    seed: (dir) => {
      fs.writeFileSync(path.join(dir, '.gitignore'), '.home/\n');
      const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' });
      git('init', '-q');
      git('add', '-A');
      git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
    },
  });
  if (b.skip) return t.skip(b.skip);
  try {
    const { page } = b;
    await page.evaluate(() => switchTab('decisions', document.querySelector('[data-tab="decisions"]')));
    const gate = page.locator('.inbox-row[data-gate-id="acme-3c"]');
    await gate.waitFor({ timeout: 15000 });
    assert.ok(await page.evaluate(() => window.__inboxData?.pending_gates?.find((g) => g.id === 'acme-3c')?.token), 'the inbox issued a token for the gate');

    // The project moves after the operator saw the gate.
    fs.appendFileSync(path.join(b.dir, 'src', 'checkout.ts'), '// changed after the gate was shown\n');

    const dialogs = answerDialogs(page, typedName);
    const posted = page.waitForResponse((r) => /\/api\/gates\/acme-3c/.test(r.url()));
    await gate.locator('button', { hasText: /^approve/i }).first().click();
    const res = await posted;
    const reply = await res.json();
    assert.equal(res.status(), 409, `refused as stale: ${JSON.stringify(reply)}`);
    assert.equal(reply.outcome, 'refused-stale');
    assert.deepEqual(reply.changed, ['src/checkout.ts']);
    await until(() => dialogs.some((d) => d.type === 'alert'), 'the page to report the refusal');
    const alert = dialogs.find((d) => d.type === 'alert');
    assert.match(alert.message, /Gate action failed/);
    assert.match(alert.message, /src\/checkout\.ts/, 'the page names the file that changed');

    assert.ok(!(await json(b, '/api/decisions?limit=5')).some((d) => d.id === 'acme-3c'), 'nothing was logged');
    assert.match(fs.readFileSync(path.join(b.dir, '.great_cto', 'tasks.md'), 'utf8'), /\| acme-3c \|[^\n]*\| open \|/, 'the gate is still open on disk');
    assert.ok((await json(b, '/api/inbox')).pending_gates.some((g) => g.id === 'acme-3c'), 'and still pending in the API');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.inbox-row[data-gate-id="acme-3c"]').count(), 1, 'and still on the page');
    assert.ok(!dialogs.some((d) => /approved/.test(d.message)), 'no dialog claimed an approval');
  } finally { await b.close(); }
});

// ── 6 ───────────────────────────────────────────────────────────────────────
test('journey 6: bd breaks mid-session, the board says it could not read, and never shows a fabricated zero', { timeout: 150000 }, async (t) => {
  let beads;
  const b = await openBoard({
    prefix: 'gcto-j6-', route: '#/decisions',
    seed: (dir) => (beads = fakeBeads(dir, [
        bdTask('acme-6f', 'Postgres connection pool exhausts under burst traffic', 'blocked'),
        bdTask('acme-1a', 'Checkout: idempotency key on every payment intent', 'in_progress'),
        bdTask('acme-3c', 'gate:ship — checkout hardening', 'open', { labels: ['gate'] }),
      ])),
  });
  if (b.skip) return t.skip(b.skip);
  try {
    const { page } = b;
    await page.evaluate(() => switchTab('decisions', document.querySelector('[data-tab="decisions"]')));
    await page.locator('.inbox-row[data-gate-id="acme-3c"]').waitFor({ timeout: 15000 });
    const before = await page.evaluate(() => allTasks.map((x) => x.id).sort());
    assert.deepEqual(before, ['acme-1a', 'acme-3c', 'acme-6f']);

    beads.set({ broken: true });
    // What bd writes look like to the board's watcher, every two seconds as a
    // working session would make them. The first changes after the failure are
    // still answered from the last good snapshot while the failing re-read runs
    // in the background (filed as a bug: measured at two to three changes); the
    // failure is reported on a later one.
    const banner = page.locator('#degraded-read');
    let pokes = 0;
    await until(async () => {
      if ((await banner.isVisible()) && /could not/i.test(await banner.innerText())) return true;
      fs.writeFileSync(path.join(b.dir, '.beads', 'touch'), String(++pokes));
      await page.waitForTimeout(2000);
      return false;
    }, 'the page to say the project could not be read', 40000);
    t.diagnostic(`bd failure reported after ${pokes} change(s)`);
    assert.match(await page.locator('#live-label').innerText(), /task data unavailable/, 'the live indicator says so too');
    // The HTTP API keeps serving the last good snapshot — not [] — but does not
    // flag it as stale (filed as a bug); what is asserted is that it fabricates nothing.
    const served = await json(b, '/api/tasks');
    assert.deepEqual(served.map((x) => x.id).sort(), before, 'the API does not answer with an empty list');
    assert.deepEqual(await page.evaluate(() => allTasks.map((x) => x.id).sort()), before, 'the last tasks are kept, not replaced by []');
    assert.ok(!(await page.locator('#inbox-allclear').isVisible()), 'no "all clear" over a read that failed');
    assert.equal(await page.locator('.inbox-row[data-gate-id="acme-3c"]').count(), 1, 'the gate seen before is still shown');
  } finally { await b.close(); }
});

// ── 7 ───────────────────────────────────────────────────────────────────────
test('journey 7: a new verdict reaches the pipeline view over SSE, without a reload', { timeout: 120000 }, async (t) => {
  const b = await openBoard({ prefix: 'gcto-j7-', route: '#/decisions' });
  if (b.skip) return t.skip(b.skip);
  try {
    const { page } = b;
    await page.evaluate(() => switchTab('decisions', document.querySelector('[data-tab="decisions"]')));
    const architect = page.locator('#pipeline-track .pl-stage').filter({ hasText: /^\s*architect\s*/ }).first();
    // The rail can sit in a collapsed section; its stages are in the DOM either way.
    await page.locator('#pipeline-track .pl-stage').first().waitFor({ state: 'attached', timeout: 15000 });
    assert.ok(await architect.evaluate((el) => el.classList.contains('idle')), 'architect starts idle');
    await page.evaluate(() => { window.__sameDocument = true; });

    // Where agents' verdicts reach the board's watcher: the state verdict log,
    // tagged with the project.
    const project = path.basename(b.dir);
    const vdir = path.join(b.home, '.great_cto', 'verdicts');
    fs.mkdirSync(vdir, { recursive: true });
    fs.appendFileSync(path.join(vdir, 'architect.log'),
      JSON.stringify({ v: 1, ts: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), agent: 'architect', verdict: 'APPROVED', project }) + '\n');

    await until(() => architect.evaluate((el) => el.classList.contains('done')), 'the architect stage to turn done', 20000);
    assert.equal(await page.evaluate(() => window.__sameDocument), true, 'the page was not reloaded');
    const stage = (await json(b, '/api/pipeline')).find((s) => s.stage === 'architect');
    assert.equal(stage.status, 'done', 'the API agrees');
    assert.equal(stage.verdict, 'APPROVED');
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

// ── 10 ──────────────────────────────────────────────────────────────────────
test('journey 10: the share report renders the same numbers the board serves', { timeout: 120000 }, async (t) => {
  const b = await openBoard({ prefix: 'gcto-j10-' });
  if (b.skip) return t.skip(b.skip);
  try {
    // Publishing posts to the production share endpoint, which no test may do
    // (it is not configurable). The report is the same HTML, rendered here.
    const { generateShareHTML } = await import('../../packages/board/lib/share.mjs');
    const tasks = await json(b, '/api/tasks');
    const metrics = await json(b, '/api/metrics?days=365');
    const html = generateShareHTML(tasks, metrics, b.dir);
    const report = await b.browser.newPage();
    try {
      const errors = [];
      report.on('pageerror', (e) => errors.push(e.message));
      await report.setContent(html, { waitUntil: 'load' });
      const text = await report.locator('#root').innerText();
      const done = metrics.tasks.done;
      const inProgress = metrics.tasks.in_progress;
      assert.ok(done > 0 && inProgress > 0, `the fixture has numbers to compare: ${JSON.stringify(metrics.tasks)}`);
      assert.match(text, new RegExp(`\\b${done} features? shipped`), `the report says ${done} shipped`);
      const stat = report.locator('.num').filter({ hasText: new RegExp(`^${inProgress}$`) });
      assert.ok(await stat.count() > 0, `the report shows ${inProgress} in progress`);
      assert.match(text, new RegExp(`${metrics.tasks.backlog} in backlog`));
      // The board's own page reads the same metrics.
      assert.equal(await b.page.evaluate(() => metrics?.tasks?.done), done, 'the board page holds the same done count');
      assert.deepEqual(errors, []);
    } finally { await report.close(); }
  } finally { await b.close(); }
});

// ── 12 ──────────────────────────────────────────────────────────────────────
test('journey 12: an OpenRouter key stored from the board is only ever shown as its fingerprint', { timeout: 120000 }, async (t) => {
  // A local OpenRouter: the board's live check goes here, never to the network.
  const seenAuth = [];
  const stub = http.createServer((req, res) => {
    seenAuth.push(req.headers.authorization || '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { limit: null, usage: 0 } }));
  });
  stub.listen(0, '127.0.0.1');
  await once(stub, 'listening');
  const key = `sk-or-v1-${'0123456789abcdef'.repeat(4)}`;
  const print = `${key.slice(0, 8)}…${key.slice(-4)}`;
  const b = await openBoard({
    prefix: 'gcto-j12-',
    env: { ...NO_REAL_KEY, GREAT_CTO_OPENROUTER_BASE: `http://127.0.0.1:${stub.address().port}` },
  });
  if (b.skip) { stub.close(); return t.skip(b.skip); }
  try {
    const { page } = b;
    const bodies = [];
    page.on('response', async (r) => { try { bodies.push(`${r.url()}\n${await r.text()}`); } catch { /* streamed */ } });
    assert.equal((await json(b, '/api/router-key')).state, 'absent', 'no key to begin with');

    await page.evaluate(() => switchTab('harness', document.querySelector('[data-tab="harness"]')));
    const status = page.locator('#judge-status');
    await until(async () => /No judge connected/.test(await status.innerText()), 'the judge card to offer a connection');
    const dialogs = answerDialogs(page);
    // The card is redrawn as the harness reads land; a key typed into a card
    // that is then replaced is gone. Wait for the reads to finish first.
    await b.settle({ quietMs: 800 });
    await page.locator('#judge-key').fill(key);
    assert.equal(await page.locator('#judge-key').inputValue(), key);
    const saved = page.waitForResponse((r) => r.url().includes('/api/router-key') && r.request().method() === 'POST' && !r.url().includes('verify'));
    await status.locator('button', { hasText: /^Connect$/ }).click();
    const reply = await (await saved).json();
    assert.equal(reply.ok, true, `stored: ${JSON.stringify(reply)}`);
    assert.ok(dialogs.some((d) => /secrets\.env/.test(d.message)), 'the write was confirmed first');

    await until(async () => /verified/.test(await status.innerText()), 'the card to show the key as verified', 20000);
    const shown = await status.innerText();
    assert.match(shown, new RegExp(print.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the card shows the fingerprint');
    assert.equal(await page.locator('#judge-key').inputValue(), '', 'the input was cleared');

    const stored = fs.readFileSync(path.join(b.home, '.great_cto', 'secrets.env'), 'utf8');
    assert.match(stored, new RegExp(`OPENROUTER_API_KEY=${key}`), 'the key itself is on disk, where it belongs');
    assert.deepEqual(seenAuth, [`Bearer ${key}`], 'the live check sent it only to the (local) OpenRouter');

    // Nowhere else: not in the page, not in any response the page received, not
    // in what the API answers directly.
    const tail = key.slice(12);
    assert.ok(!(await page.content()).includes(tail), 'the page does not hold the key');
    for (const body of bodies) assert.ok(!body.includes(tail), `a response carried the key: ${body.split('\n')[0]}`);
    for (const route of ['/api/router-key', '/api/harnesses', '/api/version']) {
      const text = await (await fetch(`${b.url}${route}`)).text();
      assert.ok(!text.includes(tail), `${route} carried the key`);
    }
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    assert.ok(!storage.includes(tail), 'browser storage does not hold the key');
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); stub.close(); }
});
