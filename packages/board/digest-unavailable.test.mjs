import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('daily, weekly and budget crons do not notify or record zero activity on an unreadable initialized store', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-digest-unreadable-'));
  const project = path.join(root, 'project'), state = path.join(root, 'state');
  fs.mkdirSync(path.join(project, '.beads'), { recursive: true });
  fs.mkdirSync(path.join(project, '.great_cto'));
  fs.mkdirSync(state);
  fs.writeFileSync(path.join(project, '.great_cto', 'PROJECT.md'), 'archetype: devtools\nmonthly-budget: $100\n');
  const registry = path.join(state, 'projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: 'project', path: project }] }));
  const vars = { GREAT_CTO_HOME: state, GREAT_CTO_PROJECTS_FILE: registry,
    GREAT_CTO_DISCOVERY_ROOT: root, GREAT_CTO_NO_UPDATE_CHECK: '1',
    GREAT_CTO_BD_BIN: fileURLToPath(new URL('./fixtures/fake-bd-controlled.mjs', import.meta.url)),
    FAKE_BD_CONTROL_ROOT: root, FAKE_BD_CONTROL_MODE: 'fail' };
  const old = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  Object.assign(process.env, vars);
  const realInterval = globalThis.setInterval, RealDate = globalThis.Date;
  const callbacks = [];
  let now = '2026-10-09T08:00:00Z';
  globalThis.setInterval = callback => { callbacks.push(callback); return { unref() {} }; };
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new RealDate(now).getTime(); }
  };
  t.after(() => {
    globalThis.setInterval = realInterval;globalThis.Date = RealDate;
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const { startAlertCron } = await import('./lib/alerts.mjs');
  startAlertCron();
  for (const name of ['digest.daily:', 'digest.weekly:', 'cost.threshold:']) {
    now = name === 'digest.daily:' ? '2026-10-09T08:00:00Z' : '2026-10-09T09:00:00Z';
    const callback = callbacks.find(fn => fn.toString().includes(name));
    assert.ok(callback, `${name} timer registered`);
    await callback();
  }
  assert.ok(fs.existsSync(path.join(root, 'project.started')), 'actual isolated Beads failure was read');
  for (const name of ['alerts-fired.json', 'notif-history.json']) {
    assert.equal(fs.existsSync(path.join(state, name)), false, `${name} must not record a fabricated quiet day`);
  }
});
