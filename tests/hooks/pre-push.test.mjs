// tests/hooks/pre-push.test.mjs — Integration tests for scripts/hooks/pre-push.sh
//
// Verifies the v2.37.1 range fix: a new branch that descends from already-pushed
// history must scan ONLY its new commits, not the entire history. A private term
// in an OLD (already-pushed) commit must NOT block; a term in a NEW commit must.
//
// Run: node --test tests/hooks/pre-push.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, chmodSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_SRC = join(__dirname, '..', '..', 'scripts', 'hooks', 'pre-push.sh');

function git(cwd, args, env = {}) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}

/**
 * Build a work repo + bare remote. `home` isolates the hook's stats writes.
 * Returns { work, bare, home }.
 */
function setupRepo() {
  const root = mkdtempSync(join(tmpdir(), 'prepush-'));
  const home = join(root, 'home');
  const bare = join(root, 'remote.git');
  const work = join(root, 'work');
  mkdirSync(home, { recursive: true });
  spawnSync('git', ['init', '--bare', bare], { encoding: 'utf8' });
  spawnSync('git', ['init', '-b', 'main', work], { encoding: 'utf8' });
  const cfg = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@e.x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@e.x' };
  git(work, ['config', 'user.email', 't@e.x']);
  git(work, ['config', 'user.name', 'T']);
  git(work, ['remote', 'add', 'origin', bare]);
  return { root, home, bare, work, cfg };
}

function commit(work, cfg, file, content, msg) {
  writeFileSync(join(work, file), content);
  git(work, ['add', '-A'], cfg);
  return git(work, ['commit', '-m', msg], cfg);
}

function installHook(work) {
  const dest = join(work, '.git', 'hooks', 'pre-push');
  copyFileSync(HOOK_SRC, dest);
  chmodSync(dest, 0o755);
}

// Marker the stub touches whenever it actually runs — lets us assert that the
// skip flag short-circuits BEFORE node is invoked.
const RAN_MARKER = join('scripts', '.summary-stub-ran');

/**
 * Drop a fake scripts/generate-summary.mjs into the work repo so the hook's
 * summary-freshness block has something to invoke.
 *   mode 'stale' → prints "⚠ stale" and exits 2 (summaries out of date)
 *   mode 'hang'  → touches the marker then blocks forever (tests the timeout)
 * The file always touches RAN_MARKER first, so its absence proves node never ran.
 */
function installSummaryStub(work, mode) {
  mkdirSync(join(work, 'scripts'), { recursive: true });
  const body =
    `import { writeFileSync } from 'node:fs';\n` +
    `writeFileSync(${JSON.stringify(RAN_MARKER)}, '1');\n` +
    (mode === 'hang'
      ? `setInterval(() => {}, 1 << 30); // hang forever\n`
      : `process.stdout.write('  ⚠ stale: docs/architecture/ARCH-x.md\\n');\nprocess.exit(2);\n`);
  writeFileSync(join(work, 'scripts', 'generate-summary.mjs'), body);
}

function ranMarkerPath(work) {
  return join(work, RAN_MARKER);
}

// Push runs the local pre-push hook; HOME is isolated so its stats writes don't leak.
function push(work, home, ref, env = {}) {
  return git(work, ['push', 'origin', ref], { HOME: home, ...env });
}

test('new branch: private term only in already-pushed history → PUSH ALLOWED (the fix)', () => {
  const { home, work, cfg } = setupRepo();

  // A: contains a private term, pushed to origin/main BEFORE the hook exists.
  commit(work, cfg, 'a.txt', 'hello', 'feat: wire up Cueinbox sync');
  assert.equal(push(work, home, 'main').status, 0, 'baseline push should succeed (no hook yet)');

  // Now install the hook and branch off the pushed history with a CLEAN commit.
  installHook(work);
  git(work, ['checkout', '-b', 'feature/clean'], cfg);
  commit(work, cfg, 'b.txt', 'clean content', 'feat: add unrelated clean feature');

  const res = push(work, home, 'feature/clean');
  assert.equal(res.status, 0,
    `Expected ALLOWED (history must not be scanned). stdout+stderr:\n${res.stdout}\n${res.stderr}`);
  assert.ok(!/LEAK DETECTED/.test(res.stdout + res.stderr), 'must not flag the historical term');
});

test('new branch: private term in a NEW commit → PUSH BLOCKED (still catches real leaks)', () => {
  const { home, work, cfg } = setupRepo();

  commit(work, cfg, 'a.txt', 'hello', 'init clean');
  assert.equal(push(work, home, 'main').status, 0);

  installHook(work);
  git(work, ['checkout', '-b', 'feature/leak'], cfg);
  commit(work, cfg, 'c.txt', 'clean body', 'feat: integrate Killbot engine'); // leak in NEW commit msg

  const res = push(work, home, 'feature/leak');
  assert.notEqual(res.status, 0, 'Expected BLOCKED for a new private-term commit');
  assert.ok(/LEAK DETECTED/.test(res.stdout + res.stderr), 'must report the leak');
});

test('new branch: private term in NEW diff content → PUSH BLOCKED', () => {
  const { home, work, cfg } = setupRepo();

  commit(work, cfg, 'a.txt', 'hello', 'init clean');
  assert.equal(push(work, home, 'main').status, 0);

  installHook(work);
  git(work, ['checkout', '-b', 'feature/diff-leak'], cfg);
  commit(work, cfg, 'd.txt', 'connecting to Minctrl backend', 'feat: clean message');

  const res = push(work, home, 'feature/diff-leak');
  assert.notEqual(res.status, 0, 'Expected BLOCKED for private term in diff');
  assert.ok(/LEAK DETECTED/.test(res.stdout + res.stderr));
});

// ── Summary-freshness block: must be warn-only by default and never hang ──────

function setupCleanBranch(name) {
  const ctx = setupRepo();
  commit(ctx.work, ctx.cfg, 'a.txt', 'hello', 'init clean');
  assert.equal(push(ctx.work, ctx.home, 'main').status, 0);
  installHook(ctx.work);
  git(ctx.work, ['checkout', '-b', name], ctx.cfg);
  return ctx;
}

test('summary: stale + default → WARN-ONLY, push ALLOWED', () => {
  const { home, work, cfg } = setupCleanBranch('feature/warn');
  installSummaryStub(work, 'stale');
  commit(work, cfg, 'b.txt', 'clean', 'feat: clean work');

  const res = push(work, home, 'feature/warn');
  assert.equal(res.status, 0, `Expected ALLOWED (warn-only). out:\n${res.stdout}\n${res.stderr}`);
  assert.ok(/warn-only/.test(res.stdout + res.stderr), 'must print the warn-only notice');
  assert.ok(existsSync(ranMarkerPath(work)), 'checker should have run');
});

test('summary: stale + GREAT_CTO_ENFORCE_SUMMARY=1 → PUSH BLOCKED', () => {
  const { home, work, cfg } = setupCleanBranch('feature/enforce');
  installSummaryStub(work, 'stale');
  commit(work, cfg, 'b.txt', 'clean', 'feat: clean work');

  const res = push(work, home, 'feature/enforce', { GREAT_CTO_ENFORCE_SUMMARY: '1' });
  assert.notEqual(res.status, 0, 'Expected BLOCKED in enforce mode');
  assert.ok(/Stale artifact summaries/.test(res.stdout + res.stderr));
});

test('summary: GREAT_CTO_SKIP_SUMMARY_CHECK=1 short-circuits BEFORE node (even in enforce mode)', () => {
  const { home, work, cfg } = setupCleanBranch('feature/skip');
  installSummaryStub(work, 'stale');
  commit(work, cfg, 'b.txt', 'clean', 'feat: clean work');

  const res = push(work, home, 'feature/skip', {
    GREAT_CTO_SKIP_SUMMARY_CHECK: '1',
    GREAT_CTO_ENFORCE_SUMMARY: '1', // even with enforce on, skip wins
  });
  assert.equal(res.status, 0, `Expected ALLOWED via skip flag. out:\n${res.stdout}\n${res.stderr}`);
  assert.ok(/Skipping summary freshness check/.test(res.stdout + res.stderr));
  assert.ok(!existsSync(ranMarkerPath(work)),
    'node must NOT run when skip flag is set (short-circuit before invocation)');
});

test('summary: a hanging checker cannot stall the push (hard timeout, enforce mode)', () => {
  const { home, work, cfg } = setupCleanBranch('feature/hang');
  installSummaryStub(work, 'hang');
  commit(work, cfg, 'b.txt', 'clean', 'feat: clean work');

  const t0 = Date.now();
  const res = push(work, home, 'feature/hang', {
    GREAT_CTO_ENFORCE_SUMMARY: '1',
    GREAT_CTO_SUMMARY_TIMEOUT: '3',
  });
  const elapsedMs = Date.now() - t0;

  assert.equal(res.status, 0, `Expected ALLOWED after timeout. out:\n${res.stdout}\n${res.stderr}`);
  assert.ok(/timed out/.test(res.stdout + res.stderr), 'must report the timeout');
  assert.ok(elapsedMs < 20000, `push must return promptly, took ${elapsedMs}ms`);
});
