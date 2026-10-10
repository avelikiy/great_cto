import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
const repo = resolve(import.meta.dirname, '../..');
function runResearchFixture(rework) {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-stage3-cli-')), root = join(dir, 'project'), bin = join(dir, 'codex'), marker = join(dir, 'calls');
  mkdirSync(root); execFileSync('git', ['init', '-q', root]); writeFileSync(join(root, 'README.md'), 'fixture\n');
  execFileSync('git', ['-C', root, 'add', 'README.md']); execFileSync('git', ['-C', root, '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('node:fs'), crypto = require('node:crypto'), args = process.argv.slice(2);
if (args[0] === '--version') { console.log('fixture'); process.exit(0); }
if (args[0] === 'auth') { console.log(JSON.stringify({ loggedIn: true, authMethod: 'fixture' })); process.exit(0); }
let prompt = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => prompt += c);
process.stdin.on('end', () => {
 fs.appendFileSync(process.env.STAGE3_CALLS, 'called\\n');
 const file = 'docs/report.md', before = fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
 const reply = prompt.includes('independent verifier') ? { state: ${JSON.stringify(rework ? 'rework' : 'verified')}, checks: ['fixture inspected authorization report'], findings: ${JSON.stringify(rework ? ['Missing authorization detail'] : [])} }
 : { verdict: 'AUDIT_COMPLETE', summary: 'Authorization research report', meta: { audit: file }, files: [{ path: file, before, content: 'Authorization findings\\n' }] };
 console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(reply) } }));
});\n`, { mode: 0o755 });
  const env = { ...process.env, GREAT_CTO_TASKS_DIR: join(dir, 'tasks'), GREAT_CTO_CODEX_RUNS_DIR: join(dir, 'runs'), GREAT_CTO_CODEX_BIN: bin, STAGE3_CALLS: marker, DO_NOT_TRACK: '1', GREAT_CTO_NO_UPDATE_CHECK: '1' };
  const cli = args => spawnSync(process.execPath, [join(repo, 'packages/cli/index.mjs'), ...args, '--dir', root], { encoding: 'utf8', env, timeout: 20000 });
  return { dir, root, marker, cli };
}
test('real daily/advanced CLI research verifies and completes an explicit report outcome', () => {
  const f = runResearchFixture(false);
  try {
    const started = f.cli(['run', 'Research CSV authorization', '--host', 'codex', '--intent', 'research', '--allow', 'docs', '--max-attempts', '2', '--accept', 'Authorization findings covered']);
    assert.equal(started.status, 0, started.stderr);
    let task = JSON.parse(f.cli(['status', '--host', 'codex', '--json']).stdout).tasks[0];
    assert.equal(task.phase, 'waiting'); assert.equal(task.intent, 'research'); assert.equal(task.budget.maxStageAttempts, 2);
    const file = join(f.dir, 'proof.json');
    writeFileSync(file, JSON.stringify({ taskId: task.taskId, goal: task.goal, revision: task.revision, kind: 'research', goalSatisfied: true,
      criteria: [{ index: 0, text: task.acceptance[0], state: 'passed', evidence: 'Operator inspected authorization findings' }],
      artifacts: [{ path: 'docs/report.md', sha256: createHash('sha256').update(readFileSync(join(f.root, 'docs/report.md'))).digest('hex') }] }), { mode: 0o600 });
    const verified = f.cli(['task','work','verify','--task',task.taskId,'--revision',String(task.revision),'--operation',randomUUID(),'--evidence',file]);
    assert.equal(verified.status, 0, verified.stderr); task = JSON.parse(verified.stdout); assert.equal(task.phase, 'verified');
    const completed = f.cli(['task','work','complete','--task',task.taskId,'--revision',String(task.revision),'--operation',randomUUID()]);
    assert.equal(completed.status, 0, completed.stderr); assert.equal(JSON.parse(completed.stdout).phase, 'completed');
    const metrics = f.cli(['task','work','metrics']); assert.equal(metrics.status, 0, metrics.stderr);
    const cohort = JSON.parse(metrics.stdout).cohorts.find(c => c.host === 'codex' && c.intent === 'research'); assert.equal(cohort.completed, 1);
    assert.equal(readFileSync(f.marker,'utf8').trim().split('\n').length, 2); // one worker and independent verifier, no implementation/release
  } finally { rmSync(f.dir, { recursive:true, force:true }); }
});
test('research verifier rework is bounded by stored budget and cannot manufacture completion', () => {
  const f = runResearchFixture(true);
  try {
    const started = f.cli(['run', 'Research CSV authorization', '--host', 'codex', '--intent', 'research', '--allow', 'docs', '--max-attempts', '2', '--accept', 'Authorization findings covered']);
    assert.equal(started.status, 2, started.stderr);
    const task = JSON.parse(f.cli(['status','--host','codex','--json']).stdout).tasks[0];
    assert.equal(task.phase, 'blocked'); assert.equal(task.rework.attempts, 2); assert.equal(task.outcome, null);
    assert.equal(readFileSync(f.marker,'utf8').trim().split('\n').length, 4);
  } finally { rmSync(f.dir, { recursive:true, force:true }); }
});
