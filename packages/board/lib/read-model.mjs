// Revisioned, last-good project snapshots for the Board boot path.
//
// A request never waits for materialisation. Cold reads return an explicit
// `loading` state; refreshes return the previous revision as `stale` while the
// next one is built. This is deliberately a cache of projections, not a cache
// of HTTP responses: callers can still expose provenance and degradation.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const snapshots = new Map();
let nextRevision = 1;
const DEFAULT_TTL_MS = 30_000;

function publicSnapshot(cwd) {
  const entry = snapshots.get(cwd);
  if (!entry) return { state: 'loading', stale: true, revision: 0, generated_at: null, data: null };
  if (entry.data) {
    return {
      state: entry.building || entry.invalidated ? 'stale' : 'current',
      stale: !!(entry.building || entry.invalidated),
      revision: entry.revision,
      generated_at: entry.generatedAt,
      data: entry.data,
      ...(entry.lastError ? { why: entry.lastError } : {}),
    };
  }
  return {
    state: entry.lastError ? 'unreadable' : 'loading',
    stale: true,
    revision: entry.revision || 0,
    generated_at: null,
    data: null,
    ...(entry.lastError ? { why: entry.lastError } : {}),
  };
}

function persistedPath(cwd, persistDir) {
  const key = createHash('sha256').update(path.resolve(cwd)).digest('hex').slice(0, 24);
  return path.join(persistDir, `${key}.json`);
}

function loadPersisted(cwd, persistDir) {
  if (!persistDir) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(persistedPath(cwd, persistDir), 'utf8'));
    if (parsed?.version !== 1 || parsed?.project !== path.resolve(cwd)
      || !parsed?.data || !Number.isInteger(parsed.revision)) return null;
    nextRevision = Math.max(nextRevision, parsed.revision + 1);
    return {
      data: parsed.data,
      revision: parsed.revision,
      generatedAt: parsed.generated_at || null,
      generatedAtMs: Date.parse(parsed.generated_at || '') || 0,
      building: false,
      epoch: 0,
      // A process restart cannot prove that the files stayed unchanged. The
      // persisted projection is useful immediately, but explicitly stale.
      invalidated: true,
      lastError: null,
    };
  } catch { return null; }
}

function savePersisted(cwd, persistDir, entry) {
  if (!persistDir || !entry.data) return;
  try {
    fs.mkdirSync(persistDir, { recursive: true, mode: 0o700 });
    const target = persistedPath(cwd, persistDir);
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({
      version: 1,
      project: path.resolve(cwd),
      revision: entry.revision,
      generated_at: entry.generatedAt,
      data: entry.data,
    }), { mode: 0o600 });
    fs.renameSync(temp, target);
  } catch { /* persistence is an accelerator, never a reason to lose live data */ }
}

function materializeSnapshot(cwd, builder, { onUpdate, ttlMs = DEFAULT_TTL_MS, persistDir } = {}) {
  let entry = snapshots.get(cwd);
  if (!entry) {
    entry = loadPersisted(cwd, persistDir)
      || { data: null, revision: 0, generatedAt: null, generatedAtMs: 0, building: false, invalidated: true, lastError: null };
    snapshots.set(cwd, entry);
  }
  if (entry.data && Date.now() - entry.generatedAtMs >= ttlMs) entry.invalidated = true;
  if (!entry.building && (entry.invalidated || !entry.data)) {
    entry.building = true;
    entry.epoch ||= 0;
    const buildEpoch = entry.epoch;
    // Defer the builder so the route can finish the cold response first.
    setImmediate(async () => {
      try {
        const data = await builder();
        entry.data = data;
        entry.revision = nextRevision++;
        entry.generatedAt = new Date().toISOString();
        entry.generatedAtMs = Date.now();
        // A file event during the build means these bytes may already be old.
        // Publish them as last-good stale, then immediately build again.
        entry.invalidated = entry.epoch !== buildEpoch;
        entry.lastError = null;
        savePersisted(cwd, persistDir, entry);
      } catch (error) {
        entry.lastError = String(error?.message || error);
        // Keep last-good data. A failed refresh is stale, never empty-current.
        entry.invalidated = true;
      } finally {
        entry.building = false;
        try { onUpdate?.(publicSnapshot(cwd)); } catch { /* observer failure is not projection failure */ }
        if (entry.invalidated && !entry.lastError && entry.epoch !== buildEpoch) {
          setImmediate(() => materializeSnapshot(cwd, builder, { onUpdate, ttlMs, persistDir }));
        }
      }
    });
  }
  return publicSnapshot(cwd);
}

function invalidateSnapshot(cwd) {
  const entry = snapshots.get(cwd);
  if (entry) { entry.invalidated = true; entry.epoch = (entry.epoch || 0) + 1; }
}

function clearSnapshots() {
  snapshots.clear();
  nextRevision = 1;
}

export { publicSnapshot, materializeSnapshot, invalidateSnapshot, clearSnapshots, persistedPath };
