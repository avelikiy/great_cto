/** `great-cto tracker …` runs the task-store CLI shipped beside the board runtime. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { codexControllerCandidates } from './codex-host.js';

export function runTracker(args: string[]): number {
  const script = codexControllerCandidates().map(p => join(dirname(p), 'tracker.mjs')).find(existsSync);
  if (!script) { process.stderr.write('great-cto: tracker runtime is missing; reinstall package\n'); return 2; }
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.error) { process.stderr.write('great-cto: ' + result.error.message + '\n'); return 2; }
  return result.status ?? 2;
}
