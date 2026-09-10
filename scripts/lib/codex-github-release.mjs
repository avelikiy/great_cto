/** GitHub Release publication with download-and-hash reconciliation. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { digest } from './codex-artifacts.mjs';

const exec = promisify(execFile);

export async function invokeGh(args) {
  const { stdout = '', stderr = '' } = await exec('gh', args, {
    encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  });
  return { stdout, stderr };
}

const notFound = error => /release not found|HTTP 404|Not Found/i.test(`${error?.stderr || ''}\n${error?.message || ''}`);

/**
 * A 404 from a repository this account cannot see reads exactly like "no
 * release yet" — and this machine flips between two gh accounts, so that is a
 * real state, not a hypothetical. Ask the repository first; only then does a
 * 404 on a release or a tag mean absence.
 */
async function repositoryReachable(policy, gh) {
  try { await gh(['api', `repos/${policy.repository}`]); }
  catch (error) {
    if (notFound(error)) throw Error(`GitHub repository ${policy.repository} is not reachable with the current gh credentials — refusing to read that as "no release yet"`);
    throw error;
  }
}

/**
 * The commit a tag points at, or null when the tag does not exist.
 *
 * Asked of the TAG, never of the release. GitHub documents a release's
 * `target_commitish` as "Unused if the Git tag already exists", so that
 * attribute can equal the approved commit while the tag points elsewhere —
 * and the approval is bound to the commit, not to the attribute.
 */
async function resolveTagCommit(policy, gh) {
  let object;
  try {
    object = JSON.parse((await gh(['api', `repos/${policy.repository}/git/ref/tags/${policy.tag}`])).stdout || 'null')?.object;
  } catch (error) {
    if (notFound(error)) return null;
    throw error;
  }
  for (let hops = 0; object?.type === 'tag' && hops < 5; hops += 1) {
    object = JSON.parse((await gh(['api', `repos/${policy.repository}/git/tags/${object.sha}`])).stdout || 'null')?.object;
  }
  if (object?.type !== 'commit' || !/^[a-f0-9]{40}$/.test(object?.sha || '')) throw Error(`GitHub tag ${policy.tag} did not resolve to a commit`);
  return object.sha;
}

const remoteName = (file, index) => `great-cto-${String(index + 1).padStart(3, '0')}-${file.sha256}`;

function parseView(result) {
  const value = JSON.parse(result?.stdout || 'null');
  if (!value || typeof value !== 'object' || !Array.isArray(value.assets)) throw Error('GitHub release view returned invalid evidence');
  return value;
}

async function view(policy, gh) {
  try {
    return parseView(await gh(['release', 'view', policy.tag, '--repo', policy.repository,
      '--json', 'isDraft,tagName,targetCommitish,url,assets']));
  } catch (error) {
    // Reached only after repositoryReachable() succeeded, so a 404 here is an
    // absent release. `error.code` is not consulted: gh run through execFile
    // reports its exit status there, never a semantic code.
    if (notFound(error)) return null;
    throw error;
  }
}

function assertRemoteShape(remote, policy, expectedNames) {
  if (remote.tagName !== policy.tag || remote.targetCommitish !== policy.targetCommitish) throw Error('GitHub release target differs from approved policy');
  const names = remote.assets.map(asset => asset.name).sort();
  const expected = [...expectedNames].sort();
  if (names.some(name => !expected.includes(name))) throw Error('GitHub release contains an unapproved asset');
  return new Set(names);
}

/**
 * Publish or reconcile one approval-bound GitHub Release.
 * The caller owns state transitions; this function owns only remote effects.
 */
export async function publishGitHubRelease(release, policy, { gh = invokeGh, verifyDownloaded } = {}) {
  const staging = mkdtempSync(join(tmpdir(), `great-cto-gh-${release.id}-`));
  const mapped = release.artifacts.map((file, index) => ({ file, name: remoteName(file, index) }));
  const expectedNames = mapped.map(item => item.name);
  try {
    await repositoryReachable(policy, gh);
    // Before any remote effect: refusing here is the check that prevents harm.
    // After publication the release is already public.
    const existingTag = await resolveTagCommit(policy, gh);
    if (existingTag && existingTag !== policy.targetCommitish) {
      throw Error(`GitHub tag ${policy.tag} already points at ${existingTag}, not the approved ${policy.targetCommitish}`);
    }
    let remote = await view(policy, gh);
    if (!remote) {
      await gh(['release', 'create', policy.tag, '--repo', policy.repository, '--target', policy.targetCommitish,
        '--draft', '--title', policy.title, '--notes', policy.notes]);
      remote = await view(policy, gh);
      if (!remote) throw Error('GitHub draft release was not observable after creation');
    }
    let present = assertRemoteShape(remote, policy, expectedNames);

    for (const { file, name } of mapped) {
      if (present.has(name)) continue;
      const path = join(staging, 'upload', name); mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(file.base64, 'base64'), { flag: 'wx', mode: 0o400 });
      await gh(['release', 'upload', policy.tag, path, '--repo', policy.repository]);
    }

    remote = await view(policy, gh);
    present = assertRemoteShape(remote, policy, expectedNames);
    if (present.size !== expectedNames.length) throw Error('GitHub release is missing an approved asset');

    const downloadedRoot = join(staging, 'downloaded');
    for (const { file, name } of mapped) {
      const downloaded = join(downloadedRoot, file.path); mkdirSync(dirname(downloaded), { recursive: true });
      await gh(['release', 'download', policy.tag, '--repo', policy.repository, '--pattern', name, '--output', downloaded]);
      if (digest(readFileSync(downloaded)) !== file.sha256) throw Error(`GitHub asset differs from approved candidate: ${file.path}`);
    }

    const smoke = await verifyDownloaded(downloadedRoot);
    if (smoke?.state !== 'passed' || smoke.code !== 0) throw Error('post-release smoke did not pass');
    if (remote.isDraft) await gh(['release', 'edit', policy.tag, '--repo', policy.repository, '--draft=false']);
    remote = await view(policy, gh);
    assertRemoteShape(remote, policy, expectedNames);
    if (remote.isDraft) throw Error('GitHub release remained a draft after publication');
    const publishedTag = await resolveTagCommit(policy, gh);
    if (publishedTag !== policy.targetCommitish) {
      throw Error(`GitHub tag ${policy.tag} resolves to ${publishedTag ?? 'nothing'}, not the approved ${policy.targetCommitish}`);
    }
    return { url: remote.url, smoke, remoteAssets: mapped.map(({ file, name }) => ({ path: file.path, name, sha256: file.sha256 })) };
  } finally {
    // Callers run smoke before this function returns, so no approved bytes or
    // credentials remain in a persistent host directory afterward.
    rmSync(staging, { recursive: true, force: true });
  }
}
