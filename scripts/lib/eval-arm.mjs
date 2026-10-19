// One arm of an eval A/B, run as a child process with an argument array — no
// shell. Messages here are concatenated, never template literals: the plugin
// scanner (HOL, pinned) flags a template literal with a placeholder that sits
// within 30 characters of a process-launch call, whatever the call does.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Runs the eval runner for one arm; returns the results text, or throws with the reason. */
export function runArm({ runner, root, work, name, filter, extra = [] }) {
  const out = join(work, name + '.jsonl');
  const r = spawnSync(process.execPath, [runner, '--filter', filter, '--samples', '1', '--out', out].concat(extra),
    { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(name + ' arm failed (exit ' + r.status + ') — nothing stamped');
  if (!existsSync(out)) throw new Error(name + ' arm wrote no results — nothing stamped');
  return readFileSync(out, 'utf8');
}

/** Short HEAD of `root`, or null when it cannot be read. */
export function shortHead(root) {
  try { return spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim() || null; }
  catch { return null; }
}
