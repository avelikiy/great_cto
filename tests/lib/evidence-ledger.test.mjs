import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import {
  EVIDENCE_LEDGER_FILE,
  EVIDENCE_STATES,
  appendEvidence,
  normalizeEvidenceEvent,
  readEvidence,
} from '../../scripts/lib/evidence-ledger.mjs';

const sandbox = () => mkdtempSync(join(tmpdir(), 'evidence-ledger-'));
const clean = (dir) => rmSync(dir, { recursive: true, force: true });
const base = (overrides = {}) => ({
  eventType: 'review.completed',
  projectId: 'great_cto',
  runId: 'run-42',
  stageId: 'code-reviewer',
  attempt: 1,
  host: 'codex',
  agent: 'code-reviewer',
  gateId: 'gate:ship',
  idempotencyKey: 'run-42:code-reviewer:1:completed',
  state: 'passed',
  diffSha: 'a'.repeat(40),
  artifactSha: 'b'.repeat(64),
  details: { findings: 0, verifier: 'independent' },
  ...overrides,
});

test('normalization produces a stable v1 envelope and deterministic event id', () => {
  const now = new Date('2026-09-11T12:00:00.000Z');
  const a = normalizeEvidenceEvent(base(), { now });
  const b = normalizeEvidenceEvent(base(), { now: new Date('2026-09-12T12:00:00.000Z') });
  assert.equal(a.v, 1);
  assert.match(a.event_id, /^evt_[a-f0-9]{32}$/);
  assert.equal(a.event_id, b.event_id, 'retries keep one identity');
  assert.equal(a.occurred_at, now.toISOString());
  assert.equal(a.diff_sha, 'a'.repeat(40));
  assert.equal(a.artifact_sha, 'b'.repeat(64));
  assert.deepEqual(a.details, { findings: 0, verifier: 'independent' });
});

test('append is durable and never overwrites the event before it', () => {
  const dir = sandbox();
  try {
    assert.equal(appendEvidence(dir, base(), { now: new Date('2026-09-11T12:00:00Z') }).state, 'appended');
    assert.equal(appendEvidence(dir, base({
      eventType: 'gate.opened', idempotencyKey: 'run-42:gate:ship:opened', state: 'pending',
    }), { now: new Date('2026-09-11T12:01:00Z') }).state, 'appended');
    const read = readEvidence(dir);
    assert.equal(read.state, 'some');
    assert.deepEqual(read.rows.map((row) => row.event_type), ['review.completed', 'gate.opened']);
    assert.equal(readFileSync(join(dir, '.great_cto', EVIDENCE_LEDGER_FILE), 'utf8').trim().split('\n').length, 2);
  } finally { clean(dir); }
});

test('same idempotency key and semantic event is a duplicate, not a second line', () => {
  const dir = sandbox();
  try {
    const first = appendEvidence(dir, base(), { now: new Date('2026-09-11T12:00:00Z') });
    const retry = appendEvidence(dir, base(), { now: new Date('2026-09-11T12:05:00Z') });
    assert.equal(retry.state, 'duplicate');
    assert.equal(retry.event.event_id, first.event.event_id);
    assert.equal(retry.event.occurred_at, first.event.occurred_at, 'the original fact wins over retry time');
    assert.equal(readEvidence(dir).rows.length, 1);
  } finally { clean(dir); }
});

test('same idempotency key with different meaning fails closed', () => {
  const dir = sandbox();
  try {
    appendEvidence(dir, base());
    const conflict = appendEvidence(dir, base({ state: 'blocked', reason: 'P0 finding' }));
    assert.equal(conflict.state, 'conflict');
    assert.match(conflict.why, /idempotency key/i);
    assert.equal(readEvidence(dir).rows.length, 1);
    assert.equal(readEvidence(dir).rows[0].state, 'passed');
  } finally { clean(dir); }
});

test('unknown evidence states stay distinct from zero, false and passed', () => {
  const dir = sandbox();
  try {
    for (const state of ['not_run', 'unknown', 'unreadable', 'unmeasured']) {
      appendEvidence(dir, base({
        eventType: 'measurement.observed', state, reason: state,
        idempotencyKey: `run-42:measurement:${state}`, details: { cost_usd: null },
      }));
    }
    const rows = readEvidence(dir).rows;
    assert.deepEqual(rows.map((row) => row.state), ['not_run', 'unknown', 'unreadable', 'unmeasured']);
    assert.ok(rows.every((row) => row.details.cost_usd === null));
  } finally { clean(dir); }
});

test('a malformed ledger is unreadable and cannot safely deduplicate a new append', () => {
  const dir = sandbox();
  try {
    mkdirSync(join(dir, '.great_cto'));
    writeFileSync(join(dir, '.great_cto', EVIDENCE_LEDGER_FILE), '{"v":1}\ntorn-write\n');
    const read = readEvidence(dir);
    assert.equal(read.state, 'unreadable');
    assert.equal(read.invalidLines, 2);
    const append = appendEvidence(dir, base());
    assert.equal(append.state, 'unreadable');
    assert.match(append.why, /cannot prove idempotency/i);
    assert.equal(readFileSync(join(dir, '.great_cto', EVIDENCE_LEDGER_FILE), 'utf8'), '{"v":1}\ntorn-write\n');
  } finally { clean(dir); }
});

test('a structurally plausible row with a forged identity is still unreadable', () => {
  const dir = sandbox();
  try {
    const event = normalizeEvidenceEvent(base());
    event.event_id = `evt_${'0'.repeat(32)}`;
    mkdirSync(join(dir, '.great_cto'));
    writeFileSync(join(dir, '.great_cto', EVIDENCE_LEDGER_FILE), `${JSON.stringify(event)}\n`);
    const read = readEvidence(dir);
    assert.equal(read.state, 'unreadable');
    assert.equal(read.invalidLines, 1);
  } finally { clean(dir); }
});

test('concurrent processes append one logical event exactly once', async () => {
  const dir = sandbox();
  try {
    const moduleUrl = new URL('../../scripts/lib/evidence-ledger.mjs', import.meta.url).href;
    const input = JSON.stringify(base());
    const program = [
      `import { appendEvidence } from ${JSON.stringify(moduleUrl)};`,
      `const result = appendEvidence(process.argv[1], JSON.parse(process.argv[2]));`,
      'process.stdout.write(result.state);',
      "if (!['appended', 'duplicate'].includes(result.state)) process.exitCode = 1;",
    ].join('\n');
    const runs = Array.from({ length: 8 }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', program, dir, input], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `exit ${code}: ${stdout}`)));
    }));
    const states = await Promise.all(runs);
    assert.equal(states.filter((state) => state === 'appended').length, 1);
    assert.equal(states.filter((state) => state === 'duplicate').length, 7);
    assert.equal(readEvidence(dir).rows.length, 1);
  } finally { clean(dir); }
});

test('schema rejects invalid identities, digests, states and sensitive payloads', () => {
  assert.throws(() => normalizeEvidenceEvent(base({ projectId: '../secret' })), /projectId/);
  assert.throws(() => normalizeEvidenceEvent(base({ diffSha: 'not-a-sha' })), /diffSha/);
  assert.throws(() => normalizeEvidenceEvent(base({ state: 'green-ish' })), /state/);
  assert.throws(() => normalizeEvidenceEvent(base({ details: { prompt: 'private model input' } })), /sensitive.*prompt/i);
  assert.throws(() => normalizeEvidenceEvent(base({ details: { nested: { api_key: 'secret' } } })), /sensitive.*api_key/i);
  assert.ok(EVIDENCE_STATES.includes('blocked'));
  assert.ok(EVIDENCE_STATES.includes('unmeasured'));
});

test('details are bounded and JSON-safe', () => {
  assert.throws(() => normalizeEvidenceEvent(base({ details: { value: undefined } })), /JSON-safe/);
  assert.throws(() => normalizeEvidenceEvent(base({ details: { payload: 'x'.repeat(9000) } })), /8192/);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => normalizeEvidenceEvent(base({ details: cyclic })), /JSON-safe/);
});
