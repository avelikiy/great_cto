// Where git will actually look for hooks — which is not always `.git/hooks`.
//
// Why this exists
// ---------------
// This repository's privacy guard was installed, executable, up to date, and
// never once ran. `core.hooksPath` was set to `~/development/great_cto/.git/hooks`
// — the location this repository lived at before it moved under `Personal/` —
// and git honours that setting over `.git/hooks` even when the directory no
// longer exists. So every push went unscanned, three private project names
// reached a public repository, and nothing anywhere said the guard was absent.
//
// The installer reported success the whole time, because it wrote the file it
// was asked to write. It just wrote it where git was no longer reading.
//
// A guard that is not installed and a guard that passed produce the same output:
// nothing. That is the same failure this repository keeps finding in its evals,
// its board and its hooks, and the fix is the same one — make the absence
// visible, rather than trusting that an install once succeeded.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The directory git will read hooks from for `cwd`.
 *
 * `core.hooksPath` wins when set, and a relative value resolves against the
 * repository's top level rather than the current directory.
 */
export function effectiveHooksDir(cwd = process.cwd(), { run = git } = {}) {
  const top = run(['rev-parse', '--show-toplevel'], cwd);
  if (!top) return null;                       // not a git repository
  const configured = run(['config', '--get', 'core.hooksPath'], cwd);
  if (!configured) {
    // A linked worktree keeps its hooks in the main checkout's git dir.
    const common = run(['rev-parse', '--git-common-dir'], cwd);
    const base = common
      ? (path.isAbsolute(common) ? common : path.resolve(top, common))
      : path.join(top, '.git');
    return path.join(base, 'hooks');
  }
  return path.isAbsolute(configured) ? configured : path.resolve(top, configured);
}

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

/**
 * Is the pre-push guard actually in force?
 *
 * States are named for what a reader needs to do, and "I could not tell" is one
 * of them rather than being folded into "fine".
 */
export function prePushStatus(cwd = process.cwd(), { source = null, run = git } = {}) {
  const dir = effectiveHooksDir(cwd, { run });
  if (!dir) return { state: 'not-a-repo', why: 'not a git repository — nothing to guard' };

  const configured = run(['config', '--get', 'core.hooksPath'], cwd);
  if (configured && !existsSync(dir)) {
    return {
      state: 'unreachable',
      dir,
      why: `core.hooksPath points at ${dir}, which does not exist — git runs no hooks at all`,
      remedy: 'git config --unset core.hooksPath',
    };
  }

  const hook = path.join(dir, 'pre-push');
  if (!existsSync(hook)) {
    return { state: 'missing', dir, why: `no pre-push hook in ${dir}`, remedy: installCommand(cwd) };
  }
  try {
    if (!(statSync(hook).mode & 0o111)) {
      return { state: 'not-executable', dir, why: `${hook} is not executable — git skips it silently`, remedy: `chmod +x ${hook}` };
    }
  } catch { /* fall through to the content check */ }

  // Installed but stale is its own answer: the guard runs and enforces rules the
  // repository has since changed.
  const src = source || path.join(cwd, 'scripts', 'hooks', 'pre-push.sh');
  if (existsSync(src)) {
    try {
      if (readFileSync(hook, 'utf8') !== readFileSync(src, 'utf8')) {
        return { state: 'stale', dir, why: `${hook} differs from scripts/hooks/pre-push.sh`, remedy: installCommand(cwd) };
      }
    } catch { /* unreadable — reported as installed rather than claimed current */ }
  }

  return { state: 'ok', dir, why: `pre-push guard in force at ${hook}` };
}

export function installCommand(cwd = process.cwd(), { run = git } = {}) {
  const dir = effectiveHooksDir(cwd, { run }) || '.git/hooks';
  return `cp scripts/hooks/pre-push.sh ${dir}/pre-push && chmod +x ${dir}/pre-push`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// Exit 1 on any state that means the guard is not in force, so ci-local can gate
// on it. `--quiet` prints only when something is wrong.

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = prePushStatus(process.cwd());
  const fine = s.state === 'ok' || s.state === 'not-a-repo';
  if (!fine) {
    console.error(`pre-push guard: ${s.state.toUpperCase()} — ${s.why}`);
    if (s.remedy) console.error(`  fix: ${s.remedy}`);
    process.exit(1);
  }
  if (!process.argv.includes('--quiet')) console.log(s.why);
}
