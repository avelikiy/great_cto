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
 * git failed). A history that could not be read is never reported as clean.
 * When --max-commits cuts the walk, the report says how many of how many commits
 * were read; it does not present a partial scan as a full one.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scan } from './secret-patterns.mjs';

export const DEFAULT_MAX_COMMITS = 2000;

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
  return new Promise((resolve) => {
    const args = ['-C', cwd, 'log', '--all', '-p', '--no-color', '--no-ext-diff', '-U0', '--format=%x00commit %H', `--max-count=${maxCommits}`];
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const seen = new Set();
    const findings = [];
    let commit = null, file = null, commits = 0, stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (line.startsWith('\0commit ')) { commit = line.slice(8); file = null; commits += 1; return; }
      if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6) : null; return; }
      if (!line.startsWith('+') || !commit || !file) return;
      for (const { name, severity } of scan(line.slice(1))) {
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
      resolve({ state: 'scanned', commits, total, partial: commits < total, findings });
    });
  });
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
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
    const scope = r.partial ? `${r.commits} of ${r.total} commits (most recent; raise --max-commits for the rest)` : `all ${r.commits} commits`;
    if (!r.findings.length) process.stdout.write(`history scanned: ${scope} — no secret pattern in an added line\n`);
    else {
      process.stdout.write(`history scanned: ${scope} — ${r.findings.length} finding(s), values withheld:\n`);
      for (const f of r.findings) process.stdout.write(`  ${f.severity.toUpperCase()}  ${f.commit}  ${f.file}  ${f.kind}\n`);
    }
  }
  process.exitCode = r.state === 'not-scanned' ? 2 : r.findings.length ? 1 : 0;
}
