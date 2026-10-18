import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { reap } from './reap.mjs';

const run = promisify(execFile);
const contracts = fileURLToPath(new URL('../pipeline-contracts.test.mjs', import.meta.url));

test('port-form CLI fixture preserves an ambient live process and its PID bytes', { timeout: 45000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'port-form-ambient-'));
  const ambientHome = join(root, 'home'), state = join(ambientHome, '.great_cto');
  const project = join(ambientHome, 'project'), preload = new URL('./private-board-home.mjs', import.meta.url).href;
  mkdirSync(state, { recursive: true });
  mkdirSync(join(project, '.great_cto'), { recursive: true });
  writeFileSync(join(project, '.great_cto', 'PROJECT.md'), 'project: ambient-fixture\nprimary: web-service\n');
  writeFileSync(join(state, 'projects.json'), JSON.stringify({ projects: [] }));
  // The old fixture would kill this owned canary, never the operator's board.
  const canary = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
  const pidFile = join(state, 'board.pid'), original = String(canary.pid);
  writeFileSync(pidFile, original);
  try {
    const { stdout } = await run(process.execPath, ['--test', '--test-name-pattern=BH-C4:', contracts], {
      cwd: project, env: { PATH: '/usr/bin:/bin:/usr/local/bin', LANG: 'C', TZ: 'UTC', TMPDIR: tmpdir(),
        NODE_OPTIONS: '--import=' + preload, GREAT_CTO_FIXTURE_HOME: ambientHome, GREAT_CTO_HOME: state,
        GREAT_CTO_PROJECTS_FILE: join(state, 'projects.json'), GREAT_CTO_DISCOVERY_ROOT: project,
        GREAT_CTO_HOST: '127.0.0.1', GREAT_CTO_NO_UPDATE_CHECK: '1' },
      timeout: 30000, maxBuffer: 1024 * 1024,
    });
    assert.match(stdout, /ok \d+ - BH-C4: CLI --port=N form parses correctly(?![^\n]*# SKIP)/);
    assert.equal(canary.exitCode, null, 'ambient process must not exit during the CLI fixture');
    assert.equal(canary.signalCode, null, 'ambient process must never receive the fixture teardown signal');
    process.kill(canary.pid, 0);
    assert.equal(readFileSync(pidFile, 'utf8'), original, 'ambient PID bytes must remain unchanged');
  } finally {
    const stopped = await reap(canary);
    assert.equal(stopped, 'reaped', 'own canary must be gone before fixture cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});
