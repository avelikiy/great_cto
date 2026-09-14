import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./snapshot-worker.mjs', import.meta.url));

function runSnapshotWorker(cwd) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER, [cwd], { silent: true });
    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.once('message', (message) => {
      if (message?.ok) resolve(message.data);
      else reject(new Error(message?.why || 'snapshot worker failed'));
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `snapshot worker exited ${code}`));
    });
  });
}

export { runSnapshotWorker };
