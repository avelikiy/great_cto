#!/usr/bin/env node
/**
 * Secrets in git history — the lines a commit ADDED, scanned with the same
 * patterns the write hook uses, reported by commit, file and kind, never by value.
 *
 * security-officer step 4b did this with two shell lines that could not find
 * anything. `git show <sha>:.` is not a way to print a commit — it fails, and
 * `2>/dev/null` hid the failure, so the step returned nothing on every repository.
 * `git log -S "A\|B"` searches for that literal string (backslash, pipe and all)
 * unless --pickaxe-regex is given, so the private-key check matched nothing too.
 * Both read as "no secrets in history". And had either worked, it would have
 * printed the secret it found into the agent's transcript, which is the leak the
 * secret-read guard exists to stop.
 *
 *   node scripts/lib/history-secret-scan.mjs [--cwd DIR] [--max-commits N] [--json]
 *
 * Exit: 0 scanned, nothing found · 1 findings · 2 NOT SCANNED (not a repository,
 * git failed) · 3 PARTIAL (the walk was capped, or the clone is shallow) and
 * nothing found in the part read. A history that could not be read, or was read in
 * part, is never reported as clean.
 *
 * Read from `git log -p --cc`: merge commits show the lines they introduced
 * themselves (a conflict resolution can add a line no parent had), paths are not
 * quoted (core.quotePath off), and a `+++ ` line is a file header only directly
 * after its `--- ` line — an added line whose text starts with `++` is content.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { isMainModule } from './is-main.mjs';
import { scan } from './secret-patterns.mjs';

// High enough that an ordinary repository is read whole; a cut is reported, not hidden.
export const DEFAULT_MAX_COMMITS = 50000;

/** Count reachable commits; null when git cannot answer. */
function commitCount(cwd) {
  const r = spawnSync('git', ['-C', cwd, 'rev-list', '--all', '--count'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const n = Number(r.stdout.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Walk `git log -p` over added lines. Resolves to
 * { state: 'scanned'|'not-scanned', commits, total, findings: [{commit, file, kind, severity}], why? }.
 */
export function scanHistory({ cwd = process.cwd(), maxCommits = DEFAULT_MAX_COMMITS } = {}) {
  const total = commitCount(cwd);
  if (total === null) {
    return Promise.resolve({ state: 'not-scanned', why: `git could not read the history in ${cwd}`, commits: 0, total: null, findings: [] });
  }
  // A repository with no commits has no history to hide anything in: scanned, empty.
  // (git log itself fails on it, which would otherwise read as NOT SCANNED.)
  if (total === 0) return Promise.resolve({ state: 'scanned', commits: 0, total: 0, partial: false, findings: [] });
  const shallow = spawnSync('git', ['-C', cwd, 'rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).stdout.trim() === 'true';
  return new Promise((resolve) => {
    const args = ['-C', cwd, '-c', 'core.quotePath=false', 'log', '--all', '-p', '--cc', '--text', '--no-color', '--no-ext-diff', '--no-renames', '-U0',
      '--format=%x00commit %H', `--max-count=${maxCommits}`];
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const seen = new Set();
    const findings = [];
    let commit = null, file = null, commits = 0, stderr = '';
    // `---` then `+++` is a header; anything else starting with '+' is content.
    let afterMinus = false, parents = 1;
    child.stderr.on('data', (d) => { stderr += d; });
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (line.startsWith('\0commit ')) { commit = line.slice(8); file = null; afterMinus = false; commits += 1; return; }
      if (line.startsWith('diff --git ') || line.startsWith('diff --cc ') || line.startsWith('diff --combined ')) { file = null; afterMinus = false; return; }
      if (line.startsWith('--- ') && file === null) { afterMinus = true; return; }
      if (afterMinus && line.startsWith('+++ ')) {
        afterMinus = false;
        const p = line.slice(4);
        // git appends a tab to a header path that holds a space.
        file = p === '/dev/null' ? null : p.replace(/\t$/, '').replace(/^"?b\//, '').replace(/"$/, '');
        return;
      }
      afterMinus = false;
      // A combined (merge) hunk has one marker column per parent: @@@ for two.
      const hunk = line.match(/^(@{2,}) /);
      if (hunk) { parents = hunk[1].length - 1; return; }
      if (!commit || !file) return;
      const marks = line.slice(0, parents);
      // Added in this commit: a '+' in EVERY marker column. In a merge, '+ ' or ' +'
      // means the line is in one parent — it came from that side, whose own commit
      // already carries it; only '++' is a line the merge itself introduced.
      if (marks !== '+'.repeat(parents)) return;
      for (const { name, severity } of scan(line.slice(parents))) {
        const key = `${commit}\0${file}\0${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({ commit: commit.slice(0, 12), file, kind: name, severity });
      }
    });
    child.on('error', (e) => resolve({ state: 'not-scanned', why: `git did not run: ${e.message}`, commits, total, findings: [] }));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ state: 'not-scanned', why: `git log exited ${code}: ${stderr.trim().split('\n')[0] || 'no output'}`, commits, total, findings: [] });
        return;
      }
      const partial = commits < total || shallow;
      resolve({ state: 'scanned', commits, total, partial, ...(shallow ? { shallow: true } : {}), findings });
    });
  });
}

const isMain = isMainModule(import.meta.url);
if (process.argv[1] && isMain) {
  // A reader that closed early (`| head`) is not an error of the scan.
  process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(process.exitCode ?? 0); throw e; });
  const argv = process.argv.slice(2);
  const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
  const cwd = path.resolve(opt('--cwd', process.cwd()));
  const maxCommits = Number(opt('--max-commits', DEFAULT_MAX_COMMITS));
  const r = await scanHistory({ cwd, maxCommits });
  if (argv.includes('--json')) process.stdout.write(JSON.stringify(r) + '\n');
  else if (r.state === 'not-scanned') process.stdout.write(`NOT SCANNED — ${r.why}\n`);
  else {
    const scope = r.shallow ? `${r.commits} commits of a SHALLOW clone (older history is not here; fetch --unshallow to read it)`
      : r.partial ? `${r.commits} of ${r.total} commits (most recent; raise --max-commits for the rest)` : `all ${r.commits} commits`;
    if (!r.findings.length) process.stdout.write(`${r.partial ? 'PARTIAL — ' : ''}history scanned: ${scope} — no secret pattern in an added line${r.partial ? ' of the part read' : ''}\n`);
    else {
      process.stdout.write(`history scanned: ${scope} — ${r.findings.length} finding(s), values withheld:\n`);
      for (const f of r.findings) process.stdout.write(`  ${f.severity.toUpperCase()}  ${f.commit}  ${f.file}  ${f.kind}\n`);
    }
  }
  process.exitCode = r.state === 'not-scanned' ? 2 : r.findings.length ? 1 : r.partial ? 3 : 0;
}
