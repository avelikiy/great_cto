import path from 'node:path';
import { spawnBdRead } from './bd-read-worker.mjs';
import { receiptReadEntry } from './receipt-read-worker.mjs';
const pending = new Map();
const MAX_ACTIVE = 2, MAX_BYTES = 16 * 1024 * 1024;
export function readBindingReceipt(cwd, { timeoutMs = 20000 } = {}) {
  return readEvidence(cwd, 'binding', timeoutMs);
}
export function readApprovalReceipt(cwd, { timeoutMs = 20000 } = {}) {
  return readEvidence(cwd, 'approval', timeoutMs);
}
export function readSecondOpinion(cwd, { timeoutMs = 20000 } = {}) {
  return readEvidence(cwd, 'second-opinion', timeoutMs);
}
function readEvidence(cwd, mode, timeoutMs) {
  cwd = path.resolve(cwd);
  const key = JSON.stringify([cwd, mode]);
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= MAX_ACTIVE) return Promise.reject(Error('Receipt reader busy; retry'));
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 20000) return Promise.reject(Error('Invalid receipt deadline'));
  const operation = new Promise((resolve, reject) => {
    let child, deadline, escalation, settled = false, resultCode, out = '', bytes = 0;
    const grouped = process.platform !== 'win32';
    const signal = s => { try { if (grouped) process.kill(-child.pid, s); else child.kill(s); } catch {} };
    const finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(deadline); clearTimeout(escalation);
      if (error) reject(error); else resolve(value);
    };
    const stop = message => {
      if (settled || escalation) return;
      signal('SIGTERM');
      escalation = setTimeout(() => {
        signal('SIGKILL'); child.stdout?.destroy(); child.stderr?.destroy(); finish(Error(message));
      }, 250);
    };
    try {
      child = spawnBdRead(process.execPath, { cwd, detached: grouped, commandArgs: [receiptReadEntry, mode], readDeadlineMs: timeoutMs + 250 });
      deadline = setTimeout(() => stop('Receipt read timed out'), timeoutMs);
      child.on('message', m => { if (m?.type === 'bd-read-result' && Number.isInteger(m.code)) resultCode = m.code; });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        if (settled || escalation) return;
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_BYTES) stop('Receipt output exceeded limit'); else out += chunk;
      });
      child.stderr.resume();
      child.on('error', () => finish(Error('Receipt worker unavailable')));
      child.on('close', code => {
        if (settled) return;
        if (escalation) { signal('SIGKILL'); finish(Error('Receipt read unavailable')); return; }
        if ((resultCode ?? code) !== 0) { finish(Error('Receipt worker failed')); return; }
        try {
          const value = JSON.parse(out);
          if (!value || !Object.hasOwn(value, 'receipt')) throw Error();
          const evidence = value.receipt;
          if (mode === 'binding') {
            if (evidence !== null && (!evidence?.head || !evidence.files)) throw Error();
          } else {
            const states = mode === 'approval' ? ['no-receipt', 'unreadable', 'differs', 'extended', 'matches'] : ['not-run', 'unmeasured', 'unreadable', 'ok'];
            if (!states.includes(evidence?.state)) throw Error();
          }
          finish(null, evidence);
        } catch { finish(Error('Receipt worker returned invalid evidence')); }
      });
    } catch { finish(Error('Receipt worker unavailable')); }
  });
  pending.set(key, operation);
  operation.then(() => pending.delete(key), () => pending.delete(key));
  return operation;
}
