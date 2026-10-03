import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOwnedPhaseFixture } from './owned-phase-fixture.mjs';

const execute = promisify(execFile);
const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
export async function runPhaseSmoke({ phaseScript, bdPath }) {
  const script = realpathSync(resolve(phaseScript)), bd = realpathSync(resolve(bdPath));
  const fixture = createOwnedPhaseFixture();
  let success = false;
  try {
    const bin = join(fixture.root, 'bin'); mkdirSync(bin, { mode: 0o700 });
    // Every invocation made by phase-task.sh uses sandbox/no-auto-push mode.
    writeFileSync(join(bin, 'bd'), `#!/bin/sh\nexec ${quote(bd)} --sandbox "$@"\n`, { mode: 0o700 });
    const baseEnv = { PATH: `${bin}:${process.env.PATH || '/usr/bin:/bin'}`, LANG: 'C', TZ: 'UTC',
      BD_NON_INTERACTIVE: '1', BEADS_ACTOR: 'phase-smoke-fixture', CI: '1' };
    const run = async (cwd, cmd, args) => {
      const r = await execute(cmd, args, { cwd, env: { ...baseEnv, BEADS_DIR: join(cwd, '.beads') },
        encoding: 'utf8', timeout: 180000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
      return r.stdout.trim();
    };
    const initialize = async name => {
      const cwd = join(fixture.root, name); mkdirSync(cwd, { mode: 0o700 });
      assert.equal(realpathSync(cwd), cwd);
      await run(cwd, 'git', ['init', '-q']);
      await run(cwd, join(bin, 'bd'), ['init', '--non-interactive', '--skip-agents', '--skip-hooks', '--prefix', name, '-q']);
      return cwd;
    };
    const phase = (cwd, args) => run(cwd, '/bin/bash', [script, ...args]);
    const bead = (cwd, args) => run(cwd, join(bin, 'bd'), args);
    const item = async (cwd, id) => {
      const value = JSON.parse(await bead(cwd, ['show', id, '--json']));
      return Array.isArray(value) ? value[0] : value;
    };
    const gate = async cwd => {
      const value = JSON.parse(await bead(cwd, ['create', 'gate:fixture', '--label', 'gate', '--json']));
      const id = (Array.isArray(value) ? value[0] : value).id;
      assert.ok(id); return id;
    };
    const cwd = await initialize('phasefixture'), parent = await gate(cwd);
    const arch = await phase(cwd, ['open','architect','fixture-feature','--parent',parent]);
    const archItem = await item(cwd, arch);
    assert.ok(arch.startsWith('phasefixture-'), 'task must belong to the fixture database');
    assert.equal(archItem.title, 'architect: fixture-feature');
    assert.ok(archItem.labels.includes('phase-arch'));
    assert.ok(archItem.labels.includes('phase'));
    assert.ok(archItem.dependencies.some(dependency => dependency.id === parent), 'actual gate dependency must exist');
    assert.equal(archItem.status, 'open');
    const a = await phase(cwd, ['open','architect','fixture-feature']);
    const b = await phase(cwd, ['open','architect','fixture-feature']);
    assert.equal(a, b); assert.equal(a, arch);
    console.log('phase fixture: open and idempotency verified');
    const impl = await phase(cwd, ['open','senior-dev','fixture-feature','--parent',parent]);
    assert.ok((await item(cwd, impl)).dependencies.some(dependency => dependency.id === parent));
    await phase(cwd, ['start', impl]);
    assert.equal((await item(cwd, impl)).status, 'in_progress');
    await phase(cwd, ['close', impl, '--verdict', 'ok']);
    assert.equal((await item(cwd, impl)).status, 'closed');
    assert.equal((await item(cwd, parent)).status, 'open', 'synthetic phase closure must not approve gate');
    const qa = await phase(cwd, ['open','qa-engineer','fixture-feature']);
    await phase(cwd, ['close',qa,'--verdict','fail','--notes','synthetic fixture failure']);
    assert.equal((await item(cwd, qa)).status, 'blocked');
    console.log('phase fixture: started/closed/blocked states verified; gate remains open');
    const pipeline = await initialize('pipelinefixture'), pipelineGate = await gate(pipeline);
    const roles = ['architect','pm','senior-dev','code-reviewer','qa-engineer','security-officer','performance-engineer','devops'];
    for (const role of roles) {
      const id = await phase(pipeline, ['open',role,'fixture-feature','--parent',pipelineGate]);
      assert.ok((await item(pipeline, id)).dependencies.some(dependency => dependency.id === pipelineGate));
      await phase(pipeline, ['close',id,'--verdict','ok']);
      assert.equal((await item(pipeline, id)).status, 'closed');
      console.log(`phase fixture: ${role} task state verified (no role/model execution)`);
    }
    const closed = JSON.parse(await bead(pipeline, ['list','--status','closed','--json']));
    assert.equal(closed.length, roles.length);
    assert.equal((await item(pipeline, pipelineGate)).status, 'open');
    success = true;
    return { lifecycleChecksVerified: 5, syntheticClosedPhaseTasks: roles.length, gateApproved: false, roleExecutionVerified: false, providerCalls: 0 };
  } catch (error) {
    // A timeout/command failure is not proof that every descendant stopped.
    // Preserve the private root instead of deleting under a possibly live CLI.
    error.message += `; fixture retained for inspection: ${fixture.root}`;
    throw error;
  } finally {
    if (success) fixture.cleanup();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runPhaseSmoke({ phaseScript: process.argv[2], bdPath: process.argv[3] }))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
