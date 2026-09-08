#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmdirSync, realpathSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { newRun, runStage, approve, recover, cancel } from './lib/codex-pipeline.mjs';
import { approveRelease } from './lib/codex-release.mjs';

// State is outside the worker workspace. A per-run exclusive lock covers the entire subprocess lifetime.
const args = process.argv.slice(2);
const command = args.shift();
const value = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const store = join(homedir(), '.great_cto', 'codex-runs');
mkdirSync(store, { recursive: true, mode: 0o700 });
const save = state => {
  const file = join(store, `${state.id}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
};
let locked = null;
try {
  let state;
  if (command === 'start') {
    const root = realpathSync(resolve(value('--dir') || '.'));
    let checkPolicy = null;
    if (value('--checks-policy')) {
      const policyPath = realpathSync(value('--checks-policy'));
      const rel = relative(root, policyPath);
      if (rel !== '..' && !rel.startsWith(`..${sep}`)) throw Error('checks policy must be operator-owned outside the target workspace');
      checkPolicy = JSON.parse(readFileSync(policyPath, 'utf8'));
    }
    let releasePolicy = null;
    if (value('--release-policy')) {
      const policyPath = realpathSync(value('--release-policy'));
      const rel = relative(root, policyPath);
      if (rel !== '..' && !rel.startsWith(`..${sep}`)) throw Error('release policy must be operator-owned outside the target workspace');
      releasePolicy = JSON.parse(readFileSync(policyPath, 'utf8'));
    }
    state = newRun({ root, prompt: value('--prompt'), checkPolicy, releasePolicy,
      allowed: (value('--allow') || '').split(',').filter(Boolean), entry: value('--entry') || 'product-owner',
      maxAttempts: value('--max-attempts') === null ? 3 : Number(value('--max-attempts')) });
    save(state);
  } else {
    const id = args[0];
    if (!/^[0-9a-f-]{36}$/.test(id || '')) throw Error('a run UUID is required');
    state = JSON.parse(readFileSync(join(store, `${id}.json`), 'utf8'));
    if (state.id !== id || state.version !== 1) throw Error('invalid run state');
  }
  if (!['start', 'resume', 'status', 'approve', 'approve-release', 'recover', 'cancel'].includes(command)) throw Error('expected start, resume, status, approve, approve-release, recover or cancel');
  if (command !== 'status') {
    const lock = join(store, `${state.id}.lock`);
    mkdirSync(lock); locked = lock;
    // Reload under lock so simultaneous approvals cannot overwrite one another.
    state = JSON.parse(readFileSync(join(store, `${state.id}.json`), 'utf8'));
    if (command === 'approve') { approve(state, value('--token')); save(state); }
    else if (command === 'approve-release') { approveRelease(state, value('--token')); save(state); }
    else if (command === 'recover') { recover(state); save(state); }
    else if (command === 'cancel') { cancel(state); save(state); }
    else while (state.status === 'ready') await runStage(state, { save });
  }
  console.log(JSON.stringify({ id: state.id, status: state.status, reason: state.reason,
    release: state.release ? { status: state.release.status, token: state.release.token, artifactDigest: state.release.artifactDigest, destination: state.release.destination, path: state.release.path } : null,
    pending: state.pending, queue: state.queue, rolesCompleted: Object.keys(state.results), stateFile: join(store, `${state.id}.json`) }, null, 2));
  process.exitCode = ['blocked', 'manual-action', 'join-wait'].includes(state.status) ? 2 : 0;
} catch (error) {
  console.error(`codex-pipeline: ${error.message}`);
  process.exitCode = 2;
} finally {
  if (locked) rmdirSync(locked);
}
