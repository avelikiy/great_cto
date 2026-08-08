// A verdict is state about the PROJECT, not about a checkout of it.
//
// Agents run in git worktrees under .claude/worktrees/, each with its own
// .great_cto/. Three runs in a row wrote their verdict there: the pipeline reads
// the main tree, saw nothing, named no next stage, and a human copied the file
// across by hand every time. The worktree is then removed with the verdict
// inside it. Once the work was 105 passing tests the pipeline could not see.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts/log-verdict.sh');
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** A tiny repo with one linked worktree — the shape agents actually run in. */
function repoWithWorktree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-wt-'));
  const main = path.join(root, 'main');
  fs.mkdirSync(main, { recursive: true });
  git(['init', '-q', '-b', 'main'], main);
  git(['config', 'user.email', 't@example.com'], main);
  git(['config', 'user.name', 'T'], main);
  fs.mkdirSync(path.join(main, '.great_cto'), { recursive: true });
  fs.writeFileSync(path.join(main, '.great_cto', 'PROJECT.md'), 'primary: devtools\n');
  fs.writeFileSync(path.join(main, 'README.md'), 'x\n');
  git(['add', '-A'], main);
  git(['commit', '-qm', 'init'], main);
  const wt = path.join(root, 'wt-1786206189-78666');
  git(['worktree', 'add', '-q', wt, 'HEAD'], main);
  return { root, main, wt };
}
const clean = (r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch {} };
const readVerdict = (dir, agent) => {
  const p = path.join(dir, '.great_cto', 'verdicts', `${agent}.log`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8').trim().split('\n').pop()) : null;
};

test('a verdict written from a worktree lands in the main tree', () => {
  const { root, main, wt } = repoWithWorktree();
  try {
    execFileSync('bash', [SCRIPT, 'senior-dev', 'TASK_DONE', '0', 'task=t1'], { cwd: wt, stdio: 'ignore' });
    assert.equal(readVerdict(wt, 'senior-dev'), null, 'nothing is left in the worktree, which is about to be deleted');
    assert.equal(readVerdict(main, 'senior-dev')?.verdict, 'TASK_DONE');
  } finally { clean(root); }
});

test('the project slug is the project, not the checkout', () => {
  // `basename $(pwd)` inside a worktree gives `wt-1786206189-78666` — a value no
  // project-scoped query matches, and one that reads as a different project.
  const { root, main, wt } = repoWithWorktree();
  try {
    execFileSync('bash', [SCRIPT, 'senior-dev', 'TASK_DONE', '0', 'task=t1'], { cwd: wt, stdio: 'ignore' });
    assert.equal(readVerdict(main, 'senior-dev').project, 'main');
  } finally { clean(root); }
});

test('a verdict written from the main tree is unaffected', () => {
  const { root, main } = repoWithWorktree();
  try {
    execFileSync('bash', [SCRIPT, 'qa-engineer', 'PASS', '0', 'task=t2'], { cwd: main, stdio: 'ignore' });
    assert.equal(readVerdict(main, 'qa-engineer')?.verdict, 'PASS');
  } finally { clean(root); }
});

test('an explicit GREAT_CTO_DIR still wins — naming a directory means it', () => {
  const { root, main, wt } = repoWithWorktree();
  try {
    execFileSync('bash', [SCRIPT, 'senior-dev', 'TASK_DONE', '0'], {
      cwd: wt, stdio: 'ignore', env: { ...process.env, GREAT_CTO_DIR: '.great_cto' },
    });
    assert.ok(readVerdict(wt, 'senior-dev'), 'the override is honoured even when it is the worse choice');
  } finally { clean(root); }
});

test('outside a git repository nothing is redirected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-nogit-'));
  try {
    execFileSync('bash', [SCRIPT, 'senior-dev', 'TASK_DONE', '0'], { cwd: dir, stdio: 'ignore' });
    assert.ok(readVerdict(dir, 'senior-dev'), 'a plain directory keeps its own .great_cto');
  } finally { clean(dir); }
});
