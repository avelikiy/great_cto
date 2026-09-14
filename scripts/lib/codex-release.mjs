/** Local artifact release. Publication and reconciliation are controller-owned. */
import { realpathSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, lstatSync, readdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateArtifacts, bundleDigest, digest, artifactPath } from './codex-artifacts.mjs';
import { validateCheckPolicy, runChecks } from './codex-checks.mjs';
import { treeReceipt } from './receipt.mjs';
import { publishGitHubRelease } from './codex-github-release.mjs';
const ROOT_MARKER = '.great-cto-release-root';
const ROOT_MARKER_CONTENT = 'great-cto-release-root:v1\n';

export function validateReleasePolicy(policy, root) {
  if (!policy || !['local', 'github-release'].includes(policy.adapter)) throw Error('release requires a supported adapter');
  const smoke = { image: policy.image, inputs: ['artifact'], commands: policy.smokeCommands, timeoutMs: policy.timeoutMs };
  validateCheckPolicy(smoke);
  if (policy.adapter === 'github-release') {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(policy.repository || '')) throw Error('GitHub release requires repository owner/name');
    if (!/^[A-Za-z0-9][A-Za-z0-9._/+\-]{0,127}$/.test(policy.tag || '')) throw Error('GitHub release requires a safe explicit tag');
    if (!/^[a-f0-9]{40}$/.test(policy.targetCommitish || '')) throw Error('GitHub release requires an exact 40-character target commit');
    if (typeof policy.title !== 'string' || !policy.title.trim() || policy.title.length > 128 || /[\r\n\0]/.test(policy.title)) throw Error('GitHub release requires a bounded single-line title');
    if (typeof policy.notes !== 'string' || policy.notes.length > 8192 || policy.notes.includes('\0')) throw Error('GitHub release notes are invalid or too large');
    return { adapter: 'github-release', repository: policy.repository, tag: policy.tag, targetCommitish: policy.targetCommitish,
      title: policy.title, notes: policy.notes, activation: 'none', rollback: 'superseding-release',
      image: policy.image, smokeCommands: JSON.parse(JSON.stringify(policy.smokeCommands)), timeoutMs: policy.timeoutMs };
  }
  if (typeof policy.releaseRoot !== 'string') throw Error('local release requires an explicit releaseRoot');
  const releaseRoot = realpathSync(policy.releaseRoot);
  if (!lstatSync(releaseRoot).isDirectory()) throw Error('release root must be a directory');
  const rel = relative(realpathSync(root), releaseRoot);
  if (rel !== '..' && !rel.startsWith(`..${sep}`)) throw Error('release root must be outside the target workspace');
  const marker = join(releaseRoot, ROOT_MARKER);
  if (!existsSync(marker) || !lstatSync(marker).isFile() || lstatSync(marker).isSymbolicLink() || readFileSync(marker, 'utf8') !== ROOT_MARKER_CONTENT) {
    throw Error(`release root is not designated: create ${ROOT_MARKER} with the documented v1 content`);
  }
  return { adapter: 'local', releaseRoot, activation: 'none', rollback: 'consumer-selects-previous', image: policy.image,
    smokeCommands: JSON.parse(JSON.stringify(policy.smokeCommands)), timeoutMs: policy.timeoutMs };
}

const releaseTarget = policy => policy.adapter === 'local'
  ? { releaseRoot: policy.releaseRoot }
  : { repository: policy.repository, tag: policy.tag, targetCommitish: policy.targetCommitish };

function assertRelease(state) {
  const r = state.release;
  if (!/^[a-f0-9-]{36}$/.test(r?.id || '')) throw Error('invalid release operation ID');
  if (!r || r.policyDigest !== digest(JSON.stringify(state.releasePolicy)) || r.artifactDigest !== bundleDigest(r.artifacts)) throw Error('release approval binding changed');
  if (JSON.stringify(r.target) !== JSON.stringify(releaseTarget(state.releasePolicy)) || r.bindingDigest !== digest(JSON.stringify({ id: r.id, target: r.target,
    policyDigest: r.policyDigest, artifactDigest: r.artifactDigest, receipt: r.receipt }))) throw Error('release candidate binding changed');
  if (r.adapter === 'local' && realpathSync(r.target.releaseRoot) !== r.target.releaseRoot) throw Error('release root changed');
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
  state.release = { id: randomUUID(), adapter: policy.adapter, status: 'awaiting-approval', token: randomUUID(), target: releaseTarget(policy),
    policyDigest: digest(JSON.stringify(policy)), artifacts, artifactDigest: bundleDigest(artifacts), receipt,
    activation: policy.activation, rollback: policy.rollback,
    preparedAt: new Date().toISOString() };
  const r = state.release;
  r.bindingDigest = digest(JSON.stringify({ id: r.id, target: r.target, policyDigest: r.policyDigest, artifactDigest: r.artifactDigest, receipt: r.receipt }));
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

export async function executeRelease(state, { safePath, checks = runChecks, gh, save = () => {} } = {}) {
  const r = assertRelease(state);
  if (!r.approvedAt || !['approved', 'publishing', 'failed', 'verified'].includes(r.status)) throw Error('release was not approved');
  r.status = 'publishing'; save(state);
  if (r.adapter === 'github-release') {
    try {
      const published = await publishGitHubRelease(r, state.releasePolicy, { gh, verifyDownloaded: root => checks({
        root, allowed: r.artifacts.map(a => a.path), checkPolicy: {
          image: state.releasePolicy.image, inputs: r.artifacts.map(a => a.path), commands: state.releasePolicy.smokeCommands,
          timeoutMs: state.releasePolicy.timeoutMs,
        },
      }, { safePath }) });
      Object.assign(r, { url: published.url, remoteAssets: published.remoteAssets, smoke: published.smoke,
        publishedAt: r.publishedAt ?? new Date().toISOString(), status: 'verified', verifiedAt: new Date().toISOString() });
      assertRelease(state); save(state); return r;
    } catch (error) {
      r.status = 'failed'; state.status = 'blocked'; state.reason = error.message; save(state); throw error;
    }
  }
  const target = join(r.target.releaseRoot, `${r.id}-${r.artifactDigest}`);
  let staging;
  try {
    let present = false;
    try { lstatSync(target); present = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!present) {
      staging = mkdtempSync(join(r.target.releaseRoot, `.great-cto-${r.id}-`));
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
