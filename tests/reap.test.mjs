// The helper itself, and the mistake it was born from.
//
// The first version returned early when the DIRECT child had already exited —
// and `great-cto board` is a launcher that exits as soon as its server is up,
// so that early return skipped the group kill on every call. Every board in the
// suite stayed alive holding its port and the next test hung instead of failing:
// a fix meant to end "just run it again" produced a hang you could only diagnose
// by running it again.
//
// Whether the direct child is gone decides only whether there is anything left
// to wait for. It never decides whether to kill the group.
//
// This file sits in tests/ rather than tests/helpers/ because ci-local globs
// `tests/*.test.mjs` — a test one directory deeper is a test nobody runs, which
// this session had already shipped once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { reap } from './helpers/reap.mjs';

const groupAlive = (pgid) => {
  try { process.kill(-pgid, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
};

// A launcher: spawns something long-lived into its own group, then exits — the
// exact shape of `great-cto board`.
function launcher() {
  return spawn(process.execPath, ['-e',
    "require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1e3)'],{stdio:'ignore'});"
    + 'process.exit(0);'], { detached: true, stdio: 'ignore' });
}

const settle = async (child) => {
  for (let i = 0; i < 60 && child.exitCode === null; i++) await new Promise((r) => setTimeout(r, 50));
};

test('reap does not return while the group still has members', async () => {
  const child = launcher();
  await settle(child);
  assert.equal(groupAlive(child.pid), true, 'the grandchild holds the group open');

  assert.equal(await reap(child), 'reaped');
  assert.equal(groupAlive(child.pid), false, 'the group must be empty before reap returns');
});

test('a child that already exited still gets its group killed', async () => {
  // The exact regression: the launcher is gone in milliseconds, the work is not.
  const child = launcher();
  await settle(child);
  assert.notEqual(child.exitCode, null, 'the launcher has exited — this is the case that regressed');
  assert.equal(groupAlive(child.pid), true, 'and its group has not');

  await reap(child);
  assert.equal(groupAlive(child.pid), false, 'an exited child is not a reason to skip the group kill');
});

test('reap answers honestly when there is nothing to reap', async () => {
  assert.equal(await reap(null), 'no-group');
  assert.equal(await reap({ pid: 999999 }, { timeoutMs: 50 }), 'reaped', 'a pid with no group is already clear');
});
