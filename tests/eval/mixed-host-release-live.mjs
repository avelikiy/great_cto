#!/usr/bin/env node
/** Prepare and start a disposable full-graph mixed-host release run. Never auto-approve gates. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createFixtureBase } from './lib/mixed-host-fixture-store.mjs';

const image = process.env.GREAT_CTO_LIVE_DOCKER_IMAGE;
const backend = process.env.GREAT_CTO_LIVE_CHECKS_BACKEND || 'docker';
if (!['docker', 'local'].includes(backend)) throw Error('Unsupported acceptance checks backend');
if (backend === 'local' && process.env.GREAT_CTO_TRUST_LOCAL_FIXTURE !== '1') throw Error('Local acceptance requires explicit GREAT_CTO_TRUST_LOCAL_FIXTURE=1');
if (backend === 'docker' && !/^node@sha256:[0-9a-f]{64}$/.test(image || '')) {
  throw Error('GREAT_CTO_LIVE_DOCKER_IMAGE must be a pinned node@sha256 digest');
}
const repo = resolve(import.meta.dirname, '../..');
if (process.argv.length > 3) throw Error('Usage: mixed-host-release-live.mjs [installed-runtime-root]');
const runtimeRoot = realpathSync(resolve(process.argv[2] || repo));
const controller = join(runtimeRoot, 'scripts', 'codex-pipeline.mjs');
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const runtimePin = { root: runtimeRoot, controllerSHA256: digest(controller),
  pipelineSHA256: digest(join(runtimeRoot, 'scripts/lib/codex-pipeline.mjs')),
  checksSHA256: digest(join(runtimeRoot, 'scripts/lib/codex-checks.mjs')),
  releaseSHA256: digest(join(runtimeRoot, 'scripts/lib/codex-release.mjs')) };
const base = createFixtureBase();
const root = join(base, 'project'), store = join(base, 'runs');
const operator = join(base, 'operator'), releaseRoot = join(base, 'releases');
mkdirSync(root); mkdirSync(store, { mode: 0o700 }); mkdirSync(operator, { mode: 0o700 }); mkdirSync(releaseRoot);
writeFileSync(join(releaseRoot, '.great-cto-release-root'), 'great-cto-release-root:v1\n');
execFileSync('git', ['init', '-q', root]);
execFileSync('git', ['-C', root, '-c', 'user.name=avelikiy', '-c', 'user.email=avelikiy@users.noreply.github.com',
  'commit', '--allow-empty', '-qm', 'fixture base']);

const execution = backend === 'local' ? { backend: 'local', trusted: true } : { image };
const checks = { ...execution, inputs: ['src', 'tests'], commands: [
  ['node', '--test', 'tests/test.mjs'],
  ['node', '-e', "require('fs').mkdirSync('dist');require('fs').copyFileSync('src/add.mjs','dist/add.mjs')"],
], outputs: ['dist/add.mjs'], timeoutMs: 60000 };
const release = { adapter: 'local', releaseRoot, ...execution, timeoutMs: 60000,
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
const executionPrompt = backend === 'local' ?
  ' Checks and release smoke use explicit trusted local execution, not Docker; there is no filesystem or network isolation. Do not claim sandboxing.' : '';

const result = spawnSync(process.execPath, [controller, 'start', '--dir', root, '--allow', 'src,tests,docs',
  '--prompt', prompt + executionPrompt, '--checks-policy', checksFile, '--release-policy', releaseFile,
  '--routes', 'qa-engineer=claude-code,security-officer=codex'], {
  cwd: runtimeRoot, env: { ...process.env, GREAT_CTO_CODEX_RUNS_DIR: store }, encoding: 'utf8',
  timeout: 900000, maxBuffer: 2 * 1024 * 1024,
});
let output;
try { output = JSON.parse(result.stdout); } catch { output = null; }
const state = output?.id ? JSON.parse(readFileSync(join(store, `${output.id}.json`), 'utf8')) : null;
if (runtimePin.controllerSHA256 !== digest(controller) || runtimePin.pipelineSHA256 !== digest(join(runtimeRoot, 'scripts/lib/codex-pipeline.mjs'))) throw Error('Runtime changed during acceptance');
if (runtimePin.checksSHA256 !== digest(join(runtimeRoot, 'scripts/lib/codex-checks.mjs')) || runtimePin.releaseSHA256 !== digest(join(runtimeRoot, 'scripts/lib/codex-release.mjs'))) throw Error('Check/release runtime changed during acceptance');
console.log(JSON.stringify({ base, root, store, releaseRoot, checksFile, releaseFile, runtimePin, backend,
  id: output?.id || null, status: state?.status || null, reason: state?.reason || result.error?.message || result.stderr || null,
  pending: state?.pending ? { role: state.pending.role, gates: state.pending.gates, result: state.pending.result } : null,
  release: state?.release ? { status: state.release.status, adapter: state.release.adapter } : null,
  exitCode: result.status }, null, 2));
if (result.status !== 0 || state?.status !== 'awaiting-gate' || state.pending?.role !== 'product-owner') process.exitCode = 1;
