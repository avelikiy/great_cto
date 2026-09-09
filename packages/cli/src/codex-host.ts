/** Supported npm CLI bridge to the bundled controlled Codex host runtime. */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function codexControllerCandidates(moduleUrl = import.meta.url): string[] {
  const cliRoot = join(dirname(fileURLToPath(moduleUrl)), '..');
  return [
    join(cliRoot, 'board', 'scripts', 'codex-pipeline.mjs'),
    join(cliRoot, '..', '..', 'scripts', 'codex-pipeline.mjs'),
  ];
}

export function runCodexHost(args: string[], { exists = existsSync, spawn = spawnSync } = {}): number {
  if (!args.length) {
    process.stderr.write('usage: great-cto codex-host start|resume|status|approve|approve-release|recover|cancel|list|doctor ...\n');
    return 2;
  }
  const controller = codexControllerCandidates().find(exists);
  if (!controller) {
    process.stderr.write('great-cto: controlled Codex host runtime is missing; reinstall the package\n');
    return 2;
  }
  const result = spawn(process.execPath, [controller, ...args], { stdio: 'inherit', env: { ...process.env } });
  if (result.error) {
    process.stderr.write(`great-cto: could not start Codex host: ${result.error.message}\n`);
    return 2;
  }
  return result.status ?? 2;
}
