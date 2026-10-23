import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, realpathSync, chmodSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runtimeImportClosure } from '../../packages/cli/scripts/runtime-import-closure.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('derived board closure includes the bound reader and imports outside the checkout', () => {
  const reader = join(root, 'scripts/lib/bound-run-proposal.mjs');
  const closure = runtimeImportClosure(root, [join(root, 'packages/board/server.mjs')]);
  assert.ok(closure.includes(reader), 'the board bundle must derive the new reader dependency');
  const isolated = mkdtempSync(join(tmpdir(), 'gcto-bound-import-'));
  const trusted = realpathSync(mkdtempSync(join(realpathSync(homedir()), '.gcto-bound-package-')));
  chmodSync(trusted, 0o700);
  try {
    for (const source of closure) {
      const destination = join(isolated, relative(root, source));
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
    writeFileSync(join(isolated, 'package.json'), '{"type":"module"}');
    const sha = value => createHash('sha256').update(value).digest('hex');
    const projectRoot = join(trusted, 'project'), storeDir = join(trusted, 'store');
    mkdirSync(join(projectRoot, '.great_cto'), { recursive: true, mode: 0o700 });
    mkdirSync(storeDir, { mode: 0o700 });
    const policy = 'archetype: devtools\napproval-level: gates-only\n';
    writeFileSync(join(projectRoot, '.great_cto/PROJECT.md'), policy, { mode: 0o600 });
    const runId = '12345678-1234-1234-1234-123456789abc', base = 'a'.repeat(40), fingerprint = 'b'.repeat(64);
    const roles = ['code-reviewer', 'qa-engineer', 'security-officer'];
    const plan = { version: 1, state: 'planned', advisory: true, planningOnly: false, reusablePass: false,
      scope: 'whole Git-visible tree plus project declaration; ignored runtime inputs not attested', fingerprint,
      assessment: { known: true, tier: 'T1', base, fingerprint: 'c'.repeat(64), files: ['src/view.ts'],
        reasons: ['auto:T1:behavioral(1)'], escalatedFromLabel: null },
      reviewers: roles.map(agent => ({ agent, reasons: ['mandatory independent delivery review'], files: [] })) };
    writeFileSync(join(storeDir, `${runId}.json`), JSON.stringify({ version: 1, id: runId, root: projectRoot,
      specialistPolicy: { mode: 'adaptive', workflow: 'existing-change', contracts: [], base, projectDigest: sha(policy) },
      specialistReview: { roles, fingerprint, plan, hardGates: ['gate:ship'], reusablePass: false },
      prompt: 'PRIVATE_PACKAGE_CANARY', token: 'PRIVATE_PACKAGE_TOKEN' }), { mode: 0o600 });
    // Optional operator-owned test input exercises the exact extracted archive;
    // normal CI exercises the derived isolated closure with the same fixture.
    const entry = process.env.GREAT_CTO_BOUND_PACKED_READER
      ? pathToFileURL(process.env.GREAT_CTO_BOUND_PACKED_READER).href : './scripts/lib/bound-run-proposal.mjs';
    const code = `import {readFileSync} from 'node:fs';
const m = await import(${JSON.stringify(entry)});
const args = JSON.parse(readFileSync(0, 'utf8'));
const binding = await m.readBoundRunBinding(args);
const proposal = await m.readBoundRunProposal({...args, focusId:'fintech-crypto', binding:binding.body.binding});
console.log(JSON.stringify({binding,proposal}));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: isolated, encoding: 'utf8', timeout: 30000,
      input: JSON.stringify({ projectRoot, projectId: sha(projectRoot), storeDir, runId, phase: 'review' }),
      env: { PATH: process.env.PATH, HOME: isolated, LANG: 'C', TZ: 'UTC' },
    });
    assert.equal(result.error, undefined, 'isolated import must start and complete');
    assert.equal(result.status, 0, 'isolated import must resolve the packaged closure');
    const response = JSON.parse(result.stdout);
    assert.equal(response.binding.body.state, 'available');
    assert.equal(response.proposal.body.state, 'available');
    assert.equal(response.proposal.body.proposal.assessmentState, 'known');
    assert.equal(response.proposal.body.currentTreeAssessment, false);
    assert.equal(response.proposal.body.reusablePass, false);
    assert.doesNotMatch(result.stdout, /PRIVATE_PACKAGE_(?:CANARY|TOKEN)/);
    assert.ok(!result.stdout.includes(projectRoot) && !result.stdout.includes(storeDir));
  } finally {
    rmSync(isolated, { recursive: true, force: true });
    rmSync(trusted, { recursive: true, force: true });
  }
});
