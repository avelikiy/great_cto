import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HOLD = 0.25;
const MISSING = Symbol('missing-file');
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const ACTIVE = new Set(['preparing', 'reserved', 'sent', 'Unknown']);
const STATES = new Set([...ACTIVE, 'complete', 'no-send', 'breach']);
const METADATA_KEYS = new Set([
  'authority', 'releaseEligibility', 'status', 'reasonCode', 'bindingDigest',
  'requestedModel', 'observedModel', 'requestedEndpoint', 'observedProvider',
  'completionReason', 'usageState', 'costState', 'costUsd', 'reservationUsd',
  'promptHash', 'responseHash', 'elapsedMs', 'profileHash', 'schemaHash',
  'inputDigest', 'manifestHash', 'acceptanceHash', 'sourceSha', 'taskId',
  'mode', 'contextClass', 'reason', 'requestId', 'advisory', 'metadataCheckedAt',
  'httpStatus', 'diagnosticCount',
]);
const USAGE_KEYS = new Set([
  'promptTokens', 'completionTokens', 'reasoningTokens', 'cacheReadTokens',
  'prompt_tokens', 'completion_tokens', 'total_tokens', 'reasoning_tokens',
  'cached_tokens', 'cache_read_tokens', 'providerReportedCost', 'calculatedCostUsd',
  'costUsd', 'inputTokens', 'outputTokens', 'cachedTokens',
]);

class StoreError extends Error {
  constructor(reasonCode) { super(reasonCode); this.reasonCode = reasonCode; }
}
const fail = reasonCode => { throw new StoreError(reasonCode); };
const deny = error => ({ ok: false, reasonCode: error instanceof StoreError ? error.reasonCode : 'persistence-failed' });
const hashTask = taskId => createHash('sha256').update(taskId).digest('hex');
const hashJson = value => createHash('sha256').update(JSON.stringify(value) + '\n').digest('hex');
const finiteCost = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ownUid = process.getuid?.();

function checkedDirectory(directory, { privateMode = false, ancestor = false } = {}) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('unsafe-path');
  if (ownUid !== undefined && stat.uid !== ownUid && !(ancestor && stat.uid === 0)) fail('unsafe-path');
  const permissions = stat.mode & 0o777;
  const trustedSticky = ancestor && stat.uid === 0 && (stat.mode & 0o1000);
  if ((permissions & 0o022) && !trustedSticky) fail('unsafe-path');
  if (privateMode && permissions !== 0o700) fail('unsafe-path');
  if ((permissions & 0o500) !== 0o500) fail('unsafe-path');
  return stat;
}

function checkedAncestors(directory) {
  const parsed = path.parse(directory);
  let current = parsed.root;
  checkedDirectory(current, { ancestor: true });
  for (const part of directory.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    checkedDirectory(current, { ancestor: true });
  }
}

function ensurePrivateDirectory(directory) {
  let created = false;
  try { fs.mkdirSync(directory, { mode: 0o700 }); created = true; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  checkedDirectory(directory, { privateMode: true });
  if (created) syncDirectory(path.dirname(directory));
}

function checkedFile(file, { missing = false } = {}) {
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) { if (missing && error.code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
      (ownUid !== undefined && stat.uid !== ownUid) || (stat.mode & 0o777) !== 0o600) fail('unsafe-path');
  return stat;
}

function readJson(file, { missing = false } = {}) {
  const stat = checkedFile(file, { missing });
  if (!stat) return MISSING;
  if (stat.size > MAX_FILE_BYTES) fail('ledger-invalid');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd);
    if (opened.dev !== stat.dev || opened.ino !== stat.ino) fail('unsafe-path');
    try { return JSON.parse(fs.readFileSync(fd, 'utf8')); }
    catch { fail('ledger-invalid'); }
  } finally { fs.closeSync(fd); }
}

function syncDirectory(directory) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function atomicJson(file, value) {
  checkedDirectory(path.dirname(file), { privateMode: true });
  checkedFile(file, { missing: true });
  const bytes = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(bytes) > MAX_FILE_BYTES) fail('persistence-failed');
  const temporary = path.join(path.dirname(file), `.kimi-${randomUUID()}.tmp`);
  let fd;
  let renamed = false;
  try {
    fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    checkedFile(file, { missing: true });
    fs.renameSync(temporary, file);
    renamed = true;
    syncDirectory(path.dirname(file));
  } catch (error) {
    // A rename visible to readers is not a durable commit until its directory syncs.
    if (renamed) error.commitUncertain = true;
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function acquireLock(file, timestamp) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') {
      checkedFile(file);
      fail('lock-contended');
    }
    throw error;
  }
  const identity = fs.fstatSync(fd);
  try {
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, JSON.stringify({ version: 1, pid: process.pid, timestamp }));
    fs.fsyncSync(fd);
    syncDirectory(path.dirname(file));
  } catch (error) {
    fs.closeSync(fd);
    fs.unlinkSync(file);
    throw error;
  }
  fs.closeSync(fd);
  return () => {
    const current = checkedFile(file);
    if (current.dev !== identity.dev || current.ino !== identity.ino) fail('unsafe-path');
    fs.unlinkSync(file);
    syncDirectory(path.dirname(file));
  };
}

function validIdentity(value) {
  return isObject(value) && typeof value.taskId === 'string' && value.taskId.length > 0 &&
    Buffer.byteLength(value.taskId) <= 256 && UUID.test(value.requestId) &&
    HASH.test(value.bindingDigest) && value.reservationUsd === HOLD;
}

function validToken(token) {
  return validIdentity(token) && token.version === 1 && token.taskHash === hashTask(token.taskId);
}

function validateLedger(ledger) {
  if (!isObject(ledger) || ledger.version !== 1 || !Number.isSafeInteger(ledger.lastObservedAt) ||
      ledger.lastObservedAt < 0 || !Array.isArray(ledger.requests)) fail('ledger-invalid');
  const identities = new Set();
  for (const record of ledger.requests) {
    if (!isObject(record) || !validToken(record.token) || !STATES.has(record.state) ||
        !Number.isSafeInteger(record.createdAt) || record.createdAt < 0 ||
        !Number.isSafeInteger(record.updatedAt) || record.updatedAt < record.createdAt ||
        record.updatedAt > ledger.lastObservedAt || typeof record.sent !== 'boolean' ||
        ![0, HOLD].includes(record.reservationUsd) ||
        !(record.costUsd === null || finiteCost(record.costUsd)) ||
        !['known', 'Unknown', 'not-incurred', 'breach'].includes(record.costState)) fail('ledger-invalid');
    if (record.evidence !== null && (!isObject(record.evidence) ||
        !HASH.test(record.evidence.metadataSha256) || !HASH.test(record.evidence.reportSha256))) fail('ledger-invalid');
    if (ACTIVE.has(record.state) && record.reservationUsd !== HOLD) fail('ledger-invalid');
    if (!ACTIVE.has(record.state) && record.reservationUsd !== 0) fail('ledger-invalid');
    if (['complete', 'breach'].includes(record.state) && !finiteCost(record.costUsd)) fail('ledger-invalid');
    const key = `${record.token.taskHash}/${record.token.requestId}`;
    if (identities.has(key)) fail('ledger-invalid');
    identities.add(key);
  }
  return ledger;
}

function normalizedUsage(usage) {
  if (!isObject(usage)) return null;
  const raw = Object.hasOwn(usage, 'prompt_tokens') || Object.hasOwn(usage, 'completion_tokens');
  const normalized = ['promptTokens', 'completionTokens', 'reasoningTokens', 'cacheReadTokens']
    .some(key => Object.hasOwn(usage, key));
  if (raw && normalized) return null;
  if (!raw) return usage;
  // Missing detail counters stay undefined so admission accounting cannot infer zero.
  return { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
    cacheReadTokens: usage.prompt_tokens_details?.cached_tokens,
    providerReportedCost: usage.cost === undefined ? null : usage.cost,
    ...(usage.total_tokens === undefined ? {} : { total_tokens: usage.total_tokens }) };
}

function safeUsage(value) {
  const usage = normalizedUsage(value);
  if (!usage) return null;
  const result = {};
  for (const [key, value] of Object.entries(usage)) {
    if (USAGE_KEYS.has(key) && finiteCost(value)) result[key] = value;
    if (key === 'providerReportedCost' && value === null) result[key] = null;
    if (key === 'costProvenance' && typeof value === 'string' && /^[a-zA-Z0-9._:/-]{1,128}$/.test(value)) result[key] = value;
  }
  return result;
}

function completeUsage(value) {
  const usage = normalizedUsage(value);
  if (!usage) return false;
  const counters = ['promptTokens', 'completionTokens', 'reasoningTokens', 'cacheReadTokens'];
  if (!counters.every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)) return false;
  if (usage.reasoningTokens > usage.completionTokens || usage.cacheReadTokens > usage.promptTokens) return false;
  if (usage.total_tokens !== undefined && usage.total_tokens !== usage.promptTokens + usage.completionTokens) return false;
  return Object.entries(usage).every(([key, value]) => !USAGE_KEYS.has(key) ||
    (key === 'providerReportedCost' && value === null) || finiteCost(value));
}

function safeMetadata(metadata) {
  const result = {};
  if (!isObject(metadata)) return result;
  for (const [key, value] of Object.entries(metadata)) {
    if (METADATA_KEYS.has(key)) {
      if (value === null || typeof value === 'boolean' || finiteCost(value)) result[key] = value;
      else if (typeof value === 'string' && Buffer.byteLength(value) <= 256 &&
        (key === 'taskId' || /^[a-zA-Z0-9._:/ -]*$/.test(value))) result[key] = value;
    }
    if (key === 'metadataHashes' && isObject(value)) {
      result.metadataHashes = Object.fromEntries(['models', 'endpoints', 'zdr']
        .filter(name => typeof value[name] === 'string' && HASH.test(value[name]))
        .map(name => [name, value[name]]));
    }
    if (key === 'usage') result.usage = safeUsage(value);
  }
  return result;
}

function withinBudgets(ledger, token, timestamp) {
  const date = new Date(timestamp).toISOString();
  let task = HOLD, day = HOLD, month = HOLD;
  for (const record of ledger.requests) {
    const cost = record.costUsd ?? 0;
    const reserve = record.reservationUsd;
    if (record.token.taskHash === token.taskHash) task += cost + reserve;
    const chargedDate = new Date(record.createdAt).toISOString();
    day += reserve + (chargedDate.slice(0, 10) === date.slice(0, 10) ? cost : 0);
    month += reserve + (chargedDate.slice(0, 7) === date.slice(0, 7) ? cost : 0);
  }
  return task <= 1 + Number.EPSILON && day <= 5 + Number.EPSILON && month <= 20 + Number.EPSILON;
}

/** Explicit roots are capabilities. Constructing a store never reads or creates state. */
export function createKimiReviewStore({ root, operatorRoot, now = () => Date.now() } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || typeof operatorRoot !== 'string' ||
      !path.isAbsolute(operatorRoot) || typeof now !== 'function') throw new TypeError('Explicit absolute root and operatorRoot are required');
  if (root !== path.resolve(root) || operatorRoot !== path.resolve(operatorRoot)) throw new TypeError('Roots must be canonical absolute paths');
  const operatorFile = path.join(operatorRoot, 'kimi-review-ledger.json');

  function paths(token) {
    const taskDir = path.join(root, '.great_cto', 'kimi-review', token.taskHash);
    const requestDir = path.join(taskDir, token.requestId);
    return { taskDir, requestDir, taskFile: path.join(taskDir, 'ledger.json'),
      metadataFile: path.join(requestDir, 'metadata.json'), reportFile: path.join(requestDir, 'report.json') };
  }

  function prepareRoots() {
    checkedAncestors(root);
    checkedDirectory(root);
    checkedAncestors(path.dirname(operatorRoot));
    ensurePrivateDirectory(operatorRoot);
    ensurePrivateDirectory(path.join(root, '.great_cto'));
    ensurePrivateDirectory(path.join(root, '.great_cto', 'kimi-review'));
  }

  function transaction(token, callback) {
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8640000000000000) fail('clock-invalid');
    prepareRoots();
    const unlockOperator = acquireLock(operatorFile + '.lock', timestamp);
    let unlockTask;
    let uncertainCommit = false;
    try {
      const locations = paths(token);
      ensurePrivateDirectory(locations.taskDir);
      unlockTask = acquireLock(locations.taskFile + '.lock', timestamp);
      const loaded = readJson(operatorFile, { missing: true });
      const ledger = loaded === MISSING ? { version: 1, lastObservedAt: timestamp, requests: [] } : validateLedger(loaded);
      if (timestamp < ledger.lastObservedAt) fail('clock-backward');
      const taskLedger = readJson(locations.taskFile, { missing: true });
      if (taskLedger !== MISSING) validateLedger(taskLedger);
      // A secondary record without its authority is a damaged installation, not a fresh budget.
      if (loaded === MISSING && taskLedger !== MISSING) fail('ledger-invalid');
      ledger.lastObservedAt = timestamp;
      return callback(ledger, locations, timestamp);
    } catch (error) {
      uncertainCommit = error.commitUncertain === true;
      throw error;
    } finally {
      // A sync failure leaves owned diagnostic locks for explicit recovery. Releasing
      // those locks would permit admission against a commit whose durability is unknown.
      if (!uncertainCommit) {
        try { if (unlockTask) unlockTask(); } finally { unlockOperator(); }
      }
    }
  }

  function writeTask(ledger, locations) {
    atomicJson(locations.taskFile, { version: 1, lastObservedAt: ledger.lastObservedAt,
      requests: ledger.requests.filter(record => record.token.taskHash === path.basename(locations.taskDir)) });
  }

  function findRecord(ledger, token) {
    const record = ledger.requests.find(item => item.token.taskHash === token.taskHash && item.token.requestId === token.requestId);
    if (!record || Object.keys(record.token).some(key => record.token[key] !== token[key])) fail('invalid-token');
    return record;
  }

  async function begin(request) {
    try {
      if (!validIdentity(request)) fail('invalid-input');
      const token = { version: 1, taskId: request.taskId, taskHash: hashTask(request.taskId),
        requestId: request.requestId, bindingDigest: request.bindingDigest, reservationUsd: HOLD };
      return transaction(token, (ledger, locations, timestamp) => {
        if (ledger.requests.some(record => record.token.requestId === token.requestId)) fail('duplicate-request');
        if (ledger.requests.some(record => record.token.taskHash === token.taskHash &&
          (ACTIVE.has(record.state) || record.state === 'breach'))) fail('task-unresolved');
        if (!withinBudgets(ledger, token, timestamp)) fail('budget-denied');
        const record = { token, state: 'preparing', sent: false, costState: 'Unknown',
          costUsd: null, reservationUsd: HOLD, evidence: null, createdAt: timestamp, updatedAt: timestamp };
        ledger.requests.push(record);
        // Commit the full hold first. Every subsequent failure leaves it unresolved.
        atomicJson(operatorFile, ledger);
        // An existing UUID directory may be orphaned evidence. Never replace its bytes.
        fs.mkdirSync(locations.requestDir, { mode: 0o700 });
        checkedDirectory(locations.requestDir, { privateMode: true });
        syncDirectory(locations.taskDir);
        atomicJson(locations.metadataFile, { ...safeMetadata(request.metadata), taskId: token.taskId,
          requestId: token.requestId, bindingDigest: token.bindingDigest, reservationUsd: HOLD });
        record.state = 'reserved';
        writeTask(ledger, locations);
        atomicJson(operatorFile, ledger);
        return { ok: true, token };
      });
    } catch (error) { return deny(error); }
  }

  async function markSent(token) {
    try {
      if (!validToken(token)) fail('invalid-token');
      return transaction(token, (ledger, locations, timestamp) => {
        const record = findRecord(ledger, token);
        if (record.state !== 'reserved') fail('task-unresolved');
        record.state = 'sent';
        record.sent = true;
        record.updatedAt = timestamp;
        atomicJson(operatorFile, ledger);
        const metadata = readJson(locations.metadataFile);
        if (!isObject(metadata)) fail('ledger-invalid');
        atomicJson(locations.metadataFile, { ...safeMetadata(metadata), status: 'sent' });
        writeTask(ledger, locations);
        return { ok: true };
      });
    } catch (error) { return deny(error); }
  }

  async function finish(token, outcome) {
    try {
      if (!validToken(token) || !isObject(outcome)) fail('invalid-token');
      return transaction(token, (ledger, locations, timestamp) => {
        const record = findRecord(ledger, token);
        if (!['reserved', 'sent'].includes(record.state)) fail('task-unresolved');
        const provenNoSend = record.state === 'reserved' && !record.sent && outcome.sent === false &&
          outcome.costState === 'not-incurred' && outcome.costUsd === 0;
        const knownCost = ['known', 'breach'].includes(outcome.costState) && finiteCost(outcome.costUsd);
        const usableReport = outcome.status !== 'complete' || isObject(outcome.report);
        const validUsage = completeUsage(outcome.usage);
        const canAccount = knownCost && usableReport && validUsage;
        record.sent = record.sent || outcome.sent === true;
        record.state = 'Unknown';
        record.costState = 'Unknown';
        record.evidence = null;
        if (knownCost) record.costUsd = outcome.costUsd;
        record.updatedAt = timestamp;
        atomicJson(operatorFile, ledger);
        const priorMetadata = readJson(locations.metadataFile);
        if (!isObject(priorMetadata)) fail('ledger-invalid');
        // Required evidence and the secondary accounting must be durable before a release.
        const finalMetadata = { ...safeMetadata(priorMetadata), ...safeMetadata(outcome.metadata),
          ...safeMetadata({ status: outcome.status }), costState: canAccount ? (outcome.costUsd > HOLD ? 'breach' : 'known') :
            provenNoSend ? 'not-incurred' : 'Unknown', costUsd: canAccount ? outcome.costUsd : null,
          usage: safeUsage(outcome.usage) };
        const finalReport = outcome.report ?? null;
        atomicJson(locations.metadataFile, finalMetadata);
        atomicJson(locations.reportFile, finalReport);
        const heldRecord = { ...record };
        record.evidence = { metadataSha256: hashJson(finalMetadata), reportSha256: hashJson(finalReport) };
        if (canAccount || provenNoSend) {
          record.state = provenNoSend ? 'no-send' : outcome.costUsd > HOLD ? 'breach' : 'complete';
          record.costState = provenNoSend ? 'not-incurred' : outcome.costUsd > HOLD ? 'breach' : 'known';
          record.costUsd = provenNoSend ? 0 : outcome.costUsd;
          record.reservationUsd = 0;
        }
        writeTask(ledger, locations);
        try { atomicJson(operatorFile, ledger); }
        catch (error) {
          // Keep the known cost and the full hold if the final release was ambiguous.
          // If storage stays broken, diagnostic locks remain the admission fence.
          Object.assign(record, heldRecord);
          try { atomicJson(operatorFile, ledger); } catch { /* Preserve the original safe error. */ }
          throw error;
        }
        return { ok: true, privateReportPath: outcome.report == null ? null : locations.reportFile };
      });
    } catch (error) { return { ...deny(error), privateReportPath: null }; }
  }

  async function read(token) {
    try {
      if (!validToken(token)) fail('invalid-token');
      return transaction(token, (ledger, locations) => {
        const record = findRecord(ledger, token);
        if (record.state === 'preparing') fail('persistence-failed');
        const metadata = readJson(locations.metadataFile);
        if (!isObject(metadata)) fail('ledger-invalid');
        const loadedReport = readJson(locations.reportFile, { missing: true });
        const report = loadedReport === MISSING ? null : loadedReport;
        if (record.evidence !== null && (record.evidence.metadataSha256 !== hashJson(metadata) ||
            loadedReport === MISSING || record.evidence.reportSha256 !== hashJson(report))) fail('evidence-invalid');
        // Secondary evidence can be ahead of authority after a torn finish transaction.
        // Its completed status must never turn an unresolved hold into a successful result.
        const authoritativeMetadata = { ...metadata, costState: record.costState,
          costUsd: record.costUsd, reservationUsd: record.reservationUsd };
        if (ACTIVE.has(record.state) && record.evidence === null && metadata.status === 'complete') {
          authoritativeMetadata.status = 'failed';
          authoritativeMetadata.reasonCode = 'persistence-failed';
        }
        atomicJson(operatorFile, ledger);
        return { ok: true, metadata: authoritativeMetadata, report, reservation: { ...record, token: { ...record.token } } };
      });
    } catch (error) { return deny(error); }
  }

  return Object.freeze({ begin, markSent, finish, read });
}
