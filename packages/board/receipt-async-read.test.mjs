import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import { randomUUID } from 'node:crypto';
import { treeReceipt, compareReceipts } from '../../scripts/lib/receipt.mjs';
import { secondOpinionForTree } from '../../scripts/lib/second-opinion-for-tree.mjs';
import { issueTokensAsync, readTokens, consumeToken, checkToken, approvalSnapshot, beginGateDecision } from './lib/gate-tokens.mjs';
import { readBindingReceipt, readApprovalReceipt, readSecondOpinion } from './lib/receipt-read.mjs';
const realGit = execFileSync('/usr/bin/which', ['git'], { encoding: 'utf8' }).trim();
const server = process.env.TEST_BOARD_SERVER || fileURLToPath(new URL('./server.mjs', import.meta.url));
const startupTraceFixture = fileURLToPath(new URL('./fixtures/receipt-startup-trace.cjs', import.meta.url));
const startupTraceEvents = new Set(['process-entry', 'spawn-start', 'spawn-return', 'spawn-error', 'fork-start', 'fork-return', 'fork-error', 'child-spawn', 'child-error', 'child-exit', 'child-close', 'exec-start', 'exec-end', 'exec-error', 'kill-start', 'kill-end', 'kill-error', 'git-held-written']);
const startupTraceRoles = new Set(['supervisor', 'receipt-worker', 'git-fixture', 'other']);
const startupTraceErrors = new Set(['ENOENT', 'EACCES', 'EPERM', 'ESRCH', 'ETIMEDOUT', 'EINVAL', 'EPIPE', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'UNKNOWN']);
const startupTraceSignals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGABRT', 0]);
const startupTraceKeys = ['atMs', 'childPid', 'errorCode', 'event', 'exitCode', 'group', 'pid', 'ppid', 'role', 'signal', 'targetPid'];
function readReceiptStartupTrace(root) {
  let fd;
  try {
    fd = fs.openSync(path.join(root, 'receipt-startup-trace.jsonl'), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 64 * 1024) return [];
    const bytes = Buffer.alloc(stat.size);
    const count = fs.readSync(fd, bytes, 0, bytes.length, 0);
    const records = [];
    const integer = value => Number.isSafeInteger(value) && value >= 0;
    const optionalPid = value => value === null || (integer(value) && value > 0);
    for (const line of bytes.subarray(0, count).toString('utf8').split('\n')) {
      if (records.length === 128) break;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (!row || Array.isArray(row) || Object.keys(row).sort().join() !== startupTraceKeys.join()) continue;
      if (!startupTraceEvents.has(row.event) || !startupTraceRoles.has(row.role) || !integer(row.atMs)
          || !integer(row.pid) || row.pid === 0 || !integer(row.ppid)
          || !optionalPid(row.childPid) || !optionalPid(row.targetPid)
          || !(row.group === null || typeof row.group === 'boolean')
          || !(row.exitCode === null || integer(row.exitCode))
          || !(row.errorCode === null || startupTraceErrors.has(row.errorCode))
          || !(row.signal === null || startupTraceSignals.has(row.signal))) continue;
      records.push(row);
    }
    return records;
  } catch { return []; }
  finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* Failure diagnostics must not replace the original result. */ } } }
}
const receiptFailureKinds = new Map([
  ['Receipt reader busy; retry', 'busy'], ['Invalid receipt deadline', 'invalid-deadline'],
  ['Receipt worker unavailable', 'worker-unavailable'], ['Receipt worker failed', 'worker-failed'],
  ['Receipt read unavailable', 'read-unavailable'], ['Receipt read timed out', 'read-timed-out'],
  ['Receipt worker returned invalid evidence', 'invalid-evidence'], ['Receipt output exceeded limit', 'output-limit'],
]);
function receiptFailureDiagnostic(error, startedAt) {
  let kind = 'other';
  try { kind = receiptFailureKinds.get(error?.message) || 'other'; } catch {}
  return { kind, elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)) };
}
async function waitFor(fn, timeoutMs = 5000, observe) {
  const started = performance.now(), end = started + timeoutMs;
  while (!fn() && performance.now() < end) await new Promise(r => setTimeout(r, 25));
  const found = fn();
  let context = '';
  if (!found && observe) {
    try { context = '; ' + JSON.stringify({ ...observe(), elapsedMs: Math.round(performance.now() - started) }); }
    catch { context = '; diagnostics unavailable'; }
  }
  assert.ok(found, 'fixture handshake did not arrive' + context);
}
test('receipt handshake diagnostics run only after failure and preserve assertion errors', async () => {
  let observations = 0;
  await waitFor(() => true, 0, () => { observations++; });
  assert.equal(observations, 0);
  await assert.rejects(waitFor(() => false, 0, () => {
    observations++; return { phase: 'await-git-held', receiptState: 'rejected', markerPresent: false };
  }), error => {
    assert.equal(error.code, 'ERR_ASSERTION');
    assert.match(error.message, /handshake did not arrive.*"phase":"await-git-held".*"receiptState":"rejected".*"elapsedMs":\d+/);
    return true;
  });
  assert.equal(observations, 1);
  await assert.rejects(waitFor(() => false, 0, () => { throw Error('diagnostic probe failed'); }), /handshake did not arrive; diagnostics unavailable/);
});
test('receipt rejection diagnostics expose fixed categories and elapsed time, never raw errors', () => {
  for (const [message, expected] of receiptFailureKinds) {
    const result = receiptFailureDiagnostic(Error(message), performance.now());
    assert.deepEqual(Object.keys(result).sort(), ['elapsedMs', 'kind']);
    assert.equal(result.kind, expected);
    assert.ok(Number.isInteger(result.elapsedMs) && result.elapsedMs >= 0);
  }
  const opaque = 'opaque private diagnostic data';
  for (const error of [Error(opaque), null, { get message() { throw Error(opaque); } }]) {
    const result = receiptFailureDiagnostic(error, performance.now());
    assert.equal(result.kind, 'other');
    assert.ok(!JSON.stringify(result).includes(opaque));
  }
});
test('receipt startup trace is inert without a control root', () => {
  const env = { ...process.env }; delete env.GCTO_RECEIPT_CONTROL_ROOT;
  const result = execFileSync(process.execPath, ['--eval', `
    const assert = require('node:assert/strict'), cp = require('node:child_process');
    const originalSpawn = cp.spawn, originalKill = process.kill;
    require(${JSON.stringify(startupTraceFixture)});
    assert.equal(cp.spawn, originalSpawn); assert.equal(process.kill, originalKill);
  `], { env, encoding: 'utf8' });
  assert.equal(result, '');
});
test('receipt startup trace sanitizes events and preserves operation semantics', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-receipt-trace-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const canary = randomUUID();
  const result = execFileSync(process.execPath, ['--require', startupTraceFixture, '--eval', `
    const assert = require('node:assert/strict'), cp = require('node:child_process'), fs = require('node:fs'), path = require('node:path');
    const root = process.env.GCTO_RECEIPT_CONTROL_ROOT;
    assert.equal(cp.execFileSync(process.execPath, ['--eval', ''], { encoding: 'utf8' }), '');
    const child = cp.spawn(process.execPath, ['--eval', ''], { stdio: 'ignore' });
    assert.equal(child.listenerCount('error'), 0);
    const opaque = new Error(${JSON.stringify(canary)}); opaque.code = ${JSON.stringify(canary)};
    assert.throws(() => child.emit('error', opaque), error => error === opaque);
    child.once('close', code => { assert.equal(code, 0); });
    const missing = cp.spawn(path.join(root, ${JSON.stringify(canary)}), [], { stdio: 'ignore' });
    missing.on('error', error => assert.equal(error.code, 'ENOENT'));
    missing.once('close', () => {});
    assert.equal(process.kill(process.pid, 0), true);
    assert.throws(() => process.kill(process.pid, ${JSON.stringify(canary)}));
    fs.appendFileSync(path.join(root, 'git-held'), String(process.pid) + '\\n');
    assert.equal(fs.readFileSync(path.join(root, 'git-held'), 'utf8'), String(process.pid) + '\\n');
  `, canary], { env: { ...process.env, GCTO_RECEIPT_CONTROL_ROOT: root, PRIVATE_TRACE_VALUE: canary }, encoding: 'utf8' });
  assert.equal(result, '');
  const raw = fs.readFileSync(path.join(root, 'receipt-startup-trace.jsonl'), 'utf8');
  assert.ok(!raw.includes(canary)); assert.ok(!raw.includes(root)); assert.ok(!raw.includes(startupTraceFixture));
  const records = readReceiptStartupTrace(root);
  assert.equal(records.length, raw.trim().split('\n').length);
  for (const event of ['process-entry', 'spawn-start', 'child-spawn', 'child-error', 'child-exit', 'child-close', 'exec-start', 'exec-end', 'kill-start', 'kill-end', 'kill-error', 'git-held-written']) {
    assert.ok(records.some(row => row.event === event), event);
  }
  assert.ok(records.some(row => row.event === 'child-error' && row.errorCode === null));
  assert.ok(records.some(row => row.event === 'child-error' && row.errorCode === 'ENOENT'));
  assert.ok(records.some(row => row.event === 'kill-start' && row.signal === 0));
  const valid = records[0], trace = path.join(root, 'receipt-startup-trace.jsonl');
  fs.writeFileSync(trace, [JSON.stringify(valid), '{', JSON.stringify({ ...valid, errorCode: canary }), JSON.stringify({ ...valid, signal: canary }), JSON.stringify({ ...valid, extra: canary }), JSON.stringify({ ...valid, pid: -1 })].join('\n'));
  assert.deepEqual(readReceiptStartupTrace(root), [valid]);
  fs.writeFileSync(trace, (JSON.stringify(valid) + '\n').repeat(129));
  assert.equal(readReceiptStartupTrace(root).length, 128);
  fs.writeFileSync(trace, Buffer.alloc(64 * 1024 + 1));
  assert.deepEqual(readReceiptStartupTrace(root), []);
  fs.unlinkSync(trace); fs.symlinkSync(path.join(root, 'git-held'), trace);
  assert.deepEqual(readReceiptStartupTrace(root), []);
});
test('receipt startup trace bounds writes and isolates logger failures', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-receipt-trace-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = execFileSync(process.execPath, ['--require', startupTraceFixture, '--eval', `
    const assert = require('node:assert/strict'), fs = require('node:fs'), cp = require('node:child_process');
    const stat = fs.fstatSync;
    fs.fstatSync = () => { throw Error('PRIVATE_LOGGER_FAILURE'); };
    assert.equal(cp.execFileSync(process.execPath, ['--eval', ''], { encoding: 'utf8' }), '');
    assert.equal(process.kill(process.pid, 0), true);
    assert.throws(() => process.kill(process.pid, 'PRIVATE_INVALID_SIGNAL'), error => error.code === 'ERR_UNKNOWN_SIGNAL');
    fs.fstatSync = stat;
    for (let i = 0; i < 100; i++) assert.equal(process.kill(process.pid, 0), true);
  `], { env: { ...process.env, GCTO_RECEIPT_CONTROL_ROOT: root }, encoding: 'utf8' });
  assert.equal(result, '');
  assert.deepEqual(readReceiptStartupTrace(root).map(row => row.event), ['process-entry']);
  fs.unlinkSync(path.join(root, 'receipt-startup-trace.jsonl'));
  execFileSync(process.execPath, ['--require', startupTraceFixture, '--eval', 'for (let i = 0; i < 100; i++) process.kill(process.pid, 0)'], {
    env: { ...process.env, GCTO_RECEIPT_CONTROL_ROOT: root }, stdio: 'pipe',
  });
  assert.equal(readReceiptStartupTrace(root).length, 64);
  assert.ok(fs.statSync(path.join(root, 'receipt-startup-trace.jsonl')).size <= 64 * 1024);
});
function repository(t, format = 'sha1') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-receipt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync(realGit, ['init', '-q', `--object-format=${format}`, root]);
  execFileSync(realGit, ['config', 'core.quotepath', 'false'], { cwd: root });
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'original\n');
  execFileSync(realGit, ['add', 'tracked.txt'], { cwd: root });
  execFileSync(realGit, ['-c', 'user.name=Receipt Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'changed\n');
  fs.writeFileSync(path.join(root, 'binary.dat'), Buffer.from([0, 255, 13, 10]));
  fs.writeFileSync(path.join(root, 'space ü.txt'), 'UTF-8 fixture\r\n');
  return root;
}
for (const format of ['sha1', 'sha256']) test(`in-process receipt blob hashes match Git ${format} for complete dirty tree`, t => {
  const root = repository(t, format);
  const optimized = treeReceipt(root, { hashFilesInProcess: true }), original = treeReceipt(root);
  assert.ok(original?.head && optimized?.head, 'receipt equality must not pass on two null values');
  assert.equal(Object.keys(optimized.files).length, 3);
  assert.deepEqual(optimized, original);
});
test('concurrent receipt reads coalesce without a persisted stale receipt cache', async t => {
  const root = repository(t);
  const first = readBindingReceipt(root), second = readBindingReceipt(root);
  assert.equal(first, second);
  const before = await first;
  fs.writeFileSync(path.join(root, 'binary.dat'), 'changed again');
  assert.notEqual((await readBindingReceipt(root)).dirty, before.dirty);
});
test('approval and second-opinion workers preserve projection semantics and fresh drift', async t => {
  const root = repository(t), receipt = treeReceipt(root);
  const dir = path.join(root, '.great_cto', 'verdicts'); fs.mkdirSync(dir, { recursive: true });
  const approval = { verdict: 'APPROVED', agent: 'code-reviewer', ts: '2026-01-01T00:00:00Z', receipt };
  fs.writeFileSync(path.join(dir, 'code-reviewer.log'), JSON.stringify(approval) + '\n');
  const expected = () => ({ ...compareReceipts(receipt, treeReceipt(root, { base: receipt.base }), { cwd: root }), agent: approval.agent, ts: approval.ts });
  assert.deepEqual(await readApprovalReceipt(root), expected());
  assert.deepEqual(await readSecondOpinion(root), secondOpinionForTree(root));
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'new drift\n');
  assert.deepEqual(await readApprovalReceipt(root), expected());
  assert.equal((await readApprovalReceipt(root)).state, 'differs');
});
test('failed receipt computation issues no tokens and does not overwrite a store', async t => {
  const root = repository(t);
  const result = await issueTokensAsync(root, [{ id: 'gate-fixture' }], { readReceipt: async () => { throw Error('deadline'); } });
  assert.equal(result.state, 'unreadable'); assert.deepEqual(result.tokens, {});
  assert.equal(readTokens(root).state, 'none');
});
test('concurrent token consumers retain the token minted during an awaited receipt', async t => {
  const root = repository(t), gates = [{ id: 'gate-fixture' }];
  const results = await Promise.all([issueTokensAsync(root, gates), issueTokensAsync(root, gates)]);
  assert.equal(results[0].state, 'ok'); assert.equal(results[0].tokens['gate-fixture'], results[1].tokens['gate-fixture']);
});
test('decision during awaited receipt cannot resurrect a consumed gate token', async t => {
  const root = repository(t), gates = [{ id: 'gate-A' }, { id: 'gate-B' }];
  const first = await issueTokensAsync(root, gates.slice(0, 1));
  let release;
  const pending = issueTokensAsync(root, gates, { readReceipt: () => new Promise(r => { release = r; }) });
  consumeToken(root, 'gate-A'); release(treeReceipt(root));
  const result = await pending;
  assert.equal(result.state, 'unreadable'); assert.deepEqual(result.tokens, {});
  assert.equal(checkToken(root, 'gate-A', first.tokens['gate-A']).ok, false);
  assert.equal(readTokens(root).tokens['gate-A'], undefined);
  assert.equal(readTokens(root).tokens['gate-B'], undefined);
});
test('snapshot preceding second-opinion await refuses issuance after decision lifecycle', async t => {
  const root = repository(t), snapshot = approvalSnapshot(root);
  const end = beginGateDecision(root);
  assert.ok(end); assert.equal(beginGateDecision(root), null);
  assert.equal((await issueTokensAsync(root, [{ id: 'gate-A' }])).state, 'unreadable');
  end(); end();
  const result = await issueTokensAsync(root, [{ id: 'gate-A' }], { snapshot });
  assert.equal(result.state, 'unreadable'); assert.deepEqual(result.tokens, {});
  assert.equal(readTokens(root).state, 'none');
  assert.equal((await issueTokensAsync(root, [{ id: 'gate-A' }])).state, 'ok');
});
test('physical project aliases share decision fence and invalidate stale issuance', async t => {
  const root = repository(t), aliasRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-receipt-alias-'));
  t.after(() => fs.rmSync(aliasRoot, { recursive: true, force: true }));
  const alias = path.join(aliasRoot, 'project'); fs.symlinkSync(root, alias, 'dir');
  await issueTokensAsync(root, [{ id: 'gate-A' }]);
  const snapshot = approvalSnapshot(root), end = beginGateDecision(alias);
  assert.ok(end); assert.equal(beginGateDecision(root), null);
  consumeToken(alias, 'gate-A'); end();
  const result = await issueTokensAsync(root, [{ id: 'gate-A' }, { id: 'gate-B' }], { snapshot });
  assert.equal(result.state, 'unreadable'); assert.deepEqual(result.tokens, {});
  assert.equal(readTokens(root).tokens['gate-A'], undefined);
});
test('distinct Git worktrees do not share their decision fence', t => {
  const root = repository(t), worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-receipt-worktree-'));
  t.after(() => fs.rmSync(worktreeRoot, { recursive: true, force: true }));
  const checkout = path.join(worktreeRoot, 'checkout');
  execFileSync(realGit, ['worktree', 'add', '--detach', '-q', checkout, 'HEAD'], { cwd: root });
  const first = beginGateDecision(root), second = beginGateDecision(checkout);
  assert.ok(first); assert.ok(second); first(); second();
});
test('unresolvable project identity cannot acquire a fence or issue tokens', async t => {
  const root = repository(t), missing = path.join(root, 'missing');
  assert.equal(beginGateDecision(missing), null);
  assert.equal((await issueTokensAsync(missing, [{ id: 'gate-A' }])).state, 'unreadable');
  assert.equal(readTokens(root).state, 'none');
});
test('native receipt hashing streams multi-chunk binary content with Git-equivalent hashes', t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, 'binary.dat'), Buffer.alloc(256 * 1024 + 17, 0xff));
  const original = fs.readSync; let calls = 0;
  fs.readSync = (...args) => { calls++; assert.ok(args[1].length <= 64 * 1024); return original(...args); };
  syncBuiltinESMExports();
  let optimized;
  try { optimized = treeReceipt(root, { hashFilesInProcess: true }); }
  finally { fs.readSync = original; syncBuiltinESMExports(); }
  assert.ok(calls > 4, 'large binary must require bounded incremental reads');
  assert.ok(optimized?.files['binary.dat']);
  assert.deepEqual(optimized, treeReceipt(root));
});
test('native hashing refuses content changed during an incremental read', t => {
  const root = repository(t), binary = path.join(root, 'binary.dat');
  fs.writeFileSync(binary, Buffer.alloc(256 * 1024 + 17, 0xff));
  const original = fs.readSync; let changed = false;
  fs.readSync = (...args) => {
    const count = original(...args);
    if (!changed && fs.fstatSync(args[0]).size > 256 * 1024) { changed = true; fs.appendFileSync(binary, 'drift'); }
    return count;
  };
  syncBuiltinESMExports();
  try { assert.equal(treeReceipt(root, { hashFilesInProcess: true }), null); assert.equal(changed, true); }
  finally { fs.readSync = original; syncBuiltinESMExports(); }
});
test('an unreadable real repository receipt cannot mint an unbound token', async t => {
  const root = repository(t);
  fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/missing\n');
  const result = await issueTokensAsync(root, [{ id: 'gate-fixture' }]);
  assert.equal(result.state, 'unreadable'); assert.deepEqual(result.tokens, {});
  assert.equal(readTokens(root).state, 'none');
});
test('receipt deadline releases its owned Git child and bounded read slot', { timeout: 7000 }, async t => {
  const cwd = repository(t), control = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-receipt-deadline-'));
  // Hold the first Git read: cleanup must not depend on a prior HEAD round-trip
  // finishing before the unchanged receipt deadline starts killing the group.
  fs.writeFileSync(path.join(control, 'hold-head'), 'ready');
  const bin = path.join(control, 'bin'); fs.mkdirSync(bin);
  fs.symlinkSync(fileURLToPath(new URL('./fixtures/held-receipt-git.mjs', import.meta.url)), path.join(bin, 'git'));
  const keys = ['PATH', 'GCTO_RECEIPT_CONTROL_ROOT', 'GCTO_RECEIPT_REAL_GIT', 'NODE_OPTIONS'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.PATH = bin + path.delimiter + process.env.PATH;
  process.env.GCTO_RECEIPT_CONTROL_ROOT = control; process.env.GCTO_RECEIPT_REAL_GIT = realGit;
  process.env.NODE_OPTIONS = `${old.NODE_OPTIONS || ''} --require ${JSON.stringify(startupTraceFixture)}`;
  try {
    const readStartedAt = performance.now();
    const pending = readBindingReceipt(cwd, { timeoutMs: 1000 });
    let receiptState = 'pending', rejection = null;
    pending.then(() => { receiptState = 'resolved'; }, error => {
      receiptState = 'rejected'; rejection = receiptFailureDiagnostic(error, readStartedAt);
    });
    const refused = assert.rejects(pending, /Receipt/);
    await waitFor(() => fs.existsSync(path.join(control, 'git-held')), 5000, () => ({
      phase: 'await-git-held', receiptState, rejection, markerPresent: fs.existsSync(path.join(control, 'git-held')),
      startupTrace: readReceiptStartupTrace(control),
    }));
    const pid = Number(fs.readFileSync(path.join(control, 'git-held'), 'utf8').trim());
    await refused;
    await waitFor(() => { try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; } }, 5000, () => ({
      phase: 'await-owned-git-exit', receiptState, rejection, markerPresent: fs.existsSync(path.join(control, 'git-held')),
      startupTrace: readReceiptStartupTrace(control),
    }));
    for (const key of keys) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; }
    assert.ok((await readBindingReceipt(cwd)).head, 'deadline must release the project slot');
  } finally {
    for (const key of keys) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; }
    fs.rmSync(control, { recursive: true, force: true });
  }
});
// This is a held-read/nonblocking-HTTP probe, not a process startup SLO. Give
// startup 15s, and let the client outlast the unchanged 20s receipt deadline.
// The old 10s client cap also included held-handshake (5s), cheap HTTP (2x1.5s)
// and gate decision (3s): valid bounded steps could exhaust it before release.
// Dedicated receipt-deadline tests and cheap HTTP caps remain unchanged.
for (const endpoint of ['inbox', 'receipt', 'inbox-head', 'inbox-race']) test(`held ${endpoint} receipt leaves cheap HTTP answering and preserves evidence`, { timeout: 65000 }, async t => {
  const cwd = repository(t), root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-receipt-http-'));
  const state = path.join(root, 'state'), bin = path.join(root, 'bin');
  fs.mkdirSync(state); fs.mkdirSync(bin); fs.mkdirSync(path.join(cwd, '.great_cto')); fs.mkdirSync(path.join(cwd, '.beads'));
  fs.writeFileSync(path.join(cwd, '.great_cto', 'PROJECT.md'), 'archetype: devtools\n');
  const initial = endpoint === 'inbox-race' ? await issueTokensAsync(cwd, [{ id: 'FIXTURE-GATE' }]) : null;
  if (endpoint === 'receipt') {
    fs.mkdirSync(path.join(cwd, '.great_cto', 'verdicts'));
    fs.writeFileSync(path.join(cwd, '.great_cto', 'verdicts', 'code-reviewer.log'), JSON.stringify({ verdict: 'APPROVED', agent: 'code-reviewer', ts: '2026-01-01T00:00:00Z', receipt: treeReceipt(cwd) }) + '\n');
  }
  fs.writeFileSync(path.join(state, 'projects.json'), JSON.stringify({ projects: [{ slug: 'fixture', path: cwd }] }));
  fs.symlinkSync(fileURLToPath(new URL('./fixtures/held-receipt-git.mjs', import.meta.url)), path.join(bin, 'git'));
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise(r => socket.close(r));
  const child = spawn(process.execPath, [server, '--no-open', '--port', String(port)], {
    cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
      PATH: bin + path.delimiter + process.env.PATH, GREAT_CTO_HOME: state, GREAT_CTO_DISCOVERY_ROOT: root,
      GREAT_CTO_NO_UPDATE_CHECK: '1', GREAT_CTO_BD_BIN: fileURLToPath(new URL('./fixtures/fake-bd-controlled.mjs', import.meta.url)),
      FAKE_BD_CONTROL_ROOT: root, FAKE_BD_CONTROL_MODE: endpoint === 'inbox-race' ? 'gate-receipt-race' : 'gate-receipt', GCTO_RECEIPT_CONTROL_ROOT: root, GCTO_RECEIPT_REAL_GIT: realGit }
  });
  let output = '', pending;
  const observation = { request: 'not-started', approvalState: null, approvalWhy: null };
  child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
  try {
    await waitFor(() => /task cache warmed/.test(output), 15000);
    if (endpoint === 'inbox-head') fs.writeFileSync(path.join(root, 'hold-head'), 'ready');
    const route = endpoint.startsWith('inbox') ? 'inbox' : endpoint;
    pending = fetch(`http://127.0.0.1:${port}/api/${route}?project=fixture`, { signal: AbortSignal.timeout(25000) });
    observation.request = 'pending';
    // Diagnostics only: never expose approval tokens or alter the probe deadlines.
    pending.then(async response => {
      observation.request = `http-${response.status}`;
      try {
        const body = await response.clone().json();
        observation.approvalState = body.approval_tokens?.state ?? null;
        observation.approvalWhy = body.approval_tokens?.why ?? null;
      } catch { observation.approvalState = 'unreadable-response'; }
    }).catch(error => { observation.request = error.name; });
    await waitFor(() => fs.existsSync(path.join(root, 'git-held')), 12000);
    for (const route of ['/api/version', '/']) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(1500) });
      assert.equal(response.status, 200); await response.text();
    }
    if (endpoint === 'inbox-race') {
      const decision = await fetch(`http://127.0.0.1:${port}/api/gates/FIXTURE-GATE`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
        body: JSON.stringify({ project: 'fixture', action: 'reject', token: initial.tokens['FIXTURE-GATE'] }), signal: AbortSignal.timeout(3000),
      });
      assert.equal(decision.status, 200); assert.equal((await decision.json()).ok, true);
    }
    fs.writeFileSync(path.join(root, 'git-release'), 'ready');
    const response = await pending, inbox = await response.json();
    assert.equal(response.status, 200);
    if (endpoint === 'inbox-race') {
      assert.equal(inbox.approval_tokens.state, 'unreadable');
      assert.equal(inbox.approval_tokens.why, 'Gate decisions changed during this snapshot; reload the inbox');
      assert.ok(inbox.pending_gates.every(g => g.token === null));
      assert.equal(readTokens(cwd).tokens['FIXTURE-GATE'], undefined);
      assert.equal(readTokens(cwd).tokens['NEW-GATE'], undefined);
    } else if (endpoint !== 'receipt') {
      assert.equal(inbox.approval_tokens.state, 'ok');
      assert.ok(inbox.pending_gates[0].token);
      const store = readTokens(cwd); assert.ok(store.tokens['FIXTURE-GATE'].receipt.head);
    } else {
      assert.equal(inbox.agent, 'code-reviewer');
      assert.equal(inbox.state, 'extended');
    }
  } catch (error) {
    t.diagnostic(JSON.stringify({ ...observation, requestedPort: port,
      observedPort: output.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/)?.[1] ?? null,
      warmed: /task cache warmed/.test(output), gitHeld: fs.existsSync(path.join(root, 'git-held')) }));
    throw error;
  } finally {
    fs.writeFileSync(path.join(root, 'git-release'), 'ready');
    if (pending) await pending.catch(() => {});
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await new Promise(r => setTimeout(r, 250));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
