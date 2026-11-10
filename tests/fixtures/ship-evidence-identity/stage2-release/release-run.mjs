import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync, rmdirSync, existsSync, readdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newRun, runStage, approve} from '../../../../scripts/lib/codex-pipeline.mjs';
import {beginWork, finishWork, linkWork} from '../../../../scripts/lib/work-tasks.mjs';
import {initializeShipBinding, reassessShipBinding} from '../../../../scripts/lib/gate-check-bound.mjs';
import {readers} from '../stage2/bound-run.mjs';
import {fixture, isolated, commit, stored, runFile, calls} from '../stage2/harness.mjs';

const graph = `[transitions.senior-dev]\non = ["DONE"]\nproduces = ["report"]\nnext = ["code-reviewer"]\n[transitions.code-reviewer]\non = ["APPROVED"]\nproduces = ["report"]\nnext = ["qa-engineer"]\n[transitions.qa-engineer]\non = ["PASS"]\nproduces = ["report"]\nnext = ["security-officer"]\n[transitions.security-officer]\non = ["APPROVED"]\nproduces = ["report"]\ngate = "gate:ship"\nnext = ["devops"]\n[transitions.devops]\non = ["DEPLOYED"]\nnext = []\n`;
export async function releaseRun(t, {prepare = true} = {}) {
  const f = fixture(t, {graph}); isolated(f, t);
  const host = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fake-host.mjs'), 'utf8').replace('#!/usr/bin/env node', `#!${process.execPath}`);
  for (const bin of ['codex', 'claude']) writeFileSync(join(f.bin, bin), host, {mode: 0o700});
  for (const role of ['senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer']) {
    writeFileSync(join(f.root, `docs/${role}.md`), `Prepared committed ${role} evidence for synthetic artifact; authority NONE, publication NOT_CHECKED.\n`);
    writeFileSync(join(f.pluginRoot, 'agents', `${role}.md`), `You are ${role}. Inspect src/app.mjs and docs/${role}.md. Return an empty files array.\n`);
  }
  commit(f, 'committed four-role synthetic candidate');
  f.releaseRoot = join(f.base, 'designated-local-release'); mkdirSync(f.releaseRoot, {mode: 0o700});
  writeFileSync(join(f.releaseRoot, '.great-cto-release-root'), 'great-cto-release-root:v1\n', {mode: 0o600});
  const checkPolicy = {backend: 'local', trusted: true, inputs: ['src/app.mjs'], outputs: ['dist/app.mjs'], timeoutMs: 10000,
    commands: [[process.execPath, '-e', 'const fs=require("node:fs");if(!fs.readFileSync("src/app.mjs","utf8").includes("42"))process.exit(1);fs.mkdirSync("dist");fs.copyFileSync("src/app.mjs","dist/app.mjs")']]};
  const releasePolicy = {adapter: 'local', releaseRoot: f.releaseRoot, backend: 'local', trusted: true, timeoutMs: 10000, smokeCommands: [[process.execPath, 'dist/app.mjs']]};
  const work = beginWork({root: f.root, host: 'codex', goal: 'Synthetic release approval only', authority: {mode: 'explicit-paths', writeScope: ['src', 'docs']}, maxAttempts: 3}, {store: f.tasks});
  f.lease = work.lease; let held = true;
  f.release = () => {if (!held) return; if (f.lockPath && existsSync(f.lockPath)) rmdirSync(f.lockPath); finishWork(work.task.taskId, work.operation.operationId, 0, {store: f.tasks, root: f.root}); f.lease.release(); held = false;};
  f.cleanupFns.push(f.release);
  const state = newRun({root: f.root, pluginRoot: f.pluginRoot, prompt: work.task.goal, allowed: ['src', 'docs'], entry: 'senior-dev', maxAttempts: 3, checkPolicy, releasePolicy});
  state.taskId = work.task.taskId; f.lockPath = join(f.runs, `${state.id}.lock`); mkdirSync(f.lockPath, {mode: 0o700});
  linkWork(state.taskId, 'runs', state.id, {store: f.tasks, root: f.root, host: 'codex'});
  const initialized = initializeShipBinding({state, policyPath: f.policyPath, lease: f.lease}, {runStore: f.runs, ...readers(f)});
  f.state = initialized.state; f.boundary = initialized.boundary;
  const step = () => runStage(f.state, {shipBoundary: f.boundary, save: value => f.boundary.save(value), contextStore: f.runs});
  await step(); await step(); await step();
  assert.equal(f.state.shipEvidence.phase, 'NEEDS_REASSESSMENT');
  assert.equal(f.state.results['senior-dev'].verification.state, 'verified'); assert.equal(f.state.results['code-reviewer'].verification.state, 'verified');
  assert.ok(f.state.released.includes('senior-dev')); assert.ok(f.state.released.includes('code-reviewer'));
  const next = reassessShipBinding({state: f.state, expectedRevision: f.state.shipEvidence.revision, lease: f.lease}, {runStore: f.runs, ...readers(f)}); f.state = next.state; f.boundary = next.boundary;
  for (let n = 0; n < 4 && f.state.status === 'ready'; n++) await step();
  assert.equal(f.state.status, 'awaiting-gate'); assert.ok(f.state.pending.gates.includes('gate:ship'));
  const qa = f.state.results['qa-engineer'].checks; assert.equal(qa.state, 'passed'); assert.equal(qa.code, 0); assert.equal(qa.artifacts.length, 1); assert.ok(qa.files['src/app.mjs']);
  approve(f.state, f.state.pending.token, {shipBoundary: f.boundary}); f.boundary.save(f.state);
  for (const role of ['senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer']) {
    assert.equal(f.state.results[role].verification.state, 'verified'); assert.ok(f.state.released.includes(role));
    assert.ok(calls(f).some(row => row.role === role && row.kind === 'worker')); assert.ok(calls(f).some(row => row.role === role && row.kind === 'verifier'));
  }
  assert.equal(f.state.queue[0], 'devops');
  if (prepare) {await step(); assert.equal(f.state.status, 'awaiting-release'); assert.equal(f.state.release.status, 'awaiting-approval');}
  assert.deepEqual(readdirSync(f.releaseRoot), ['.great-cto-release-root']);
  return f;
}
