// The board, driven in a real browser, before every release.
//
// Three CSS checks read the source; the layout snapshot opens the page and
// compares what rendered. None of them CLICKS anything. 3.27.1 shipped a board
// on which a blocked task could be opened and read and not decided — the
// endpoint existed, the button did not — and every gate was green, because no
// check had ever pressed a button on this page.
//
// This is that check. It starts a board over a fixture project, opens it in
// Chromium, and walks the four screens the way an operator does: the nav, the
// drawer, the palette, the decision buttons. A console error anywhere is a
// failure — the board is one inline bundle, so a thrown exception silently
// stops every later handler on the page.
//
// It SKIPS, never passes, when Playwright or the server is unavailable: "not
// checked" and "checked and fine" are different states, and this repository
// keeps deleting the code that confuses them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServerOnFreePort } from '../helpers/board-start.mjs';
import { reapAndClean } from '../helpers/reap.mjs';
import { buildFixture, FIXTURE_NAME } from '../../scripts/lib/screenshot-fixture.mjs';

let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* reported as a skip */ }

const SCREENS = [
  ['decisions', 'Decisions'],
  ['ledger', 'Ledger'],
  ['fleet', 'Fleet'],
  ['harness', 'Harness'],
  ['usage', 'Usage'],
];

/**
 * Session logs of both hosts, written into the fixture HOME the way the hosts
 * write them — Usage is then read by the real server path, not a stub. One
 * Claude Code response is two lines that repeat its usage: the screen must
 * count it once.
 */
function seedHostLogs(fakeHome, projectPath) {
  const now = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const cdir = path.join(fakeHome, '.claude', 'projects', '-w-acme');
  fs.mkdirSync(cdir, { recursive: true });
  const usage = { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 7000, cache_creation_input_tokens: 0 };
  const line = (block) => ({ type: 'assistant', timestamp: now, cwd: projectPath, entrypoint: 'claude-desktop', message: { id: 'm1', model: 'claude-opus-5', usage, content: [block] } });
  fs.writeFileSync(path.join(cdir, 'e2e-session.jsonl'), [
    { type: 'custom-title', customTitle: 'Checkout redesign' },
    line({ type: 'tool_use', name: 'Agent', input: { subagent_type: 'great-cto:senior-dev' } }),
    line({ type: 'tool_use', name: 'Skill', input: { skill: 'superpowers:brainstorming' } }),
    { type: 'assistant', timestamp: now, isApiErrorMessage: true, error: 'rate_limit', message: { id: 'refused', model: '<synthetic>', content: [{ type: 'text', text: "You've hit your session limit · resets 3pm (Europe/Vienna)" }] } },
    { type: 'user', timestamp: now, message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'PreToolUse:Bash hook error: great_cto shared-tree guard blocked the command — `git stash`' }] } },
    { type: 'attachment', timestamp: now, attachment: { type: 'hook_cancelled', hookEvent: 'PreToolUse', hookName: 'PreToolUse:Bash', command: 'Destructive-command check...', timedOut: true, timeoutMs: 5000 } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
  const xdir = path.join(fakeHome, '.codex', 'sessions', '2026', '10', '06');
  fs.mkdirSync(xdir, { recursive: true });
  const xu = { input_tokens: 4000, cached_input_tokens: 3000, cache_write_input_tokens: 0, output_tokens: 500, reasoning_output_tokens: 100, total_tokens: 4500 };
  fs.writeFileSync(path.join(xdir, 'rollout-e2e.jsonl'), [
    { timestamp: now, type: 'session_meta', payload: { id: 'th-e2e', cwd: projectPath, originator: 'Codex Desktop', thread_source: 'user', source: 'vscode' } },
    { timestamp: now, type: 'turn_context', payload: { model: 'gpt-6.1-sol' } },
    { timestamp: now, type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', input: 'await tools.exec_command({cmd:"ls"});' } },
    { timestamp: now, type: 'token_usage_record', payload: { response_id: 'r1', usage: xu } },
    { timestamp: now, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: xu }, rate_limits: { primary: { used_percent: 42, window_minutes: 10080, resets_at: Math.floor(Date.now() / 1000) + 86400 }, plan_type: 'prolite' } } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(fakeHome, '.codex', 'session_index.jsonl'), JSON.stringify({ id: 'th-e2e', thread_name: 'Invoice export' }) + '\n');
  // Foreign transcripts live alongside this project's logs. Their directory
  // is not attribution; their large usage must not reach any aggregate.
  fs.writeFileSync(path.join(cdir, 'foreign.jsonl'), [
    { type: 'custom-title', customTitle: 'Foreign checkout' },
    { ...line({ type: 'text', text: 'foreign' }), cwd: `${projectPath}-other`, message: { id: 'foreign', model: 'foreign-model', usage: { input_tokens: 9000000, output_tokens: 1 }, content: [] } },
  ].map(JSON.stringify).join('\n') + '\n');
  fs.writeFileSync(path.join(xdir, 'foreign.jsonl'), [
    { type: 'session_meta', payload: { id: 'foreign', cwd: `${projectPath}-other` } },
    { type: 'turn_context', payload: { model: 'foreign-model' } },
    { type: 'token_usage_record', timestamp: now, payload: { response_id: 'foreign', usage: { input_tokens: 9000000, output_tokens: 1 } } },
  ].map(JSON.stringify).join('\n') + '\n');
  // What the great_cto status line records from Claude Code's own rate_limits.
  const sec = (h) => Math.floor(Date.now() / 1000) + h * 3600;
  fs.writeFileSync(path.join(fakeHome, '.great_cto', 'claude-limits.jsonl'), JSON.stringify({ ts: now,
    windows: { five_hour: { used: 35, resets: sec(2) }, seven_day: { used: 64, resets: sec(72) }, seven_day_opus: { used: 20, resets: sec(72) } } }) + '\n');
}

/** Everything the suite needs, or a reason it could not be had. */
async function boardUnderTest({ seed = () => {} } = {}) {
  if (!chromium) return { skip: 'playwright is not installed — not checked, not passed' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-e2e-'));
  buildFixture(dir);
  seed(dir);
  // The board resolves its project from the working directory, not from a flag
  // — and its registry from HOME. Both have to point at the fixture, or the
  // suite silently walks whatever project this machine happens to have open,
  // which is how a green E2E run proves nothing.
  const fakeHome = path.join(dir, '.home');
  fs.mkdirSync(path.join(fakeHome, '.great_cto'), { recursive: true });
  fs.writeFileSync(path.join(fakeHome, '.great_cto', 'projects.json'),
    JSON.stringify({ projects: [{ name: FIXTURE_NAME, path: dir }] }, null, 2));
  seedHostLogs(fakeHome, dir);
  // Verdicts as agents write them — one JSON line each — so Usage reads the
  // fixture project's outcomes through the registry, like any other project.
  const vt = (h) => new Date(Date.now() - h * 3600000).toISOString().replace(/\.\d+Z$/, 'Z');
  fs.writeFileSync(path.join(dir, '.great_cto', 'verdicts', 'security-officer.log'), [
    { v: 1, ts: vt(5), agent: 'security-officer', verdict: 'BLOCKED', meta: { need: 'implementer' } },
    { v: 1, ts: vt(3), agent: 'security-officer', verdict: 'APPROVED' },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.appendFileSync(path.join(dir, '.great_cto', 'events.jsonl'),
    `${JSON.stringify({ v: 1, ts: vt(4), kind: 'agent-stop', agent: 'great-cto:security-officer', outcome: 'no-verdict-reported' })}\n`);
  let started;
  try {
    started = await startServerOnFreePort({
      entry: path.resolve('packages/board/server.mjs'),
      cwd: dir,
      env: {
        HOME: fakeHome, USERPROFILE: fakeHome, GREAT_CTO_NO_BOARD: '1',
        GREAT_CTO_PROJECTS_FILE: path.join(fakeHome, '.great_cto', 'projects.json'),
      },
      portEnv: 'PORT',
    });
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { skip: `board did not come up — not checked, not passed: ${e.message}` };
  }
  // A missing browser BINARY is the same third state as a missing package:
  // Playwright imports fine and only fails at launch, and a failure here would
  // read as "the board is broken" on a machine that has simply never run
  // `npx playwright install chromium`.
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    await reapAndClean(started.proc, dir);
    return { skip: `chromium would not launch — not checked, not passed: ${String(e.message).split('\n')[0]}` };
  }
  return {
    dir, started, browser,
    url: `http://127.0.0.1:${started.port}`,
    async close() {
      await browser.close().catch(() => {});
      // reapAndClean, not a bare kill: it WAITS for the process group to empty
      // before removing the fixture. A board still holding the directory is the
      // orphan that wedges the next gate on this machine.
      await reapAndClean(started.proc, dir);
    },
  };
}

/** A page that records every console error and page exception it saw. */
async function openBoard(env, route = '', pageOptions = {}) {
  const page = await env.browser.newPage({ viewport: { width: 1440, height: 900 }, ...pageOptions });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${env.url}/${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.panel.active, #panel-inbox', { timeout: 15000 });
  await page.waitForTimeout(1200);   // the board paints, then fills from /api/*
  return { page, errors };
}

test('Russian browser locale keeps UI English and task/document text unchanged', { timeout: 120_000 }, async (t) => {
  const title = 'Проверить повторную оплату';
  const description = 'Не списывать деньги дважды. См. docs/decisions/ADR-002-retry.md';
  const documentTitle = 'Повторная оплата';
  const documentBody = 'Повторный запрос использует тот же ключ идемпотентности.';
  const env = await boardUnderTest({ seed(dir) {
    fs.appendFileSync(path.join(dir, '.great_cto', 'tasks.md'),
      `\n| id | title | status | owner |\n|----|-------|--------|-------|\n`
      + `| acme-locale | ${title} [${description}] | blocked | senior-dev |\n`);
    fs.writeFileSync(path.join(dir, 'docs', 'decisions', 'ADR-002-retry.md'),
      `# ${documentTitle}\n\n${documentBody}\n`);
  } });
  if (env.skip) return t.skip(env.skip);
  try {
    const { page, errors } = await openBoard(env, '#/decisions', {
      locale: 'ru-RU', timezoneId: 'Europe/Vienna',
    });
    assert.equal(await page.evaluate(() => navigator.language), 'ru-RU', 'actually exercise a non-English browser');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal((await page.locator('.nav-item[data-tab="decisions"] .nav-label').innerText()).trim(), 'Decisions');
    await page.getByRole('button', { name: title, exact: true }).click();
    await page.waitForSelector('#side-panel.open');
    assert.equal(await page.locator('#side-body .side-title').innerText(), title);
    assert.equal(await page.locator('#side-body .side-desc').innerText(), description);
    assert.deepEqual(await page.locator('#side-body .side-task-actions button').allInnerTexts(), ['Unblock', 'Close']);
    assert.ok((await page.locator('#side-body .prop-key').allInnerTexts()).includes('Created'));

    const timestamps = await page.evaluate(() => {
      const iso = '2026-10-09T15:43:47Z';
      return { actual: fmtDate(iso), short: fmtDT(iso),
        english: new Date(iso).toLocaleString('en-US'), russian: new Date(iso).toLocaleString('ru-RU'),
        expectedShort: new Date(iso).toLocaleString('en-US', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        }), offset: new Date(iso).getTimezoneOffset() };
    });
    assert.equal(timestamps.actual, timestamps.english);
    assert.notEqual(timestamps.actual, timestamps.russian);
    assert.equal(timestamps.short, timestamps.expectedShort);
    assert.equal(timestamps.offset, -120, 'retain Vienna local time, not forced UTC');

    await page.getByRole('button', { name: 'docs/decisions/ADR-002-retry.md open →' }).click();
    await page.waitForSelector('#side-body .side-desc h1');
    assert.equal(await page.locator('#side-body .side-desc h1').innerText(), documentTitle);
    assert.equal(await page.locator('#side-body .side-desc p').innerText(), documentBody);
    await page.getByRole('button', { name: '← back to task' }).click();
    assert.equal(await page.locator('#side-body .side-desc').innerText(), description);
    assert.deepEqual(errors.filter(e => !/favicon|net::ERR_/.test(e)), []);
  } finally { await env.close(); }
});

test('every screen paints its own content, and nothing throws on the way', { timeout: 180_000 }, async (t) => {
  const env = await boardUnderTest();
  if (env.skip) return t.skip(env.skip);
  try {
    const { page, errors } = await openBoard(env);
    for (const [route, title] of SCREENS) {
      await page.goto(`${env.url}/#/${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);

      const active = await page.locator('.panel.active').first();
      assert.equal(await active.count(), 1, `${route}: exactly one panel is active`);

      // What the OPERATOR can see, which is not the same as what innerText
      // returns: Fleet keeps a closed agent drawer in its markup, and that
      // drawer's placeholder reads "Loading…" until something is opened into
      // it. Judging the screen on the drawer's text would fail a screen that is
      // fine — and, worse, could pass one that is not.
      assert.equal(await page.locator('#agent-drawer.open, #side-panel.open').count(), 0,
        `${route}: a drawer was left open before anything was clicked`);
      const text = (await active.evaluate((el) => {
        const c = el.cloneNode(true);
        c.querySelectorAll('#agent-drawer, .drawer-backdrop, #side-panel').forEach((n) => n.remove());
        return c.innerText;
      })).trim();
      assert.ok(text.length > 40, `${route}: the panel painted something (got ${text.length} chars)`);
      // Fleet names itself by the VIEW it opened on ("Needs attention"), which is
      // the redesign's point: the screen opens on what needs a person, not on the
      // roster. So the sidebar's own label is the thing that must be current.
      const navLabel = await page.locator('.nav-item.active').first().innerText();
      assert.ok(text.includes(title) || navLabel.includes(title),
        `${route}: the screen names itself — neither the panel nor the active nav item says "${title}"`);
      assert.ok(!/loading…|connecting…/i.test(text.slice(0, 200)),
        `${route}: still says "loading…" after the data should have arrived`);

      // A page that scrolls sideways at 1440 is a layout that broke, not a wide table.
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 1, `${route}: the page scrolls sideways by ${over}px at 1440`);
    }
    assert.deepEqual(errors.filter((e) => !/favicon|net::ERR_/.test(e)), [],
      'the board logged console errors while the operator walked it');
  } finally { await env.close(); }
});

test('sidebar rows share geometry, icons and accessible states at every breakpoint', { timeout: 120_000 }, async (t) => {
  const b = await boardUnderTest();
  if (b.skip) { t.skip(b.skip); return; }
  try {
    const { page } = await openBoard(b);
    assert.equal(await page.locator('.nav-item[data-tab="work"] svg.icon').count(), 1, 'Work has the same icon column as other destinations');
    await page.locator('#tools-nav summary').click();
    await page.locator('.nav-item[data-tab="fleet"]').click();
    await page.waitForSelector('#nav-view-all .nav-label');
    for (const width of [1440, 1000, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width === 375) await page.locator('button[aria-controls="sidebar"]').click();
      const rows = await page.locator('.nav-item, #tools-nav summary, .nav-view-item').evaluateAll(els => els
        .filter(el => el.getClientRects().length && getComputedStyle(el).display !== 'none')
        .map(el => {
          const s = getComputedStyle(el), icon = el.querySelector('svg.icon'), label = el.querySelector('.nav-label');
          return { name: el.getAttribute('aria-label') || label?.textContent, height: el.getBoundingClientRect().height,
            font: s.fontSize, padding: s.paddingLeft, gap: s.gap,
            icon: icon?.getBoundingClientRect().width, labelVisible: label && getComputedStyle(label).display !== 'none' };
        }));
      assert.ok(rows.length >= 8);
      for (const row of rows) {
        assert.equal(row.height, width === 375 ? 44 : 36, `${row.name} row height at ${width}`);
        assert.equal(row.font, rows[0].font, `${row.name} typography at ${width}`);
        assert.equal(row.padding, rows[0].padding, `${row.name} padding at ${width}`);
        assert.equal(row.gap, rows[0].gap, `${row.name} icon gap at ${width}`);
        assert.equal(row.icon, 16, `${row.name} has a consistent icon at ${width}`);
        assert.equal(row.labelVisible, width !== 1000, `${row.name} rail label visibility`);
      }
      assert.equal(await page.locator('.nav-item[aria-selected="true"]').count(), 1);
      assert.equal(await page.locator('#nav-view-needs').getAttribute('aria-pressed'), 'true');
      if (process.env.GREAT_CTO_SIDEBAR_SCREENSHOTS) {
        fs.mkdirSync(process.env.GREAT_CTO_SIDEBAR_SCREENSHOTS, { recursive: true });
        await page.locator('#sidebar').screenshot({ path: path.join(process.env.GREAT_CTO_SIDEBAR_SCREENSHOTS, `sidebar-${width}.png`) });
      }
      if (width === 375) await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const settledStyle = async (locator, property) => locator.evaluate(async (el, property) => {
      await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {})));
      return getComputedStyle(el)[property];
    }, property);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      const work = page.locator('.nav-item[data-tab="work"]'), view = page.locator('#nav-view-all');
      await work.hover();
      const hover = await settledStyle(work, 'backgroundColor');
      await view.hover();
      assert.equal(await settledStyle(view, 'backgroundColor'), hover, `shared hover colour in ${theme}`);
      await page.keyboard.press('Tab'); // keyboard modality makes :focus-visible explicit
      await work.focus();
      const focus = await settledStyle(work, 'outlineColor');
      await view.focus();
      assert.equal(await settledStyle(view, 'outlineColor'), focus, `shared focus colour in ${theme}`);
      assert.equal(await view.evaluate(el => getComputedStyle(el).outlineWidth), '2px');
    }
    await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    await page.locator('#nav-view-all').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#nav-view-all').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#nav-view-needs').getAttribute('aria-pressed'), 'false');
    await page.locator('.nav-item[data-tab="history"]').click();
    assert.equal(await page.locator('.nav-item.active').count(), 1, 'only the current destination is active');
    assert.equal(await page.locator('.nav-item[data-tab="history"]').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('.nav-views').isVisible(), false, 'Fleet filters stay contextual');
  } finally { await b.close(); }
});

test('the sidebar moves between screens, by mouse and by keyboard', { timeout: 120_000 }, async (t) => {
  const env = await boardUnderTest();
  if (env.skip) return t.skip(env.skip);
  try {
    const { page } = await openBoard(env, '#/decisions');
    // Ledger, Fleet, Harness and Usage live in the Tools disclosure, closed by
    // default since the task-centric navigation (2026-10-02). An operator opens
    // it first; a test that clicks a hidden item was checking a sidebar that no
    // longer exists.
    await page.locator('#tools-nav > summary').click();
    await page.locator('.nav-item', { hasText: 'Fleet' }).first().click();
    await page.waitForTimeout(700);
    assert.match(await page.locator('.panel.active').first().innerText(), /Fleet|agent/i,
      'clicking Fleet in the sidebar shows Fleet');
    assert.match(page.url(), /#\/fleet/, 'and the URL says where the operator is');

    // The nav is a tablist: a keyboard operator reaches every screen.
    const ledger = page.locator('.nav-item', { hasText: 'Ledger' }).first();
    await ledger.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    assert.match(page.url(), /#\/ledger/, 'Enter on a focused nav item navigates');
  } finally { await env.close(); }
});

/** Route both decision endpoints to a recorder, so a click's destination is provable. */
async function recordDecisions(page) {
  const seen = [];
  const capture = async (r) => {
    seen.push({ method: r.request().method(), url: r.request().url(), body: r.request().postData() });
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  };
  await page.route('**/api/tasks/*/status*', capture);
  await page.route('**/api/gates/**', capture);
  return seen;
}

/** The row for a task that is NOT a gate — the one the fixture leaves blocked. */
function blockedRow(page) {
  return page.locator('.inbox-row').filter({ hasText: 'blocked' }).first();
}

test('a BLOCKED task can be unblocked from the board, in the row and in the drawer', { timeout: 120_000 }, async (t) => {
  const env = await boardUnderTest();
  if (env.skip) return t.skip(env.skip);
  try {
    const { page } = await openBoard(env, '#/decisions');
    const row = blockedRow(page);
    assert.equal(await row.count(), 1,
      'the fixture leaves one blocked task — if this is 0 the fixture changed and this test proves nothing');

    // The endpoint is stubbed because `bd` need not exist on the machine running
    // this suite. What is under test is the WIRING: that a control the operator
    // can see reaches the right endpoint with a status it accepts. The
    // endpoint's own behaviour is covered by the board's server tests.
    const seen = await recordDecisions(page);

    // 1. From the row itself, without opening anything.
    const rowBtn = row.locator('button', { hasText: /unblock/i }).first();
    assert.equal(await rowBtn.count(), 1, 'a blocked row carries Unblock where the operator can see it');
    await rowBtn.click();
    await page.waitForTimeout(800);
    assert.equal(seen.length, 1, 'the row button reached exactly one endpoint');
    assert.equal(seen[0].method, 'POST');
    assert.match(seen[0].url, /\/api\/tasks\/[^/]+\/status/, 'and it was the status endpoint');
    assert.match(String(seen[0].body), /"status":"open"/, 'Unblock sets the task back to open');

    // 2. And from inside the drawer, which is where the operator lands after reading it.
    seen.length = 0;
    await row.click();
    await page.waitForSelector('#side-panel.open', { timeout: 8000 });
    const buttons = await page.locator('#side-body .side-task-actions button').allInnerTexts();
    assert.ok(buttons.length > 0,
      'the drawer offers no action at all — a board that can read a task and not decide it');
    assert.ok(buttons.some((b) => /unblock/i.test(b)), `the drawer offers Unblock (offered: ${buttons.join(', ')})`);
    assert.ok(buttons.some((b) => /close/i.test(b)), `the drawer offers Close (offered: ${buttons.join(', ')})`);
    await page.locator('#side-body .side-task-actions button', { hasText: /unblock/i }).first().click();
    await page.waitForTimeout(800);
    assert.equal(seen.length, 1, 'the drawer button reached exactly one endpoint');
    assert.match(String(seen[0].body), /"status":"open"/);
  } finally { await env.close(); }
});

test('a gate is approved through its ritual, and a wrong name approves nothing', { timeout: 120_000 }, async (t) => {
  const env = await boardUnderTest();
  if (env.skip) return t.skip(env.skip);
  try {
    const { page } = await openBoard(env, '#/decisions');
    const gate = page.locator('.inbox-row').filter({ hasText: /gate:/ }).first();
    if (await gate.count() === 0) return t.skip('the fixture raised no gate — nothing to approve');
    const seen = await recordDecisions(page);
    const approve = gate.locator('button', { hasText: /^approve/i }).first();
    assert.equal(await approve.count(), 1, 'a waiting gate carries an Approve control');

    // Playwright DISMISSES dialogs by default — which is itself the assertion
    // that matters most here: a gate that is only ever approved by answering a
    // dialog cannot be approved by a click that answers nothing.
    await approve.click();
    await page.waitForTimeout(800);
    assert.deepEqual(seen, [], 'a dismissed ritual approved nothing');

    // Answering it correctly does approve. The typed-name prompt is answered
    // with the gate name the dialog itself demands, so the test cannot drift
    // out of step with the ritual's wording.
    page.on('dialog', (d) => {
      const want = /Type (\S+) to approve/.exec(d.message());
      d.accept(want ? want[1] : '');
    });
    await approve.click();
    await page.waitForTimeout(1000);
    assert.equal(seen.length, 1, 'the answered ritual posted exactly one decision');
    assert.equal(seen[0].method, 'POST');
    assert.match(seen[0].url, /\/api\/gates\//, 'and it went to the gate endpoint');
  } finally { await env.close(); }
});

test('the palette opens on its shortcut and finds a screen', { timeout: 120_000 }, async (t) => {
  const env = await boardUnderTest();
  if (env.skip) return t.skip(env.skip);
  try {
    const { page } = await openBoard(env, '#/decisions');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await page.waitForTimeout(500);
    const palette = page.locator('#cmdk.open');
    assert.ok(await palette.count() > 0 && await palette.isVisible(), '⌘K opened the palette');
    await page.keyboard.type('ledger');
    await page.waitForTimeout(600);
    assert.match((await palette.innerText()).toLowerCase(), /ledger/, 'and it found the Ledger screen');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#cmdk.open').count(), 0, 'Escape closes it again');
  } finally { await env.close(); }
});

test('the board holds at phone width: no sideways scroll, touch targets reachable', { timeout: 120_000 }, async (t) => {
  const env = await boardUnderTest();
  if (env.skip) return t.skip(env.skip);
  try {
    const page = await env.browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    for (const [route] of SCREENS) {
      await page.goto(`${env.url}/#/${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 1, `${route}: scrolls sideways by ${over}px at 375`);
    }
    // The floor under a touch target, measured on what actually rendered.
    const short = await page.evaluate(() => [...document.querySelectorAll('.panel.active button, .panel.active a')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ t: (el.innerText || el.title || '').trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((b) => b.h > 0 && b.h < 44));
    assert.deepEqual(short, [], 'every visible control on a touch screen is at least 44px tall');
    await page.close();
  } finally { await env.close(); }
});

test('the fixture project is the one the board resolved', { timeout: 120_000 }, async (t) => {
  const env = await boardUnderTest();
  if (env.skip) return t.skip(env.skip);
  try {
    const { page } = await openBoard(env, '#/decisions');
    const shell = await page.locator('body').innerText();
    assert.ok(shell.includes(FIXTURE_NAME) || shell.includes('acme'),
      'the board is showing the fixture, not some other project on this machine');
  } finally { await env.close(); }
});

// Fleet reads two machine-level answers besides the verdicts: how often the
// session logs dispatched each agent, and which reviewers this project's
// PROJECT.md requires. Both are stubbed — the logs and the fixture's archetype
// are this machine's business — so what is under test is that the screen says
// what those answers mean, and that a required reviewer with no verdict is put
// in front of the operator rather than left in the roster.
test('Fleet shows real dispatches and required reviewers, and puts a missing one in Needs attention', { timeout: 120_000 }, async (t) => {
  const env = await boardUnderTest();
  if (env.skip) return t.skip(env.skip);
  try {
    const page = await env.browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const json = (body) => (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/api/agent-usage*', json({
      state: 'counted', transcripts: 3, read: 3,
      window: { from: '2026-08-01T00:00:00Z', to: '2026-09-20T00:00:00Z' },
      agents: { 'legal-reviewer': { dispatches: 4, lastRun: '2026-09-19T00:00:00Z', projects: 2 } },
    }));
    // The fixture HOME installs no agents, so the roster is stubbed too: two
    // reviewers, neither with a verdict in this project.
    const agent = (slug) => ({ slug, health: 'unknown', runs_total: 0, runs_30d: 0, last_run: null,
      success_rate: null, model_state: 'undeclared', retired: false });
    await page.route('**/api/agents-installed*', json({
      agents: [agent('pci-reviewer'), agent('legal-reviewer')], summary: { active_30d: 0 },
    }));
    await page.route('**/api/required-reviewers*', json({
      state: 'read',
      reviewers: [{ agent: 'pci-reviewer', why: 'archetype commerce', verdict: false }],
    }));
    await page.goto(`${env.url}/#/fleet`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.agent-row', { timeout: 15000 });
    await page.waitForTimeout(1200);

    const row = (slug) => page.locator(`.agent-row[data-slug="${slug}"]`);
    assert.equal(await row('pci-reviewer').count(), 1,
      'the required reviewer with no verdict is in the default view, Needs attention');
    assert.match(await row('pci-reviewer').innerText(), /required · not run/,
      'and its row says it is required and has not run');

    await page.evaluate(() => setFleetView('all'));
    await page.waitForTimeout(600);
    const legal = await row('legal-reviewer').innerText();
    assert.match(legal, /dispatched 4× · no verdict/,
      'an agent the logs dispatched but no verdict names reads as dispatched, not as never observed');
    assert.doesNotMatch(legal, /never observed/);

    await page.evaluate(() => setFleetView('never'));
    await page.waitForTimeout(600);
    assert.equal(await row('legal-reviewer').count(), 0,
      'Never observed means no verdict AND no dispatch — a dispatched agent is not in it');
    assert.deepEqual(errors, [], 'nothing threw on the Fleet screen');
    await page.close();
  } finally { await env.close(); }
});

// A session stopped on a permission prompt is a decision the operator owes, so it
// sits at the top of Decisions; sessions that merely finished a turn are one line.
test('Decisions shows a session that waits for the operator, above the status', { timeout: 120_000 }, async (t) => {
  const env = await boardUnderTest();
  if (env.skip) return t.skip(env.skip);
  try {
    const page = await env.browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/session-status*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [
      { session: 'a1b2c3d4e5', state: 'blocked', since: new Date(Date.now() - 120_000).toISOString(), reason: 'Claude needs your permission to use Bash', kind: 'permission_prompt' },
      { session: 'ffff0000', state: 'waiting', since: new Date().toISOString() },
      { session: 'eeee1111', state: 'waiting', since: new Date().toISOString() },
    ] }) }));
    await page.goto(`${env.url}/#/decisions`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#inbox-sessions .session-blocked', { timeout: 15000 });
    const text = await page.locator('#inbox-sessions').innerText();
    assert.match(text, /session a1b2c3d4 waits for you/);
    assert.match(text, /permission to use Bash/);
    assert.match(text, /2 sessions finished a turn/);
    const above = await page.evaluate(() => {
      const a = document.getElementById('inbox-sessions'); const b = document.getElementById('proj-status');
      return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.ok(above, 'the waiting session is above the project-status disclosure');
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await env.close(); }
});

// Usage reads both hosts' own logs. The fixture HOME holds one Claude Code
// conversation and one Codex thread (seedHostLogs); what is under test is that
// both reach the screen through the real reader — a response written as two
// lines counted once, account-wide quotas excluded, an unpriced model shown as
// n/a rather than $0 — and that the host switch changes what is listed.
test('Usage shows Claude Code and Codex side by side, from their own logs', { timeout: 120_000 }, async (t) => {
  const env = await boardUnderTest();
  if (env.skip) return t.skip(env.skip);
  try {
    const page = await env.browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR_/.test(m.text())) errors.push(m.text()); });
    await page.goto(`${env.url}/#/usage`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.usage-card[data-host="codex"]', { timeout: 20000 });

    const claude = await page.locator('.usage-card[data-host="claude"]').innerText();
    assert.match(claude, /10\.0k\s*tokens/, `one response, counted once: 1k in + 2k out + 7k cache (got: ${claude.slice(0, 120)})`);
    assert.match(claude, /\$0\.06/, 'priced at the Opus 5 list rate');
    assert.match(claude, /In this project: 1 plan-limit refusals/, 'project-local refusals still counted');
    assert.equal(await page.locator('[data-limits]').count(), 0, 'account-wide quotas are not drawn as project statistics');

    const codex = await page.locator('.usage-card[data-host="codex"]').innerText();
    assert.match(codex, /4\.5k\s*tokens/);
    assert.doesNotMatch(codex, /42% used|plan prolite/);
    assert.match(codex, /n\/a/, 'an unpriced model is n/a, not $0');

    const text = await page.locator('#panel-usage').innerText();
    assert.match(text, /selected project|Statistics for/);
    assert.doesNotMatch(text, /Foreign checkout|foreign-model/);
    assert.match(text, /Checkout redesign/, 'the Claude Code conversation by its title');
    assert.match(text, /Invoice export/, 'the Codex thread by its name');
    assert.match(text, /senior-dev\s*great_cto/, 'a great_cto agent dispatched under the plugin prefix is ours');

    await page.waitForSelector('[data-outcomes="agents"]', { timeout: 20000 });
    const agents = await page.locator('[data-outcomes="agents"]').innerText();
    assert.match(agents, /security-officer\s+2\s+1\s+1\s+0\s+50%\s+1/, 'two verdicts: one pass, one stop — half stopped the pipeline; and one run ended with none');
    assert.match(await page.locator('[data-outcomes="findings"]').innerText(), /P0 filed\s*0/, 'no Beads in the fixture: zero filed, and the card says so');
    const hooks = await page.locator('#panel-usage').innerText();
    assert.match(hooks, /Guards refused a call · 1[\s\S]*shared-tree\s*great_cto/, 'the guard that refused, marked as ours');
    assert.match(hooks, /Hooks that timed out · 1[\s\S]*Destructive-command check/);

    await page.getByRole('button', { name: 'Codex', exact: true }).click();
    await page.waitForTimeout(200);
    assert.match(await page.locator('.usage-lists').first().innerText(), /exec_command/, 'the host switch lists Codex tools');
    assert.deepEqual(errors, [], 'nothing threw while Usage was read');
  } finally {
    await env.close();
  }
});
