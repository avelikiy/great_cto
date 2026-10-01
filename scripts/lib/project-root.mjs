/**
 * project-root — the directory whose .great_cto/ a hook should write to.
 *
 * Hooks resolved `.great_cto` against the current working directory, and a
 * session's working directory wanders: one project on the measuring machine had
 * `backend/.great_cto/` and `backend/src/.great_cto/` beside the real one, each
 * with its own event log and handoff, none of them a project. The root is the
 * nearest directory at or above `start` that holds `.great_cto/PROJECT.md`; with
 * none, `start` itself, which is what the hooks did before.
 *
 * The same walk is inlined in shell at the head of every hook command in
 * plugin.json (ROOT_SNIPPET below), so a hook is already in the root when it runs.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function projectRoot(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, '.great_cto', 'PROJECT.md'))) return dir;
    const up = dirname(dir);
    if (up === dir) return resolve(start);
    dir = up;
  }
}

/** POSIX sh, no subprocess: cd to the nearest ancestor with .great_cto/PROJECT.md, if any. */
export const ROOT_SNIPPET = '_gd="$PWD"; while [ -n "$_gd" ] && [ ! -f "$_gd/.great_cto/PROJECT.md" ]; do _gd="${_gd%/*}"; done; [ -n "$_gd" ] && cd "$_gd"; ';
