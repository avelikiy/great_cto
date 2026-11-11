// Settings after the 2026-11 UX audit (findings F6 and F15,
// docs/design/UX-AUDIT-board-2026-11.md).
//
// Settings used to open on a 73-agent table; the settings were the fourth tab,
// 5.6 screens long, and printed the local path of every registered project and
// the alert address. Every agent row carried the same red permission badge, so
// the badge marked nothing. These tests hold what replaced that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('./public/assets/admin-shell.js', import.meta.url), 'utf8');

function fn(name) {
  const m = html.match(new RegExp(`\\nfunction ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(m, `located ${name}`);
  return m[0];
}
function run(names, extra = {}) {
  const context = { ...extra };
  vm.createContext(context);
  vm.runInContext(names.map(fn).join('\n'), context);
  return context;
}

test('Settings opens on the settings; the agent list is one tab away', () => {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(shell, context);
  const ui = context.window.GctoAdmin;
  assert.equal(ui.route('settings').panel, 'settings');
  assert.equal(ui.route('settings/general').panel, 'settings');
  // Old addresses and the new names land on the same screens.
  for (const input of ['fleet', 'agents', 'settings/executors', 'settings/agents']) assert.equal(ui.route(input).panel, 'agents', input);
  for (const input of ['skills', 'settings/capabilities', 'settings/skills']) assert.equal(ui.route(input).panel, 'skills', input);
  assert.match(shell, /\[\['settings\/general','General'\],\['settings\/executors','Agents'\],\['settings\/capabilities','Skills'\],\['settings\/runtime','Runtime'\]\]/);
});

test('the alert address is masked until asked for', () => {
  const { maskAddress } = run(['maskAddress']);
  assert.equal(maskAddress('someone@example.org'), 's•••@•••.org');
  assert.equal(maskAddress('a.b+tag@mail.example.co.uk'), 'a•••@•••.uk');
  assert.equal(maskAddress(''), '');
  assert.equal(maskAddress('not an address'), '', 'something that is not an address is not echoed');
  assert.match(fn('renderAlertRows'), /settingsView\.reveal \? esc\(addr\) : esc\(maskAddress\(addr\)\)/);
});

test('project paths are not in the page until asked for', () => {
  const page = html.slice(html.indexOf('async function loadSettingsPage()'), html.indexOf('async function registerProjectFromSettings()'));
  // The one place a path is written is behind the reveal switch.
  const writes = page.match(/pr\.path/g) || [];
  assert.equal(writes.length, 1);
  assert.match(page, /\$\{settingsView\.reveal \? `<span class="cap muted mono">\$\{esc\(String\(pr\.path/);
  assert.match(html, /const settingsView = \{ reveal: false, allProjects: false,/, 'hidden is the default, and it is not persisted');
  assert.doesNotMatch(page, /localStorage\.(set|get)Item|sessionStorage/);
});

test('three projects, the current one first; the register field is open when there is none', () => {
  const page = html.slice(html.indexOf('async function loadSettingsPage()'), html.indexOf('async function registerProjectFromSettings()'));
  assert.match(page, /sort\(\(x, y\) => \(y\.slug === currentProject\) - \(x\.slug === currentProject\)\)/);
  assert.match(page, /settingsView\.allProjects \? ordered\.slice\(0, 40\) : ordered\.slice\(0, 3\)/);
  assert.match(page, /settingsView\.register \|\| \(plist && plist\.length === 0\)/);
});

test('a re-render does not eat a path being typed', () => {
  const page = html.slice(html.indexOf('async function loadSettingsPage()'), html.indexOf('async function registerProjectFromSettings()'));
  assert.match(page, /id="settings-register-path"[^>]*value="\$\{esc\(settingsView\.registerValue \|\| ''\)\}" oninput="settingsView\.registerValue=this\.value"/);
});

test('the long forms are closed by default and open one at a time from their row', () => {
  for (const id of ['panel-share', 'notif-email-card', 'push-card', 'notif-recent-card']) {
    assert.match(html, new RegExp(`id="${id}"[^>]* hidden>`), `${id} starts closed`);
  }
  assert.match(fn('settingsOpenForm'), /el\.hidden = x === id \? !el\.hidden : true;/);
});

test('a permission badge marks only an agent that differs from the common set', () => {
  const agents = [
    { slug: 'a', posture: { state: 'expensive', expensive: ['code.destructive', 'x'] } },
    { slug: 'b', posture: { state: 'expensive', expensive: ['x', 'code.destructive'] } },
    { slug: 'c', posture: { state: 'expensive', expensive: ['code.destructive', 'x'], scopedInNameOnly: ['Bash(node:*)'] } },
    { slug: 'd', posture: { state: 'unclassified', unknownTools: ['mcp__new'] } },
    { slug: 'r', retired: true, posture: { state: 'routine' } },
  ];
  const ctx = run(['postureSig', 'fleetStandardSig', 'permissionCell', 'postureChips'], {
    fleetState: { agents }, esc: (v) => String(v),
  });
  const std = ctx.fleetStandardSig();
  assert.equal(std, 'expensive|code.destructive,x', 'order of the list does not matter, retired agents do not vote');
  assert.equal(ctx.permissionCell(agents[0], std).standard, true);
  assert.match(ctx.permissionCell(agents[0], std).html, />Standard</);
  const extra = ctx.permissionCell(agents[2], std);
  assert.equal(extra.standard, false);
  assert.match(extra.html, />1 extra</);
  assert.match(extra.html, /node:\*/, 'the grant itself is on the tooltip');
  const odd = ctx.permissionCell(agents[3], std);
  assert.equal(odd.standard, false);
  assert.match(odd.html, /not classified/, 'an unjudged agent keeps the chip that says so');
});

test('filters are four chips on the page; "expensive" has none and "retired" appears only when used', () => {
  assert.match(html, /const AGENT_CHIPS = \['project', 'needs', 'never', 'all', 'retired'\];/);
  assert.match(html, /if \(key === 'retired' && !n && fleetState\.view !== 'retired'\) return '';/);
  assert.doesNotMatch(html, /nav-view-/, 'the sidebar holds destinations only');
  assert.match(html, /\['expensive', 'Expensive grants'\]/, 'the view itself still exists for old links');
});

test('ages are words', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const ctx = run(['longAgo'], { Date: Object.assign(function (...a) { return new Date(...a); }, { now: () => now, parse: Date.parse }), Number, Math });
  assert.equal(ctx.longAgo('2026-11-11T11:59:40Z'), 'just now');
  assert.equal(ctx.longAgo('2026-11-11T11:15:00Z'), '45 minutes ago');
  assert.equal(ctx.longAgo('2026-11-10T20:00:00Z'), '16 hours ago');
  assert.equal(ctx.longAgo('2026-08-07T12:00:00Z'), '96 days ago');
  assert.equal(ctx.longAgo('nonsense'), 'time unknown');
});
