#!/usr/bin/env node
/** Opt-in, disposable local release acceptance. Never targets a user's product. */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { newRun, runStage, approve } from '../../scripts/lib/codex-pipeline.mjs';
import { approveRelease } from '../../scripts/lib/codex-release.mjs';
import { runCodexExec } from '../../scripts/lib/codex-exec.mjs';

if (!process.argv.includes('--approve-fixture-gates') || !process.env.GREAT_CTO_LIVE_DOCKER_IMAGE) {
  throw Error('Requires explicit --approve-fixture-gates and GREAT_CTO_LIVE_DOCKER_IMAGE; optional --live-codex incurs model usage');
}
const live = process.argv.includes('--live-codex');
const base = mkdtempSync(join(tmpdir(), 'great-cto-release-e2e-'));
const root = join(base, 'project'), destination = join(base, 'releases');
mkdirSync(root); mkdirSync(destination);
execFileSync('git', ['init', '-q'], { cwd: root });
execFileSync('git', ['-c', 'user.name=Acceptance', '-c', 'user.email=acceptance@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture base'], { cwd: root });
const image = process.env.GREAT_CTO_LIVE_DOCKER_IMAGE;
const prompt = 'Disposable LOCAL RELEASE acceptance fixture. Build a package-free JavaScript module src/add.mjs exporting add(a,b). Accept only finite numbers; reject other inputs with TypeError. Add tests/test.mjs using node:test. No dependencies, external services or production deployment. Planning roles create only docs artifacts: brief, architecture, plan and briefs; implementation is senior-dev responsibility. Required meta paths must be in docs/ or src/ or tests/. Do not request Beads or .great_cto files. Keep planning minimal, one short document per contract key; provide precise semantics for overflow (reject non-finite result). Runtime checks and local artifact release are controller-owned. QA/security inspect current implementation, record reports in docs/. L3 is read-only and checks the local release receipt; no production observability claim. Each role should complete ONLY its own stage responsibility, not the entire product.';
const state = newRun({ root, prompt, allowed: ['src', 'tests', 'docs'], checkPolicy: { image, inputs: ['src', 'tests'],
  commands: [['node', '--test', 'tests/test.mjs'], ['node', '-e', "require('fs').mkdirSync('dist');require('fs').copyFileSync('src/add.mjs','dist/add.mjs')"]],
  outputs: ['dist/add.mjs'], timeoutMs: 60000 }, releasePolicy: { adapter: 'local', destination, image, timeoutMs: 60000,
  smokeCommands: [['node', '--input-type=module', '-e', "import assert from 'node:assert/strict';import {add} from './dist/add.mjs';assert.equal(add(2,3),5);assert.throws(()=>add(NaN,1),TypeError)"]] } });
const stateFile = join(base, 'run.json');
const save = s => writeFileSync(stateFile, JSON.stringify(s, null, 2));
save(state); console.log(JSON.stringify({ liveCodex: live, root, stateFile, id: state.id }));
const fixtureWorker = async () => {
  const role = state.queue[0], rule = state.graph[role];
  const files = [], meta = {};
  for (const key of rule.produces || []) {
    if (key === 'receipt') continue;
    const path = `docs/${role}-${key}.md`; meta[key] = path;
    files.push({ path, before: null, content: `# ${role}\nDisposable acceptance ${key}.\n` });
  }
  if (role === 'senior-dev') files.push(
    { path: 'src/add.mjs', before: null, content: 'export function add(a,b){if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(a+b))throw new TypeError("finite numbers required");return a+b;}\n' },
    { path: 'tests/test.mjs', before: null, content: 'import {test} from "node:test";import assert from "node:assert/strict";import {add} from "../src/add.mjs";test("add",()=>{assert.equal(add(2,3),5);assert.throws(()=>add(NaN,1),TypeError);assert.throws(()=>add(Number.MAX_VALUE,Number.MAX_VALUE),TypeError);});\n' });
  return { state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: rule.on[0], summary: `fixture ${role}`, meta, files }) };
};
const events = [];
for (let step = 0; step < 80; step++) {
  events.push({ status: state.status, role: state.queue[0], at: new Date().toISOString() });
  console.log(JSON.stringify(events.at(-1)));
  if (state.status === 'awaiting-gate') { approve(state, state.pending.token); save(state); continue; }
  if (state.status === 'awaiting-release') { approveRelease(state, state.release.token); save(state); continue; }
  if (state.status !== 'ready') break;
  await runStage(state, { save, execute: live ? runCodexExec : fixtureWorker,
    ...(live ? {} : { verify: async () => ({ state: 'verified', findings: [], checks: ['fixture semantic verifier; not live Codex'] }) }) });
}
const result = { liveCodex: live, status: state.status, reason: state.reason, roles: Object.keys(state.results),
  release: state.release ? { status: state.release.status, path: state.release.path, digest: state.release.artifactDigest } : null, stateFile, events };
writeFileSync(join(base, 'acceptance.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (state.status !== 'done' || state.release?.status !== 'verified' || !state.results['l3-support']) process.exitCode = 1;
