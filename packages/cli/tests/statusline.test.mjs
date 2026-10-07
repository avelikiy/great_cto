// Claude's plan use reaches only the status line. `great-cto statusline install`
// puts a recorder there without taking the user's own status line away, and
// uninstall puts it back. The recorder keeps one line per change.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installStatusline, uninstallStatusline, statuslineStatus, ourCommand } from '../dist/statusline.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSET = path.resolve(HERE, '../assets/statusline.mjs');
const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

function paths() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-'));
  made.push(home);
  const gctoDir = path.join(home, '.great_cto');
  return { settings: path.join(home, '.claude', 'settings.json'), gctoDir, script: path.join(gctoDir, 'statusline.mjs'),
    conf: path.join(gctoDir, 'statusline.json'), log: path.join(gctoDir, 'claude-limits.jsonl'), asset: ASSET, home };
}
const write = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 2)); };
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('install keeps the user\'s status line and every other setting; uninstall puts it back exactly', () => {
  const p = paths();
  const mine = { type: 'command', command: 'echo mine', padding: 2 };
  write(p.settings, { model: 'opus', statusLine: mine, enabledPlugins: { x: true } });
  const r = installStatusline(p);
  assert.equal(r.ok, true, r.message);
  const s = read(p.settings);
  assert.equal(s.statusLine.command, ourCommand(p));
  assert.equal(s.statusLine.padding, 2, 'padding carried over');
  assert.deepEqual([s.model, s.enabledPlugins], ['opus', { x: true }], 'nothing else touched');
  assert.equal(read(p.conf).chain, 'echo mine');
  assert.ok(fs.existsSync(p.script), 'the recorder is copied, not run through npx');
  assert.ok(r.backup && fs.existsSync(r.backup), 'settings backed up before the write');
  assert.equal(installStatusline(p).message, 'status line script refreshed', 'a second install does not save itself as the previous one');
  assert.equal(read(p.conf).chain, 'echo mine');
  assert.equal(uninstallStatusline(p).ok, true);
  assert.deepEqual(read(p.settings).statusLine, mine, 'the previous status line, exactly');
});

test('with no status line before, uninstall removes ours and leaves none', () => {
  const p = paths();
  write(p.settings, { model: 'opus' });
  installStatusline(p);
  uninstallStatusline(p);
  assert.equal('statusLine' in read(p.settings), false);
});

test('a settings file that is not JSON is left alone', () => {
  const p = paths();
  write(p.settings, '{ not json');
  const r = installStatusline(p);
  assert.equal(r.ok, false);
  assert.equal(fs.readFileSync(p.settings, 'utf8'), '{ not json');
});

test('the recorder keeps one line per change of the plan numbers, and shows the user\'s line', () => {
  const p = paths();
  write(p.settings, { statusLine: { type: 'command', command: 'echo "  my line"' } });
  installStatusline(p);
  const run = (rl) => spawnSync(process.execPath, [p.script], {
    input: JSON.stringify({ model: { display_name: 'Opus' }, workspace: { current_dir: '/w/acme' }, rate_limits: rl }),
    encoding: 'utf8', env: { ...process.env, GREAT_CTO_HOME: p.gctoDir },
  });
  const a = { five_hour: { used_percentage: 12.34, resets_at: 1791580294 }, seven_day: { used_percentage: 40, resets_at: '2026-10-09T21:11:00Z' }, seven_day_opus: null };
  const r1 = run(a);
  assert.equal(r1.stdout, '  my line\n', 'the user\'s status line, unchanged');
  run(a);
  run({ ...a, five_hour: { used_percentage: 13, resets_at: 1791580294 } });
  const lines = fs.readFileSync(p.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2, 'a repeated reading is not a new line');
  assert.deepEqual(lines[0].windows, { five_hour: { used: 12.3, resets: 1791580294 }, seven_day: { used: 40, resets: Date.parse('2026-10-09T21:11:00Z') / 1000 } });
  assert.equal(statuslineStatus(p).installed, true);
});

test('with no status line of the user\'s, a short one of its own', () => {
  const p = paths();
  write(p.settings, {});
  installStatusline(p);
  const r = spawnSync(process.execPath, [p.script], {
    input: JSON.stringify({ model: { display_name: 'Opus 5.5' }, workspace: { current_dir: '/w/acme' }, rate_limits: { five_hour: { used_percentage: 7 }, seven_day: { used_percentage: 41.6 } } }),
    encoding: 'utf8', env: { ...process.env, GREAT_CTO_HOME: p.gctoDir },
  });
  assert.equal(r.stdout.trim(), 'Opus 5.5 · acme · 5h 7% · 7d 42%');
});

test('no rate_limits (an API key, not a plan) records nothing and still prints', () => {
  const p = paths();
  write(p.settings, {});
  installStatusline(p);
  const r = spawnSync(process.execPath, [p.script], { input: JSON.stringify({ model: { id: 'claude-opus-5-5' }, rate_limits: null }), encoding: 'utf8', env: { ...process.env, GREAT_CTO_HOME: p.gctoDir } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), 'claude-opus-5-5');
  assert.equal(fs.existsSync(p.log), false);
});
