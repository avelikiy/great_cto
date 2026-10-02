/** Advanced task operations share the same source/bundled runtime as daily entry. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { codexControllerCandidates } from './codex-host.js';
export function runWorkTask(args: string[]): number {
  const script = codexControllerCandidates().map(p => join(dirname(p), 'work-task.mjs')).find(existsSync);
  if (!script) { process.stderr.write('great-cto: task operations runtime is missing; reinstall package\n'); return 2; }
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.error) { process.stderr.write('great-cto: ' + result.error.message + '\n'); return 2; }
  return result.status ?? 2;
}
