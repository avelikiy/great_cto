import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { graphBinding } from '../../scripts/lib/host-graph-observer.mjs';
import { appendHostGraphEvent } from '../../scripts/lib/host-graph-journal.mjs';
import { bindNativeGraph } from '../../scripts/lib/host-graph-bindings.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'gcto-graph-special-'))), root = join(tmp, 'project'); mkdirSync(root);
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  return { tmp, root, store: join(tmp, 'store'), sessionId: randomUUID() };
}
function child(source, input) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', source, JSON.stringify(input)], { timeout: 2000, killSignal: 'SIGKILL', encoding: 'utf8' });
}
test('journal rejects FIFO records without blocking the read-side event loop', { skip: process.platform === 'win32' ? 'POSIX special-file scenario' : false }, t => {
  const f = fixture(t), binding = graphBinding({ root: f.root, host: 'codex', runId: f.sessionId, sessionId: f.sessionId });
  appendHostGraphEvent(binding, { schemaVersion: 1, id: digest('fixture'), host: 'codex', mode: 'native', kind: 'session', phase: 'started', outcome: 'unknown', sessionId: f.sessionId, parentIds: [], observedAt: new Date().toISOString() }, { store: f.store });
  const file = join(f.store, readdirSync(f.store).find(n => n.endsWith('.jsonl'))); rmSync(file); execFileSync('mkfifo', [file]);
  const module = pathToFileURL(resolve('scripts/lib/host-graph-journal.mjs')).href;
  const result = child(`import {readHostGraph} from ${JSON.stringify(module)};const x=JSON.parse(process.argv[1]);process.exit(readHostGraph(x.binding,{store:x.store}).health==='degraded'?0:5)`, { binding, store: f.store });
  assert.equal(result.status, 0, 'non-regular records must be refused before a blocking read');
});
test('native enrollment rejects FIFO metadata without blocking the read-side event loop', { skip: process.platform === 'win32' ? 'POSIX special-file scenario' : false }, t => {
  const f = fixture(t); bindNativeGraph({ root: f.root, host: 'codex', sessionId: f.sessionId }, f);
  const file = join(f.store, readdirSync(f.store).find(n => n.endsWith('.json'))); rmSync(file); execFileSync('mkfifo', [file]);
  const module = pathToFileURL(resolve('scripts/lib/host-graph-bindings.mjs')).href;
  const result = child(`import {nativeGraphObservations} from ${JSON.stringify(module)};const x=JSON.parse(process.argv[1]);try{nativeGraphObservations(x.root,{store:x.store});process.exit(5)}catch{process.exit(0)}`, { root: f.root, store: f.store });
  assert.equal(result.status, 0, 'non-regular enrollment must be refused before a blocking read');
});
