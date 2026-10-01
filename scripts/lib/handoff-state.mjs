#!/usr/bin/env node
/**
 * handoff-state — what /save records about WHERE the work stood, and what
 * /resume checks before it believes the note.
 *
 * Two failures this exists for:
 *
 *   1. Several sessions share one working tree. The next session inherits a
 *      branch, a dirty tree, a stash and a dev server it did not start, and the
 *      session log said none of it. So /save now captures the run state
 *      (`captureState`) and writes it into the log as a block with a
 *      machine-readable marker.
 *
 *   2. A note is a snapshot; the tree keeps moving. Other sessions commit on
 *      top of it, and /resume used to summarise the note as if it were current.
 *      `staleness` answers "how far has HEAD moved since the saved sha" — by
 *      ancestry when git still knows the sha, by the saved time when it does not.
 *
 * `parseLog` reads a /save log back: the marker, the goal, the first step, and
 * every Done item with its `Verify:` line — so /resume can re-run the cheap
 * proofs instead of repeating "done" on the note's word. `classifyVerify`
 * decides which proofs are safe to re-run unattended: a command that could
 * change anything (push, deploy, rm, a redirect into a file) is never re-run
 * by /resume, however cheap it looks.
 *
 * Read-only by construction: every git call here is a query. The stash is
 * COUNTED with `git stash list`, never applied, popped or dropped — a stash in
 * a shared tree may be another session's work.
 *
 * Zero dependencies; every probe is best-effort and a failure reads as "not
 * known", never as a crash. The lsof probe is optional and never fails capture.
 *
 * The run-state / verify / start-here fields adapt an idea from the MIT-licensed
 * handoff skill in techwolf-ai/ai-first-toolkit (see NOTICE.md); the code and
 * wording here are our own.
 *
 * CLI:
 *   node handoff-state.mjs capture [--json] [--no-servers]
 *   node handoff-state.mjs check (--log FILE | --saved-at ISO --sha SHA [--branch B]) [--json]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIRTY_CAP = 30;
export const COMMITS_CAP = 10;

/** Ports a dev server usually sits on. Anything else listening is not ours to report. */
export const DEV_PORTS = new Set([
  3000, 3001, 3002, 3003, 3004, 3005, 3141, 3333, 4000, 4173, 4200, 4321,
  5000, 5001, 5173, 5174, 5555, 6006, 8000, 8001, 8080, 8081, 8787, 8888, 9000, 19006,
]);

/** OS daemons that squat on dev ports (macOS AirPlay holds :5000 and :7000). Not a server you left running. */
const OS_DAEMONS = /^(ControlCe|ControlCenter|rapportd|AirPlayXPC|launc|mDNSRespo|sharingd)/;

function runGit(args, { cwd, env }) {
  try {
    const r = spawnSync('git', args, { cwd, env: env || process.env, encoding: 'utf8', timeout: 10_000 });
    return { ok: r.status === 0, out: (r.stdout || '').replace(/\s+$/, ''), raw: r.stdout || '' };
  } catch {
    return { ok: false, out: '', raw: '' };
  }
}

function tilde(p) {
  if (!p) return p;
  const home = os.homedir();
  if (home && (p === home || p.startsWith(home + path.sep))) return '~' + p.slice(home.length);
  return p;
}

/** `git status --porcelain=v1 -z` → [{status, path, from?}]. -z keeps odd names unquoted. */
export function parseStatusZ(raw) {
  const parts = raw.split('\0');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e || e.length < 4) continue;
    const xy = e.slice(0, 2);
    const entry = { status: xy.trim() || xy, path: e.slice(3) };
    if (/[RC]/.test(xy)) { entry.from = parts[i + 1]; i++; }
    out.push(entry);
  }
  return out;
}

/** `lsof -nP -iTCP -sTCP:LISTEN` output → dev servers, one per pid+port. */
export function parseLsof(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^(\S+)\s+(\d+)\s.*\bTCP\s+\S*:(\d+)\s+\(LISTEN\)/);
    if (!m) continue;
    const port = Number(m[3]);
    const pid = Number(m[2]);
    if (!DEV_PORTS.has(port) || OS_DAEMONS.test(m[1])) continue;
    const key = `${pid}:${port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ command: m[1], pid, port });
  }
  return out.sort((a, b) => a.port - b.port || a.pid - b.pid);
}

function defaultLsof() {
  if (typeof process.getuid !== 'function') return '';
  const r = spawnSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-u', String(process.getuid())],
    { encoding: 'utf8', timeout: 3_000 });
  return r.stdout || '';
}

/**
 * The run state of the tree at `cwd`, right now.
 * Options: `probeServers` (default true), `lsof` (a function returning lsof
 * text — injectable for tests), `env` (for git), `now` (a Date).
 */
export function captureState({ cwd = process.cwd(), probeServers = true, lsof, env, now } = {}) {
  const capturedAt = (now instanceof Date ? now : new Date()).toISOString();
  const g = (...args) => runGit(args, { cwd, env });

  let servers = [];
  let serversProbed = false;
  if (lsof || probeServers) {
    try { servers = parseLsof((lsof || defaultLsof)()); serversProbed = true; } catch { servers = []; }
  }

  const base = {
    inRepo: false, cwd, branch: null, detached: false, sha: null, shortSha: null,
    dirty: [], dirtyTotal: 0, upstream: null, ahead: null, behind: null,
    worktree: null, linkedWorktree: false, stashCount: 0, servers, serversProbed, capturedAt,
  };
  if (g('rev-parse', '--is-inside-work-tree').out !== 'true') return base;

  const s = { ...base, inRepo: true };
  const head = g('rev-parse', 'HEAD');
  if (head.ok && /^[0-9a-f]{7,}$/.test(head.out)) {
    s.sha = head.out;
    s.shortSha = g('rev-parse', '--short', 'HEAD').out || head.out.slice(0, 7);
  }
  const br = g('branch', '--show-current');
  s.branch = br.out || null;
  s.detached = !s.branch && !!s.sha;

  const st = g('status', '--porcelain=v1', '-z');
  if (st.ok) {
    const all = parseStatusZ(st.raw);
    s.dirtyTotal = all.length;
    s.dirty = all.slice(0, DIRTY_CAP);
  }

  const up = g('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
  if (up.ok && up.out) {
    s.upstream = up.out;
    const lr = g('rev-list', '--left-right', '--count', '@{upstream}...HEAD');
    const m = lr.out.match(/^(\d+)\s+(\d+)$/);
    if (m) { s.behind = Number(m[1]); s.ahead = Number(m[2]); }
  }

  const top = g('rev-parse', '--show-toplevel');
  s.worktree = top.ok ? top.out : null;
  const gd = g('rev-parse', '--path-format=absolute', '--git-dir');
  const cd = g('rev-parse', '--path-format=absolute', '--git-common-dir');
  s.linkedWorktree = gd.ok && cd.ok && path.resolve(gd.out) !== path.resolve(cd.out);

  // Counted, never touched: a stash in a shared tree may be someone else's work.
  const stash = g('stash', 'list');
  s.stashCount = stash.ok && stash.out ? stash.out.split('\n').length : 0;
  return s;
}

/** The `## Run state` block /save writes into the session log. */
export function renderRunState(s) {
  const L = ['## Run state', ''];
  L.push(`<!-- handoff-state saved_at=${s.capturedAt} sha=${s.sha || ''} branch=${s.branch || ''} -->`);
  if (!s.inRepo) {
    L.push(`- not a git repository (${tilde(s.cwd)}) — no branch or sha to check against`);
  } else {
    const where = s.branch ? `\`${s.branch}\`` : '(detached HEAD)';
    const at = s.shortSha ? ` @ \`${s.shortSha}\`` : ' (no commits yet)';
    const wt = s.worktree ? ` · worktree \`${tilde(s.worktree)}\`${s.linkedWorktree ? ' (linked)' : ''}` : '';
    L.push(`- branch: ${where}${at}${wt}`);
    L.push(s.upstream
      ? `- upstream: \`${s.upstream}\` — ahead ${s.ahead ?? '?'}, behind ${s.behind ?? '?'}`
      : '- upstream: none');
    if (!s.dirtyTotal) L.push('- tree: clean');
    else {
      L.push(`- tree: dirty — ${s.dirtyTotal} file${s.dirtyTotal === 1 ? '' : 's'}`);
      for (const f of s.dirty) L.push(`  - \`${f.status} ${f.path}\`${f.from ? ` (from ${f.from})` : ''}`);
      if (s.dirtyTotal > s.dirty.length) L.push(`  - … and ${s.dirtyTotal - s.dirty.length} more`);
    }
    if (s.stashCount) {
      L.push(`- stash: ${s.stashCount} entr${s.stashCount === 1 ? 'y' : 'ies'} — may belong to another session; do not pop or drop without asking`);
    }
  }
  if (!s.serversProbed) L.push('- servers: not probed');
  else if (!s.servers.length) L.push('- servers: none on common dev ports');
  else L.push(`- servers: ${s.servers.map((v) => `\`:${v.port}\` ${v.command} (pid ${v.pid})`).join(', ')}`);
  L.push(`- captured: ${s.capturedAt}`);
  return L.join('\n') + '\n';
}

/** git accepts ISO 8601 for --since; milliseconds only confuse it. */
function sinceArg(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * How far the tree has moved since a note saved at `savedAt` on `sha`
 * (and, when recorded, `branch`).
 */
export function staleness({ cwd = process.cwd(), savedAt, sha, branch, env, cap = COMMITS_CAP } = {}) {
  const g = (...args) => runGit(args, { cwd, env });
  const r = {
    inRepo: false, savedAt: savedAt || null, savedSha: sha || null, savedBranch: branch || null,
    currentBranch: null, currentSha: null, shaKnown: false, shaOnHead: null,
    branchChanged: false, commitsSince: 0, commits: [], basis: 'none', stale: false,
  };
  if (g('rev-parse', '--is-inside-work-tree').out !== 'true') return r;
  r.inRepo = true;
  r.currentBranch = g('branch', '--show-current').out || null;
  const head = g('rev-parse', 'HEAD');
  r.currentSha = head.ok ? head.out : null;
  if (!r.currentSha) return r;

  let range = null;
  if (sha && /^[0-9a-f]{4,40}$/i.test(sha) && g('cat-file', '-e', `${sha}^{commit}`).ok) {
    r.shaKnown = true;
    r.shaOnHead = g('merge-base', '--is-ancestor', sha, 'HEAD').ok;
    range = [`${sha}..HEAD`];
    r.basis = 'sha';
  } else if (sinceArg(savedAt)) {
    range = [`--since=${sinceArg(savedAt)}`, 'HEAD'];
    r.basis = 'time';
  }
  if (range) {
    const n = g('rev-list', '--count', ...range);
    r.commitsSince = n.ok ? Number(n.out) || 0 : 0;
    const log = g('log', `-n${cap}`, '--format=%h%x09%s', ...range);
    r.commits = log.ok && log.out
      ? log.out.split('\n').map((l) => { const [h, ...rest] = l.split('\t'); return { sha: h, subject: rest.join('\t') }; })
      : [];
  }
  r.branchChanged = Boolean((branch && r.currentBranch !== branch) || (r.shaKnown && r.shaOnHead === false));
  r.stale = r.commitsSince > 0 || r.branchChanged;
  return r;
}

// ── reading a /save log back ────────────────────────────────────────────────

const WRITES = /(^|\s)(rm|rmdir|mv|cp|dd|chmod|chown|sudo|kill|pkill|killall|truncate|tee|touch|mkdir|ln|scp|rsync|ssh|kubectl|terraform|helm|gcloud|aws|az|wrangler|vercel|fly|heroku)(\s|$)|\bgit\s+(push|commit|stash|checkout|switch|reset|restore|clean|rebase|merge|pull|cherry-pick|revert|tag|am|apply|worktree\s+(add|remove|prune)|branch\s+-[dDmM]|gc|prune|update-ref|fetch)\b|\b(publish|deploy|release)\b|\bnpm\s+(install|i|ci|uninstall|update|version|publish)\b|\bdocker\s+(push|rm|rmi|run|compose)\b|\bcurl\b[^|;&]*(\s-X\s*(POST|PUT|PATCH|DELETE)|\s(-d|--data|-F|--form|-T|--upload-file)\b)|\bbd\s+(create|close|update|delete|dep)\b|\bsed\s+-i\b/i;
const SLOW = /ci-local|playwright|\be2e\b|\bnpm\s+run\s+build\b|\b(vite|next|tsc|cargo|go|make|gradle|mvn|xcodebuild)\s+build\b|^\s*(npm|pnpm|yarn)\s+(run\s+)?test\s*$|^\s*(pytest|cargo\s+test|go\s+test\s+\.\/\.\.\.)\s*$|\bmake\b|\bdocker\s+build\b|\bmaestro\b|\beval\b/i;
const READ_ONLY = [
  /^node\s+--test\b/,
  /^(npm|pnpm|yarn)\s+(run\s+)?test\s+--\s+\S/,
  /^npx\s+vitest\s+run\s+\S/,
  /^(pytest|python3?\s+-m\s+pytest)\s+\S/,
  /^go\s+test\s+\S/,
  /^git\s+(log|status|diff|show|rev-parse|merge-base|ls-files|branch(\s+--show-current|\s+--contains\b.*|\s+-a|\s+-r|\s+--list.*)?|describe|cat-file|blame|grep)(\s|$)/,
  /^(grep|rg|ls|cat|head|tail|wc|test|\[|diff|cmp|stat|file|jq|find(?!.*\s-(delete|exec)))(\s|$)/,
  /^gh\s+(run|pr|issue)\s+(list|view|checks)\b/,
  /^node\s+\S*(handoff-state|pipeline-state|gate-check|doctor)\.mjs\s+(check|capture)?/,
  /^(true|echo|printf)(\s|$)/,
];

/**
 * 'cheap'   — read-only and quick: /resume may re-run it unattended.
 * 'slow'    — read-only but heavy (full suites, builds, e2e): listed, not re-run.
 * 'unsafe'  — could change files, history, or anything outside the machine: never re-run.
 * 'unlisted' — not recognised; treated as not safe to run unattended.
 */
export function classifyVerify(cmd) {
  const c = String(cmd || '').trim();
  if (!c) return 'unlisted';
  if (/`|\$\(/.test(c)) return 'unlisted';
  // A redirect into anything but /dev/null writes a file.
  if (/(?<![0-9&])>>?\s*(?!&|\/dev\/null)/.test(c)) return 'unsafe';
  const segments = c.split(/\s*(?:\|\||&&|;|\|)\s*/).filter(Boolean);
  let worst = 'cheap';
  const rank = { cheap: 0, unlisted: 1, slow: 2, unsafe: 3 };
  for (const seg of segments) {
    let k;
    if (WRITES.test(seg)) k = 'unsafe';
    else if (SLOW.test(seg)) k = 'slow';
    else if (READ_ONLY.some((re) => re.test(seg))) k = 'cheap';
    else k = 'unlisted';
    if (rank[k] > rank[worst]) worst = k;
  }
  return worst;
}

function parseVerify(text) {
  const t = text.trim();
  const nv = t.match(/^not\s+verified\b\s*[—–:-]*\s*(.*)$/i);
  if (nv) return { command: null, expect: null, kind: 'none', reason: nv[1].trim() || 'no reason given' };
  let command; let rest;
  const bt = t.match(/^`([^`]+)`\s*(.*)$/);
  if (bt) { command = bt[1].trim(); rest = bt[2]; }
  else {
    const split = t.split(/\s+(?:→|->)\s+/);
    command = split[0].trim(); rest = split.length > 1 ? `→ ${split.slice(1).join(' → ')}` : '';
  }
  const ex = rest.match(/^(?:→|->)\s*(.+)$/);
  return { command, expect: ex ? ex[1].trim() : null, kind: classifyVerify(command) };
}

function section(lines, name) {
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${name}\\s*$`, 'i').test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

/** A /save log → { savedAt, sha, branch, goal, firstStep, done: [{item, verify}] }. */
export function parseLog(text) {
  const src = String(text || '');
  const lines = src.split(/\r?\n/);
  const r = { savedAt: null, sha: null, branch: null, goal: null, firstStep: null, done: [] };

  const marker = src.match(/<!--\s*handoff-state\s+([^>]*?)\s*-->/);
  if (marker) {
    for (const kv of marker[1].split(/\s+/)) {
      const [k, ...v] = kv.split('=');
      const val = v.join('=').trim();
      if (!val || val === 'none') continue;
      if (k === 'saved_at') r.savedAt = val;
      else if (k === 'sha') r.sha = val;
      else if (k === 'branch') r.branch = val;
    }
  }
  if (!r.savedAt) {
    // An older note: no marker, but its frontmatter still dates it (local time).
    const d = src.match(/^date:\s*(\d{4})-(\d{2})-(\d{2})\s*$/m);
    const t = src.match(/^time:\s*(\d{1,2}):(\d{2})\s*$/m);
    if (d) {
      const dt = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), t ? Number(t[1]) : 0, t ? Number(t[2]) : 0);
      if (!Number.isNaN(dt.getTime())) r.savedAt = dt.toISOString();
    }
  }

  const goal = section(lines, 'Goal').map((l) => l.trim()).filter(Boolean);
  r.goal = goal.length ? goal[0].replace(/^[-*]\s+/, '') : null;
  const start = section(lines, 'Start here').map((l) => l.trim()).find((l) => /^(\d+[.)]|[-*])\s+/.test(l));
  r.firstStep = start ? start.replace(/^(\d+[.)]|[-*])\s+/, '') : null;

  let cur = null;
  for (const l of section(lines, 'Done')) {
    const item = l.match(/^[-*]\s+(.*)$/);
    if (item) {
      cur = { item: item[1].trim(), verify: null };
      if (!/^\*?\(none\)\*?$/i.test(cur.item)) r.done.push(cur);
      continue;
    }
    const v = l.match(/^\s+(?:[-*]\s+)?Verify:\s*(.*)$/i);
    if (v && cur) cur.verify = parseVerify(v[1]);
  }
  return r;
}

// ── report ──────────────────────────────────────────────────────────────────

const WHY_NOT = {
  slow: 'not re-run: heavy — run it yourself if the item matters now',
  unsafe: 'not re-run: could change files, history or something outside this machine',
  unlisted: 'not re-run: not a recognised read-only command',
};

export function renderCheck(st, log) {
  const L = [];
  const short = (s) => (s ? s.slice(0, 7) : '?');
  const savedDesc = `saved ${st.savedAt || '?'}${st.savedSha ? ` at ${short(st.savedSha)}` : ''}${st.savedBranch ? ` on ${st.savedBranch}` : ''}`;
  if (!st.inRepo) L.push('Staleness unknown: not a git repository — read the note as a snapshot of unknown age.');
  else if (st.commitsSince > 0) {
    L.push(`STALE: ${st.commitsSince} commit${st.commitsSince === 1 ? '' : 's'} since this note (${savedDesc}) — the note may be stale.`);
  } else if (st.branchChanged) {
    L.push(`STALE: the branch changed since this note (${savedDesc}; now ${st.currentBranch || 'detached HEAD'}) — the note may be stale.`);
  } else {
    L.push(`Note is current: no commits since it was written (${savedDesc}).`);
  }
  if (st.inRepo && st.branchChanged && st.commitsSince > 0) {
    L.push(`Branch changed: note was on ${st.savedBranch || '(unrecorded)'}, now on ${st.currentBranch || 'detached HEAD'}${st.shaOnHead === false ? '; the saved sha is not under HEAD' : ''}.`);
  }
  if (st.basis === 'time') L.push('(saved sha unknown to git — counted by commit time instead)');
  for (const c of st.commits) L.push(`  ${c.sha} ${c.subject}`);
  if (st.commitsSince > st.commits.length) L.push(`  … and ${st.commitsSince - st.commits.length} more`);

  if (log) {
    L.push('');
    if (log.goal) L.push(`Goal: ${log.goal}`);
    L.push(`Start here: ${log.firstStep || '(the note records no first step)'}`);
    if (log.done.length) {
      L.push('');
      L.push('Done items and their proof:');
      for (const d of log.done) {
        if (!d.verify) { L.push(`  [no proof]  ${d.item} — the note gives no Verify line`); continue; }
        if (d.verify.kind === 'none') { L.push(`  [unverified] ${d.item} — ${d.verify.reason}`); continue; }
        const exp = d.verify.expect ? ` → ${d.verify.expect}` : '';
        const tag = d.verify.kind === 'cheap' ? '[re-run]    ' : `[${d.verify.kind}]`.padEnd(12);
        L.push(`  ${tag} ${d.item}: \`${d.verify.command}\`${exp}${d.verify.kind === 'cheap' ? '' : ` — ${WHY_NOT[d.verify.kind]}`}`);
      }
    }
  }
  return L.join('\n') + '\n';
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

const USAGE = [
  'usage: handoff-state.mjs capture [--json] [--no-servers]',
  '       handoff-state.mjs check (--log FILE | --saved-at ISO --sha SHA [--branch B]) [--json]',
].join('\n');

export function main(argv = process.argv.slice(2), { cwd = process.cwd(), out = process.stdout, err = process.stderr } = {}) {
  const [cmd, ...rest] = argv;
  const json = rest.includes('--json');
  if (cmd === 'capture') {
    const s = captureState({ cwd, probeServers: !rest.includes('--no-servers') });
    out.write(json ? JSON.stringify(s, null, 2) + '\n' : renderRunState(s));
    return 0;
  }
  if (cmd === 'check') {
    let savedAt = argValue(rest, '--saved-at');
    let sha = argValue(rest, '--sha');
    let branch = argValue(rest, '--branch');
    let log = null;
    const logPath = argValue(rest, '--log');
    if (logPath) {
      let text;
      try { text = fs.readFileSync(logPath, 'utf8'); } catch (e) {
        err.write(`handoff-state: cannot read ${logPath}: ${e.code || e.message}\n${USAGE}\n`);
        return 2;
      }
      log = parseLog(text);
      savedAt = savedAt || log.savedAt;
      sha = sha || log.sha;
      branch = branch || log.branch;
    }
    if (!savedAt && !sha) {
      err.write(`handoff-state: nothing to check against — the note has no saved time or sha\n${USAGE}\n`);
      return 2;
    }
    const st = staleness({ cwd, savedAt, sha, branch });
    out.write(json ? JSON.stringify({ staleness: st, log }, null, 2) + '\n' : renderCheck(st, log));
    return 0;
  }
  err.write(`${USAGE}\n`);
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = main();
}
