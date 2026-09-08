/** Local artifact release. Publication and reconciliation are controller-owned. */
import { realpathSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, lstatSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateArtifacts, bundleDigest, digest, artifactPath } from './codex-artifacts.mjs';
import { validateCheckPolicy, runChecks } from './codex-checks.mjs';
import { treeReceipt } from './receipt.mjs';

export function validateReleasePolicy(policy, root) {
  if (policy?.adapter !== 'local' || typeof policy.destination !== 'string') throw Error('release requires the local adapter and an explicit destination');
  const destination = realpathSync(policy.destination);
  if (!lstatSync(destination).isDirectory()) throw Error('release destination must be a directory');
  const rel = relative(realpathSync(root), destination);
  if (rel !== '..' && !rel.startsWith(`..${sep}`)) throw Error('release destination must be outside the target workspace');
  validateCheckPolicy({ image: policy.image, inputs: ['artifact'], commands: policy.smokeCommands, timeoutMs: policy.timeoutMs });
  return { adapter: 'local', destination, image: policy.image, smokeCommands: JSON.parse(JSON.stringify(policy.smokeCommands)), timeoutMs: policy.timeoutMs };
}

function assertRelease(state) {
  const r = state.release;
  if (!/^[a-f0-9-]{36}$/.test(r?.id || '')) throw Error('invalid release operation ID');
  if (!r || r.policyDigest !== digest(JSON.stringify(state.releasePolicy)) || r.artifactDigest !== bundleDigest(r.artifacts)) throw Error('release approval binding changed');
  if (r.destination !== state.releasePolicy.destination || r.bindingDigest !== digest(JSON.stringify({ id: r.id, destination: r.destination,
    policyDigest: r.policyDigest, artifactDigest: r.artifactDigest, receipt: r.receipt }))) throw Error('release candidate binding changed');
  if (realpathSync(r.destination) !== r.destination) throw Error('release destination changed');
  if (!r.receipt || r.receipt.truncated || JSON.stringify(treeReceipt(state.root)) !== JSON.stringify(r.receipt)) throw Error('release source changed since preparation');
  return r;
}

export function prepareRelease(state) {
  for (const role of ['senior-dev', 'code-reviewer', 'qa-engineer', 'security-officer']) {
    if (state.results[role]?.verification?.state !== 'verified' || !state.released.includes(role)) throw Error(`release prerequisite missing: ${role}`);
  }
  const evidence = state.results['qa-engineer'].checks;
  if (evidence?.state !== 'passed' || !evidence.artifacts) throw Error('release requires QA-checked exported artifacts');
  if (!evidence.files || !Object.keys(evidence.files).length || evidence.policyDigest !== digest(JSON.stringify(state.checkPolicy))) throw Error('QA checks policy evidence missing or stale');
  for (const [name, expected] of Object.entries(evidence.files)) {
    artifactPath(name); let current = state.root;
    for (const part of name.split('/')) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink()) throw Error('QA input became a symlink');
    }
    if (!lstatSync(current).isFile() || digest(readFileSync(current)) !== expected) throw Error('source changed since QA checks');
  }
  const policy = validateReleasePolicy(state.releasePolicy, state.root);
  if (JSON.stringify(policy) !== JSON.stringify(state.releasePolicy)) throw Error('release policy is not canonical');
  const artifacts = validateArtifacts(evidence.artifacts);
  if (bundleDigest(artifacts) !== evidence.artifactDigest) throw Error('QA artifact evidence changed');
  const receipt = treeReceipt(state.root);
  if (!receipt || receipt.truncated) throw Error('release requires a complete Git receipt');
  state.release = { id: randomUUID(), status: 'awaiting-approval', token: randomUUID(), destination: policy.destination,
    policyDigest: digest(JSON.stringify(policy)), artifacts, artifactDigest: bundleDigest(artifacts), receipt,
    preparedAt: new Date().toISOString() };
  const r = state.release;
  r.bindingDigest = digest(JSON.stringify({ id: r.id, destination: r.destination, policyDigest: r.policyDigest, artifactDigest: r.artifactDigest, receipt: r.receipt }));
  state.status = 'awaiting-release';
}

export function approveRelease(state, token) {
  const r = assertRelease(state);
  if (state.status !== 'awaiting-release' || r.status !== 'awaiting-approval' || token !== r.token) throw Error('release approval token does not match');
  r.approvedAt = new Date().toISOString(); r.status = 'approved'; delete r.token;
  state.status = 'ready';
}

function verifyDirectory(path, artifacts) {
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) throw Error('unsafe published directory');
  const expected = new Map(artifacts.map(a => [a.path, a.sha256])); const found = [];
  const walk = (dir, prefix = '') => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name), rel = prefix + name, stat = lstatSync(full);
      if (stat.isSymbolicLink()) throw Error('symlink in published artifact');
      if (stat.isDirectory()) walk(full, `${rel}/`);
      else {
        if (!stat.isFile() || !expected.has(rel) || digest(readFileSync(full)) !== expected.get(rel)) throw Error('published artifact differs from approved candidate');
        found.push(rel);
      }
    }
  };
  walk(path);
  if (found.length !== expected.size) throw Error('published artifact missing');
}

export function recoverRelease(state) {
  const r = assertRelease(state);
  if (!r.approvedAt || !['publishing', 'failed'].includes(r.status)) throw Error('release is not recoverable');
  // Reuse operation ID and candidate; never rebuild or approve a replacement.
  state.status = 'ready'; delete state.reason;
}

export async function executeRelease(state, { safePath, checks = runChecks, save = () => {} } = {}) {
  const r = assertRelease(state);
  if (!r.approvedAt || !['approved', 'publishing', 'failed', 'verified'].includes(r.status)) throw Error('release was not approved');
  r.status = 'publishing'; save(state);
  const target = join(r.destination, `${r.id}-${r.artifactDigest}`);
  let staging;
  try {
    let present = false;
    try { lstatSync(target); present = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!present) {
      staging = mkdtempSync(join(r.destination, `.great-cto-${r.id}-`));
      for (const file of validateArtifacts(r.artifacts)) {
        const path = join(staging, file.path); mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, Buffer.from(file.base64, 'base64'), { flag: 'wx', mode: 0o444 });
      }
      verifyDirectory(staging, r.artifacts);
      renameSync(staging, target); staging = null;
    }
    verifyDirectory(target, r.artifacts);
    r.path = target; r.publishedAt ??= new Date().toISOString(); save(state);
    r.smoke = await checks({ root: target, allowed: r.artifacts.map(a => a.path), checkPolicy: {
      image: state.releasePolicy.image, inputs: r.artifacts.map(a => a.path), commands: state.releasePolicy.smokeCommands,
      timeoutMs: state.releasePolicy.timeoutMs,
    } }, { safePath });
    verifyDirectory(target, r.artifacts);
    if (r.smoke?.state !== 'passed' || r.smoke.code !== 0) throw Error('post-release smoke did not pass');
    assertRelease(state);
    r.status = 'verified'; r.verifiedAt = new Date().toISOString();
    save(state); return r;
  } catch (error) {
    r.status = 'failed'; state.status = 'blocked'; state.reason = error.message; save(state); throw error;
  } finally {
    // Only this invocation's private staging directory is discarded. A published
    // candidate, including a failed smoke candidate, is retained for inspection.
    if (staging) rmSync(staging, { recursive: true, force: true });
  }
}
