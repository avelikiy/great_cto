import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFixtureBase } from '../eval/lib/mixed-host-fixture-store.mjs';

const REPO = resolve(import.meta.dirname, '../..');
// Exercise an extracted npm board or installed plugin without falling back to
// the source checkout's controller or graph.
const PLUGIN_ROOT = resolve(process.env.GREAT_CTO_LIVE_PLUGIN_ROOT || REPO);
const CONTROLLER = join(PLUGIN_ROOT, 'scripts', 'codex-pipeline.mjs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('live Claude Code and Codex workers complete one frozen QA/security wave',
  { skip: process.env.GREAT_CTO_LIVE_MIXED !== '1' }, async () => {
    const { newRun, runStage } = await import(pathToFileURL(join(PLUGIN_ROOT, 'scripts', 'lib', 'codex-pipeline.mjs')));
    const claudeAuth = JSON.parse(execFileSync('claude', ['auth', 'status', '--json'], { encoding: 'utf8' }));
    assert.equal(claudeAuth.loggedIn, true, 'Claude Code CLI must be authenticated');
    execFileSync('codex', ['login', 'status']);

    // Preserve this disposable project and run store as acceptance evidence.
    const base = createFixtureBase();
    const root = join(base, 'project'), store = join(base, 'runs');
    mkdirSync(root); mkdirSync(store, { mode: 0o700 }); mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'README.md'), '# Mixed-host smoke fixture\n\n`add(2, 3)` returns 5. No network, credentials or deployment.\n');
    writeFileSync(join(root, 'src', 'add.mjs'), 'export function add(a, b) { return a + b; }\n');
    execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-qm', 'mixed-host smoke fixture']);

    const state = newRun({ root, pluginRoot: PLUGIN_ROOT,
      prompt: 'Inspect src/add.mjs and README.md only. QA: verify the source expression add(2,3) equals 5. ' +
        'Security: verify src/add.mjs and README.md contain no hardcoded secrets or network calls. ' +
        'The report must contain only directly observed facts about these two files; do not speculate about module loading, ' +
        'runtime configuration, or the number of repository files. Return PASS or APPROVED only if supported by evidence. ' +
        'Code reviewer: inspect the same two files and create concise review evidence under docs/. ' +
        'Each reviewer must create a distinct concise report under docs/ and set meta.report to that path. ' +
        'Use a new report filename per frozen wave. Do not add coverage gaps about non-numeric inputs or ' +
        'other hypothetical behavior outside the numeric example. ' +
        'Do not modify code or deploy anything.',
      allowed: ['docs'], entry: 'code-reviewer', maxAttempts: 3,
      hostRoutes: { 'qa-engineer': 'claude-code', 'security-officer': 'codex' } });
    const file = join(store, `${state.id}.json`);
    const save = next => writeFileSync(file, JSON.stringify(next), { mode: 0o600 });
    save(state);
    console.log(`LIVE_MIXED_RUN=${state.id} STORE=${store} PROJECT=${root}`);

    // The shipped graph now joins all three reviewers. Obtain real code-review
    // evidence first; no result or gate approval is synthesized for the fixture.
    while (state.status === 'ready') await runStage(state, { save, contextStore: store });
    assert.equal(state.status, 'join-wait', state.reason);
    assert.equal(state.results['code-reviewer']?.verification.state, 'verified');
    assert.equal(state.pending, null);
    state.queue.push('qa-engineer', 'security-officer');
    state.status = 'ready';
    save(state);

    const result = spawnSync(process.execPath, [CONTROLLER, 'resume', state.id], {
      cwd: REPO, env: { ...process.env, GREAT_CTO_CODEX_RUNS_DIR: store, GREAT_CTO_TASKS_DIR: join(store, 'tasks'), GREAT_CTO_DISABLE_EVENTS: '1' },
      encoding: 'utf8', timeout: 900000, maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `controller failed: ${result.error?.message || result.stderr || result.stdout}`);
    const output = JSON.parse(result.stdout);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(output.status, 'awaiting-gate'); // Human approval is not part of this automated smoke.
    const wave = saved.waveHistory?.at(-1);
    assert.equal(wave?.status, 'verified');
    assert.equal(saved.results['code-reviewer']?.verification.state, 'verified');
    assert.deepEqual(wave.hosts,
      { 'qa-engineer': 'claude-code', 'security-officer': 'codex' });
    const reports = {};
    for (const [role, host] of Object.entries(wave.hosts)) {
      const stage = saved.results[role];
      assert.equal(stage.host, host);
      assert.equal(stage.verification.state, 'verified');
      const report = join(root, stage.meta.report);
      assert.equal(existsSync(report), true);
      const bytes = readFileSync(report);
      assert.ok(bytes.length > 0);
      reports[role] = { path: report, sha256: sha256(bytes), verification: stage.verification };
    }
    assert.notEqual(reports['qa-engineer'].path, reports['security-officer'].path);
    console.log(JSON.stringify({ run: state.id, pluginRoot: PLUGIN_ROOT, status: output.status, pendingGates: saved.pending.gates,
      claudeVersion: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
      codexVersion: execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim(), reports }));
  });
