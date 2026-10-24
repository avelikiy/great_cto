import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listCodexRuns } from '../../scripts/lib/codex-host-state.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-list-output-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'project'), store = join(dir, 'runs');
  mkdirSync(root); mkdirSync(store, { mode: 0o700 });
  for (let n = 0; n < 24; n++) {
    const id = randomUUID();
    writeFileSync(join(store, `${id}.json`), JSON.stringify({
      version: 1, id, root, status: 'done', results: {}, queue: [],
    }), { mode: 0o600 });
  }
  const listing = listCodexRuns({ root, store });
  return { dir, root, store, listing };
}

test('controller list flushes complete JSON larger than 8192 bytes through a pipe', t => {
  const { root, store, listing } = fixture(t);
  const expected = JSON.stringify(listing, null, 2) + '\n';
  const expectedBytes = Buffer.byteLength(expected);
  assert.ok(expectedBytes > 8192, 'fixture must exceed the observed pipe truncation boundary');
  const controller = fileURLToPath(new URL('../../scripts/codex-pipeline.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [controller, 'list', '--dir', root], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, GREAT_CTO_CODEX_RUNS_DIR: store },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(Buffer.byteLength(result.stdout), expectedBytes, 'list must flush every JSON byte before exiting');
  assert.equal(result.stdout, expected);
});

test('daily status flushes complete JSON larger than 8192 bytes through a pipe', t => {
  const { dir, root, store, listing } = fixture(t);
  const expected = JSON.stringify({ schemaVersion: 1, state: listing.state, runs: listing.runs, tasks: [] }, null, 2) + '\n';
  const expectedBytes = Buffer.byteLength(expected);
  assert.ok(expectedBytes > 8192, 'fixture must exceed the observed pipe truncation boundary');
  const cli = fileURLToPath(new URL('../../packages/cli/index.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'status', '--host', 'codex', '--json', '--dir', root], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, GREAT_CTO_CODEX_RUNS_DIR: store, GREAT_CTO_TASKS_DIR: join(dir, 'tasks'),
      DO_NOT_TRACK: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(Buffer.byteLength(result.stdout), expectedBytes, 'status must flush every JSON byte before exiting');
  assert.equal(result.stdout, expected);
});
