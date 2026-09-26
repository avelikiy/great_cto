import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { newRun } from '../../scripts/lib/codex-pipeline.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const CONTROLLER = join(REPO, 'scripts', 'codex-pipeline.mjs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('live Claude Code and Codex workers complete one frozen QA/security wave',
  { skip: process.env.GREAT_CTO_LIVE_MIXED !== '1' }, () => {
    const claudeAuth = JSON.parse(execFileSync('claude', ['auth', 'status', '--json'], { encoding: 'utf8' }));
    assert.equal(claudeAuth.loggedIn, true, 'Claude Code CLI must be authenticated');
    execFileSync('codex', ['login', 'status']);

    // Preserve this disposable project and run store as acceptance evidence.
    const base = mkdtempSync(join(tmpdir(), 'great-cto-live-mixed-'));
    const root = join(base, 'project'), store = join(base, 'runs');
    mkdirSync(root); mkdirSync(store, { mode: 0o700 }); mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'README.md'), '# Mixed-host smoke fixture\n\n`add(2, 3)` returns 5. No network, credentials or deployment.\n');
    writeFileSync(join(root, 'src', 'add.mjs'), 'export function add(a, b) { return a + b; }\n');
    execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-qm', 'mixed-host smoke fixture']);

    const state = newRun({ root, pluginRoot: REPO,
      prompt: 'Inspect src/add.mjs and README.md only. QA: verify the source expression add(2,3) equals 5. ' +
        'Security: verify src/add.mjs and README.md contain no hardcoded secrets or network calls. ' +
        'The report must contain only directly observed facts about these two files; do not speculate about module loading, ' +
        'runtime configuration, or the number of repository files. Return PASS or APPROVED only if supported by evidence. ' +
        'Each reviewer must create a distinct concise report under docs/ and set meta.report to that path. ' +
        'Do not modify code or deploy anything.',
      allowed: ['docs'], entry: 'qa-engineer', maxAttempts: 1,
      hostRoutes: { 'qa-engineer': 'claude-code', 'security-officer': 'codex' } });
    state.queue.push('security-officer');
    const file = join(store, `${state.id}.json`);
    writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
    console.log(`LIVE_MIXED_RUN=${state.id} STORE=${store} PROJECT=${root}`);

    const result = spawnSync(process.execPath, [CONTROLLER, 'resume', state.id], {
      cwd: REPO, env: { ...process.env, GREAT_CTO_CODEX_RUNS_DIR: store, GREAT_CTO_DISABLE_EVENTS: '1' },
      encoding: 'utf8', timeout: 900000, maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `controller failed: ${result.error?.message || result.stderr || result.stdout}`);
    const output = JSON.parse(result.stdout);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(output.status, 'awaiting-gate'); // Human approval is not part of this automated smoke.
    assert.equal(saved.waveHistory?.[0]?.status, 'verified');
    assert.deepEqual(saved.waveHistory[0].hosts,
      { 'qa-engineer': 'claude-code', 'security-officer': 'codex' });
    const reports = {};
    for (const [role, host] of Object.entries(saved.waveHistory[0].hosts)) {
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
    console.log(JSON.stringify({ run: state.id, status: output.status, pendingGates: saved.pending.gates,
      claudeVersion: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
      codexVersion: execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim(), reports }));
  });
