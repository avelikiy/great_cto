import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const moduleUrl = new URL('../../scripts/lib/kimi-review-store.mjs', import.meta.url).href;
let createKimiReviewStore;
try { ({ createKimiReviewStore } = await import(moduleUrl)); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const digest = 'a'.repeat(64);
const baseTime = Date.UTC(2026, 9, 24, 12);
const taskHash = taskId => createHash('sha256').update(taskId).digest('hex');

function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kimi-store-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'repo');
  const operatorRoot = path.join(base, 'operator');
  fs.mkdirSync(root, { mode: 0o700 });
  fs.mkdirSync(operatorRoot, { mode: 0o700 });
  let time = baseTime;
  const store = () => {
    assert.equal(typeof createKimiReviewStore, 'function', 'store implementation is missing');
    return createKimiReviewStore({ root, operatorRoot, now: () => time });
  };
  return { base, root, operatorRoot, store, setTime: value => { time = value; } };
}

const input = (taskId = randomUUID(), requestId = randomUUID()) => ({
  taskId, requestId, bindingDigest: digest, reservationUsd: 0.25,
  metadata: { authority: 'NONE', releaseEligibility: 'NOT_CHECKED', status: 'admitted' },
});
const finished = (costUsd = 0.1) => ({
  status: 'complete', costState: 'known', costUsd, sent: true,
  usage: { promptTokens: 100, completionTokens: 50, reasoningTokens: 0, cacheReadTokens: 0 },
  metadata: { status: 'complete', authority: 'NONE', releaseEligibility: 'NOT_CHECKED' },
  report: { verdict: 'PASS', findings: [] },
});
const operatorPath = f => path.join(f.operatorRoot, 'kimi-review-ledger.json');
const requestPath = (f, token) => path.join(f.root, '.great_cto', 'kimi-review', token.taskHash, token.requestId);
const readLedger = f => JSON.parse(fs.readFileSync(operatorPath(f), 'utf8'));

async function child(code, args) {
  const proc = spawn(process.execPath, ['--input-type=module', '-e', code, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  proc.stdout.on('data', chunk => { stdout += chunk; });
  proc.stderr.on('data', chunk => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => { proc.on('error', reject); proc.on('exit', resolve); });
  return { exitCode, stdout, stderr };
}
const childBegin = `
  const {createKimiReviewStore} = await import(process.argv[1]);
  const s = createKimiReviewStore({root:process.argv[2],operatorRoot:process.argv[3],now:()=>${baseTime}});
  console.log(JSON.stringify(await s.begin(JSON.parse(process.argv[4]))));
`;

test('initial admission persists a private reservation and round-trips its evidence', async t => {
  const f = fixture(t), s = f.store(), request = input('../literal task id');
  assert.equal(fs.existsSync(operatorPath(f)), false);
  const admitted = await s.begin(request);
  assert.equal(admitted.ok, true);
  assert.deepEqual(admitted.token, { version: 1, taskId: request.taskId, taskHash: taskHash(request.taskId),
    requestId: request.requestId, bindingDigest: digest, reservationUsd: 0.25 });
  const read = await s.read(admitted.token);
  assert.equal(read.ok, true);
  assert.equal(read.metadata.authority, 'NONE');
  assert.equal(read.reservation.reservationUsd, 0.25);
  for (const file of [operatorPath(f), path.join(requestPath(f, admitted.token), 'metadata.json')]) {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  }
  assert.equal(fs.statSync(path.dirname(requestPath(f, admitted.token))).mode & 0o777, 0o700);
});

test('construction without explicit roots cannot acquire ambient filesystem capability', () => {
  assert.equal(typeof createKimiReviewStore, 'function');
  assert.throws(() => createKimiReviewStore({}), /root/i);
});

test('invalid UUID, hash, reservation and task shape deny without creating a ledger', async t => {
  const f = fixture(t), s = f.store();
  for (const change of [{ requestId: '../escape' }, { bindingDigest: 'bad' }, { reservationUsd: 0.26 },
    { reservationUsd: 0 }, { taskId: '' }, { taskId: '😀'.repeat(65) }]) {
    assert.equal((await s.begin({ ...input(), ...change })).ok, false);
  }
  assert.equal(fs.existsSync(operatorPath(f)), false);
});

test('corrupt operator bytes are never replaced with an empty budget', async t => {
  const f = fixture(t), s = f.store();
  fs.writeFileSync(operatorPath(f), '{broken ledger', { mode: 0o600 });
  assert.equal((await s.begin(input())).ok, false);
  assert.equal(fs.readFileSync(operatorPath(f), 'utf8'), '{broken ledger');
});

test('unreadable operator mode is denied even when the process can bypass mode bits', async t => {
  const f = fixture(t), s = f.store();
  fs.writeFileSync(operatorPath(f), '{}', { mode: 0o000 });
  assert.equal((await s.begin(input())).ok, false);
  assert.equal(fs.statSync(operatorPath(f)).mode & 0o777, 0);
});

test('active and duplicate task attempts remain denied after process-local store recreation', async t => {
  const f = fixture(t), request = input();
  assert.equal((await f.store().begin(request)).ok, true);
  assert.equal((await f.store().begin(request)).ok, false);
  assert.equal((await f.store().begin(input(request.taskId))).ok, false);
});

test('markSent is durable and a later claimed no-send never frees its hold', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  assert.equal((await s.markSent(token)).ok, true);
  assert.equal((await s.markSent(token)).ok, false);
  assert.equal((await s.finish(token, { status: 'failed', costState: 'not-incurred', costUsd: 0,
    sent: false, metadata: {}, report: null })).ok, true);
  const read = await f.store().read(token);
  assert.equal(read.reservation.costState, 'Unknown');
  assert.equal(read.reservation.reservationUsd, 0.25);
  assert.equal((await f.store().begin(input(token.taskId))).ok, false);
});

test('proven pre-send termination releases its reservation but never allows request replay', async t => {
  const f = fixture(t), s = f.store(), request = input();
  const { token } = await s.begin(request);
  assert.equal((await s.finish(token, { status: 'failed', costState: 'not-incurred', costUsd: 0,
    sent: false, metadata: {}, report: null })).ok, true);
  assert.equal((await s.read(token)).reservation.reservationUsd, 0);
  assert.equal((await s.begin(request)).ok, false);
  assert.equal((await s.begin(input(request.taskId))).ok, true);
});

test('known completion persists a private report and releases only unused reservation', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  const result = await s.finish(token, finished());
  assert.equal(result.ok, true);
  assert.equal(result.privateReportPath, path.join(requestPath(f, token), 'report.json'));
  const read = await f.store().read(token);
  assert.deepEqual(read.report, { verdict: 'PASS', findings: [] });
  assert.equal(read.reservation.costUsd, 0.1);
  assert.equal(read.reservation.reservationUsd, 0);
  assert.equal((await s.finish(token, finished(0))).ok, false);
});

test('known cost above reserve is retained and disables the task', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  assert.equal((await s.finish(token, finished(0.4))).ok, true);
  const read = await s.read(token);
  assert.equal(read.reservation.costUsd, 0.4);
  assert.equal(read.reservation.costState, 'breach');
  assert.equal((await s.begin(input(token.taskId))).ok, false);
});

test('task lifetime cap includes known spend plus the next full reservation', async t => {
  const f = fixture(t), s = f.store(), taskId = randomUUID();
  for (let i = 0; i < 4; i++) {
    const result = await s.begin(input(taskId));
    assert.equal(result.ok, true);
    await s.markSent(result.token);
    await s.finish(result.token, finished(0.25));
  }
  assert.equal((await s.begin(input(taskId))).reasonCode, 'budget-denied');
});

test('day cap includes unresolved holds from other tasks and survives UTC rollover', async t => {
  const f = fixture(t), s = f.store();
  for (let i = 0; i < 20; i++) assert.equal((await s.begin(input())).ok, true);
  assert.equal((await s.begin(input())).reasonCode, 'budget-denied');
  f.setTime(Date.UTC(2026, 10, 1));
  assert.equal((await f.store().begin(input())).reasonCode, 'budget-denied');
});

test('completed daily spend rolls over while monthly spend continues to constrain admission', async t => {
  const f = fixture(t), s = f.store();
  for (let day = 1; day <= 4; day++) {
    f.setTime(Date.UTC(2026, 9, day));
    for (let i = 0; i < 20; i++) {
      const result = await s.begin(input());
      assert.equal(result.ok, true);
      await s.markSent(result.token);
      assert.equal((await s.finish(result.token, finished(0.25))).ok, true);
    }
  }
  f.setTime(Date.UTC(2026, 9, 5));
  assert.equal((await s.begin(input())).reasonCode, 'budget-denied');
  f.setTime(Date.UTC(2026, 10, 1));
  assert.equal((await s.begin(input())).ok, true);
});

test('backward time denies admission instead of opening a fresh period', async t => {
  const f = fixture(t), s = f.store();
  assert.equal((await s.begin(input())).ok, true);
  f.setTime(baseTime - 1);
  assert.equal((await s.begin(input())).reasonCode, 'clock-backward');
});

test('operator lock contention fails fast and never deletes a stale owner lock', async t => {
  const f = fixture(t), s = f.store();
  const lock = operatorPath(f) + '.lock';
  fs.writeFileSync(lock, JSON.stringify({ pid: 2147483647, at: 1 }), { mode: 0o600 });
  const started = performance.now();
  assert.equal((await s.begin(input())).reasonCode, 'lock-contended');
  assert.ok(performance.now() - started < 500);
  assert.equal(fs.existsSync(lock), true);
});

test('task lock contention never reserves operator money and releases its own operator lock', async t => {
  const f = fixture(t), s = f.store(), request = input();
  const dir = path.join(f.root, '.great_cto', 'kimi-review', taskHash(request.taskId));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, 'ledger.json.lock');
  fs.writeFileSync(lock, '{}', { mode: 0o600 });
  assert.equal((await s.begin(request)).reasonCode, 'lock-contended');
  assert.equal(fs.existsSync(operatorPath(f)), false);
  assert.equal(fs.existsSync(operatorPath(f) + '.lock'), false);
  assert.equal(fs.existsSync(lock), true);
});

test('operator ledger symlink and nonregular target cannot redirect writes', async t => {
  const f = fixture(t), s = f.store(), outside = path.join(f.base, 'outside');
  fs.writeFileSync(outside, 'original', { mode: 0o600 });
  fs.symlinkSync(outside, operatorPath(f));
  assert.equal((await s.begin(input())).ok, false);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'original');
  fs.unlinkSync(operatorPath(f));
  fs.mkdirSync(operatorPath(f), { mode: 0o700 });
  assert.equal((await s.begin(input())).ok, false);
});

test('unsafe operator directory and symlink runtime parent deny before unsafe writes', async t => {
  const f = fixture(t), s = f.store();
  fs.chmodSync(f.operatorRoot, 0o777);
  assert.equal((await s.begin(input())).ok, false);
  fs.chmodSync(f.operatorRoot, 0o700);
  const outside = path.join(f.base, 'outside');
  fs.mkdirSync(outside, { mode: 0o700 });
  fs.symlinkSync(outside, path.join(f.root, '.great_cto'));
  assert.equal((await s.begin(input())).ok, false);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('metadata allowlist excludes prompt, raw errors, reasoning and arbitrary nested content', async t => {
  const f = fixture(t), s = f.store();
  const { token } = await s.begin({ ...input(), metadata: { authority: 'NONE', prompt: 'LEAK',
    rawError: 'LEAK', reasoning: 'LEAK', metadataHashes: { models: digest, injected: 'LEAK' },
    usage: { promptTokens: 1, raw: 'LEAK' } } });
  const metadata = fs.readFileSync(path.join(requestPath(f, token), 'metadata.json'), 'utf8');
  assert.equal(metadata.includes('LEAK'), false);
  assert.equal(JSON.parse(metadata).metadataHashes.models, digest);
});

test('report persistence failure retains Unknown full hold and blocks task after restart', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  fs.mkdirSync(path.join(requestPath(f, token), 'report.json'), { mode: 0o700 });
  assert.equal((await s.finish(token, finished())).ok, false);
  const read = await f.store().read(token);
  assert.equal(read.ok, false);
  assert.equal((await f.store().begin(input(token.taskId))).ok, false);
  assert.equal(JSON.stringify(readLedger(f)).includes('Unknown'), true);
});

test('metadata failure after authoritative begin commit leaves full hold and blocks task', async t => {
  const f = fixture(t), s = f.store(), request = input();
  const reqDir = path.join(f.root, '.great_cto', 'kimi-review', taskHash(request.taskId), request.requestId);
  fs.mkdirSync(reqDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(reqDir, 'metadata.json'), { mode: 0o700 });
  assert.equal((await s.begin(request)).ok, false);
  assert.equal((await f.store().begin(input(request.taskId))).ok, false);
  assert.equal(fs.existsSync(operatorPath(f)), true);
});

test('tampered tokens cannot settle, send or read another reservation', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  for (const altered of [{ ...token, taskHash: 'b'.repeat(64) }, { ...token, bindingDigest: 'b'.repeat(64) },
    { ...token, requestId: '../escape' }, { ...token, reservationUsd: 0 }]) {
    assert.equal((await s.markSent(altered)).ok, false);
    assert.equal((await s.finish(altered, finished())).ok, false);
    assert.equal((await s.read(altered)).ok, false);
  }
});

test('independent processes cannot lose operator reservations or duplicate an active task', async t => {
  const f = fixture(t);
  f.store();
  const taskId = randomUUID();
  const results = await Promise.all(Array.from({ length: 8 }, () => child(childBegin,
    [moduleUrl, f.root, f.operatorRoot, JSON.stringify(input(taskId))])));
  for (const result of results) assert.equal(result.exitCode, 0, result.stderr);
  const admitted = results.map(r => JSON.parse(r.stdout)).filter(r => r.ok);
  assert.equal(admitted.length, 1);
  assert.equal((await f.store().read(admitted[0].token)).reservation.reservationUsd, 0.25);
});

test('concurrent independent tasks retain every granted reservation', async t => {
  const f = fixture(t);
  f.store();
  const results = await Promise.all(Array.from({ length: 12 }, () => child(childBegin,
    [moduleUrl, f.root, f.operatorRoot, JSON.stringify(input())])));
  const admitted = results.map(result => {
    assert.equal(result.exitCode, 0, result.stderr);
    return JSON.parse(result.stdout);
  }).filter(result => result.ok);
  assert.ok(admitted.length > 0);
  for (const { token } of admitted) assert.equal((await f.store().read(token)).reservation.reservationUsd, 0.25);
  let further = 0;
  while ((await f.store().begin(input())).ok) further++;
  assert.equal(further + admitted.length, 20);
});

test('process exit immediately after operator commit cannot erase the hold', async t => {
  const f = fixture(t), request = input();
  f.store();
  const code = `
    import fs from 'node:fs';
    const rename = fs.renameSync;
    fs.renameSync = (...args) => {
      const result = rename(...args);
      if (args[1] === process.argv[3] + '/kimi-review-ledger.json') process.exit(81);
      return result;
    };
    ${childBegin}
  `;
  const result = await child(code, [moduleUrl, f.root, f.operatorRoot, JSON.stringify(request)]);
  assert.equal(result.exitCode, 81, result.stderr);
  assert.equal(fs.existsSync(operatorPath(f)), true);
  assert.equal((await f.store().begin(input(request.taskId))).ok, false);
  // Recovery is explicit: the crashed lock is not removed automatically.
  fs.unlinkSync(operatorPath(f) + '.lock');
  const taskLock = path.join(f.root, '.great_cto', 'kimi-review', taskHash(request.taskId), 'ledger.json.lock');
  if (fs.existsSync(taskLock)) fs.unlinkSync(taskLock);
  assert.equal((await f.store().begin(input(request.taskId))).ok, false);
  let remaining = 0;
  while ((await f.store().begin(input())).ok) remaining++;
  assert.equal(remaining, 19);
});

test('contradictory no-send cannot erase a known accounting breach', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  assert.equal((await s.finish(token, { ...finished(0.4), sent: false })).ok, true);
  const read = await s.read(token);
  assert.equal(read.reservation.costUsd, 0.4);
  assert.equal(read.reservation.costState, 'breach');
  assert.equal((await s.begin(input(token.taskId))).ok, false);
});

test('Unknown cost without a not-incurred event retains its pre-send reservation', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  assert.equal((await s.finish(token, { status: 'failed', costState: 'Unknown', costUsd: null,
    sent: false, metadata: {}, report: null })).ok, true);
  assert.equal((await s.read(token)).reservation.reservationUsd, 0.25);
  assert.equal((await s.begin(input(token.taskId))).ok, false);
});

test('negative usage cannot release a known-cost reservation', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  await s.finish(token, { ...finished(), usage: { promptTokens: -1 } });
  assert.equal((await s.read(token)).reservation.reservationUsd, 0.25);
});

test('tokens are value identities independent of JSON property order', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  const reordered = Object.fromEntries(Object.entries(token).reverse());
  assert.equal((await s.markSent(reordered)).ok, true);
  assert.equal((await s.read(reordered)).ok, true);
});

test('a preexisting evidence record cannot be silently overwritten on a fresh ledger', async t => {
  const f = fixture(t), s = f.store(), request = input();
  const reqDir = path.join(f.root, '.great_cto', 'kimi-review', taskHash(request.taskId), request.requestId);
  fs.mkdirSync(reqDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(reqDir, 'metadata.json'), 'existing evidence', { mode: 0o600 });
  assert.equal((await s.begin(request)).ok, false);
  assert.equal(fs.readFileSync(path.join(reqDir, 'metadata.json'), 'utf8'), 'existing evidence');
});

test('final operator write failure cannot turn durable secondary evidence into terminal success', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  const code = `
    import fs from 'node:fs';
    const rename = fs.renameSync;
    let operatorWrites = 0;
    fs.renameSync = (...args) => {
      if (args[1] === process.argv[3] + '/kimi-review-ledger.json' && ++operatorWrites === 2) {
        const error = new Error('PRIVATE_FAULT_MARKER'); error.code = 'EIO'; throw error;
      }
      return rename(...args);
    };
    const {createKimiReviewStore} = await import(process.argv[1]);
    const s = createKimiReviewStore({root:process.argv[2],operatorRoot:process.argv[3],now:()=>${baseTime}});
    console.log(JSON.stringify(await s.finish(JSON.parse(process.argv[4]), JSON.parse(process.argv[5]))));
  `;
  const result = await child(code, [moduleUrl, f.root, f.operatorRoot, JSON.stringify(token), JSON.stringify(finished())]);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, false);
  assert.equal((result.stdout + result.stderr).includes('PRIVATE_FAULT_MARKER'), false);
  const read = await f.store().read(token);
  assert.equal(read.reservation.reservationUsd, 0.25);
  assert.equal(read.metadata.costState, 'Unknown');
  assert.notEqual(read.metadata.status, 'complete');
  assert.equal((await f.store().begin(input(token.taskId))).ok, false);
});

test('an evidence failure retains actual known cost above reservation', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  fs.mkdirSync(path.join(requestPath(f, token), 'report.json'), { mode: 0o700 });
  assert.equal((await s.finish(token, finished(0.6))).ok, false);
  const [record] = readLedger(f).requests;
  assert.equal(record.costUsd, 0.6);
  assert.equal(record.reservationUsd, 0.25);
  assert.equal((await s.begin(input(token.taskId))).ok, false);
});

test('unreadable metadata cannot discard a known breach received after send', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  fs.chmodSync(path.join(requestPath(f, token), 'metadata.json'), 0o000);
  assert.equal((await s.finish(token, finished(0.6))).ok, false);
  assert.equal(readLedger(f).requests[0].costUsd, 0.6);
  assert.equal((await s.begin(input(token.taskId))).ok, false);
});

test('a post-rename sync failure leaves durable recovery fencing instead of granting free budget', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  const code = `
    import fs from 'node:fs';
    const rename = fs.renameSync, sync = fs.fsyncSync;
    let operatorWrites = 0, fault = false;
    fs.renameSync = (...args) => {
      const value = rename(...args);
      if (args[1] === process.argv[3] + '/kimi-review-ledger.json' && ++operatorWrites === 2) fault = true;
      return value;
    };
    fs.fsyncSync = (...args) => {
      if (fault) { fault = false; throw new Error('PRIVATE_SYNC_FAULT'); }
      return sync(...args);
    };
    const {createKimiReviewStore} = await import(process.argv[1]);
    const s = createKimiReviewStore({root:process.argv[2],operatorRoot:process.argv[3],now:()=>${baseTime}});
    console.log(JSON.stringify(await s.finish(JSON.parse(process.argv[4]), JSON.parse(process.argv[5]))));
  `;
  const result = await child(code, [moduleUrl, f.root, f.operatorRoot, JSON.stringify(token), JSON.stringify(finished())]);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, false);
  assert.equal((result.stdout + result.stderr).includes('PRIVATE_SYNC_FAULT'), false);
  assert.equal((await f.store().begin(input(token.taskId))).ok, false);
  assert.equal((await f.store().begin(input())).ok, false);
  assert.equal(readLedger(f).requests[0].reservationUsd, 0.25);
});

test('a successful read persists the observed clock floor across restart', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  f.setTime(baseTime + 1000);
  assert.equal((await s.read(token)).ok, true);
  f.setTime(baseTime + 999);
  assert.equal((await f.store().begin(input())).reasonCode, 'clock-backward');
});

test('JSON null is a corrupt operator ledger rather than initial missing state', async t => {
  const f = fixture(t), s = f.store();
  fs.writeFileSync(operatorPath(f), 'null', { mode: 0o600 });
  assert.equal((await s.begin(input())).ok, false);
  assert.equal(fs.readFileSync(operatorPath(f), 'utf8'), 'null');
});

test('a corrupt task ledger cannot be reset or overwrite its authoritative reservation', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  const taskFile = path.join(path.dirname(requestPath(f, token)), 'ledger.json');
  fs.writeFileSync(taskFile, 'null');
  assert.equal((await s.markSent(token)).ok, false);
  assert.equal(fs.readFileSync(taskFile, 'utf8'), 'null');
  assert.equal(readLedger(f).requests[0].reservationUsd, 0.25);
});

test('corrupt metadata cannot be reclassified as a clean successful report', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  const metadataFile = path.join(requestPath(f, token), 'metadata.json');
  fs.writeFileSync(metadataFile, 'null');
  assert.equal((await s.finish(token, finished(0.6))).ok, false);
  assert.equal(fs.readFileSync(metadataFile, 'utf8'), 'null');
  assert.equal(readLedger(f).requests[0].costUsd, 0.6);
  assert.equal(readLedger(f).requests[0].reservationUsd, 0.25);
});

test('ledger hardlinks and symlink locks never overwrite or unlink the referenced file', async t => {
  const f = fixture(t), s = f.store(), outside = path.join(f.base, 'outside');
  fs.writeFileSync(outside, 'untouched', { mode: 0o600 });
  fs.linkSync(outside, operatorPath(f));
  assert.equal((await s.begin(input())).ok, false);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'untouched');
  fs.unlinkSync(operatorPath(f));
  fs.symlinkSync(outside, operatorPath(f) + '.lock');
  assert.equal((await s.begin(input())).ok, false);
  assert.equal(fs.lstatSync(operatorPath(f) + '.lock').isSymbolicLink(), true);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'untouched');
});

test('missing, partial and impossible usage never releases a known-cost hold', async t => {
  const f = fixture(t), s = f.store();
  for (const usage of [null, {}, { promptTokens: 1 },
    { promptTokens: 100, completionTokens: 50, reasoningTokens: 51, cacheReadTokens: 0 },
    { promptTokens: 100, completionTokens: 50, reasoningTokens: 0, cacheReadTokens: 101 }]) {
    const { token } = await s.begin(input());
    await s.markSent(token);
    await s.finish(token, { ...finished(), usage });
    assert.equal((await s.read(token)).reservation.costState, 'Unknown');
    assert.equal((await s.read(token)).reservation.reservationUsd, 0.25);
  }
});

test('usage provenance retains explicit absent provider cost without inventing zero', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  await s.finish(token, { ...finished(), usage: { ...finished().usage,
    providerReportedCost: null, calculatedCostUsd: 0.1, costProvenance: 'pinned-rates' } });
  const read = await s.read(token);
  assert.equal(read.metadata.usage.providerReportedCost, null);
  assert.equal(read.metadata.usage.calculatedCostUsd, 0.1);
  assert.equal(read.metadata.usage.costProvenance, 'pinned-rates');
});

test('a durably completed advisory with Unknown cost keeps its completed evidence and full hold', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  const outcome = { ...finished(), costState: 'Unknown', costUsd: null, usage: null };
  assert.equal((await s.finish(token, outcome)).ok, true);
  const read = await f.store().read(token);
  assert.equal(read.metadata.status, 'complete');
  assert.equal(read.metadata.costState, 'Unknown');
  assert.equal(read.reservation.reservationUsd, 0.25);
  assert.deepEqual(read.report, { verdict: 'PASS', findings: [] });
  assert.equal((await f.store().begin(input(token.taskId))).ok, false);
});

test('post-commit report modification fails its durable evidence binding', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  await s.finish(token, finished());
  fs.writeFileSync(path.join(requestPath(f, token), 'report.json'), JSON.stringify({ verdict: 'BLOCK', findings: [] }));
  assert.equal((await f.store().read(token)).ok, false);
});

test('new operator directory must sync its parent before reservation admission', async t => {
  const f = fixture(t);
  f.store();
  fs.rmdirSync(f.operatorRoot);
  const code = `
    import fs from 'node:fs';
    import path from 'node:path';
    const open = fs.openSync, close = fs.closeSync, sync = fs.fsyncSync;
    const handles = new Map();
    fs.openSync = (...args) => { const fd = open(...args); handles.set(fd, args[0]); return fd; };
    fs.closeSync = fd => { handles.delete(fd); return close(fd); };
    fs.fsyncSync = fd => {
      if (handles.get(fd) === path.dirname(process.argv[3])) throw new Error('PRIVATE_PARENT_SYNC_FAULT');
      return sync(fd);
    };
    ${childBegin}
  `;
  const result = await child(code, [moduleUrl, f.root, f.operatorRoot, JSON.stringify(input())]);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, false);
  assert.equal((result.stdout + result.stderr).includes('PRIVATE_PARENT_SYNC_FAULT'), false);
  assert.equal(fs.existsSync(operatorPath(f)), false);
});

test('complete raw OpenRouter usage settles known spend and preserves token components', async t => {
  const f = fixture(t), s = f.store(), taskId = randomUUID();
  const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150,
    prompt_tokens_details: { cached_tokens: 25 }, completion_tokens_details: { reasoning_tokens: 10 }, cost: 0.25 };
  for (let i = 0; i < 4; i++) {
    const { token } = await s.begin(input(taskId));
    await s.markSent(token);
    assert.equal((await s.finish(token, { ...finished(0.25), usage })).ok, true);
    const read = await s.read(token);
    assert.equal(read.reservation.reservationUsd, 0);
    assert.equal(read.reservation.costState, 'known');
    assert.equal(read.metadata.usage.promptTokens, 100);
    assert.equal(read.metadata.usage.completionTokens, 50);
    assert.equal(read.metadata.usage.cacheReadTokens, 25);
    assert.equal(read.metadata.usage.reasoningTokens, 10);
    assert.equal(read.metadata.usage.providerReportedCost, 0.25);
  }
  assert.equal((await s.begin(input(taskId))).reasonCode, 'budget-denied');
});

test('partial, negative and inconsistent raw usage always retains Unknown full hold', async t => {
  const f = fixture(t), s = f.store();
  const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150,
    prompt_tokens_details: { cached_tokens: 25 }, completion_tokens_details: { reasoning_tokens: 10 }, cost: 0.1 };
  for (const partial of [
    { ...usage, prompt_tokens_details: {} }, { ...usage, completion_tokens_details: {} },
    { ...usage, prompt_tokens: -1 }, { ...usage, total_tokens: 151 },
    { ...usage, completion_tokens_details: { reasoning_tokens: 51 } },
    { ...usage, prompt_tokens_details: { cached_tokens: 101 } }, { ...usage, cost: -1 },
  ]) {
    const { token } = await s.begin(input());
    await s.markSent(token);
    await s.finish(token, { ...finished(), usage: partial });
    const read = await s.read(token);
    assert.equal(read.reservation.reservationUsd, 0.25);
    assert.equal(read.reservation.costState, 'Unknown');
  }
});

const evidenceV2 = (responseState = 'validated') => ({ evidenceVersion: 2, responseState,
  deadlineMs: 1000, validatedElapsedMs: responseState === 'validated' ? 1001.5 : null,
  callerOutcome: 'not-recorded' });
const validated = () => ({ ...finished(), status: 'validated', metadata: { ...finished().metadata,
  ...evidenceV2(), status: 'validated', reasonCode: 'response-validated' } });

test('validated v2 evidence settles accounting without recording caller delivery on restart', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin({ ...input(), metadata: evidenceV2('incomplete') });
  await s.markSent(token);
  assert.equal((await s.finish(token, validated())).ok, true);
  const metadataFile = path.join(requestPath(f, token), 'metadata.json');
  const before = fs.readFileSync(metadataFile);
  const read = await f.store().read(token);
  assert.equal(read.metadata.evidenceVersion, 2);
  assert.equal(read.metadata.status, 'validated');
  assert.equal(read.metadata.reasonCode, 'response-validated');
  assert.equal(read.metadata.responseState, 'validated');
  assert.equal(read.metadata.validatedElapsedMs, 1001.5);
  assert.equal(read.metadata.callerOutcome, 'not-recorded');
  assert.equal(read.reservation.state, 'complete');
  assert.equal(read.reservation.costUsd, 0.1);
  assert.equal(read.reservation.reservationUsd, 0);
  assert.deepEqual(fs.readFileSync(metadataFile), before);
});

test('validated evidence without a real report never releases known-cost reservation', async t => {
  for (const report of [null, [], 'not a report']) {
    const f = fixture(t), s = f.store(), { token } = await s.begin(input());
    await s.markSent(token);
    await s.finish(token, { ...validated(), report });
    const record = readLedger(f).requests[0];
    assert.equal(record.state, 'Unknown');
    assert.equal(record.costUsd, 0.1);
    assert.equal(record.reservationUsd, 0.25);
  }
});

test('validated private report with incomplete usage retains its full hold and evidence', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token);
  assert.equal((await s.finish(token, { ...validated(), usage: null })).ok, true);
  const read = await f.store().read(token);
  assert.equal(read.metadata.responseState, 'validated');
  assert.equal(read.metadata.callerOutcome, 'not-recorded');
  assert.equal(read.reservation.reservationUsd, 0.25);
  assert.deepEqual(read.report, validated().report);
});

test('unsupported or malformed evidence versions fail closed before admission', async t => {
  const f = fixture(t), s = f.store();
  for (const change of [{ evidenceVersion: 3 }, { evidenceVersion: '2' }, { responseState: 'complete' },
    { callerOutcome: 'complete' }, { deadlineMs: 180001 }, { deadlineMs: 0 },
    { validatedElapsedMs: -1 }, { validatedElapsedMs: Infinity }, { responseState: 'invalid' }]) {
    const result = await s.begin({ ...input(), metadata: { ...evidenceV2(), ...change } });
    assert.equal(result.ok, false, JSON.stringify(change));
  }
  assert.equal(fs.existsSync(operatorPath(f)), false);
});

test('legacy evidence keeps original bytes and hashes without a new delivery claim', async t => {
  const f = fixture(t), s = f.store(), { token } = await s.begin(input());
  await s.markSent(token); await s.finish(token, finished());
  const files = ['metadata.json', 'report.json'].map(name => path.join(requestPath(f, token), name));
  const before = files.map(file => fs.readFileSync(file));
  const evidence = structuredClone(readLedger(f).requests[0].evidence);
  const read = await f.store().read(token);
  assert.equal(read.ok, true); assert.equal(read.metadata.evidenceVersion, undefined);
  assert.deepEqual(files.map(file => fs.readFileSync(file)), before);
  assert.deepEqual(read.reservation.evidence, evidence);
});
