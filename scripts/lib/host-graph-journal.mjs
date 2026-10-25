/** Private observations only. This journal cannot dispatch, approve or verify work. */
import { createHash } from 'node:crypto';
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const HOST_GRAPH_LIMITS = Object.freeze({ events: 4096, bytes: 4 * 1024 * 1024, eventBytes: 4096, page: 200 });
export const hostGraphStore = () => process.env.GREAT_CTO_HOST_GRAPHS_DIR || join(homedir(), '.great_cto', 'host-graphs');
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const identity = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
const hosts = new Set(['codex', 'claude-code']), modes = new Set(['controlled', 'native']);
const kinds = new Set(['session', 'turn', 'tool', 'child', 'error']);
const phases = new Set(['started', 'completed', 'failed', 'stopped', 'unknown']);
const outcomes = new Set(['unknown', 'succeeded', 'failed', 'cancelled']);
const tools = new Set(['shell', 'read', 'write', 'search', 'mcp', 'agent', 'other']);
export const HOST_GRAPH_DIAGNOSTICS = Object.freeze(['unsupported-host-or-mode', 'invalid-trusted-binding', 'invalid-event', 'unsupported-event-shape', 'invalid-trusted-parents', 'missing-explicit-parent', 'missing-source-event-identity', 'source-version-unverified', 'observer-listener-failure', 'observer-transport-failure']);
const diagnosticCodes = new Set(HOST_GRAPH_DIAGNOSTICS);
const date = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const safeVersion = value => value === null || value === undefined || (typeof value === 'string' && /^\d{1,5}(?:\.\d{1,5}){0,3}(?:[-+][0-9A-Za-z.-]{1,32})?$/.test(value) && value.length <= 80);

function bindingIdentity(binding) {
  if (!binding || typeof binding.root !== 'string' || !identity(binding.runId) || !identity(binding.sessionId)
    || (binding.attemptId != null && !identity(binding.attemptId)) || (binding.host != null && !hosts.has(binding.host))) throw Error('invalid journal binding');
  const root = realpathSync(binding.root), projectId = 'project:' + hash(root);
  if (binding.projectId !== projectId) throw Error('journal project binding does not match root');
  // A journal spans retries in one session, while attempts remain event-specific.
  return { root, projectId, runId: binding.runId, sessionId: binding.sessionId, host: binding.host ?? null,
    key: hash(JSON.stringify([projectId, binding.runId, binding.sessionId, ...(binding.host ? [binding.host] : [])])) };
}
function secureAncestors(path) {
  const parents = [];
  for (let cursor = resolve(path); ; cursor = dirname(cursor)) {
    parents.push(cursor); if (dirname(cursor) === cursor) break;
  }
  for (const parent of parents.reverse()) {
    try { if (lstatSync(parent).isSymbolicLink()) throw Error('journal path cannot contain symlinks'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function context(binding, store, create = false) {
  const bound = bindingIdentity(binding), location = resolve(store);
  secureAncestors(location);
  const rel = relative(bound.root, location);
  if (!rel || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))) throw Error('journal must be outside the worker project');
  if (create) mkdirSync(location, { recursive: true, mode: 0o700 });
  if (existsSync(location)) {
    const info = lstatSync(location);
    if (!info.isDirectory() || (info.mode & 0o077) || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw Error('journal store must be owner-only 0700');
  }
  return { ...bound, store: location, file: join(location, bound.key + '.jsonl') };
}
function normalize(event, binding, expected) {
  if (!event || event.schemaVersion !== 1 || !digest(event.id) || (event.sourceEventId != null && !digest(event.sourceEventId))
    || !hosts.has(event.host) || (expected.host != null && event.host !== expected.host) || !modes.has(event.mode) || !kinds.has(event.kind) || !phases.has(event.phase)
    || !outcomes.has(event.outcome) || (event.callId != null && !digest(event.callId)) || event.sessionId !== expected.sessionId
    || (event.projectId != null && event.projectId !== expected.projectId) || (event.runId != null && event.runId !== expected.runId)
    || (event.attemptId != null && !identity(event.attemptId)) || (binding.attemptId != null && event.attemptId !== binding.attemptId)
    || (event.sequence != null && (!Number.isSafeInteger(event.sequence) || event.sequence < 0))
    || !Array.isArray(event.parentIds) || event.parentIds.length > 16 || event.parentIds.some(id => !digest(id) || id === event.id)
    || (event.diagnosticCodes != null && (event.kind !== 'error' || !Array.isArray(event.diagnosticCodes) || event.diagnosticCodes.length > 16 || event.diagnosticCodes.some(code => !diagnosticCodes.has(code))))
    || !date(event.observedAt) || (event.occurredAt != null && !date(event.occurredAt))
    || (event.toolClass != null && !tools.has(event.toolClass)) || !safeVersion(event.sourceVersion)) throw Error('invalid normalized journal event');
  const value = { schemaVersion: 1, id: event.id, projectId: expected.projectId, runId: expected.runId,
    sourceEventId: event.sourceEventId ?? null, sequence: event.sequence ?? null, host: event.host, mode: event.mode,
    kind: event.kind, phase: event.phase, outcome: event.outcome, callId: event.callId ?? null, sessionId: expected.sessionId,
    attemptId: event.attemptId ?? null, parentIds: [...new Set(event.parentIds)],
    occurredAt: event.occurredAt ?? null, observedAt: event.observedAt, toolClass: event.toolClass ?? null,
    sourceVersion: event.sourceVersion ?? null, ...(event.diagnosticCodes ? { diagnosticCodes: [...new Set(event.diagnosticCodes)] } : {}) };
  if (Buffer.byteLength(JSON.stringify(value)) > HOST_GRAPH_LIMITS.eventBytes) throw Error('journal event exceeds size limit');
  return value;
}
const comparable = event => { const { observedAt, ...rest } = event; return JSON.stringify(rest); };
function descriptor(file, flags) {
  const fd = openSync(file, flags | (constants.O_NOFOLLOW || 0), 0o600);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw Error('journal file must be owner-only 0600 with one link');
    return { fd, info };
  } catch (error) { closeSync(fd); throw error; }
}
function scan(ctx, binding) {
  let opened;
  try { opened = descriptor(ctx.file, constants.O_RDONLY); }
  catch (error) { if (error.code === 'ENOENT') return { events: [], diagnostics: [], bytes: 0, tail: false, absent: true }; throw error; }
  try {
    if (opened.info.size > HOST_GRAPH_LIMITS.bytes) throw Error('journal exceeds byte quota');
    const raw = readFileSync(opened.fd, 'utf8');
    const lines = raw.split('\n'), tail = !!lines.at(-1), diagnostics = [], events = [], ids = new Map();
    if (tail) diagnostics.push('truncated-tail');
    for (const line of lines) {
      if (!line) continue;
      if (Buffer.byteLength(line) > HOST_GRAPH_LIMITS.eventBytes) { diagnostics.push('oversized-record'); continue; }
      try {
        const event = normalize(JSON.parse(line), { ...binding, attemptId: null }, ctx);
        if (ids.has(event.id)) {
          if (comparable(ids.get(event.id)) !== comparable(event)) diagnostics.push('conflicting-event-id');
          continue;
        }
        if (events.length >= HOST_GRAPH_LIMITS.events) { diagnostics.push('event-quota'); break; }
        ids.set(event.id, event); events.push(event); diagnostics.push(...(event.diagnosticCodes || []));
      } catch { diagnostics.push('malformed-record'); }
    }
    if (events.length >= HOST_GRAPH_LIMITS.events) diagnostics.push('event-quota');
    return { events, diagnostics: [...new Set(diagnostics)], bytes: Buffer.byteLength(raw), tail, absent: false };
  } finally { closeSync(opened.fd); }
}
const reasonFor = error => typeof error?.code === 'string' && /^E[A-Z0-9_]+$/.test(error.code)
  ? `journal I/O unavailable (${error.code})` : String(error?.message || 'journal unavailable').slice(0, 180);

const LOSS_CODES = new Set(['writer-contention', 'event-conflict', 'event-quota', 'byte-quota', 'append-failure', 'writer-cleanup-failure']);
function lossDiagnostics(ctx) {
  let opened;
  try {
    opened = descriptor(ctx.file + '.incomplete', constants.O_RDONLY);
    if (opened.info.size > 512) return ['invalid-loss-marker'];
    const marker = JSON.parse(readFileSync(opened.fd, 'utf8'));
    return marker?.schemaVersion === 1 && marker.binding === ctx.key && LOSS_CODES.has(marker.code)
      ? [marker.code] : ['invalid-loss-marker'];
  } catch (error) { return error.code === 'ENOENT' ? [] : ['invalid-loss-marker']; }
  finally { if (opened) closeSync(opened.fd); }
}
function markIncomplete(ctx, code) {
  if (!ctx || !LOSS_CODES.has(code)) return false;
  let fd;
  try {
    // One immutable marker is enough to establish loss, even when the journal lock is held.
    ({ fd } = descriptor(ctx.file + '.incomplete', constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL));
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, binding: ctx.key, code }) + '\n');
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
    const dir = openSync(ctx.store, constants.O_RDONLY); try { fsyncSync(dir); } finally { closeSync(dir); }
    return true;
  } catch (error) { return error.code === 'EEXIST' && lossDiagnostics(ctx).some(c => LOSS_CODES.has(c)); }
  finally { if (fd !== undefined) closeSync(fd); }
}
function lost(ctx, code, reason) {
  return { state: 'degraded', reason, lossMarker: markIncomplete(ctx, code) ? 'recorded' : 'unavailable' };
}

/** A lock failure never steals a writer lease or changes execution state. */
export function appendHostGraphEvent(binding, event, { store = hostGraphStore() } = {}) {
  let ctx, locked = false;
  try {
    ctx = context(binding, store, true);
    const value = normalize(event, binding, ctx), lock = ctx.file + '.lock';
    try { mkdirSync(lock, { mode: 0o700 }); locked = true; }
    catch (error) { if (error.code === 'EEXIST') return lost(ctx, 'writer-contention', 'journal writer is busy; delivery is incomplete'); throw error; }
    const current = scan(ctx, binding), previous = current.events.find(e => e.id === value.id);
    if (previous) return comparable(previous) === comparable(value) ? { state: 'duplicate', reason: null }
      : lost(ctx, 'event-conflict', 'conflicting event identity; history is unchanged');
    if (current.events.length >= HOST_GRAPH_LIMITS.events) return lost(ctx, 'event-quota', 'journal event quota reached; history is incomplete');
    const line = (current.tail ? '\n' : '') + JSON.stringify(value) + '\n';
    if (current.bytes + Buffer.byteLength(line) > HOST_GRAPH_LIMITS.bytes) return lost(ctx, 'byte-quota', 'journal byte quota reached; history is incomplete');
    const { fd } = descriptor(ctx.file, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT);
    try {
      const bytes = Buffer.from(line); let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
      fsyncSync(fd);
    } finally { closeSync(fd); }
    if (current.absent) { const dir = openSync(ctx.store, constants.O_RDONLY); try { fsyncSync(dir); } finally { closeSync(dir); } }
    return { state: 'recorded', reason: current.diagnostics.length ? 'earlier journal damage remains visible' : null };
  } catch (error) { return lost(ctx, 'append-failure', reasonFor(error)); }
  finally { if (locked) { try { rmSync(ctx.file + '.lock', { recursive: true, force: true }); } catch { markIncomplete(ctx, 'writer-cleanup-failure'); } } }
}
function coverage(events, diagnostics, capabilities) {
  const support = value => value === true || value === 'supported' ? true : value === false || value === 'unsupported' ? false : null;
  const item = (value, reason) => { const supported = support(value); return { supported, state: supported === false || !events.length ? 'unavailable' : 'partial', reason }; };
  // Even a terminal event cannot attest that the host delivered every event.
  return {
    lifecycle: item(capabilities?.lifecycle ?? null, diagnostics.length ? 'Observation gaps or damage are recorded.' : 'Host delivery completeness is not attested.'),
    parentChild: item(capabilities?.parentChild ?? null, 'Only explicit parent identities establish relationships.'),
    tools: item(capabilities?.tools ?? null, 'Tool observations do not establish complete host coverage.'),
    verification: item(false, 'Verifier authority comes from controller receipts, never host observations.'),
    gates: item(false, 'Gate authority comes from validated controller decisions, never host observations.'),
    artifacts: item(false, 'Publication and deployment require separately bound evidence.'),
  };
}
export function readHostGraph(binding, { store = hostGraphStore(), cursor = null, limit = HOST_GRAPH_LIMITS.page, capabilities = null } = {}) {
  let events = [], diagnostics = [];
  try {
    const ctx = context(binding, store), result = scan(ctx, binding); events = result.events; diagnostics = [...result.diagnostics, ...lossDiagnostics(ctx)];
    let offset = 0;
    if (cursor != null) {
      if (typeof cursor !== 'string' || !/^[a-f0-9]{64}:[0-9]{1,5}$/.test(cursor) || cursor.split(':')[0] !== ctx.key) throw Error('invalid journal cursor');
      offset = Number(cursor.split(':')[1]); if (offset > events.length) throw Error('journal cursor is outside history');
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > HOST_GRAPH_LIMITS.page) throw Error('invalid journal page limit');
    const ids = new Set(events.map(e => e.id));
    if (events.some(e => e.parentIds.some(id => !ids.has(id)))) diagnostics.push('missing-parent');
    const sequences = new Map();
    for (const e of events.filter(e => e.sequence != null)) {
      const source = `${e.host}:${e.attemptId || ''}`, seen = sequences.get(source) || new Set(); seen.add(e.sequence); sequences.set(source, seen);
    }
    for (const seen of sequences.values()) {
      const sorted = [...seen].sort((a, b) => a - b);
      if (sorted.some((n, i) => i > 0 && n !== sorted[i - 1] + 1)) diagnostics.push('source-sequence-gap');
    }
    diagnostics = [...new Set(diagnostics)];
    const page = events.slice(offset, offset + limit), next = offset + page.length;
    return { state: events.length ? 'recorded' : 'unavailable', events: page, total: events.length,
      cursor: next < events.length ? `${ctx.key}:${next}` : null, health: diagnostics.length ? 'degraded' : result.absent ? 'absent' : 'ok',
      reason: diagnostics.length ? 'Journal observations are incomplete.' : result.absent ? 'No host observation journal is recorded.' : null,
      diagnostics, coverage: coverage(events, diagnostics, capabilities) };
  } catch (error) {
    return { state: 'unavailable', events: [], total: 0, cursor: null, health: 'degraded', reason: reasonFor(error),
      diagnostics: ['unreadable-journal'], coverage: coverage([], ['unreadable-journal'], capabilities) };
  }
}
