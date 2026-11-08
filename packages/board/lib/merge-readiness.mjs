/**
 * Is this task's branch ready to merge? Seven rows, read from what is actually
 * recorded (owner-approved design v12, ldws.3). The board never merges: when every
 * row passes it offers the command to copy.
 *
 * A row that could not be read is `not-read` and counts as a blocker, never as a
 * pass. A task with no known branch gets no card at all: there is nothing to merge.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/;
const REVIEWERS = Object.freeze(['code-reviewer', 'qa-engineer']);
const APPROVING = new Set(['APPROVED', 'PASS', 'DONE']);
const DESIGN_PATHS = /^packages\/board\/public\//;
const DESIGN_LINK = /^Design-Approved:\s*(https:\/\/claude\.ai\/\S+)/m;
const CACHE_MS = 30_000;

const THREADS_QUERY = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){pageInfo{hasNextPage} nodes{isResolved}}}}}';

/** Runs a command with a deadline. Rejects with { stderr, code } as execFile does. */
export function run(cmd, args, { cwd, timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; reject(err); } else resolve(stdout);
    });
  });
}

const attempt = async (fn) => { try { return await fn(); } catch { return null; } };

/** The branch a Work entry stands for, or null: a recorded publication, then ADR-047's task/<id>. */
export async function resolveBranch(entry, { root, exec = run } = {}) {
  const recorded = entry?.publication?.branch;
  if (typeof recorded === 'string' && SAFE_BRANCH.test(recorded)) return recorded;
  for (const id of entry?.issueIds || []) {
    const candidate = `task/${id}`;
    if (!SAFE_BRANCH.test(candidate)) continue;
    const found = await attempt(() => exec('git', ['-C', root, 'show-ref', '--verify', '--quiet', `refs/heads/${candidate}`]));
    if (found !== null) return candidate;
  }
  return null;
}

/** JSON lines of a verdict log. Older plain-text lines carry no head and are skipped. */
function verdictRecords(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return e.code === 'ENOENT' ? [] : null; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('{')) continue;
    try { out.push(JSON.parse(line)); } catch { /* one bad line does not hide the rest */ }
  }
  return out;
}

/** Latest verdict per reviewer bound to this exact head, from the project and the branch's worktree. */
export function readReviewerVerdicts(dirs, head) {
  const found = {};
  for (const reviewer of REVIEWERS) {
    const records = [];
    for (const dir of dirs) {
      for (const name of [`${reviewer}.log`, `great-cto:${reviewer}.log`]) {
        const got = verdictRecords(path.join(dir, '.great_cto', 'verdicts', name));
        if (got === null) return null;
        records.push(...got);
      }
    }
    const bound = records.filter((r) => r?.receipt?.head === head).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    found[reviewer] = bound.at(-1)?.verdict ?? null;
  }
  return found;
}

/** Records of <root>/.great_cto/gate-runs.jsonl, or null when it exists and cannot be read. */
export function readGateHistory(root) {
  let raw;
  try { raw = fs.readFileSync(path.join(root, '.great_cto', 'gate-runs.jsonl'), 'utf8'); }
  catch (e) { return e.code === 'ENOENT' ? [] : null; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip the line */ }
  }
  return out;
}

async function readPullRequest(root, branch, exec) {
  let raw;
  try {
    raw = await exec('gh', ['pr', 'view', branch, '--json', 'number,state,isDraft,mergeable,url,headRefOid,body'], { cwd: root });
  } catch (e) {
    return /no pull requests? found/i.test(String(e.stderr || '')) ? { missing: true } : null;
  }
  try { return JSON.parse(raw); } catch { return null; }
}

async function unresolvedThreads(root, pr, exec) {
  const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(pr.url || '');
  if (!m) return null;
  const raw = await attempt(() => exec('gh', ['api', 'graphql', '-f', `query=${THREADS_QUERY}`, '-F', `owner=${m[1]}`, '-F', `name=${m[2]}`, '-F', `number=${m[3]}`], { cwd: root }));
  if (raw === null) return null;
  try {
    const threads = JSON.parse(raw).data.repository.pullRequest.reviewThreads;
    if (threads.pageInfo.hasNextPage) return null; // a partial count would understate it
    return threads.nodes.filter((t) => !t.isResolved).length;
  } catch { return null; }
}

/** Everything the rows are judged on. A value of null means it could not be read. */
export async function readFacts(root, { branch, base = null, issueIds = [], tasks = null, gateQueue = null, exec = run, now = Date.now() }) {
  const git = (args) => attempt(async () => String(await exec('git', ['-C', root, ...args])).trim());
  const originHead = await git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  const integration = base ? `origin/${base}` : (originHead ? originHead.replace('refs/remotes/', '') : 'origin/main');
  const head = await git(['rev-parse', `refs/heads/${branch}`]);
  const aheadRaw = await git(['rev-list', '--count', `${integration}..refs/heads/${branch}`]);
  const list = await git(['worktree', 'list', '--porcelain']);
  let worktree = null;
  if (list) {
    for (const block of list.split('\n\n')) {
      if (block.includes(`branch refs/heads/${branch}`)) worktree = /^worktree (.+)$/m.exec(block)?.[1] || null;
    }
  }
  let dirty = worktree ? null : 0;
  if (worktree) {
    const status = await attempt(async () => String(await exec('git', ['-C', worktree, 'status', '--porcelain'])));
    if (status !== null) dirty = status.split('\n').filter((l) => l.trim() && !/^\?\? (node_modules|packages\/cli\/node_modules)$/.test(l.trim())).length;
  }
  const pr = await readPullRequest(root, branch, exec);
  const threads = pr && !pr.missing ? await unresolvedThreads(root, pr, exec) : null;
  const filesRaw = await git(['diff', '--name-only', `${integration}...refs/heads/${branch}`]);
  const messages = await git(['log', '--format=%B', `${integration}..refs/heads/${branch}`]);
  const subtasks = !issueIds.length ? [] : tasks === null ? null : tasks
    .filter((t) => issueIds.some((id) => String(t.id).startsWith(`${id}.`)))
    .filter((t) => !['closed', 'done'].includes(String(t.raw_status || t.status || '').toLowerCase()))
    .map((t) => t.id);
  return {
    branch, integration, head, ahead: aheadRaw === null ? null : Number(aheadRaw), worktree, dirty, pr, threads,
    files: filesRaw === null ? null : filesRaw.split('\n').filter(Boolean),
    designLink: DESIGN_LINK.exec(`${messages || ''}\n${pr?.body || ''}`)?.[1] || null,
    gateRuns: readGateHistory(root),
    gateQueue,
    gateRunnable: !!worktree && fs.existsSync(path.join(worktree, 'scripts', 'ci-local.sh')),
    verdicts: head ? readReviewerVerdicts([root, ...(worktree ? [worktree] : [])], head) : null,
    linkedIssues: issueIds.length > 0,
    subtasks,
    checkedAt: new Date(now).toISOString(),
  };
}

const row = (id, label, state, detail, action = null) => ({ id, label, state, detail, action });
const NOT_READ = 'Not read';
const short = (sha) => String(sha || '').slice(0, 7);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function branchRow(f) {
  const main = f.integration.replace(/^origin\//, '');
  if (f.ahead === null || f.dirty === null) return row('branch', 'Branch', 'not-read', NOT_READ);
  if (f.dirty > 0) return row('branch', 'Branch', 'fail', `${plural(f.dirty, 'uncommitted change')} in the worktree`);
  if (f.ahead === 0) return row('branch', 'Branch', 'fail', `No commits ahead of ${main}`);
  return row('branch', 'Branch', 'pass', `${plural(f.ahead, 'commit')} ahead of ${main} · ${f.worktree ? 'working tree clean' : 'no local worktree'}`);
}

function prRow(f) {
  const main = f.integration.replace(/^origin\//, '');
  const link = f.pr?.url ? { kind: 'link', label: 'Open PR', href: f.pr.url } : null;
  if (f.pr === null) return row('pr', 'Pull request', 'not-read', NOT_READ);
  if (f.pr.missing) return row('pr', 'Pull request', 'fail', 'No pull request for this branch');
  const n = `#${f.pr.number}`;
  if (f.pr.state !== 'OPEN') return row('pr', 'Pull request', 'fail', `${n} is ${String(f.pr.state).toLowerCase()}`, link);
  if (f.head && f.pr.headRefOid !== f.head) return row('pr', 'Pull request', 'fail', `${n} is on ${short(f.pr.headRefOid)}, the branch is on ${short(f.head)}`, link);
  if (f.pr.isDraft) return row('pr', 'Pull request', 'fail', `${n} is a draft`, link);
  if (f.pr.mergeable === 'CONFLICTING') return row('pr', 'Pull request', 'fail', `${n} open · conflicts with ${main}`, link);
  if (f.pr.mergeable !== 'MERGEABLE') return row('pr', 'Pull request', 'not-read', `${n} open · ${NOT_READ}: GitHub has not computed conflicts`, link);
  return row('pr', 'Pull request', 'pass', `${n} open · no conflicts with ${main}`, link);
}

function queueText(q) {
  if (q.state === 'running') return 'running now';
  const why = Number.isFinite(q.idle) ? ` (CPU ${q.idle}% idle${q.ahead ? `, ${plural(q.ahead, 'gate')} ahead` : ''})` : '';
  return `queued — waiting for a quiet machine${why}`;
}

function gateRow(f) {
  const q = f.gateQueue;
  const live = q && q.branch === f.branch ? q : null;
  // "Run gate" appears only when no run is queued or running, on any branch.
  const action = live ? { kind: 'disabled', label: live.state === 'running' ? 'Running' : 'Queued' }
    : (f.gateRunnable && !q ? { kind: 'run-gate', label: 'Run gate' } : null);
  if (f.gateRuns === null || !f.head) return row('gate', 'Local gate', 'not-read', NOT_READ, action);
  const onHead = (r) => r?.sha && f.head.startsWith(r.sha);
  const last = f.gateRuns.filter(onHead).at(-1);
  const withQueue = (r) => (live ? { ...r, queue: queueText(live), queueBrief: queueText(live).replace(/ \(.*\)$/, '') } : r);
  if (last?.result === 'green') return withQueue(row('gate', 'Local gate', 'pass', 'Green on this head.', live ? action : null));
  if (last?.result === 'skipped') return withQueue(row('gate', 'Local gate', 'pass', 'Green on this head, some tests skipped.', live ? action : null));
  if (last?.result === 'red') {
    const steps = Array.isArray(last.failed) && last.failed.length ? `: ${last.failed.slice(0, 3).join(', ')}` : '';
    return withQueue(row('gate', 'Local gate', 'fail', `Red on this head${steps}.`, action));
  }
  const older = f.gateRuns.filter((r) => r?.branch === f.branch && ['green', 'skipped'].includes(r.result)).at(-1);
  const prior = older ? `Last green run is on an older head (${short(older.sha)}).` : 'No run on this head.';
  return withQueue({ ...row('gate', 'Local gate', 'fail', prior, action), ...(older ? { brief: 'Green only on an older head.' } : {}) });
}

function reviewersRow(f) {
  if (f.verdicts === null) return row('reviewers', 'Reviewers', 'not-read', NOT_READ);
  const parts = REVIEWERS.map((r) => `${r}: ${f.verdicts[r] ? f.verdicts[r].toLowerCase() : 'no verdict on this head'}`);
  const ok = REVIEWERS.every((r) => APPROVING.has(f.verdicts[r]));
  return row('reviewers', 'Reviewers', ok ? 'pass' : 'fail', parts.join(' · '), { kind: 'tab', label: 'Verdicts', tab: 'evidence' });
}

function commentsRow(f) {
  if (f.pr === null) return row('comments', 'Review comments', 'not-read', NOT_READ);
  if (f.pr.missing) return row('comments', 'Review comments', 'na', 'No pull request yet');
  if (f.threads === null) return row('comments', 'Review comments', 'not-read', NOT_READ);
  if (f.threads === 0) return row('comments', 'Review comments', 'pass', 'None unresolved');
  return row('comments', 'Review comments', 'fail', `${f.threads} unresolved on the PR`, {
    kind: 'copy', label: 'Copy for agent',
    text: `Resolve the ${plural(f.threads, 'unresolved review thread')} on ${f.pr.url}: read each one, fix the code or answer it, and push to ${f.branch}. Do not merge.`,
  });
}

function subtasksRow(f) {
  if (!f.linkedIssues) return row('subtasks', 'Open subtasks', 'na', 'Not linked to a Beads task');
  if (f.subtasks === null) return row('subtasks', 'Open subtasks', 'not-read', NOT_READ);
  if (!f.subtasks.length) return row('subtasks', 'Open subtasks', 'pass', 'None open in Beads');
  return { ...row('subtasks', 'Open subtasks', 'fail', `${f.subtasks.length} open in Beads: ${f.subtasks.slice(0, 3).join(', ')}`, { kind: 'issue', label: 'Show', narrowLabel: 'Show subtask', issue: f.subtasks[0] }), brief: `${f.subtasks.length} open in Beads` };
}

function designRow(f) {
  if (f.files === null) return row('design', 'Design approval', 'not-read', NOT_READ);
  if (!f.files.some((p) => DESIGN_PATHS.test(p))) return row('design', 'Design approval', 'na', 'Not required: no board, admin or landing files changed');
  if (f.designLink) return row('design', 'Design approval', 'pass', 'Approved in Claude Design', { kind: 'link', label: 'Open', href: f.designLink });
  return row('design', 'Design approval', 'fail', 'Board files changed; no Design-Approved link in the commits or the PR');
}

/** The run the board started, if its process is still alive. A display hint and the single-run check. */
export function readGateQueue(root) {
  try {
    const q = JSON.parse(fs.readFileSync(path.join(root, '.great_cto', 'gate-queue.json'), 'utf8'));
    process.kill(q.pid, 0);
    return q;
  } catch { return null; } // display-only: no file or a dead pid means nothing is queued; nothing is written from this
}

/** The one-line form a passed row takes on a phone. */
function briefOf(r, f) {
  if (r.state === 'na') return { comments: 'no PR yet', subtasks: 'not linked', design: 'not required' }[r.id] || '';
  return {
    branch: `${f.ahead} ahead, ${f.worktree ? 'clean' : 'no worktree'}`, pr: 'no conflicts', gate: 'green on this head',
    reviewers: `${REVIEWERS.length} approve`, comments: 'none unresolved', subtasks: 'none open', design: 'approved',
  }[r.id] || '';
}

/** Pure: the card from the facts. */
export function evaluate(f) {
  const rows = [branchRow(f), prRow(f), gateRow(f), reviewersRow(f), commentsRow(f), subtasksRow(f), designRow(f)]
    .map((r) => (r.state === 'pass' || r.state === 'na' ? { ...r, brief: briefOf(r, f) } : r));
  const blockers = rows.filter((r) => r.state === 'fail' || r.state === 'not-read').length;
  const ready = blockers === 0;
  return {
    branch: f.branch, head: f.head, shortHead: short(f.head), checkedAt: f.checkedAt, blockers, ready, rows,
    mergeCommand: ready && f.pr && !f.pr.missing ? `gh pr merge ${f.pr.number} --merge --match-head-commit ${f.head}` : null,
  };
}

const cache = new Map();

/** The card for one Work entry, or { branch: null } when it has no branch. Cached briefly: gh is slow. */
export async function readinessFor(root, entry, { tasks = null, gateQueue = null, exec = run, now = Date.now() } = {}) {
  const branch = await resolveBranch(entry, { root, exec });
  if (!branch) return { branch: null };
  const key = `${root}\0${branch}\0${gateQueue?.state || ''}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const facts = await readFacts(root, { branch, base: entry.publication?.base || null, issueIds: entry.issueIds || [], tasks, gateQueue, exec, now });
  const value = evaluate(facts);
  cache.set(key, { at: now, value });
  return value;
}

const GATE_SCRIPT = fileURLToPath(new URL('./gate-run.sh', import.meta.url));

/** Starts one detached gate on the entry's own worktree. No path comes from the request. */
export async function startGate(root, entry, { exec = run, spawnFn = spawn } = {}) {
  const branch = await resolveBranch(entry, { root, exec });
  if (!branch) return { status: 404, error: 'This task has no branch' };
  const list = await attempt(async () => String(await exec('git', ['-C', root, 'worktree', 'list', '--porcelain'])));
  const block = list?.split('\n\n').find((b) => b.includes(`branch refs/heads/${branch}`));
  const worktree = block ? /^worktree (.+)$/m.exec(block)?.[1] : null;
  if (!worktree || !fs.existsSync(path.join(worktree, 'scripts', 'ci-local.sh'))) return { status: 409, error: 'This branch has no worktree with a local gate' };
  if (readGateQueue(root)) return { status: 409, error: 'A gate is already queued or running' };
  const child = spawnFn('bash', [GATE_SCRIPT, worktree, branch, root], { detached: true, stdio: 'ignore', cwd: worktree });
  child.unref?.();
  fs.mkdirSync(path.join(root, '.great_cto'), { recursive: true });
  fs.writeFileSync(path.join(root, '.great_cto', 'gate-queue.json'), `${JSON.stringify({ branch, state: 'queued', pid: child.pid, ahead: 0 })}\n`);
  return { status: 202, state: 'queued', branch };
}
