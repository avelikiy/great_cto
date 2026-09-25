#!/usr/bin/env node
/** Prepare and start a disposable full-graph mixed-host release run. Never auto-approve gates. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createFixtureBase } from './lib/mixed-host-fixture-store.mjs';

const image = process.env.GREAT_CTO_LIVE_DOCKER_IMAGE;
if (!/^node@sha256:[0-9a-f]{64}$/.test(image || '')) {
  throw Error('GREAT_CTO_LIVE_DOCKER_IMAGE must be a pinned node@sha256 digest');
}
const repo = resolve(import.meta.dirname, '../..');
const base = createFixtureBase();
const root = join(base, 'project'), store = join(base, 'runs');
const operator = join(base, 'operator'), releaseRoot = join(base, 'releases');
mkdirSync(root); mkdirSync(store, { mode: 0o700 }); mkdirSync(operator, { mode: 0o700 }); mkdirSync(releaseRoot);
writeFileSync(join(releaseRoot, '.great-cto-release-root'), 'great-cto-release-root:v1\n');
execFileSync('git', ['init', '-q', root]);
execFileSync('git', ['-C', root, '-c', 'user.name=Acceptance', '-c', 'user.email=acceptance@example.invalid',
  'commit', '--allow-empty', '-qm', 'fixture base']);

const checks = { image, inputs: ['src', 'tests'], commands: [
  ['node', '--test', 'tests/test.mjs'],
  ['node', '-e', "require('fs').mkdirSync('dist');require('fs').copyFileSync('src/add.mjs','dist/add.mjs')"],
], outputs: ['dist/add.mjs'], timeoutMs: 60000 };
const release = { adapter: 'local', releaseRoot, image, timeoutMs: 60000,
  smokeCommands: [['node', '--input-type=module', '-e',
    "import assert from 'node:assert/strict';import {add} from './dist/add.mjs';assert.equal(add(2,3),5);assert.throws(()=>add(NaN,1),TypeError)"]] };
const checksFile = join(operator, 'checks.json'), releaseFile = join(operator, 'release.json');
writeFileSync(checksFile, JSON.stringify(checks, null, 2), { mode: 0o600 });
writeFileSync(releaseFile, JSON.stringify(release, null, 2), { mode: 0o600 });

const prompt = 'Disposable LOCAL RELEASE acceptance fixture. Build a package-free JavaScript module src/add.mjs exporting add(a,b). ' +
  'Accept only finite numbers; reject other inputs and non-finite sums with TypeError. Add tests/test.mjs using node:test. ' +
  'No dependencies, external services or production deployment. Planning roles create only concise docs artifacts: brief, ' +
  'architecture, plan and implementation briefs. Senior-dev owns implementation. Required meta paths must be within docs/, src/ or tests/. ' +
  'Do not request Beads or .great_cto files. Runtime checks and local artifact release are controller-owned. ' +
  'QA and security inspect the same implementation snapshot, write separate new docs/ reports and state only checked facts. ' +
  'L3 is read-only and checks the local release receipt; make no production observability claim. ' +
  'Each role completes only its own stage responsibility.';

const controller = join(repo, 'scripts', 'codex-pipeline.mjs');
const result = spawnSync(process.execPath, [controller, 'start', '--dir', root, '--allow', 'src,tests,docs',
  '--prompt', prompt, '--checks-policy', checksFile, '--release-policy', releaseFile,
  '--routes', 'qa-engineer=claude-code,security-officer=codex'], {
  cwd: repo, env: { ...process.env, GREAT_CTO_CODEX_RUNS_DIR: store }, encoding: 'utf8',
  timeout: 900000, maxBuffer: 2 * 1024 * 1024,
});
let output;
try { output = JSON.parse(result.stdout); } catch { output = null; }
const state = output?.id ? JSON.parse(readFileSync(join(store, `${output.id}.json`), 'utf8')) : null;
console.log(JSON.stringify({ base, root, store, releaseRoot, checksFile, releaseFile,
  id: output?.id || null, status: state?.status || null, reason: state?.reason || result.error?.message || result.stderr || null,
  pending: state?.pending ? { role: state.pending.role, gates: state.pending.gates, result: state.pending.result } : null,
  release: state?.release ? { status: state.release.status, adapter: state.release.adapter } : null,
  exitCode: result.status }, null, 2));
if (result.status !== 0 || state?.status !== 'awaiting-gate' || state.pending?.role !== 'product-owner') process.exitCode = 1;
