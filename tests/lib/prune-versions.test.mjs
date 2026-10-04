// Which cached plugin versions install-local --prune may delete.
//
// It deleted every version but the new one. Open sessions keep running hooks
// from the version they started on — CLAUDE_PLUGIN_ROOT names it — and a hook
// run from a deleted directory is how all 70 agents and 38 commands vanished on
// 2026-09-11. A directory a live session points at is not "other", it is in use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneVersionsPlan, liveRootsFromPs, applyPrunePlan, readLiveRoots, readRegisteredRoots } from '../../scripts/lib/prune-versions.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const C = '/h/.claude/plugins/cache/local/great_cto';

test('the new version stays and versions nobody runs are removed', () => {
  const r = pruneVersionsPlan({ versionDirs: [`${C}/3.28.3`, `${C}/3.28.4`, `${C}/3.28.5`], keep: `${C}/3.28.5`, liveRoots: [] });
  assert.deepEqual(r.remove, [`${C}/3.28.3`, `${C}/3.28.4`]);
});

test('a version a live session runs from is kept, and says why', () => {
  const r = pruneVersionsPlan({ versionDirs: [`${C}/3.28.3`, `${C}/3.28.4`, `${C}/3.28.5`], keep: `${C}/3.28.5/`,
    liveRoots: [`${C}/3.28.4/`] });
  assert.deepEqual(r.remove, [`${C}/3.28.3`]);
  assert.ok(r.kept.some((k) => k.dir === `${C}/3.28.4` && /live session/.test(k.why)));
});

test('when live sessions cannot be read, nothing is removed', () => {
  const r = pruneVersionsPlan({ versionDirs: [`${C}/3.28.4`, `${C}/3.28.5`], keep: `${C}/3.28.5`, liveRoots: null });
  assert.deepEqual(r.remove, []);
  assert.match(r.why, /could not read/);
});

test('plugin roots are read from process environments, once each', () => {
  const ps = [
    `12 /usr/bin/claude --resume TERM=xterm CLAUDE_PLUGIN_ROOT=${C}/3.28.4 HOME=/h`,
    `13 node hook.mjs CLAUDE_PLUGIN_ROOT=${C}/3.28.4 PATH=/bin`,
    `14 /usr/bin/claude CLAUDE_PLUGIN_ROOT=${C}/3.28.5`,
    '15 zsh -l',
  ].join('\n');
  assert.deepEqual(liveRootsFromPs(ps), [`${C}/3.28.4`, `${C}/3.28.5`]);
});

test('a plugin root with a space in it is read whole, not cut at the space', () => {
  const root = '/h/Library/Application Support/Claude/plugins/great_cto/3.28.4';
  const ps = `21 /Applications/Claude.app claude CLAUDE_PLUGIN_ROOT=${root} HOME=/h\n22 node x.mjs CLAUDE_PLUGIN_ROOT=${root}`;
  assert.deepEqual(liveRootsFromPs(ps), [root]);
  const r = pruneVersionsPlan({ versionDirs: [root, '/h/other/3.28.5'], keep: '/h/other/3.28.5', liveRoots: liveRootsFromPs(ps) });
  assert.deepEqual(r.remove, [], 'the directory a session runs from was planned for deletion');
});

// SessionStart ran its own cleanup: `ls | sort -V | awk (all but the newest 3) |
// xargs rm -rf`, with no live-session check — the check install-local --prune got
// after 2026-09-11. It now calls this plan with keepNewest, so the newest three
// stay as before and a version a live session runs from stays too.
test('keepNewest keeps the newest N by version, not by name order', () => {
  const dirs = ['3.9.0', '3.10.0', '3.28.4', '3.29.0', '3.29.1'].map((v) => `${C}/${v}`);
  const r = pruneVersionsPlan({ versionDirs: dirs, keep: `${C}/3.29.1`, liveRoots: [], keepNewest: 3 });
  assert.deepEqual(r.remove.sort(), [`${C}/3.10.0`, `${C}/3.9.0`].sort(), '3.10.0 is older than 3.28.4, and 3.9.0 older than both');
  assert.ok(r.kept.some((k) => k.dir === `${C}/3.28.4` && /newest/.test(k.why)));
});

test('keepNewest never removes a version a live session runs from, however old', () => {
  const dirs = ['3.9.0', '3.28.4', '3.29.0', '3.29.1'].map((v) => `${C}/${v}`);
  const r = pruneVersionsPlan({ versionDirs: dirs, keep: `${C}/3.29.1`, liveRoots: [`${C}/3.9.0`], keepNewest: 3 });
  assert.deepEqual(r.remove, []);
});

function cacheFixture(t) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'contained-prune-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'cache');
  const keep = path.join(root, '3.48.0');
  const old = path.join(root, '3.47.0');
  fs.mkdirSync(keep, { recursive: true });
  fs.mkdirSync(old);
  return { temp, root, keep, old };
}

test('prune deletes only a validated direct-child version', (t) => {
  const f = cacheFixture(t);
  assert.equal(applyPrunePlan({ ...f, remove: [f.old] }), 1);
  assert.equal(fs.existsSync(f.old), false);
  assert.equal(fs.existsSync(f.keep), true);
});

for (const kind of ['root', 'keep', 'outside', 'traversal', 'nested', 'symlink', 'stage', 'file']) {
  test(`prune refuses ${kind} without deleting even an earlier valid candidate`, (t) => {
    const f = cacheFixture(t);
    let unsafe;
    if (kind === 'root') unsafe = f.root;
    if (kind === 'keep') unsafe = f.keep;
    if (kind === 'outside') unsafe = f.temp;
    if (kind === 'traversal') unsafe = `${f.root}/../cache`;
    if (kind === 'nested') { unsafe = path.join(f.old, '3.1.0'); fs.mkdirSync(unsafe); }
    if (kind === 'symlink') { unsafe = path.join(f.root, '3.1.0'); fs.symlinkSync(f.temp, unsafe); }
    if (kind === 'stage') { unsafe = path.join(f.root, '.local-install-stage-owned'); fs.mkdirSync(unsafe); }
    if (kind === 'file') { unsafe = path.join(f.root, '3.1.0'); fs.writeFileSync(unsafe, 'not directory'); }
    assert.throws(() => applyPrunePlan({ ...f, remove: [f.old, unsafe] }));
    assert.equal(fs.existsSync(f.old), true);
    assert.equal(fs.existsSync(f.keep), true);
  });
}

test('prune refuses symlink root and preserves another installer lock', (t) => {
  const f = cacheFixture(t);
  const alias = path.join(f.temp, 'alias');
  fs.symlinkSync(f.root, alias);
  assert.throws(() => applyPrunePlan({ root: alias, keep: f.keep, remove: [f.old] }));
  fs.mkdirSync(path.join(f.root, '.local-install-lock'));
  assert.throws(() => applyPrunePlan({ ...f, remove: [f.old] }));
  assert.equal(fs.existsSync(path.join(f.root, '.local-install-lock')), true);
  assert.equal(fs.existsSync(f.old), true);
});

test('successful ps without a positive environment control is unknown, not no sessions', () => {
  assert.equal(readLiveRoots({ probeToken: 'fixture', readPs: () => 'node claude\n' }), null);
  assert.equal(readLiveRoots({ probeToken: 'fixture', readPs: () => 'ps GREAT_CTO_PRUNE_VISIBILITY=wrong\n' }), null);
});

test('visible native host without a plugin root refuses pruning even with working ps', () => {
  const probe = 'ps GREAT_CTO_PRUNE_VISIBILITY=fixture\n';
  for (const client of ['claude --resume', '/Applications/Codex.app/Contents/MacOS/Codex', 'codex exec --json']) {
    assert.equal(readLiveRoots({ probeToken: 'fixture', readPs: () => probe + client + ' PATH=/fixture\n' }), null);
  }
  assert.deepEqual(readLiveRoots({ probeToken: 'fixture', readPs: () => probe }), []);
  assert.deepEqual(readLiveRoots({ probeToken: 'fixture', readPs: () => probe + `claude CLAUDE_PLUGIN_ROOT=${C}/3.28.4 PATH=/fixture\n` }), [`${C}/3.28.4`]);
});

test('registered versions and canonical live aliases remain protected beyond newest three', (t) => {
  const f = cacheFixture(t);
  const alias = path.join(f.temp, 'old-alias');
  fs.symlinkSync(f.old, alias);
  const r = pruneVersionsPlan({ versionDirs: [f.old, f.keep], keep: f.keep, liveRoots: [alias], keepNewest: 1 });
  assert.deepEqual(r.remove, []);
  const registered = pruneVersionsPlan({ versionDirs: [f.old, f.keep], keep: f.keep, liveRoots: [], protectedRoots: [alias], keepNewest: 1 });
  assert.deepEqual(registered.remove, []);
  assert.match(registered.kept[0].why, /registration/);
});

test('registry protection reads every scope and refuses unavailable/malformed/symlink state', (t) => {
  const f = cacheFixture(t);
  const registry = path.join(f.temp, 'registry.json');
  assert.equal(readRegisteredRoots(registry), null);
  fs.writeFileSync(registry, '{broken');
  assert.equal(readRegisteredRoots(registry), null);
  fs.writeFileSync(registry, JSON.stringify({ version: 2, plugins: { 'great_cto@local': [
    { scope: 'user', installPath: f.keep }, { scope: 'project', installPath: f.old } ] } }));
  assert.deepEqual(readRegisteredRoots(registry), [f.keep, f.old]);
  const alias = path.join(f.temp, 'registry-alias');
  fs.symlinkSync(registry, alias);
  assert.equal(readRegisteredRoots(alias), null);
});

test('CLI prune leaves non-version folders and all registered old versions alone', (t) => {
  const f = cacheFixture(t);
  const backup = path.join(f.root, 'backup');
  fs.mkdirSync(backup);
  const registry = path.join(f.temp, 'registry.json');
  fs.writeFileSync(registry, JSON.stringify({ version: 2, plugins: { 'great_cto@local': [{ scope: 'user', installPath: f.old }] } }));
  const bin = path.join(f.temp, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'ps'), '#!/bin/sh\nprintf "ps GREAT_CTO_PRUNE_VISIBILITY=%s\\n" "$GREAT_CTO_PRUNE_VISIBILITY"\n', { mode: 0o755 });
  const script = fileURLToPath(new URL('../../scripts/lib/prune-versions.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [script, '--cache-root', f.root, '--keep', f.keep, '--registry', registry, '--keep-newest', '1', '--apply'], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /non-version cache directory left alone/);
  assert.equal(fs.existsSync(backup), true);
  assert.equal(fs.existsSync(f.old), true);
});
