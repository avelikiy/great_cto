import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdtempSync, realpathSync, lstatSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('helper import preserves an independently owned matching-prefix process and root', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'gcto-gate-preservation-'))), identity = lstatSync(root);
  writeFileSync(join(root, 'sentinel'), 'preserve');
  const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready\\n");setInterval(()=>{},1000)'], { cwd: root, stdio: ['ignore','pipe','pipe'], detached: true });
  const closed = new Promise(resolve => child.once('close', resolve));
  try {
    await once(child.stdout, 'data');
    const helper = await import('./reap.mjs');
    assert.equal(helper.sweepStrays, undefined, 'prefix sweeping must not be an available API');
    assert.equal(child.exitCode, null); assert.equal(child.signalCode, null);
    assert.equal(existsSync(root), true); assert.equal(readFileSync(join(root, 'sentinel'), 'utf8'), 'preserve');
    const board = readFileSync(fileURLToPath(new URL('../board-gate.test.mjs', import.meta.url)), 'utf8');
    assert.ok(!board.includes('sweepStrays'));
    assert.ok(board.includes('fixture.cleanup()'));
    assert.ok(board.includes("assert.equal(result, 'reaped'"));
  } finally {
    const { reap } = await import('./reap.mjs');
    assert.equal(await reap(child), 'reaped', 'owned test process did not stop; root retained');
    await closed;
    const current = lstatSync(root);
    assert.equal(current.ino, identity.ino); assert.equal(current.dev, identity.dev);
    rmSync(root, { recursive: true, force: true });
  }
});
