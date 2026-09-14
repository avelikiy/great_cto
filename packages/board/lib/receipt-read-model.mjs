import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./receipt-worker.mjs', import.meta.url));
const receipts = new Map();
let nextRevision = 1;
const DEFAULT_TTL_MS = 30_000;

function runWorker(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, cwd], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `receipt worker exited ${code}`));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error('receipt worker returned invalid JSON')); }
    });
  });
}

function view(entry) {
  if (!entry?.data) return {
    state: entry?.error ? 'unreadable' : 'computing',
    why: entry?.error || 'receipt is being computed in the background',
    projection: { freshness: entry?.error ? 'unreadable' : 'loading', revision: entry?.revision || 0, computed_at: null },
  };
  return {
    ...entry.data,
    projection: {
      freshness: entry.building || entry.expired ? 'stale' : 'current',
      revision: entry.revision,
      computed_at: entry.computedAt,
      ...(entry.error ? { why: entry.error } : {}),
    },
  };
}

function receiptReadModel(cwd, { runner = runWorker, ttlMs = DEFAULT_TTL_MS, onUpdate } = {}) {
  let entry = receipts.get(cwd);
  const expired = !!entry?.data && Date.now() - entry.computedAtMs >= ttlMs;
  if (!entry) {
    entry = { data: null, revision: 0, computedAt: null, computedAtMs: 0, building: false, expired: true, error: null, epoch: 0 };
    receipts.set(cwd, entry);
  }
  entry.expired = expired || entry.expired;
  if (!entry.building && (!entry.data || entry.expired)) {
    entry.building = true;
    const buildEpoch = entry.epoch || 0;
    setImmediate(async () => {
      try {
        entry.data = await runner(cwd);
        entry.revision = nextRevision++;
        entry.computedAtMs = Date.now();
        entry.computedAt = new Date(entry.computedAtMs).toISOString();
        entry.expired = (entry.epoch || 0) !== buildEpoch;
        entry.error = null;
      } catch (error) {
        entry.error = String(error?.message || error);
        entry.expired = true;
      } finally {
        entry.building = false;
        try { onUpdate?.(view(entry)); } catch { /* observer failure is not receipt failure */ }
        if (entry.expired && !entry.error && (entry.epoch || 0) !== buildEpoch) {
          setImmediate(() => receiptReadModel(cwd, { runner, ttlMs, onUpdate }));
        }
      }
    });
  }
  return view(entry);
}

function invalidateReceipt(cwd) {
  const entry = receipts.get(cwd);
  if (entry) { entry.expired = true; entry.epoch = (entry.epoch || 0) + 1; }
}

function clearReceipts() {
  receipts.clear();
  nextRevision = 1;
}

export { receiptReadModel, invalidateReceipt, clearReceipts, runWorker };
