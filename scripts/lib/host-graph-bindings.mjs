/** Explicit local enrollment; native observation grants no execution authority. */
import { createHash, randomUUID } from 'node:crypto';
import { constants, openSync, closeSync, fstatSync, fsyncSync, linkSync, mkdirSync, lstatSync, existsSync, readFileSync, writeFileSync, realpathSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { assertExternal, projectIdentity } from './work-tasks.mjs';
import { readHostGraph } from './host-graph-journal.mjs';
import { graphBinding, observeHostGraph, projectHostObservations, recordHostGraphGap } from './host-graph-observer.mjs';
import { codexNativeTurnIdentity } from './host-graph-events.mjs';
const hostSet = new Set(['codex', 'claude-code']);
const validVersion = value => value === null || (typeof value === 'string' && value.length <= 80 && /^\d{1,5}\.\d{1,5}\.\d{1,5}(?:[-.+][A-Za-z0-9.-]{1,32})?$/.test(value));
const identity = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
export const nativeGraphStore = () => process.env.GREAT_CTO_GRAPH_BINDINGS_DIR || join(homedir(), '.great_cto', 'graph-bindings');
const key = (root, host, sessionId) => createHash('sha256').update(JSON.stringify([projectIdentity(root), host, sessionId])).digest('hex');
function secure(root, store, create = false) {
  assertExternal(root, store);
  let current = resolve(store);
  while (current !== dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw Error('graph binding store has a symbolic link');
    current = dirname(current);
  }
  if (create) mkdirSync(store, { recursive: true, mode: 0o700 });
  if (existsSync(store) && (!lstatSync(store).isDirectory() || (lstatSync(store).mode & 0o077) || (process.getuid && lstatSync(store).uid !== process.getuid()))) throw Error('graph bindings require private permissions');
}
function syncDirectory(store) { const fd = openSync(store, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } }
function readPrivate(file) {
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.mode & 0o077 || stat.size > 4096 || (process.getuid && stat.uid !== process.getuid())) throw Error('unsafe graph enrollment');
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
}
function load(root, host, sessionId, store) {
  secure(root, store);
  const file = join(store, `${key(root, host, sessionId)}.json`);
  if (!existsSync(file)) return null;
  const b = readPrivate(file);
  if (b.version !== 1 || b.root !== realpathSync(root) || b.projectId !== projectIdentity(root) || b.host !== host || b.sessionId !== sessionId || b.runId !== sessionId) throw Error('graph enrollment binding mismatch');
  return b;
}
export function bindNativeGraph({ root, host, sessionId, sourceVersion = null }, { store = nativeGraphStore() } = {}) {
  if (!hostSet.has(host) || !identity(sessionId) || !validVersion(sourceVersion)) throw Error('invalid native graph binding');
  secure(root, store, true);
  const binding = { version: 1, ...graphBinding({ root: realpathSync(root), runId: sessionId, sessionId }), host, sourceVersion };
  const file = join(store, `${key(root, host, sessionId)}.json`), tmp = `${file}.${process.pid}.tmp`;
  if (existsSync(file)) { load(root, host, sessionId, store); throw Error('session already enrolled; remove binding before changing capabilities'); }
  try { writeFileSync(tmp, JSON.stringify(binding), { mode: 0o600, flag: 'wx' });
    const fd = openSync(tmp, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); }
    linkSync(tmp, file); }
  finally { rmSync(tmp, { force: true }); syncDirectory(store); }
  return { state: 'enrolled', host, sessionId, projectId: binding.projectId, authority: 'observation-only' };
}
export function unbindNativeGraph({ root, host, sessionId }, { store = nativeGraphStore() } = {}) {
  if (!hostSet.has(host) || !identity(sessionId)) throw Error('invalid native graph binding');
  const b = load(root, host, sessionId, store);
  if (b) { rmSync(join(store, `${key(root, host, sessionId)}.json`)); syncDirectory(store); }
  return { state: b ? 'unenrolled' : 'absent', authority: 'observation-only' };
}
export function observeNativeGraphHook({ root, host, event }, { store = nativeGraphStore(), journalStore } = {}) {
  const sessionId = event?.session_id;
  if (!hostSet.has(host) || !identity(sessionId)) return { state: 'ignored' };
  let b = load(root, host, sessionId, store);
  if (!b && event.hook_event_name === 'SessionStart') {
    const policyFile = join(store, `${key(root, host, 'project-policy')}.policy`);
    if (existsSync(policyFile)) {
      const policy = readPrivate(policyFile);
      if (policy.version !== 1 || policy.projectId !== projectIdentity(root) || policy.root !== realpathSync(root) || policy.host !== host || policy.enabled !== true) throw Error('invalid graph observation policy');
      bindNativeGraph({ root, host, sessionId, sourceVersion: policy.sourceVersion }, { store });
      b = load(root, host, sessionId, store);
    }
  }
  if (!b) return { state: 'not-enrolled' };
  const turnHook = ['UserPromptSubmit', 'Stop'].includes(event.hook_event_name);
  const sourceIdentityPresent = host === 'codex' && turnHook ? !!codexNativeTurnIdentity(event) : !!event.event_id;
  if ((turnHook || (event.hook_event_name === 'SessionStart' && event.source === 'resume')) && !sourceIdentityPresent) {
    // Retain each received delivery without pretending it has a replay-safe host ID.
    b = { ...b, sourceEventId: randomUUID() };
    recordHostGraphGap(b, host, 'native', ['missing-source-event-identity'], { store: journalStore });
  }
  if (['SubagentStart', 'SubagentStop'].includes(event.hook_event_name)) {
    const roots = readHostGraph(b, { store: journalStore }).events.filter(e => e.host === host && e.kind === 'session' && e.phase === 'started');
    if (roots.length) b = { ...b, parentIds: [roots[0].id] }; // Same explicitly enrolled session; containment, not dispatch order.
  }
  return observeHostGraph({ binding: b, host, mode: 'native', sourceVersion: b.sourceVersion, event, store: journalStore });
}
export function nativeGraphObservations(root, { store = nativeGraphStore(), journalStore } = {}) {
  secure(root, store);
  if (!existsSync(store)) return [];
  const rows = [];
  // Enrollment files are bounded and read only after exact project matching.
  const names = readdirSync(store).filter(n => /^[a-f0-9]{64}\.json$/.test(n));
  if (names.length > 4096) throw Error('native graph enrollment read limit');
  for (const name of names) {
    const file = join(store, name);
    const candidate = readPrivate(file);
    if (candidate.projectId !== projectIdentity(root)) continue;
    if (!hostSet.has(candidate.host) || !identity(candidate.sessionId)) throw Error('invalid graph enrollment');
    const b = load(root, candidate.host, candidate.sessionId, store);
    if (name !== `${key(root, b.host, b.sessionId)}.json`) throw Error('invalid graph enrollment filename');
    rows.push({ host: b.host, sessionId: b.sessionId, runId: b.runId,
      graph: projectHostObservations(b, { store: journalStore }) });
  }
  return rows;
}

/** Bounded page of exactly one explicitly enrolled session. */
export function readNativeGraphPage({ root, host, sessionId, cursor = null, limit = 200 }, { store = nativeGraphStore(), journalStore } = {}) {
  if (!hostSet.has(host) || !identity(sessionId)) throw Error('invalid native graph binding');
  const b = load(root, host, sessionId, store);
  if (!b) throw Error('native session is not enrolled in this project');
  return projectHostObservations(b, { store: journalStore, cursor, limit });
}

/** Project opt-in before SessionStart permits observation from the real start event. */
export function enableNativeGraph({ root, host, sourceVersion = null }, { store = nativeGraphStore() } = {}) {
  if (!hostSet.has(host) || !validVersion(sourceVersion)) throw Error('invalid graph observation policy');
  secure(root, store, true);
  const file = join(store, `${key(root, host, 'project-policy')}.policy`);
  const body = { version: 1, projectId: projectIdentity(root), root: realpathSync(root), host, sourceVersion, enabled: true };
  const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
  try { writeFileSync(fd, JSON.stringify(body)); fsyncSync(fd); } finally { closeSync(fd); }
  syncDirectory(store);
  return { state: 'enabled', host, projectId: body.projectId, scope: 'new native sessions in this exact project', authority: 'observation-only' };
}
export function disableNativeGraph({ root, host }, { store = nativeGraphStore() } = {}) {
  if (!hostSet.has(host)) throw Error('invalid graph host');
  secure(root, store);
  const file = join(store, `${key(root, host, 'project-policy')}.policy`);
  if (existsSync(file)) { const p = readPrivate(file); if (p.projectId !== projectIdentity(root) || p.host !== host) throw Error('graph policy mismatch'); rmSync(file); }
  // Revocation also stops already-enrolled sessions for this host/project.
  for (const row of nativeGraphObservations(root, { store })) if (row.host === host) unbindNativeGraph({ root, host, sessionId: row.sessionId }, { store });
  if (existsSync(store)) syncDirectory(store);
  return { state: 'disabled', authority: 'observation-only', retainedHistory: true };
}
