import { Worker } from 'node:worker_threads';
import path from 'node:path';

function computeReport(days, projectPath) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./usage-report-worker.mjs', import.meta.url), { workerData: { days, projectPath } });
    worker.unref();
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(Error('statistics deadline exceeded')), 120000);
    timer.unref();
    worker.once('message', result => finish(null, result));
    worker.once('error', error => finish(error));
    worker.once('exit', () => finish(Error('statistics worker exited without a result')));
  });
}

/** Bounded stale-while-refresh cache. One scan at a time, off the HTTP thread. */
export function usageReports({ compute = computeReport, now = Date.now, ttlMs = 60000, limit = 8 } = {}) {
  const slots = new Map(); let running = null, runningKey = null;
  return {
    get(days, projectPath = null) {
      projectPath = projectPath ? path.resolve(projectPath) : null;
      const key = JSON.stringify([days, projectPath]);
      let slot = slots.get(key);
      if (!slot) {
        if (slots.size >= limit) slots.delete(slots.keys().next().value);
        slot = { value: null, at: 0 }; slots.set(key, slot);
      }
      if ((!slot.value || now() - slot.at >= ttlMs) && !running) {
        runningKey = key;
        running = Promise.resolve().then(() => compute(days, projectPath)).then(value => {
          if (value?.state === 'counted') { slot.value = value; slot.error = null; }
          else if (!slot.value) slot.value = { state: 'unavailable', why: value?.why || 'Statistics could not be read.' };
          else slot.error = value?.why || 'Statistics refresh failed.';
        }, () => {
          if (!slot.value) slot.value = { state: 'unavailable', why: 'Statistics worker failed; retry after a minute.' };
          else slot.error = 'Statistics refresh failed.';
        }).finally(() => { slot.at = now(); running = null; runningKey = null; });
      }
      if (!slot.value) return { state: 'computing', why: 'Reading session statistics in a background worker; navigation remains available.' };
      return { ...slot.value, refreshing: runningKey === key, stale: !!slot.error || now() - slot.at >= ttlMs, refreshError: slot.error || null };
    },
  };
}
