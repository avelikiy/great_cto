// Canonical evidence shared by hosts, stages, gates and Board projections.
//
// Existing verdict and pipeline journals remain source-compatible during the
// migration. This ledger is additive: one immutable event per line, with an
// idempotency identity stable across retries. It deliberately stores artifact
// digests and bounded facts, never prompts, secrets or artifact bytes.

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

export const EVIDENCE_LEDGER_FILE = 'evidence-ledger.jsonl';
export const EVIDENCE_SCHEMA_VERSION = 1;
export const EVIDENCE_STATES = Object.freeze([
  'not_run',
  'unknown',
  'unreadable',
  'unmeasured',
  'pending',
  'running',
  'passed',
  'blocked',
  'failed',
  'cancelled',
  'completed',
]);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const EVENT_TYPE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const EVENT_ID = /^evt_[a-f0-9]{32}$/;
const DIGEST = /^[a-f0-9]{7,64}$/i;
const MAX_DETAILS_BYTES = 8192;
const SENSITIVE_KEY = /(^|[_-])(prompt|secret|token|authorization|api[_-]?key|base64|bytes|content)([_-]|$)/i;
const sleepCell = new Int32Array(new SharedArrayBuffer(4));

function requiredString(value, name, { max = 256, pattern = IDENTIFIER } = {}) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0') || !pattern.test(value)) {
    throw new TypeError(`${name} must be a non-empty bounded identifier`);
  }
  return value;
}

function optionalString(value, name, { max = 256, pattern = IDENTIFIER } = {}) {
  if (value == null) return null;
  return requiredString(value, name, { max, pattern });
}

function optionalReason(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 2000 || value.includes('\0')) {
    throw new TypeError('reason must be a string of at most 2000 characters');
  }
  return value;
}

function optionalDigest(value, name) {
  if (value == null) return null;
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new TypeError(`${name} must be a 7-64 character hex digest`);
  return value.toLowerCase();
}

function canonicalDetails(value, { depth = 0, seen = new WeakSet() } = {}) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('details must be JSON-safe');
    return value;
  }
  if (typeof value !== 'object' || depth > 6) throw new TypeError('details must be JSON-safe');
  if (seen.has(value)) throw new TypeError('details must be JSON-safe');
  seen.add(value);
  if (Array.isArray(value)) {
    const out = value.map((item) => canonicalDetails(item, { depth: depth + 1, seen }));
    seen.delete(value);
    return out;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('details must be JSON-safe');
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (SENSITIVE_KEY.test(key)) throw new TypeError(`details contain sensitive field ${key}`);
    const item = value[key];
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      throw new TypeError('details must be JSON-safe');
    }
    out[key] = canonicalDetails(item, { depth: depth + 1, seen });
  }
  seen.delete(value);
  return out;
}

function detailsOf(value) {
  if (value == null) return {};
  const details = canonicalDetails(value);
  if (Array.isArray(details) || details === null || typeof details !== 'object') {
    throw new TypeError('details must be a JSON-safe object');
  }
  if (Buffer.byteLength(JSON.stringify(details), 'utf8') > MAX_DETAILS_BYTES) {
    throw new TypeError(`details must not exceed ${MAX_DETAILS_BYTES} bytes`);
  }
  return details;
}

function eventId(projectId, idempotencyKey) {
  const hash = createHash('sha256').update(projectId).update('\0').update(idempotencyKey).digest('hex').slice(0, 32);
  return `evt_${hash}`;
}

/** Validate caller input and return the one persisted v1 shape. */
export function normalizeEvidenceEvent(entry, { now = new Date() } = {}) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('event must be an object');
  const projectId = requiredString(entry.projectId, 'projectId', { max: 128 });
  const idempotencyKey = requiredString(entry.idempotencyKey, 'idempotencyKey', {
    max: 512,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/,
  });
  const date = entry.occurredAt == null ? new Date(now) : new Date(entry.occurredAt);
  if (!Number.isFinite(date.getTime())) throw new TypeError('occurredAt must be a valid date');
  if (!EVIDENCE_STATES.includes(entry.state)) throw new TypeError(`state must be one of: ${EVIDENCE_STATES.join(', ')}`);
  const attempt = entry.attempt == null ? null : entry.attempt;
  if (attempt !== null && (!Number.isSafeInteger(attempt) || attempt < 1)) throw new TypeError('attempt must be a positive integer');

  return {
    v: EVIDENCE_SCHEMA_VERSION,
    event_id: eventId(projectId, idempotencyKey),
    event_type: requiredString(entry.eventType, 'eventType', { max: 128, pattern: EVENT_TYPE }),
    occurred_at: date.toISOString(),
    project_id: projectId,
    run_id: requiredString(entry.runId, 'runId', { max: 256 }),
    stage_id: optionalString(entry.stageId, 'stageId'),
    attempt,
    host: optionalString(entry.host, 'host', { max: 64 }),
    agent: optionalString(entry.agent, 'agent', { max: 128 }),
    gate_id: optionalString(entry.gateId, 'gateId', { max: 128 }),
    parent_event_id: optionalString(entry.parentEventId, 'parentEventId', { max: 36, pattern: EVENT_ID }),
    idempotency_key: idempotencyKey,
    state: entry.state,
    reason: optionalReason(entry.reason),
    diff_sha: optionalDigest(entry.diffSha, 'diffSha'),
    artifact_sha: optionalDigest(entry.artifactSha, 'artifactSha'),
    details: detailsOf(entry.details),
  };
}

function persistedEvent(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || row.v !== EVIDENCE_SCHEMA_VERSION) return false;
  try {
    const normalized = normalizeEvidenceEvent({
      eventType: row.event_type,
      occurredAt: row.occurred_at,
      projectId: row.project_id,
      runId: row.run_id,
      stageId: row.stage_id,
      attempt: row.attempt,
      host: row.host,
      agent: row.agent,
      gateId: row.gate_id,
      parentEventId: row.parent_event_id,
      idempotencyKey: row.idempotency_key,
      state: row.state,
      reason: row.reason,
      diffSha: row.diff_sha,
      artifactSha: row.artifact_sha,
      details: row.details,
    });
    // Canonical comparison rejects forged event IDs, omitted/extra fields and
    // sensitive details while remaining independent of JSON object key order.
    return JSON.stringify(canonicalDetails(row)) === JSON.stringify(canonicalDetails(normalized));
  } catch { return false; }
}

/** Read every valid row and make corruption visible rather than skipping it. */
export function readEvidence(cwd) {
  const path = join(cwd, '.great_cto', EVIDENCE_LEDGER_FILE);
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return { state: 'none', why: 'no evidence recorded yet', rows: [], invalidLines: 0 };
    return { state: 'unreadable', why: `${path}: ${String(error?.message || error)}`, rows: [], invalidLines: null };
  }

  const rows = [];
  let invalidLines = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (!persistedEvent(row)) invalidLines += 1;
      else rows.push(row);
    } catch { invalidLines += 1; }
  }
  if (invalidLines) {
    return {
      state: 'unreadable',
      why: `${invalidLines} invalid line(s); ${rows.length} valid event(s) retained but not trusted for idempotency`,
      rows,
      invalidLines,
    };
  }
  return {
    state: rows.length ? 'some' : 'none',
    why: rows.length ? `${rows.length} event(s)` : 'no evidence recorded yet',
    rows,
    invalidLines: 0,
  };
}

function semanticFingerprint(event) {
  const { occurred_at: _occurredAt, ...semantic } = event;
  return createHash('sha256').update(JSON.stringify(canonicalDetails(semantic))).digest('hex');
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

function acquireLock(path, { timeoutMs = 2000, staleMs = 30000 } = {}) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    try {
      const fd = openSync(path, 'wx', 0o600);
      writeSync(fd, `${process.pid}\n`);
      return fd;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const age = Date.now() - statSync(path).mtimeMs;
        const owner = Number(readFileSync(path, 'utf8').trim());
        if (age > staleMs && !processAlive(owner)) { unlinkSync(path); continue; }
      } catch (readError) {
        if (readError?.code === 'ENOENT') continue;
      }
      Atomics.wait(sleepCell, 0, 0, 10);
    }
  }
  const error = new Error(`evidence ledger lock busy after ${timeoutMs}ms`);
  error.code = 'EBUSY';
  throw error;
}

function releaseLock(fd, path) {
  try { closeSync(fd); } catch { /* already closed */ }
  try { unlinkSync(path); } catch { /* another failure must not hide the result */ }
}

function durableAppend(path, line) {
  const fd = openSync(path, 'a', 0o600);
  try {
    const bytes = Buffer.from(line, 'utf8');
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(fd, bytes, offset, bytes.length - offset);
      if (written < 1) throw new Error('evidence ledger append made no progress');
      offset += written;
    }
    fsyncSync(fd);
  } finally { closeSync(fd); }
  // A new journal also creates a directory entry. Sync it when the platform
  // permits opening directories, but do not make portability depend on that.
  let dirFd;
  try { dirFd = openSync(dirname(path), 'r'); fsyncSync(dirFd); }
  catch { /* file fsync is still the portable durability floor */ }
  finally { if (dirFd !== undefined) closeSync(dirFd); }
}

/**
 * Append one canonical event under an inter-process lock.
 *
 * Validation errors throw because they are programmer errors. Filesystem,
 * corruption and contention outcomes are returned explicitly so no caller can
 * turn missing evidence into success by catching and forgetting an exception.
 */
export function appendEvidence(cwd, entry, options = {}) {
  const event = normalizeEvidenceEvent(entry, options);
  const path = join(cwd, '.great_cto', EVIDENCE_LEDGER_FILE);
  const lockPath = join(cwd, '.great_cto', `${EVIDENCE_LEDGER_FILE}.lock`);
  mkdirSync(dirname(path), { recursive: true });
  let lockFd;
  try {
    lockFd = acquireLock(lockPath, { timeoutMs: options.lockTimeoutMs, staleMs: options.staleLockMs });
    const current = readEvidence(cwd);
    if (current.state === 'unreadable') {
      return { state: 'unreadable', why: `cannot prove idempotency: ${current.why}`, event: null };
    }
    const existing = current.rows.find((row) => row.event_id === event.event_id || row.idempotency_key === event.idempotency_key);
    if (existing) {
      if (semanticFingerprint(existing) === semanticFingerprint(event)) {
        return { state: 'duplicate', why: 'event already recorded', event: existing };
      }
      return { state: 'conflict', why: `idempotency key ${event.idempotency_key} already names a different event`, event: existing };
    }
    durableAppend(path, `${JSON.stringify(event)}\n`);
    return { state: 'appended', why: '', event };
  } catch (error) {
    if (error?.code === 'EBUSY') return { state: 'busy', why: String(error.message || error), event: null };
    return { state: 'unreadable', why: String(error?.message || error), event: null };
  } finally {
    if (lockFd !== undefined) releaseLock(lockFd, lockPath);
  }
}

export function evidenceLedgerExists(cwd) {
  return existsSync(join(cwd, '.great_cto', EVIDENCE_LEDGER_FILE));
}
