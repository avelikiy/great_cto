// INV-013: docs/INVARIANTS.md changes only in the open.
//
// Weakening a rule in that file reads exactly like rewording it, so the pre-push
// hook refuses a commit that edits it without naming the invariants it changed —
// `INVARIANT-CHANGE(INV-NNN)` in that commit's own message. Each case pushes to a
// real bare remote with the real hook installed.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, chmodSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'hooks', 'pre-push.sh');
const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true }); });

const git = (cwd, args, env = {}) => spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'prepush-inv-'));
  TMP.push(root);
  const home = join(root, 'home');
  const bare = join(root, 'remote.git');
  const work = join(root, 'work');
  mkdirSync(join(home, '.great_cto'), { recursive: true });
  // Synthetic private terms only — the privacy scan runs too and must stay quiet.
  writeFileSync(join(home, '.great_cto', 'private-terms'), '# synthetic fixtures\nZephyrite\n');
  spawnSync('git', ['init', '--bare', bare], { encoding: 'utf8' });
  spawnSync('git', ['init', '-b', 'main', work], { encoding: 'utf8' });
  git(work, ['config', 'user.email', 't@e.x']);
  git(work, ['config', 'user.name', 'T']);
  git(work, ['remote', 'add', 'origin', bare]);
  mkdirSync(join(work, 'docs'), { recursive: true });
  writeFileSync(join(work, 'docs/INVARIANTS.md'), '# Invariants\n\n- **INV-001** a rule.\n  verify: none yet — fixture\n');
  writeFileSync(join(work, 'README.md'), 'hello\n');
  git(work, ['add', '-A']);
  git(work, ['commit', '-m', 'init']);
  assert.equal(git(work, ['push', 'origin', 'main'], { HOME: home }).status, 0, 'baseline push without the hook');
  const dest = join(work, '.git', 'hooks', 'pre-push');
  copyFileSync(HOOK_SRC, dest);
  chmodSync(dest, 0o755);
  return { home, work };
}

function change(work, file, content, msg) {
  writeFileSync(join(work, file), content);
  git(work, ['add', '-A']);
  return git(work, ['commit', '-m', msg]);
}

const push = (work, home) => git(work, ['push', 'origin', 'main'], { HOME: home });

test('editing the invariants without a marker is refused, and says what to add', () => {
  const { home, work } = setup();
  change(work, 'docs/INVARIANTS.md', '# Invariants\n\n- **INV-001** a softer rule.\n  verify: none yet — fixture\n', 'docs: tidy wording');
  const r = push(work, home);
  assert.notEqual(r.status, 0, `expected BLOCKED:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /edits docs\/INVARIANTS\.md without naming what it changed/);
  assert.match(r.stderr, /INVARIANT-CHANGE\(INV-NNN\)/);
});

test('the same edit with INVARIANT-CHANGE(INV-001) goes through', () => {
  const { home, work } = setup();
  change(work, 'docs/INVARIANTS.md', '# Invariants\n\n- **INV-001** a clearer rule.\n  verify: none yet — fixture\n',
    'docs: clarify INV-001\n\nINVARIANT-CHANGE(INV-001)');
  const r = push(work, home);
  assert.equal(r.status, 0, `expected ALLOWED:\n${r.stdout}\n${r.stderr}`);
});

test('several ids in one marker are accepted', () => {
  const { home, work } = setup();
  change(work, 'docs/INVARIANTS.md', '# Invariants\n\n- **INV-001** a rule.\n  verify: none yet — fixture\n- **INV-002** another.\n  verify: none yet — fixture\n',
    'docs: add INV-002\n\nINVARIANT-CHANGE(INV-001, INV-002)');
  assert.equal(push(work, home).status, 0);
});

test('a push that does not touch the file is untouched by the check', () => {
  const { home, work } = setup();
  change(work, 'README.md', 'hello again\n', 'docs: readme');
  assert.equal(push(work, home).status, 0);
});

test('a marker in a neighbouring commit does not cover the commit that edits the file', () => {
  const { home, work } = setup();
  change(work, 'README.md', 'x\n', 'chore: prepare\n\nINVARIANT-CHANGE(INV-001)');
  change(work, 'docs/INVARIANTS.md', '# Invariants\n\n- **INV-001** changed.\n  verify: none yet — fixture\n', 'docs: quietly change a rule');
  const r = push(work, home);
  assert.notEqual(r.status, 0, 'the marker has to be on the commit that makes the change');
});
