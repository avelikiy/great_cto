// Which cached plugin versions install-local --prune may delete.
//
// It deleted every version but the new one. Open sessions keep running hooks
// from the version they started on — CLAUDE_PLUGIN_ROOT names it — and a hook
// run from a deleted directory is how all 70 agents and 38 commands vanished on
// 2026-09-11. A directory a live session points at is not "other", it is in use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneVersionsPlan, liveRootsFromPs, applyPrunePlan } from '../../scripts/lib/prune-versions.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
