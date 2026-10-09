/** Publish an explicitly approved, already-committed verified task. Never merge. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readWorkTask, mutateWorkTask, acquireProjectLease, publicWorkTask } from './work-tasks.mjs';
import { treeReceipt } from './receipt.mjs';
import { scan } from './secret-patterns.mjs';
import { realpathSync } from 'node:fs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const bindingOf = (value, revision = value.revision) => ({ taskId: value.taskId, revision,
  repository: value.repository, origin: value.origin, branch: value.branch, base: value.base,
  head: value.head, baseHead: value.baseHead, tree: value.tree, paths: value.paths,
  allow: value.allow, patchDigest: value.patchDigest });
const ref = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9/_-]{0,120}$/.test(value)
  && !value.endsWith('/') && !value.includes('//');
const scopePath = value => typeof value === 'string' && value.length <= 300 && value.length > 0
  && !value.startsWith('/') && !value.startsWith('-') && !value.includes('\\') && !value.includes(':') && !value.includes(',')
  && !/[\x00-\x1f]/.test(value) && !value.split('/').some(p => !p || p === '.' || p === '..');
function command(bin, args, root, execute = execFileSync) {
  try { return String(execute(bin, args, { cwd: root, encoding: 'utf8', timeout: 20000,
    maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1', GH_PROMPT_DISABLED: '1' } })); }
  catch { throw Error(`${bin} ${args[0]} failed; inspect local authentication, hooks or network (output withheld)`); }
}
function repository(url, root, execute) {
  const https = /^https:\/\/github\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(url);
  if (https) return `${https[1]}/${https[2]}`;
  const ssh = /^git@([A-Za-z0-9_.-]+):([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(url);
  if (!ssh || ssh[1].startsWith('-')) throw Error('publication requires a credential-free GitHub origin');
  if (ssh[1] !== 'github.com') {
    // Inspect OpenSSH's effective config without connecting; never echo identity paths.
    const config = command('ssh', ['-G', '-o', 'CanonicalizeHostname=no', '-o', 'BatchMode=yes', `git@${ssh[1]}`], root, execute);
    const values = new Map(config.split('\n').map(line => line.trim().split(/\s+/, 2)));
    if (values.get('hostname')?.toLowerCase() !== 'github.com' || values.get('user') !== 'git' || values.get('port') !== '22')
      throw Error('SSH alias does not resolve to git@github.com:22');
    if (process.env.GIT_SSH || process.env.GIT_SSH_COMMAND || /(?:^|\0)(?:core\.sshcommand|ssh\.variant)\n/i.test(command('git', ['config', '--list', '--null'], root, execute)))
      throw Error('custom SSH transport cannot be verified for publication');
  }
  return `${ssh[2]}/${ssh[3]}`;
}
function ready(task, root) {
  if (task.managed === false || task.intent === 'research' || task.phase !== 'verified' || task.outcome?.state !== 'verified')
    throw Error('publication requires a managed verified delivery task');
  if (task.decisions?.length || task.operations.some(o => o.state === 'running')) throw Error('task has pending decisions or an active host operation');
  const receipt = treeReceipt(root);
  if (!receipt || receipt.dirty || receipt.truncated || !same(receipt, task.outcome.receipt)) throw Error('verified tree receipt is missing or stale; commit and reverify before publication');
}

export function previewPublication({ root, taskId, base = 'main', allow = null }, options = {}) {
  const task = readWorkTask(taskId, { ...options, root }); ready(task, root);
  const git = args => command('git', args, root, options.execute);
  if (realpathSync(git(['rev-parse', '--show-toplevel']).trim()) !== realpathSync(root)) throw Error('publication task must own the repository root, not a nested directory');
  // Even metadata/log changes excluded from verification cannot accidentally ship.
  if (git(['status', '--porcelain=v1', '--untracked-files=all']).trim()) throw Error('publication requires a fully clean worktree and index');
  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
  if (!ref(base) || !ref(branch) || branch === base || ['main', 'master', 'develop'].includes(branch)) throw Error('publication requires a non-protected named feature branch and valid base');
  git(['check-ref-format', `refs/heads/${base}`]); git(['check-ref-format', `refs/heads/${branch}`]);
  const origins = git(['remote', 'get-url', '--all', 'origin']).trim().split('\n');
  const pushOrigins = git(['remote', 'get-url', '--push', '--all', 'origin']).trim().split('\n');
  if (origins.length !== 1 || pushOrigins.length !== 1 || origins[0] !== pushOrigins[0]) throw Error('origin must have exactly one identical fetch and push URL');
  const repo = repository(origins[0], root, options.execute);
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const baseHead = git(['rev-parse', '--verify', `refs/remotes/origin/${base}^{commit}`]).trim();
  git(['merge-base', '--is-ancestor', baseHead, head]);
  const commits = git(['rev-list', '--reverse', `${baseHead}..${head}`]).trim().split('\n').filter(Boolean);
  if (!commits.length || commits.length > 100 || git(['rev-list', '--merges', `${baseHead}..${head}`]).trim()) throw Error('publication supports 1..100 linear commits; merge commits require manual review');
  const paths = [...new Set(commits.flatMap(commit => git(['diff-tree', '-r', '--no-commit-id', '--no-renames', '--name-only', '-z', commit]).split('\0').filter(Boolean)))];
  if (!paths.length || paths.length > 200) throw Error('publication requires 1..200 changed files');
  const allowed = allow || task.authority?.writeScope;
  if (!Array.isArray(allowed) || !allowed.length || allowed.some(p => !scopePath(p))) throw Error('publication requires explicit relative path scope');
  if (paths.some(p => !scopePath(p) || !allowed.some(a => p === a || p.startsWith(a + '/')))) throw Error('diff contains paths outside the approved publication scope');
  const patch = commits.map(commit => git(['show', '--no-color', '--format=fuller', '--no-ext-diff', '--no-textconv', '--no-renames', '--binary', commit, '--'])).join('\n');
  if (Buffer.byteLength(patch) > 2 * 1024 * 1024 || patch.includes('GIT binary patch')) throw Error('publication preview exceeds its text-only size limit; inspect manually');
  // Scan complete publication content, including removed lines; never return matched secrets.
  if (scan(patch).length) throw Error('publication diff contains a possible secret; resolve locally before preview');
  const binding = { taskId, revision: task.revision, repository: repo, origin: origins[0], branch, base,
    head, baseHead, tree: git(['rev-parse', 'HEAD^{tree}']).trim(), paths, allow: [...allowed], patchDigest: digest(patch) };
  let confirmation = { expectedRevision: task.revision, approval: digest(binding) };
  const pending = task.publication;
  if (pending && pending.state !== 'pr-linked') {
    if (task.revision !== pending.guardRevision || digest(bindingOf(binding, pending.approvedRevision)) !== pending.approval
      || digest(bindingOf(pending, pending.approvedRevision)) !== pending.approval) throw Error('unfinished publication changed; reconcile before a new preview');
    confirmation = { expectedRevision: pending.approvedRevision, approval: pending.approval };
  }
  return { ...binding, approval: digest(binding), confirmation, patch,
    summary: git(['diff', '--no-ext-diff', '--no-textconv', '--stat', baseHead, head, '--']),
    scope: 'push approved commit and create/find draft PR only; no commit, merge, release or deploy' };
}

function assertPR(pr, preview) {
  if (!pr || pr.headRefOid !== preview.head || pr.headRefName !== preview.branch || pr.baseRefName !== preview.base
    || pr.state !== 'OPEN' || pr.isDraft !== true || typeof pr.url !== 'string'
    || !pr.url.startsWith(`https://github.com/${preview.repository}/pull/`) || !/\/pull\/[1-9][0-9]*$/.test(pr.url))
    throw Error('existing PR does not match approved SHA/base/draft state; inspect it manually');
  return pr;
}

export function publishPublication({ root, taskId, base = 'main', allow = null, expectedRevision, approval, confirm }, options = {}) {
  if (confirm !== 'publish-draft-pr' || !Number.isInteger(expectedRevision) || !/^[0-9a-f]{64}$/.test(approval || ''))
    throw Error('publication requires explicit publish-draft-pr confirmation, revision and preview approval');
  const lease = acquireProjectLease(root, options);
  let active = false;
  try {
    let task = readWorkTask(taskId, { ...options, root }), existing = task.publication;
    if (existing && existing.approval === approval && existing.approvedRevision === expectedRevision) {
      if (base !== existing.base || (allow && !same(allow, existing.allow))) throw Error('publication retry parameters conflict with approved request');
      if (existing.state === 'pr-linked') return { publication: existing, task: publicWorkTask(task) };
      if (task.revision !== existing.guardRevision) throw Error('task changed after publication approval; new preview required');
    } else {
      const preview = previewPublication({ root, taskId, base, allow }, options);
      if (preview.revision !== expectedRevision || preview.approval !== approval) throw Error('stale publication preview; refresh and approve exact content');
      if (existing && existing.state !== 'pr-linked') throw Error('unfinished publication exists; reconcile its approved operation first');
      task = mutateWorkTask(taskId, t => { t.publication = { ...preview, patch: undefined, summary: undefined,
        approvedRevision: expectedRevision, guardRevision: t.revision + 1, state: 'prepared', url: null, lastError: null }; }, { ...options, root });
      existing = task.publication;
    }
    active = true;
    // Revalidate task evidence/content on retry without issuing a new approval.
    const current = previewPublication({ root, taskId, base: existing.base, allow: existing.allow }, options);
    if (digest(bindingOf(current, existing.approvedRevision)) !== approval
      || digest(bindingOf(existing, existing.approvedRevision)) !== approval) throw Error('publication inputs changed; refuse external writes');
    const git = args => command('git', args, root, options.execute);
    const gh = args => command('gh', args, root, options.execute);
    const checkpoint = (state, more = {}) => {
      task = mutateWorkTask(taskId, t => {
        if (t.revision !== t.publication.guardRevision) throw Error('task revision changed during publication');
        Object.assign(t.publication, more, { state, guardRevision: t.revision + 1, lastError: null });
      }, { ...options, root }); existing = task.publication;
    };
    const remoteBase = git(['ls-remote', '--refs', 'origin', `refs/heads/${existing.base}`]).trim().split(/\s+/)[0];
    if (remoteBase !== existing.baseHead) throw Error('remote base moved; fetch and reverify before publication');
    const remoteHead = git(['ls-remote', '--refs', 'origin', `refs/heads/${existing.branch}`]).trim().split(/\s+/)[0];
    if (remoteHead && remoteHead !== existing.head) throw Error('remote feature branch differs; no overwrite or force push permitted');
    // Empty expected ref is a create-only CAS, not permission to overwrite a ref.
    // Without it, another writer could create an ancestor between ls-remote and push.
    // Immutable SHA refspec; normal hooks remain enabled. No --force or nonempty lease.
    if (remoteHead !== existing.head) git(['push', `--force-with-lease=refs/heads/${existing.branch}:`, 'origin', `${existing.head}:refs/heads/${existing.branch}`]);
    if (git(['ls-remote', '--refs', 'origin', `refs/heads/${existing.branch}`]).trim().split(/\s+/)[0] !== existing.head)
      throw Error('remote commit identity is unconfirmed; reconcile before PR creation');
    checkpoint('pushed');
    const list = () => {
      const prs = JSON.parse(gh(['pr', 'list', '--repo', existing.repository, '--head', existing.branch, '--base', existing.base,
        '--state', 'all', '--limit', '100', '--json', 'url,headRefOid,headRefName,baseRefName,state,isDraft']));
      if (!Array.isArray(prs) || prs.length > 1) throw Error('PR identity is ambiguous');
      return prs[0] ? assertPR(prs[0], existing) : null;
    };
    let pr = list();
    if (!pr) {
      // Persist intent BEFORE sending create. A timeout is an uncertain outcome, not permission to create twice.
      if (existing.createIssued) throw Error('PR creation outcome is uncertain; no duplicate create will be sent; reconcile remotely');
      if (git(['ls-remote', '--refs', 'origin', `refs/heads/${existing.base}`]).trim().split(/\s+/)[0] !== existing.baseHead)
        throw Error('remote base changed before PR creation; reverify before publication');
      checkpoint('pushed', { createIssued: true });
      gh(['pr', 'create', '--repo', existing.repository, '--base', existing.base, '--head', existing.branch, '--draft',
        '--title', `Task ${taskId}`, '--body', `Verified task publication. Task: ${taskId}. Approved commit: ${existing.head}. Merge, release and deploy require separate authorization.`]);
      pr = list();
      if (!pr) throw Error('created PR is not visible yet; retry reconciliation only');
    }
    checkpoint('pr-linked', { url: pr.url });
    return { publication: existing, task: publicWorkTask(task) };
  } catch (error) {
    if (active) mutateWorkTask(taskId, t => {
      if (t.revision !== t.publication.guardRevision) return false;
      t.publication.lastError = error.message; t.publication.guardRevision = t.revision + 1;
    }, { ...options, root });
    throw error;
  } finally { lease.release(); }
}
